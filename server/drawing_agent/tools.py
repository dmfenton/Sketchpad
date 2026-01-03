"""MCP tools for the drawing agent."""

import asyncio
import json
import logging
import tempfile
from pathlib import Path as FilePath
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

from drawing_agent.types import Path, PathType, Point

logger = logging.getLogger(__name__)


def parse_path_data(path_data: dict[str, Any]) -> Path | None:
    """Parse a path dictionary into a Path object."""
    try:
        path_type_str = path_data.get("type", "")
        points_data = path_data.get("points", [])

        # Validate path type
        try:
            path_type = PathType(path_type_str)
        except ValueError:
            return None

        # Handle SVG path type (raw d-string)
        if path_type == PathType.SVG:
            d_string = path_data.get("d", "")
            if not d_string or not isinstance(d_string, str):
                return None
            return Path(type=PathType.SVG, points=[], d=d_string)

        # Parse points for other path types
        points = []
        for pt in points_data:
            if isinstance(pt, dict) and "x" in pt and "y" in pt:
                points.append(Point(x=float(pt["x"]), y=float(pt["y"])))
            else:
                return None

        # Validate point count for path type
        min_points = {
            PathType.LINE: 2,
            PathType.QUADRATIC: 3,
            PathType.CUBIC: 4,
            PathType.POLYLINE: 2,
        }
        if len(points) < min_points.get(path_type, 2):
            return None

        return Path(type=path_type, points=points)
    except (TypeError, ValueError):
        return None


# Python code execution timeout (seconds)
PYTHON_TIMEOUT = 30


async def run_python_code(code: str, canvas_width: int, canvas_height: int) -> dict[str, Any]:
    """Execute Python code in a subprocess and capture output.

    The code should print JSON to stdout with one of these formats:
    1. {"paths": [...]} - array of path objects
    2. {"svg_paths": [...]} - array of SVG d-strings

    The code has access to canvas_width and canvas_height variables.

    Returns dict with stdout, stderr, return_code, and parsed paths.
    """
    # Prepend canvas dimensions as variables
    full_code = f"""
import math
import random
import json

# Canvas dimensions
canvas_width = {canvas_width}
canvas_height = {canvas_height}

# Helper functions for generating paths
def svg_path(d: str) -> dict:
    \"\"\"Create an SVG path dict.\"\"\"
    return {{"type": "svg", "d": d}}

def line(x1: float, y1: float, x2: float, y2: float) -> dict:
    \"\"\"Create a line path.\"\"\"
    return {{"type": "line", "points": [{{"x": x1, "y": y1}}, {{"x": x2, "y": y2}}]}}

def polyline(*points) -> dict:
    \"\"\"Create a polyline from (x, y) tuples.\"\"\"
    return {{"type": "polyline", "points": [{{"x": p[0], "y": p[1]}} for p in points]}}

def quadratic(x1: float, y1: float, cx: float, cy: float, x2: float, y2: float) -> dict:
    \"\"\"Create a quadratic bezier curve.\"\"\"
    return {{"type": "quadratic", "points": [
        {{"x": x1, "y": y1}}, {{"x": cx, "y": cy}}, {{"x": x2, "y": y2}}
    ]}}

def cubic(x1: float, y1: float, cx1: float, cy1: float, cx2: float, cy2: float, x2: float, y2: float) -> dict:
    \"\"\"Create a cubic bezier curve.\"\"\"
    return {{"type": "cubic", "points": [
        {{"x": x1, "y": y1}}, {{"x": cx1, "y": cy1}}, {{"x": cx2, "y": cy2}}, {{"x": x2, "y": y2}}
    ]}}

def output_paths(paths: list):
    \"\"\"Output paths as JSON to stdout.\"\"\"
    print(json.dumps({{"paths": paths}}))

def output_svg_paths(svg_d_strings: list):
    \"\"\"Output SVG d-strings as JSON to stdout.\"\"\"
    print(json.dumps({{"svg_paths": svg_d_strings}}))

# User code below
{code}
"""

    # Write code to temp file and execute
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(full_code)
        temp_path = FilePath(f.name)

    try:
        proc = await asyncio.create_subprocess_exec(
            "python3",
            str(temp_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=PYTHON_TIMEOUT
            )
        except TimeoutError:
            proc.kill()
            await proc.wait()
            return {
                "stdout": "",
                "stderr": f"Code execution timed out after {PYTHON_TIMEOUT} seconds",
                "return_code": -1,
                "paths": [],
            }

        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        # Parse output for paths
        paths: list[Path] = []
        if proc.returncode == 0 and stdout_str.strip():
            try:
                # Find JSON in output (last line or full output)
                lines = stdout_str.strip().split("\n")
                json_str = None
                for line in reversed(lines):
                    line = line.strip()
                    if line.startswith("{"):
                        json_str = line
                        break

                if json_str:
                    output = json.loads(json_str)

                    # Handle paths array
                    if "paths" in output:
                        for path_data in output["paths"]:
                            parsed = parse_path_data(path_data)
                            if parsed:
                                paths.append(parsed)

                    # Handle svg_paths array (d-strings)
                    if "svg_paths" in output:
                        for d_string in output["svg_paths"]:
                            if isinstance(d_string, str) and d_string.strip():
                                paths.append(Path(type=PathType.SVG, points=[], d=d_string))

            except json.JSONDecodeError as e:
                stderr_str += f"\nFailed to parse JSON output: {e}"

        return {
            "stdout": stdout_str,
            "stderr": stderr_str,
            "return_code": proc.returncode or 0,
            "paths": paths,
        }
    finally:
        temp_path.unlink(missing_ok=True)


# Global callback - will be set by the agent
_draw_callback: Any = None


def set_draw_callback(callback: Any) -> None:
    """Set the callback function for drawing paths."""
    global _draw_callback
    _draw_callback = callback


async def handle_draw_paths(args: dict[str, Any]) -> dict[str, Any]:
    """Handle draw_paths tool call (testable without decorator).

    Args:
        args: Dictionary with 'paths' (array of path objects) and optional 'done' (bool)

    Returns:
        Tool result with success/error status
    """
    paths_data = args.get("paths", [])
    done = args.get("done", False)

    if not isinstance(paths_data, list):
        return {
            "content": [{"type": "text", "text": "Error: paths must be an array"}],
            "is_error": True,
        }

    # Parse paths
    parsed_paths: list[Path] = []
    errors: list[str] = []

    for i, path_data in enumerate(paths_data):
        if not isinstance(path_data, dict):
            errors.append(f"Path {i}: must be an object")
            continue

        path = parse_path_data(path_data)
        if path is None:
            errors.append(f"Path {i}: invalid format (need type and points)")
        else:
            parsed_paths.append(path)

    # Call the draw callback with valid paths (even if there were some errors)
    if parsed_paths and _draw_callback is not None:
        await _draw_callback(parsed_paths, done)

    # Report errors if any
    if errors:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Parsed {len(parsed_paths)} paths with {len(errors)} errors:\n"
                    + "\n".join(errors),
                }
            ],
            "is_error": len(parsed_paths) == 0,
        }

    return {
        "content": [
            {
                "type": "text",
                "text": f"Successfully drew {len(parsed_paths)} paths."
                + (" Piece marked as complete." if done else ""),
            }
        ],
    }


async def handle_mark_piece_done() -> dict[str, Any]:
    """Handle mark_piece_done tool call (testable without decorator).

    Returns:
        Tool result confirming the piece is done
    """
    if _draw_callback is not None:
        await _draw_callback([], True)

    return {
        "content": [{"type": "text", "text": "Piece marked as complete."}],
    }


# Global canvas dimensions - will be set by the agent
_canvas_width: int = 800
_canvas_height: int = 600


def set_canvas_dimensions(width: int, height: int) -> None:
    """Set the canvas dimensions for Python code execution."""
    global _canvas_width, _canvas_height
    _canvas_width = width
    _canvas_height = height


async def handle_generate_svg(args: dict[str, Any]) -> dict[str, Any]:
    """Handle generate_svg tool call (testable without decorator).

    Args:
        args: Dictionary with 'code' (Python code string) and optional 'done' (bool)

    Returns:
        Tool result with execution output and drawn paths
    """
    code = args.get("code", "")
    done = args.get("done", False)

    if not code or not isinstance(code, str):
        return {
            "content": [{"type": "text", "text": "Error: code must be a non-empty string"}],
            "is_error": True,
        }

    # Run the Python code
    result = await run_python_code(code, _canvas_width, _canvas_height)

    stdout = result["stdout"]
    stderr = result["stderr"]
    return_code = result["return_code"]
    paths = result["paths"]

    # Build response message
    response_parts = []

    if return_code != 0:
        response_parts.append(f"Code execution failed (exit code {return_code})")
        if stderr:
            response_parts.append(f"Errors:\n{stderr[:1000]}")
        return {
            "content": [{"type": "text", "text": "\n".join(response_parts)}],
            "is_error": True,
        }

    # Call the draw callback with generated paths
    if paths and _draw_callback is not None:
        await _draw_callback(paths, done)
        response_parts.append(f"Successfully generated and drew {len(paths)} paths.")
    elif not paths:
        response_parts.append("Code executed but no paths were generated. "
                              "Make sure to call output_paths() or output_svg_paths() at the end.")

    if done:
        response_parts.append("Piece marked as complete.")

    # Include stdout if there's additional output
    if stdout and not stdout.strip().startswith("{"):
        response_parts.append(f"Output:\n{stdout[:500]}")

    return {
        "content": [{"type": "text", "text": "\n".join(response_parts)}],
    }


@tool(
    "draw_paths",
    "Draw paths on the canvas. Each path has a type (line, polyline, quadratic, cubic, svg) and either points or a d-string.",
    {
        "type": "object",
        "properties": {
            "paths": {
                "type": "array",
                "description": "Array of path objects to draw",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["line", "polyline", "quadratic", "cubic", "svg"],
                            "description": "Path type: line (2 pts), polyline (N pts), quadratic (3 pts), cubic (4 pts), svg (d-string)",
                        },
                        "points": {
                            "type": "array",
                            "description": "Array of points (for line, polyline, quadratic, cubic)",
                            "items": {
                                "type": "object",
                                "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                                "required": ["x", "y"],
                            },
                        },
                        "d": {
                            "type": "string",
                            "description": "SVG path d-string (for type=svg). Example: 'M 10 10 L 100 100 C 150 50 200 150 250 100'",
                        },
                    },
                    "required": ["type"],
                },
            },
            "done": {
                "type": "boolean",
                "description": "Set to true when the piece is complete",
                "default": False,
            },
        },
        "required": ["paths"],
    },
)
async def draw_paths(args: dict[str, Any]) -> dict[str, Any]:
    """Draw paths on the canvas."""
    return await handle_draw_paths(args)


@tool(
    "mark_piece_done",
    "Signal that the current piece is complete. Call this when you're satisfied with the drawing.",
    {"type": "object", "properties": {}, "required": []},
)
async def mark_piece_done(_args: dict[str, Any]) -> dict[str, Any]:
    """Mark the current piece as complete."""
    return await handle_mark_piece_done()


@tool(
    "generate_svg",
    """Run Python code to generate SVG paths programmatically. Use this for algorithmic, mathematical, or complex generative drawings.

The code has access to:
- canvas_width, canvas_height: Canvas dimensions
- math, random, json: Standard library modules
- Helper functions:
  - line(x1, y1, x2, y2) -> path dict
  - polyline((x1,y1), (x2,y2), ...) -> path dict
  - quadratic(x1, y1, cx, cy, x2, y2) -> path dict
  - cubic(x1, y1, cx1, cy1, cx2, cy2, x2, y2) -> path dict
  - svg_path(d_string) -> path dict
  - output_paths(paths_list) -> prints JSON to stdout
  - output_svg_paths(d_strings_list) -> prints JSON to stdout

Example - draw a spiral:
```python
paths = []
for i in range(100):
    t = i * 0.1
    r = 10 + t * 5
    x1 = canvas_width/2 + r * math.cos(t)
    y1 = canvas_height/2 + r * math.sin(t)
    x2 = canvas_width/2 + (r+5) * math.cos(t+0.1)
    y2 = canvas_height/2 + (r+5) * math.sin(t+0.1)
    paths.append(line(x1, y1, x2, y2))
output_paths(paths)
```

Example - draw using raw SVG d-strings:
```python
output_svg_paths([
    "M 100 100 C 150 50 200 150 250 100",
    "M 100 200 Q 175 150 250 200"
])
```""",
    {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "Python code to execute. Must call output_paths() or output_svg_paths() at the end.",
            },
            "done": {
                "type": "boolean",
                "description": "Set to true when the piece is complete",
                "default": False,
            },
        },
        "required": ["code"],
    },
)
async def generate_svg(args: dict[str, Any]) -> dict[str, Any]:
    """Generate SVG paths using Python code."""
    return await handle_generate_svg(args)


def create_drawing_server() -> Any:
    """Create the MCP server with drawing tools."""
    return create_sdk_mcp_server(
        name="drawing",
        version="1.0.0",
        tools=[draw_paths, mark_piece_done, generate_svg],
    )
