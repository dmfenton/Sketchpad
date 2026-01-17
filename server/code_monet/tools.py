"""MCP tools for the drawing agent."""

import asyncio
import base64
import json
import logging
import tempfile
import time
from pathlib import Path as FilePath
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

from code_monet.types import Path, PathType, Point

logger = logging.getLogger(__name__)


def parse_path_data(path_data: dict[str, Any]) -> Path | None:
    """Parse a path dictionary into a Path object.

    Supports optional style properties: color, stroke_width, opacity.
    """
    try:
        path_type_str = path_data.get("type", "")
        points_data = path_data.get("points", [])

        # Validate path type
        try:
            path_type = PathType(path_type_str)
        except ValueError:
            return None

        # Extract optional style properties
        color = path_data.get("color")
        stroke_width = path_data.get("stroke_width")
        opacity = path_data.get("opacity")

        # Validate style properties
        if color is not None and not isinstance(color, str):
            color = None
        if stroke_width is not None:
            try:
                stroke_width = float(stroke_width)
                # Clamp to reasonable range
                stroke_width = max(0.5, min(10.0, stroke_width))
            except (TypeError, ValueError):
                stroke_width = None
        if opacity is not None:
            try:
                opacity = float(opacity)
                # Clamp to 0-1
                opacity = max(0.0, min(1.0, opacity))
            except (TypeError, ValueError):
                opacity = None

        # Handle SVG path type (raw d-string)
        if path_type == PathType.SVG:
            d_string = path_data.get("d", "")
            if not d_string or not isinstance(d_string, str):
                return None
            return Path(
                type=PathType.SVG,
                points=[],
                d=d_string,
                color=color,
                stroke_width=stroke_width,
                opacity=opacity,
            )

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

        return Path(
            type=path_type,
            points=points,
            color=color,
            stroke_width=stroke_width,
            opacity=opacity,
        )
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
    Helper functions support optional style parameters: color, stroke_width, opacity.

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

# Helper function to add style properties to a path dict
def _add_style(path_dict: dict, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Add optional style properties to a path dict.\"\"\"
    if color is not None:
        path_dict["color"] = color
    if stroke_width is not None:
        path_dict["stroke_width"] = stroke_width
    if opacity is not None:
        path_dict["opacity"] = opacity
    return path_dict

# Helper functions for generating paths (all support optional style parameters)
def svg_path(d: str, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create an SVG path dict with optional style.\"\"\"
    return _add_style({{"type": "svg", "d": d}}, color, stroke_width, opacity)

def line(x1: float, y1: float, x2: float, y2: float, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a line path with optional style.\"\"\"
    return _add_style(
        {{"type": "line", "points": [{{"x": x1, "y": y1}}, {{"x": x2, "y": y2}}]}},
        color, stroke_width, opacity
    )

def polyline(*points, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a polyline from (x, y) tuples with optional style.\"\"\"
    return _add_style(
        {{"type": "polyline", "points": [{{"x": p[0], "y": p[1]}} for p in points]}},
        color, stroke_width, opacity
    )

def quadratic(x1: float, y1: float, cx: float, cy: float, x2: float, y2: float, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a quadratic bezier curve with optional style.\"\"\"
    return _add_style(
        {{"type": "quadratic", "points": [
            {{"x": x1, "y": y1}}, {{"x": cx, "y": cy}}, {{"x": x2, "y": y2}}
        ]}},
        color, stroke_width, opacity
    )

def cubic(x1: float, y1: float, cx1: float, cy1: float, cx2: float, cy2: float, x2: float, y2: float, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a cubic bezier curve with optional style.\"\"\"
    return _add_style(
        {{"type": "cubic", "points": [
            {{"x": x1, "y": y1}}, {{"x": cx1, "y": cy1}}, {{"x": cx2, "y": cy2}}, {{"x": x2, "y": y2}}
        ]}},
        color, stroke_width, opacity
    )

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
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=PYTHON_TIMEOUT)
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


# Global callbacks - will be set by the agent
_draw_callback: Any = None
_get_canvas_callback: Any = None
_add_strokes_callback: Any = None
_get_workspace_dir_callback: Any = None


def set_draw_callback(callback: Any) -> None:
    """Set the callback function for drawing paths."""
    global _draw_callback
    _draw_callback = callback


def set_get_canvas_callback(callback: Any) -> None:
    """Set the callback function for getting canvas image."""
    global _get_canvas_callback
    _get_canvas_callback = callback


def set_add_strokes_callback(callback: Any) -> None:
    """Set the callback function for adding strokes to state.

    This callback adds strokes to state synchronously (before the tool returns)
    so the canvas image can include the new strokes.
    """
    global _add_strokes_callback
    _add_strokes_callback = callback


def set_workspace_dir_callback(callback: Any) -> None:
    """Set the callback function for getting the workspace directory.

    Used by generate_image to save reference images.
    """
    global _get_workspace_dir_callback
    _get_workspace_dir_callback = callback


def _inject_canvas_image(content: list[dict[str, Any]]) -> None:
    """Inject current canvas image into response content if callback is set."""
    if _get_canvas_callback is None:
        return
    try:
        png_bytes = _get_canvas_callback()
        image_b64 = base64.standard_b64encode(png_bytes).decode("utf-8")
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_b64,
                },
            }
        )
    except Exception as e:
        logger.warning(f"Failed to get canvas image: {e}")


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

    # Add strokes to state immediately (so canvas image includes them)
    logger.info(
        f"draw_paths: {len(parsed_paths)} paths, add_strokes={'set' if _add_strokes_callback else 'None'}"
    )
    if parsed_paths and _add_strokes_callback is not None:
        await _add_strokes_callback(parsed_paths)

    # Call the draw callback for animation (strokes already in state)
    logger.info(f"draw_paths: triggering animation, callback={'set' if _draw_callback else 'None'}")
    if parsed_paths and _draw_callback is not None:
        await _draw_callback(parsed_paths, done)

    # Build response content
    content: list[dict[str, Any]] = []

    # Report errors if any
    if errors:
        content.append(
            {
                "type": "text",
                "text": f"Parsed {len(parsed_paths)} paths with {len(errors)} errors:\n"
                + "\n".join(errors),
            }
        )
        if len(parsed_paths) == 0:
            return {"content": content, "is_error": True}
    else:
        content.append(
            {
                "type": "text",
                "text": f"Successfully drew {len(parsed_paths)} paths."
                + (" Piece marked as complete." if done else ""),
            }
        )

    # Inject canvas image if we drew paths
    if parsed_paths:
        _inject_canvas_image(content)

    return {"content": content}


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

    # Add strokes to state immediately (so canvas image includes them)
    logger.info(
        f"generate_svg: {len(paths)} paths, add_strokes={'set' if _add_strokes_callback else 'None'}"
    )
    if paths and _add_strokes_callback is not None:
        await _add_strokes_callback(paths)
        response_parts.append(f"Successfully generated and drew {len(paths)} paths.")
    elif not paths:
        response_parts.append(
            "Code executed but no paths were generated. "
            "Make sure to call output_paths() or output_svg_paths() at the end."
        )

    # Call the draw callback for animation (strokes already in state)
    logger.info(
        f"generate_svg: triggering animation, callback={'set' if _draw_callback else 'None'}"
    )
    if paths and _draw_callback is not None:
        await _draw_callback(paths, done)

    if done:
        response_parts.append("Piece marked as complete.")

    # Include stdout if there's additional output
    if stdout and not stdout.strip().startswith("{"):
        response_parts.append(f"Output:\n{stdout[:500]}")

    # Build response content
    content: list[dict[str, Any]] = [{"type": "text", "text": "\n".join(response_parts)}]

    # Inject canvas image if we drew paths
    if paths:
        _inject_canvas_image(content)

    return {"content": content}


@tool(
    "draw_paths",
    "Draw paths on the canvas (800x600). Coordinates must be within bounds: X 0-800, Y 0-600. Each path has a type (line, polyline, quadratic, cubic, svg) and either points or a d-string. In Paint mode, paths can have color, stroke_width, and opacity.",
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
                            "description": "SVG path d-string (for type=svg). Coordinates must be within canvas bounds (0-800, 0-600). Example: 'M 100 100 L 400 300 C 500 200 600 400 700 300'",
                        },
                        "color": {
                            "type": "string",
                            "description": "Hex color for the path (Paint mode only). Example: '#e94560'",
                        },
                        "stroke_width": {
                            "type": "number",
                            "description": "Stroke width 0.5-10 (Paint mode only). Default: 3",
                        },
                        "opacity": {
                            "type": "number",
                            "description": "Opacity 0-1 (Paint mode only). Default: 1",
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

IMPORTANT: Canvas is 800x600. All coordinates must be within X: 0-800, Y: 0-600. Center is (400, 300).

The code has access to:
- canvas_width (800), canvas_height (600): Use for positioning within bounds
- math, random, json: Standard library modules
- Helper functions (all accept optional color, stroke_width, opacity kwargs for Paint mode):
  - line(x1, y1, x2, y2, color=None, stroke_width=None, opacity=None) -> path dict
  - polyline(*points, color=None, stroke_width=None, opacity=None) -> path dict (points are (x,y) tuples)
  - quadratic(x1, y1, cx, cy, x2, y2, color=None, stroke_width=None, opacity=None) -> path dict
  - cubic(x1, y1, cx1, cy1, cx2, cy2, x2, y2, color=None, stroke_width=None, opacity=None) -> path dict
  - svg_path(d_string, color=None, stroke_width=None, opacity=None) -> path dict
  - output_paths(paths_list) -> prints JSON to stdout
  - output_svg_paths(d_strings_list) -> prints JSON to stdout

Example - draw a spiral centered on canvas:
```python
paths = []
cx, cy = canvas_width / 2, canvas_height / 2  # (400, 300)
for i in range(100):
    t = i * 0.1
    r = 10 + t * 5
    x1, y1 = cx + r * math.cos(t), cy + r * math.sin(t)
    x2, y2 = cx + (r+5) * math.cos(t+0.1), cy + (r+5) * math.sin(t+0.1)
    paths.append(line(x1, y1, x2, y2))
output_paths(paths)
```

Example - colorful spiral (Paint mode):
```python
colors = ["#e94560", "#7b68ee", "#4ecdc4", "#ffd93d"]
paths = []
cx, cy = canvas_width / 2, canvas_height / 2
for i in range(100):
    t = i * 0.1
    r = 10 + t * 5
    x1, y1 = cx + r * math.cos(t), cy + r * math.sin(t)
    x2, y2 = cx + (r+5) * math.cos(t+0.1), cy + (r+5) * math.sin(t+0.1)
    paths.append(line(x1, y1, x2, y2, color=colors[i % len(colors)], stroke_width=2))
output_paths(paths)
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


async def handle_view_canvas() -> dict[str, Any]:
    """Handle view_canvas tool call (testable without decorator).

    Returns:
        Tool result with the current canvas image
    """
    if _get_canvas_callback is None:
        return {
            "content": [{"type": "text", "text": "Error: Canvas not available"}],
            "is_error": True,
        }

    png_bytes = _get_canvas_callback()
    image_b64 = base64.standard_b64encode(png_bytes).decode("utf-8")

    return {
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_b64,
                },
            }
        ],
    }


@tool(
    "view_canvas",
    "View the current canvas state as an image. Your strokes appear in black, human strokes appear in blue. Call this anytime to see your work.",
    {"type": "object", "properties": {}, "required": []},
)
async def view_canvas(_args: dict[str, Any]) -> dict[str, Any]:
    """View the current canvas as an image."""
    return await handle_view_canvas()


# Image generation timeout (seconds)
IMAGE_GEN_TIMEOUT = 60


async def handle_imagine(args: dict[str, Any]) -> dict[str, Any]:
    """Handle imagine tool call.

    Generates an image using Google's Nano Banana (Gemini image generation),
    saves it to the workspace, and returns it to the agent.

    Args:
        args: Dictionary with 'prompt' (required) and optional 'name' for the file

    Returns:
        Tool result with the generated image and file path
    """
    from code_monet.config import settings

    prompt = args.get("prompt", "")
    name = args.get("name", "")

    if not prompt or not isinstance(prompt, str):
        return {
            "content": [{"type": "text", "text": "Error: prompt must be a non-empty string"}],
            "is_error": True,
        }

    if not settings.google_api_key:
        return {
            "content": [
                {
                    "type": "text",
                    "text": "Error: Image generation not available. GOOGLE_API_KEY not configured.",
                }
            ],
            "is_error": True,
        }

    if _get_workspace_dir_callback is None:
        return {
            "content": [{"type": "text", "text": "Error: Workspace not available"}],
            "is_error": True,
        }

    try:
        from io import BytesIO

        from google import genai
        from PIL import Image

        # Initialize client with API key
        client = genai.Client(api_key=settings.google_api_key)

        # Generate image using Nano Banana (Flash model)
        logger.info(f"Generating image with prompt: {prompt[:100]}...")

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    client.models.generate_content,
                    model="gemini-2.5-flash-preview-05-20",
                    contents=[prompt],
                ),
                timeout=IMAGE_GEN_TIMEOUT,
            )
        except TimeoutError:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Image generation timed out after {IMAGE_GEN_TIMEOUT}s",
                    }
                ],
                "is_error": True,
            }

        # Check for valid response
        if not response.candidates or len(response.candidates) == 0:
            return {
                "content": [
                    {"type": "text", "text": "Error: No response from image generation API"}
                ],
                "is_error": True,
            }

        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            return {
                "content": [{"type": "text", "text": "Error: Empty response from API"}],
                "is_error": True,
            }

        # Process response
        image_data = None
        text_response = None

        for part in candidate.content.parts:
            if part.text is not None:
                text_response = part.text
            elif part.inline_data is not None:
                image_data = part.inline_data.data

        if image_data is None:
            error_msg = "No image generated."
            if text_response:
                error_msg += f" Model response: {text_response}"
            return {
                "content": [{"type": "text", "text": f"Error: {error_msg}"}],
                "is_error": True,
            }

        # Load image and save to workspace
        image = Image.open(BytesIO(image_data))
        workspace_dir = _get_workspace_dir_callback()
        references_dir = FilePath(workspace_dir) / "references"
        references_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        if name:
            # Sanitize the name
            safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
            filename = f"{safe_name}.png"
        else:
            # Generate a unique name based on timestamp
            filename = f"reference_{int(time.time())}.png"

        filepath = references_dir / filename
        image.save(filepath, "PNG")

        logger.info(f"Saved generated image to {filepath}")

        # Convert to base64 for response
        image_b64 = base64.standard_b64encode(image_data).decode("utf-8")

        # Build response
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": f"Generated image saved to references/{filename}. "
                f"You can view it anytime using the Read tool.",
            }
        ]

        # Add model's text response if any
        if text_response:
            content.append({"type": "text", "text": f"Model notes: {text_response}"})

        # Include the image in response
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_b64,
                },
            }
        )

        return {"content": content}

    except Exception as e:
        logger.exception(f"Image generation failed: {e}")
        return {
            "content": [{"type": "text", "text": f"Error generating image: {e!s}"}],
            "is_error": True,
        }


@tool(
    "imagine",
    """Generate a reference image using AI (Nano Banana / Google Gemini).

Use this to create reference images for your drawings - visual inspiration, style references,
or to visualize what you're trying to create before drawing it.

The generated image is saved to your workspace and returned so you can see it immediately.
You can view saved reference images later using the Read tool on the references/ directory.

Tips for good prompts:
- Be specific about subject, style, composition, and mood
- Use photographic terms like "wide angle", "close-up", "soft lighting"
- Specify art styles if relevant: "watercolor style", "line art", "minimalist"

Example prompts:
- "A serene Japanese garden with cherry blossoms at sunset, soft lighting"
- "Simple line drawing of a cat sitting, minimal black lines on white"
- "Abstract geometric pattern with overlapping circles in blue and orange"
""",
    {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Detailed description of the image to generate",
            },
            "name": {
                "type": "string",
                "description": "Optional name for the image file (without extension). If not provided, a timestamp-based name is used.",
            },
        },
        "required": ["prompt"],
    },
)
async def imagine(args: dict[str, Any]) -> dict[str, Any]:
    """Generate a reference image using AI."""
    return await handle_imagine(args)


def create_drawing_server() -> Any:
    """Create the MCP server with drawing tools."""
    return create_sdk_mcp_server(
        name="drawing",
        version="1.0.0",
        tools=[
            draw_paths,
            mark_piece_done,
            generate_svg,
            view_canvas,
            imagine,
        ],
    )
