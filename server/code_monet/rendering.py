"""Centralized image rendering for canvas strokes.

This module provides a unified API for rendering strokes to images with
configurable options for background, dimensions, scaling, and output format.
"""

from __future__ import annotations

import asyncio
import base64
import io
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from PIL import Image, ImageDraw

from code_monet.brushes import expand_brush_stroke
from code_monet.canvas import path_to_point_list
from code_monet.types import DrawingStyleType, Path, get_style_config

if TYPE_CHECKING:
    from code_monet.types import CanvasState
    from code_monet.workspace import WorkspaceState


def hex_to_rgba(hex_color: str, opacity: float = 1.0) -> tuple[int, int, int, int]:
    """Convert hex color and opacity to RGBA tuple."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return (r, g, b, int(opacity * 255))


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")


@dataclass(frozen=True)
class RenderOptions:
    """Configuration for stroke rendering.

    Attributes:
        width: Output image width in pixels
        height: Output image height in pixels
        background_color: Background color as hex string or RGBA tuple
        drawing_style: Style config for stroke appearance
        highlight_human: Render human strokes in highlight color
        plotter_stroke_override: Override stroke color (e.g., white on dark bg)
        expand_brushes: Expand brush strokes for paint mode visibility
        scale_from: Source dimensions (w, h) for scaling strokes
        scale_padding: Padding when scaling
        output_format: Return type - "image" (PIL), "bytes", or "base64"
        optimize_png: Enable PNG optimization (slower but smaller)
    """

    width: int = 800
    height: int = 600
    background_color: str | tuple[int, int, int, int] = "#FFFFFF"
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER
    highlight_human: bool = False
    plotter_stroke_override: str | None = None
    expand_brushes: bool = False
    scale_from: tuple[int, int] | None = None
    scale_padding: int = 0
    output_format: Literal["image", "bytes", "base64"] = "bytes"
    optimize_png: bool = False

    def _parse_background(self) -> tuple[int, int, int, int]:
        """Parse background_color to RGBA tuple."""
        if isinstance(self.background_color, tuple):
            return self.background_color
        return hex_to_rgba(self.background_color, 1.0)


@dataclass
class _ScaleTransform:
    """Computed scale and offset for transforming coordinates."""

    scale: float = 1.0
    offset_x: float = 0.0
    offset_y: float = 0.0

    def apply(self, points: list[tuple[float, float]]) -> list[tuple[float, float]]:
        """Apply scale and offset to point list."""
        if self.scale == 1.0 and self.offset_x == 0.0 and self.offset_y == 0.0:
            return points
        return [(x * self.scale + self.offset_x, y * self.scale + self.offset_y) for x, y in points]


def _compute_transform(options: RenderOptions) -> _ScaleTransform:
    """Compute scale transform from options."""
    if options.scale_from is None:
        return _ScaleTransform()

    src_w, src_h = options.scale_from
    target_w = options.width - 2 * options.scale_padding
    target_h = options.height - 2 * options.scale_padding

    scale = min(target_w / src_w, target_h / src_h)
    offset_x = (options.width - src_w * scale) / 2
    offset_y = (options.height - src_h * scale) / 2

    return _ScaleTransform(scale=scale, offset_x=offset_x, offset_y=offset_y)


def render_strokes(
    strokes: list[Path],
    options: RenderOptions | None = None,
) -> Image.Image | bytes | str:
    """Core sync function to render strokes to an image.

    Args:
        strokes: List of Path objects to render
        options: Render configuration (uses defaults if None)

    Returns:
        PIL Image, PNG bytes, or base64 string depending on options.output_format
    """
    if options is None:
        options = RenderOptions()

    style_config = get_style_config(options.drawing_style)
    transform = _compute_transform(options)

    # Create image with background
    bg_rgba = options._parse_background()
    img = Image.new("RGBA", (options.width, options.height), bg_rgba)
    draw_layer = Image.new("RGBA", (options.width, options.height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(draw_layer)

    # Build list of paths, expanding brush strokes if needed
    paths_to_render: list[Path] = []
    if options.expand_brushes:
        for path in strokes:
            if path.brush:
                paths_to_render.extend(expand_brush_stroke(path))
            else:
                paths_to_render.append(path)
    else:
        paths_to_render = strokes

    for path in paths_to_render:
        points = path_to_point_list(path)
        if len(points) < 2:
            continue

        # Get effective style
        effective_style = path.get_effective_style(style_config)

        # Determine stroke color
        if options.plotter_stroke_override and options.drawing_style == DrawingStyleType.PLOTTER:
            rgba = hex_to_rgba(options.plotter_stroke_override, effective_style.opacity)
        elif options.highlight_human and path.author == "human":
            rgba = hex_to_rgba(style_config.human_stroke.color, effective_style.opacity)
        else:
            rgba = hex_to_rgba(effective_style.color, effective_style.opacity)

        # Apply scaling
        scaled_points = transform.apply(points)
        stroke_width = max(1, int(effective_style.stroke_width * transform.scale))

        draw.line(scaled_points, fill=rgba, width=stroke_width)

    img = Image.alpha_composite(img, draw_layer)
    img = img.convert("RGB")

    # Return in requested format
    if options.output_format == "image":
        return img

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=options.optimize_png)
    png_bytes = buffer.getvalue()

    if options.output_format == "base64":
        return base64.standard_b64encode(png_bytes).decode("utf-8")

    return png_bytes


async def render_strokes_async(
    strokes: list[Path],
    options: RenderOptions | None = None,
) -> Image.Image | bytes | str:
    """Async wrapper for render_strokes (runs in thread pool)."""
    return await asyncio.to_thread(render_strokes, strokes, options)


# =============================================================================
# Convenience functions for common use cases
# =============================================================================


def render_canvas(
    canvas: CanvasState,
    *,
    highlight_human: bool = False,
    expand_brushes: bool = False,
    output_format: Literal["image", "bytes", "base64"] = "bytes",
) -> Image.Image | bytes | str:
    """Render a CanvasState to an image.

    Convenience wrapper that extracts dimensions and style from canvas.
    """
    options = RenderOptions(
        width=canvas.width,
        height=canvas.height,
        drawing_style=canvas.drawing_style,
        highlight_human=highlight_human,
        expand_brushes=expand_brushes,
        output_format=output_format,
    )
    return render_strokes(canvas.strokes, options)


def render_workspace(
    state: WorkspaceState,
    *,
    highlight_human: bool = True,
    output_format: Literal["image", "bytes", "base64"] = "bytes",
) -> Image.Image | bytes | str:
    """Render a WorkspaceState's canvas to an image."""
    return render_canvas(
        state.canvas,
        highlight_human=highlight_human,
        output_format=output_format,
    )


async def render_workspace_async(
    state: WorkspaceState,
    *,
    highlight_human: bool = True,
    output_format: Literal["image", "bytes", "base64"] = "bytes",
) -> Image.Image | bytes | str:
    """Async wrapper for render_workspace."""
    return await asyncio.to_thread(
        render_workspace, state, highlight_human=highlight_human, output_format=output_format
    )


# =============================================================================
# Preset factories for common rendering scenarios
# =============================================================================


def options_for_agent_view(canvas: CanvasState) -> RenderOptions:
    """Options for rendering canvas for agent viewing.

    - Highlights human strokes
    - Expands brush strokes so AI sees what users see
    - Returns PIL Image for direct use
    """
    return RenderOptions(
        width=canvas.width,
        height=canvas.height,
        drawing_style=canvas.drawing_style,
        highlight_human=True,
        expand_brushes=True,
        output_format="image",
    )


def options_for_og_image(
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER,
) -> RenderOptions:
    """Options for Open Graph social sharing images.

    - 1200x630 (optimal OG size)
    - Dark background matching site theme
    - White strokes for plotter mode visibility
    - Scales from 800x600 with padding
    """
    return RenderOptions(
        width=1200,
        height=630,
        background_color=(26, 26, 46, 255),  # Dark background
        drawing_style=drawing_style,
        plotter_stroke_override="#FFFFFF" if drawing_style == DrawingStyleType.PLOTTER else None,
        scale_from=(800, 600),
        scale_padding=50,
        optimize_png=True,
    )


def options_for_thumbnail(
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER,
) -> RenderOptions:
    """Options for gallery thumbnails.

    - 800x600 standard canvas size
    - White background
    """
    return RenderOptions(
        width=800,
        height=600,
        background_color="#FFFFFF",
        drawing_style=drawing_style,
    )


def options_for_share_preview(
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER,
) -> RenderOptions:
    """Options for share link preview images.

    - 800x600 standard canvas size
    - White background
    - PNG optimization for smaller files
    """
    return RenderOptions(
        width=800,
        height=600,
        background_color="#FFFFFF",
        drawing_style=drawing_style,
        optimize_png=True,
    )


# Keep _hex_to_rgba as alias for backwards compatibility in tests
_hex_to_rgba = hex_to_rgba
