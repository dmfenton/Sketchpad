"""Canvas rendering and operations."""

import io
from typing import Any
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw

from drawing_agent.interpolation import interpolate_svg_path
from drawing_agent.state import state_manager
from drawing_agent.types import Path, PathType
from drawing_agent.workspace import workspace


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


def render_svg() -> str:
    """Render current canvas state to SVG."""
    canvas = state_manager.canvas

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
    # SVG paths need to be interpolated to get points
    if path.type == PathType.SVG:
        if not path.d:
            return []
        points = interpolate_svg_path(path.d, steps_per_unit=0.5)
        return [(p.x, p.y) for p in points]
    return [(p.x, p.y) for p in path.points]


def render_png() -> bytes:
    """Render current canvas state to PNG."""
    canvas = state_manager.canvas

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
    state_manager.add_stroke(path)


def clear_canvas() -> None:
    """Clear all strokes from the canvas."""
    state_manager.clear_canvas()


def get_strokes() -> list[Path]:
    """Get all strokes on the canvas."""
    return state_manager.canvas.strokes


def get_canvas_image() -> Image.Image:
    """Get canvas as PIL Image for agent consumption."""
    png_bytes = render_png()
    return Image.open(io.BytesIO(png_bytes))


def save_current_canvas() -> str | None:
    """Save current canvas to gallery. Returns saved ID or None if empty."""
    return state_manager.new_canvas()


def load_canvas_from_gallery(canvas_id: str) -> list[Path] | None:
    """Load a canvas from gallery by ID."""
    # canvas_id is like "piece_074" - extract piece number
    if canvas_id.startswith("piece_"):
        try:
            piece_num = int(canvas_id.split("_")[1])
            saved = workspace.load_from_gallery(piece_num)
            if saved:
                return saved.strokes
        except (ValueError, IndexError):
            pass
    return None


def get_gallery() -> list[dict[str, Any]]:
    """Get list of saved canvases."""
    canvases = workspace.list_gallery()
    return [
        {
            "id": c.id,
            "created_at": c.created_at,
            "piece_number": c.piece_number,
            "stroke_count": len(c.strokes),
        }
        for c in canvases
    ]
