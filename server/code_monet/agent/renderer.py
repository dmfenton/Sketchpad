"""Canvas rendering to PIL Image for the drawing agent."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PIL import Image

from code_monet.rendering import (
    image_to_base64,
    options_for_agent_view,
    render_strokes,
)
from code_monet.types import DrawingStyleConfig

if TYPE_CHECKING:
    from code_monet.types import CanvasState

# Re-export for backwards compatibility
__all__ = ["render_canvas_to_image", "image_to_base64"]


def render_canvas_to_image(
    canvas: CanvasState,
    style_config: DrawingStyleConfig,  # noqa: ARG001 - kept for API compat
    highlight_human: bool = True,
) -> Image.Image:
    """Render canvas state to a PIL Image.

    Renders paths using the active drawing style's colors and widths.
    In paint mode, applies brush expansion so the AI sees what users see.

    Args:
        canvas: The canvas state containing strokes
        style_config: Drawing style configuration (unused, kept for API compat)
        highlight_human: If True, render human strokes in the highlight color

    Returns:
        PIL Image of the rendered canvas
    """
    options = options_for_agent_view(canvas)
    # Override highlight_human if caller specifies False
    if not highlight_human:
        from dataclasses import replace

        options = replace(options, highlight_human=False)

    result = render_strokes(canvas.strokes, options)
    assert isinstance(result, Image.Image)
    return result
