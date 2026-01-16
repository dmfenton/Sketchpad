"""Canvas rendering utilities.

Pure functions for path conversion - no state access.
"""

from code_monet.interpolation import interpolate_svg_path
from code_monet.types import Path, PathType


def render_path_to_svg_d(path: Path) -> str:
    """Convert a path to SVG path 'd' attribute."""
    # SVG paths already have their d-string
    if path.type == PathType.SVG:
        return path.d or ""

    if not path.points:
        return ""

    points = path.points
    d_parts: list[str] = []

    match path.type:
        case PathType.LINE:
            if len(points) >= 2:
                d_parts.append(f"M {points[0].x} {points[0].y}")
                d_parts.append(f"L {points[1].x} {points[1].y}")

        case PathType.POLYLINE:
            if points:
                d_parts.append(f"M {points[0].x} {points[0].y}")
                for p in points[1:]:
                    d_parts.append(f"L {p.x} {p.y}")

        case PathType.QUADRATIC:
            if len(points) >= 3:
                d_parts.append(f"M {points[0].x} {points[0].y}")
                d_parts.append(f"Q {points[1].x} {points[1].y} {points[2].x} {points[2].y}")

        case PathType.CUBIC:
            if len(points) >= 4:
                d_parts.append(f"M {points[0].x} {points[0].y}")
                d_parts.append(
                    f"C {points[1].x} {points[1].y} "
                    f"{points[2].x} {points[2].y} "
                    f"{points[3].x} {points[3].y}"
                )

    return " ".join(d_parts)


def path_to_point_list(path: Path) -> list[tuple[float, float]]:
    """Convert path to list of (x, y) tuples for PIL drawing."""
    # SVG paths need to be interpolated to get points
    if path.type == PathType.SVG:
        if not path.d:
            return []
        points = interpolate_svg_path(path.d, steps_per_unit=0.5)
        return [(p.x, p.y) for p in points]
    return [(p.x, p.y) for p in path.points]
