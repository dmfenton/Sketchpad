"""Canvas rendering utilities.

Pure functions for path conversion and PNG rendering - no state access.
"""

import io

from PIL import Image, ImageDraw

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


def render_strokes_to_png(
    strokes: list[Path],
    width: int = 800,
    height: int = 800,
    background: str = "#FFFFFF",
    stroke_color: str = "#000000",
    stroke_width: int = 2,
    optimize: bool = True,
) -> bytes:
    """Render a list of strokes to a PNG image.

    Args:
        strokes: List of Path objects to render.
        width: Output image width in pixels. Defaults to 800.
        height: Output image height in pixels. Defaults to 800.
        background: Background color as hex string. Defaults to white.
        stroke_color: Stroke color as hex string. Defaults to black.
        stroke_width: Line width in pixels. Defaults to 2.
        optimize: Whether to optimize PNG compression. Defaults to True.

    Returns:
        PNG image data as bytes.

    Example:
        >>> from code_monet.types import Path, Point, PathType
        >>> stroke = Path(type=PathType.LINE, points=[Point(x=0, y=0), Point(x=100, y=100)])
        >>> png_data = render_strokes_to_png([stroke], width=200, height=200)
        >>> len(png_data) > 0
        True
    """
    img = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(img)

    for path in strokes:
        points = path_to_point_list(path)
        if len(points) >= 2:
            draw.line(points, fill=stroke_color, width=stroke_width)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=optimize)
    return buffer.getvalue()
