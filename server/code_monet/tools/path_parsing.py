"""Path data parsing and validation."""

from __future__ import annotations

from typing import Any

from code_monet.types import BRUSH_PRESETS, Path, PathType, Point


def parse_path_data(path_data: dict[str, Any]) -> Path | None:
    """Parse a path dictionary into a Path object.

    Supports optional style properties: brush, color, stroke_width, opacity.
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
        brush = path_data.get("brush")
        color = path_data.get("color")
        stroke_width = path_data.get("stroke_width")
        opacity = path_data.get("opacity")

        # Validate brush (must be a valid preset name or None)
        if brush is not None:
            if not isinstance(brush, str):
                brush = None
            elif brush not in BRUSH_PRESETS:
                brush = None  # Invalid brush name, ignore

        # Validate style properties
        if color is not None and not isinstance(color, str):
            color = None
        if stroke_width is not None:
            try:
                stroke_width = float(stroke_width)
                # Clamp to reasonable range (extended for brushes)
                stroke_width = max(0.5, min(30.0, stroke_width))
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
                brush=brush,
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
            brush=brush,
            color=color,
            stroke_width=stroke_width,
            opacity=opacity,
        )
    except (TypeError, ValueError):
        return None
