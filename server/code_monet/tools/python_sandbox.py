"""Python code execution sandbox for SVG generation."""

from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path as FilePath
from typing import Any

from code_monet.types import BRUSH_PRESETS, Path, PathType

from .path_parsing import parse_path_data

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
    # Generate BRUSHES list from presets (ensures consistency with types.py)
    brushes_list = json.dumps(list(BRUSH_PRESETS.keys()))

    # Prepend canvas dimensions as variables
    full_code = f"""
import math
import random
import json

# Canvas dimensions
canvas_width = {canvas_width}
canvas_height = {canvas_height}

# Available brush presets for paint mode (generated from BRUSH_PRESETS)
BRUSHES = {brushes_list}

# Helper function to add style properties to a path dict
def _add_style(path_dict: dict, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Add optional style and brush properties to a path dict.\"\"\"
    if brush is not None:
        path_dict["brush"] = brush
    if color is not None:
        path_dict["color"] = color
    if stroke_width is not None:
        path_dict["stroke_width"] = stroke_width
    if opacity is not None:
        path_dict["opacity"] = opacity
    return path_dict

# Helper functions for generating paths (all support optional brush and style parameters)
def svg_path(d: str, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create an SVG path dict with optional brush and style.\"\"\"
    return _add_style({{"type": "svg", "d": d}}, brush, color, stroke_width, opacity)

def line(x1: float, y1: float, x2: float, y2: float, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a line path with optional brush and style.\"\"\"
    return _add_style(
        {{"type": "line", "points": [{{"x": x1, "y": y1}}, {{"x": x2, "y": y2}}]}},
        brush, color, stroke_width, opacity
    )

def polyline(*points, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a polyline from (x, y) tuples with optional brush and style.\"\"\"
    return _add_style(
        {{"type": "polyline", "points": [{{"x": p[0], "y": p[1]}} for p in points]}},
        brush, color, stroke_width, opacity
    )

def quadratic(x1: float, y1: float, cx: float, cy: float, x2: float, y2: float, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a quadratic bezier curve with optional brush and style.\"\"\"
    return _add_style(
        {{"type": "quadratic", "points": [
            {{"x": x1, "y": y1}}, {{"x": cx, "y": cy}}, {{"x": x2, "y": y2}}
        ]}},
        brush, color, stroke_width, opacity
    )

def cubic(x1: float, y1: float, cx1: float, cy1: float, cx2: float, cy2: float, x2: float, y2: float, brush=None, color=None, stroke_width=None, opacity=None) -> dict:
    \"\"\"Create a cubic bezier curve with optional brush and style.\"\"\"
    return _add_style(
        {{"type": "cubic", "points": [
            {{"x": x1, "y": y1}}, {{"x": cx1, "y": cy1}}, {{"x": cx2, "y": cy2}}, {{"x": x2, "y": y2}}
        ]}},
        brush, color, stroke_width, opacity
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
                            parsed = parse_path_data(
                                path_data,
                                canvas_width=canvas_width,
                                canvas_height=canvas_height,
                            )
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
