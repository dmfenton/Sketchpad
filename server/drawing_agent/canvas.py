"""Canvas state and rendering."""

import io
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw

from drawing_agent.state import state_manager
from drawing_agent.types import Path, PathType


def render_path_to_svg_d(path: Path) -> str:
    """Convert a path to SVG path 'd' attribute."""
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


def render_svg() -> str:
    """Render current canvas state to SVG."""
    state = state_manager.state
    canvas = state.canvas

    svg = ET.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "width": str(canvas.width),
            "height": str(canvas.height),
            "viewBox": f"0 0 {canvas.width} {canvas.height}",
        },
    )

    # White background
    ET.SubElement(
        svg,
        "rect",
        {
            "width": "100%",
            "height": "100%",
            "fill": "#FFFFFF",
        },
    )

    # Render strokes
    for path in canvas.strokes:
        d = render_path_to_svg_d(path)
        if d:
            ET.SubElement(
                svg,
                "path",
                {
                    "d": d,
                    "stroke": "#000000",
                    "stroke-width": "2",
                    "fill": "none",
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                },
            )

    return ET.tostring(svg, encoding="unicode")


def path_to_point_list(path: Path) -> list[tuple[float, float]]:
    """Convert path to list of (x, y) tuples for PIL drawing."""
    return [(p.x, p.y) for p in path.points]


def render_png() -> bytes:
    """Render current canvas state to PNG."""
    state = state_manager.state
    canvas = state.canvas

    img = Image.new("RGB", (canvas.width, canvas.height), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    for path in canvas.strokes:
        points = path_to_point_list(path)
        if len(points) >= 2:
            draw.line(points, fill="#000000", width=2)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def add_stroke(path: Path) -> None:
    """Add a completed stroke to the canvas."""
    state_manager.state.canvas.strokes.append(path)
    state_manager.save()


def clear_canvas() -> None:
    """Clear all strokes from the canvas."""
    state_manager.state.canvas.strokes = []
    state_manager.save()


def get_strokes() -> list[Path]:
    """Get all strokes on the canvas."""
    return state_manager.state.canvas.strokes


def get_canvas_image() -> Image.Image:
    """Get canvas as PIL Image for agent consumption."""
    png_bytes = render_png()
    return Image.open(io.BytesIO(png_bytes))
