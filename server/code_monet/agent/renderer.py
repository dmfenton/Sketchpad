"""Canvas rendering to PIL Image for the drawing agent."""

from __future__ import annotations

import base64
import io
from typing import TYPE_CHECKING

from PIL import Image, ImageDraw

from code_monet.brushes import expand_brush_stroke
from code_monet.canvas import path_to_point_list
from code_monet.types import DrawingStyleConfig, DrawingStyleType, Path

if TYPE_CHECKING:
    from code_monet.types import CanvasState


def render_canvas_to_image(
    canvas: CanvasState,
    style_config: DrawingStyleConfig,
    highlight_human: bool = True,
) -> Image.Image:
    """Render canvas state to a PIL Image.

    Renders paths using the active drawing style's colors and widths.
    In paint mode, applies brush expansion so the AI sees what users see.

    Args:
        canvas: The canvas state containing strokes
        style_config: Drawing style configuration for colors/widths
        highlight_human: If True, render human strokes in the highlight color

    Returns:
        PIL Image of the rendered canvas
    """
    is_paint_mode = canvas.drawing_style == DrawingStyleType.PAINT

    img = Image.new("RGB", (canvas.width, canvas.height), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    # Build list of paths to render, expanding brush strokes in paint mode
    paths_to_render: list[Path] = []
    for path in canvas.strokes:
        if is_paint_mode and path.brush:
            # Expand brush stroke so AI sees what users see
            expanded = expand_brush_stroke(path)
            paths_to_render.extend(expanded)
        else:
            paths_to_render.append(path)

    for path in paths_to_render:
        points = path_to_point_list(path)
        if len(points) >= 2:
            # Get the effective style for this path
            effective_style = path.get_effective_style(style_config)

            # For the canvas image shown to the agent, use style colors
            # In plotter mode, human strokes are blue for visibility
            if highlight_human and path.author == "human":
                color = style_config.human_stroke.color
            else:
                color = effective_style.color

            width = max(1, int(effective_style.stroke_width))
            draw.line(points, fill=color, width=width)

    return img


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64 string.

    Args:
        img: PIL Image to convert

    Returns:
        Base64-encoded PNG string
    """
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")
