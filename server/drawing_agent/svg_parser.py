"""Parse SVG files and path strings into drawable Path objects."""

import json
import logging
import re
from xml.etree import ElementTree as ET

from svgpathtools import (
    CubicBezier,
    Line,
    QuadraticBezier,
    parse_path,
)
from svgpathtools import Path as SVGPath

from drawing_agent.types import Path, PathType, Point

logger = logging.getLogger(__name__)


def parse_svg_path_d(d: str) -> list[Path]:
    """Parse an SVG path 'd' attribute string into Path objects.

    Args:
        d: SVG path data string (e.g., "M 0 0 L 100 100")

    Returns:
        List of Path objects
    """
    if not d or not d.strip():
        return []

    try:
        svg_path: SVGPath = parse_path(d)
    except Exception:
        return []

    paths: list[Path] = []

    for segment in svg_path:
        if isinstance(segment, Line):
            # Line segment: start and end points
            paths.append(
                Path(
                    type=PathType.LINE,
                    points=[
                        Point(x=segment.start.real, y=segment.start.imag),
                        Point(x=segment.end.real, y=segment.end.imag),
                    ],
                )
            )
        elif isinstance(segment, QuadraticBezier):
            # Quadratic bezier: start, control, end
            paths.append(
                Path(
                    type=PathType.QUADRATIC,
                    points=[
                        Point(x=segment.start.real, y=segment.start.imag),
                        Point(x=segment.control.real, y=segment.control.imag),
                        Point(x=segment.end.real, y=segment.end.imag),
                    ],
                )
            )
        elif isinstance(segment, CubicBezier):
            # Cubic bezier: start, control1, control2, end
            paths.append(
                Path(
                    type=PathType.CUBIC,
                    points=[
                        Point(x=segment.start.real, y=segment.start.imag),
                        Point(x=segment.control1.real, y=segment.control1.imag),
                        Point(x=segment.control2.real, y=segment.control2.imag),
                        Point(x=segment.end.real, y=segment.end.imag),
                    ],
                )
            )
        # Arc segments are converted to cubic beziers by svgpathtools automatically

    return paths


def parse_svg_string(svg_text: str) -> list[Path]:
    """Parse an SVG string and extract all paths.

    Args:
        svg_text: Complete SVG document as string

    Returns:
        List of Path objects from all <path> elements
    """
    if not svg_text or not svg_text.strip():
        return []

    # Handle potential namespace issues
    svg_text = re.sub(r'\sxmlns="[^"]*"', "", svg_text)

    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError:
        return []

    paths: list[Path] = []

    # Find all path elements (handle potential namespace prefix)
    for path_elem in root.iter():
        if path_elem.tag.endswith("path") or path_elem.tag == "path":
            d = path_elem.get("d", "")
            if d:
                paths.extend(parse_svg_path_d(d))

    return paths


def parse_json_paths(json_text: str) -> list[Path]:
    """Parse JSON array of path definitions.

    Expected format:
    [
        {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]},
        {"type": "polyline", "points": [{"x": 0, "y": 0}, {"x": 50, "y": 50}, {"x": 100, "y": 0}]},
        ...
    ]

    Args:
        json_text: JSON string containing array of path definitions

    Returns:
        List of Path objects
    """
    if not json_text or not json_text.strip():
        return []

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    paths: list[Path] = []

    for item in data:
        if not isinstance(item, dict):
            continue

        path_type_str = item.get("type", "")
        raw_points = item.get("points", [])

        try:
            path_type = PathType(path_type_str)
        except ValueError:
            continue

        if not isinstance(raw_points, list):
            continue

        points: list[Point] = []
        for p in raw_points:
            if not isinstance(p, dict):
                continue
            if "x" not in p or "y" not in p:
                logger.warning(f"Point missing x or y coordinate: {p}")
                continue
            points.append(Point(x=float(p["x"]), y=float(p["y"])))

        if points:
            paths.append(Path(type=path_type, points=points))

    return paths


def extract_paths_from_output(stdout: str) -> list[Path]:
    """Extract paths from code execution stdout.

    Tries to parse as JSON first, falls back to looking for JSON arrays in the output.

    Args:
        stdout: Standard output from code execution

    Returns:
        List of Path objects
    """
    if not stdout or not stdout.strip():
        return []

    # Try direct JSON parse first
    paths = parse_json_paths(stdout.strip())
    if paths:
        return paths

    # Look for JSON arrays in the output (in case there's other text)
    json_pattern = r"\[[\s\S]*?\{[\s\S]*?\"type\"[\s\S]*?\}[\s\S]*?\]"
    matches = re.findall(json_pattern, stdout)

    for match in matches:
        paths = parse_json_paths(match)
        if paths:
            return paths

    return []
