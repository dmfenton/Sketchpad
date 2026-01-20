"""Signature tool for signing artwork."""

from __future__ import annotations

import re
from typing import Any

from claude_agent_sdk import tool

from code_monet.types import Path, PathType

from .callbacks import (
    get_add_strokes_callback,
    get_canvas_dimensions,
    get_draw_callback,
    inject_canvas_image,
)

# Signature SVG path data for "Code Monet" in elegant script
# This is a hand-crafted cursive signature that scales to fit any corner
_SIGNATURE_SVG = """M 0 25 C 5 10 15 5 25 15 C 35 25 20 35 30 30
Q 35 28 40 20 L 45 25 C 50 20 55 15 60 20
Q 65 25 60 30 C 55 35 50 30 55 25
M 75 15 Q 80 10 85 15 C 90 20 85 30 80 30 Q 75 30 75 25 Q 75 20 80 18
M 95 30 L 95 15 Q 100 10 105 15 Q 110 20 105 25 Q 100 30 95 30
M 115 20 Q 120 15 125 20 Q 130 25 125 30 Q 120 35 115 30 Q 110 25 115 20
M 145 25 L 160 25 M 152 15 L 152 35
M 175 15 Q 185 15 185 22 Q 185 28 180 30 Q 190 35 195 32 L 200 28
M 210 20 Q 215 15 220 20 Q 225 25 220 30 Q 215 35 210 30 Q 205 25 210 20
M 235 30 L 235 15 C 240 10 250 15 250 22 Q 250 28 245 30 Q 250 35 250 30
M 260 20 Q 265 15 270 20 Q 275 25 270 30 Q 265 35 260 30 Q 255 25 260 20
M 280 15 L 280 30 Q 285 35 290 30 L 290 15
M 300 15 L 300 30 M 300 20 L 310 30 M 305 25 L 310 15"""


def _transform_svg_path(d: str, scale: float, offset_x: float, offset_y: float) -> str:
    """Transform an SVG path by scaling and translating.

    Only handles absolute SVG commands (M, L, Q, C). The signature uses
    absolute coordinates only, so relative commands are not supported.

    Args:
        d: SVG path d-string with absolute commands only
        scale: Scale factor
        offset_x: X translation after scaling
        offset_y: Y translation after scaling

    Returns:
        Transformed d-string
    """
    # This transformer handles absolute SVG commands only (uppercase)
    # Split by commands, transform coordinate pairs
    result: list[str] = []
    tokens = re.findall(r"[MLQC]|[-+]?\d*\.?\d+", d)

    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token in "MLQC":
            result.append(token)
            i += 1
        else:
            # It's a number - check if it's X or Y based on position
            # In SVG, coordinates come in pairs (x, y)
            x = float(token)
            if i + 1 < len(tokens) and tokens[i + 1] not in "MLQCmlqc":
                y = float(tokens[i + 1])
                # Transform
                new_x = x * scale + offset_x
                new_y = y * scale + offset_y
                result.append(f"{new_x:.1f}")
                result.append(f"{new_y:.1f}")
                i += 2
            else:
                # Single number (shouldn't happen in well-formed paths)
                result.append(str(x * scale))
                i += 1

    return " ".join(result)


def _generate_signature_paths(
    position: str = "bottom_right",
    size: str = "medium",
    color: str | None = None,
) -> list[Path]:
    """Generate signature paths for "Code Monet" at the specified position.

    Args:
        position: Where to place the signature (bottom_right, bottom_left, bottom_center)
        size: Size of signature (small, medium, large)
        color: Optional color for the signature (hex string)

    Returns:
        List of Path objects for the signature
    """
    # Size scales
    scales = {"small": 0.4, "medium": 0.6, "large": 0.8}
    scale = scales.get(size, 0.6)

    # The signature SVG is about 310 units wide x 40 units tall
    sig_width = 310 * scale
    sig_height = 40 * scale

    # Position calculations using canvas dimensions from globals
    margin = 20.0
    dims = get_canvas_dimensions()
    canvas_w: float = float(dims[0])
    canvas_h: float = float(dims[1])
    offset_x: float
    offset_y: float
    if position == "bottom_left":
        offset_x = margin
        offset_y = canvas_h - margin - sig_height
    elif position == "bottom_center":
        offset_x = (canvas_w - sig_width) / 2
        offset_y = canvas_h - margin - sig_height
    else:  # bottom_right (default)
        offset_x = canvas_w - margin - sig_width
        offset_y = canvas_h - margin - sig_height

    # Parse and transform the signature SVG
    # Split into individual path commands
    paths: list[Path] = []

    # Each M command starts a new subpath in the signature
    subpaths = _SIGNATURE_SVG.strip().split("M ")
    for subpath in subpaths:
        if not subpath.strip():
            continue

        # Reconstruct with M prefix
        d_string = "M " + subpath.strip()

        # Transform coordinates by scaling and offsetting
        transformed = _transform_svg_path(d_string, scale, offset_x, offset_y)

        path = Path(
            type=PathType.SVG,
            points=[],
            d=transformed,
            color=color,
            stroke_width=1.5 * scale,
            opacity=0.85,
        )
        paths.append(path)

    return paths


async def handle_sign_canvas(args: dict[str, Any]) -> dict[str, Any]:
    """Handle sign_canvas tool call.

    Adds a theatrical "Code Monet" signature to the canvas.

    Args:
        args: Dictionary with optional 'position', 'size', and 'color'

    Returns:
        Tool result with confirmation and canvas image
    """
    position = args.get("position", "bottom_right")
    size = args.get("size", "medium")
    color = args.get("color")

    # Validate position
    valid_positions = ["bottom_right", "bottom_left", "bottom_center"]
    if position not in valid_positions:
        position = "bottom_right"

    # Validate size
    valid_sizes = ["small", "medium", "large"]
    if size not in valid_sizes:
        size = "medium"

    # Generate signature paths
    signature_paths = _generate_signature_paths(position, size, color)

    if not signature_paths:
        return {
            "content": [{"type": "text", "text": "Error: Failed to generate signature"}],
            "is_error": True,
        }

    # Add signature strokes to state
    _add_strokes_callback = get_add_strokes_callback()
    if _add_strokes_callback is not None:
        await _add_strokes_callback(signature_paths)

    # Trigger animation (don't mark done - let agent do that separately)
    _draw_callback = get_draw_callback()
    if _draw_callback is not None:
        await _draw_callback(signature_paths, False)

    # Build response
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": f"✒️ Signed the canvas with 'Code Monet' at {position.replace('_', ' ')} ({size} size). "
            "The signature adds a theatrical flourish to mark this as your work.",
        }
    ]

    # Inject canvas image to show the result
    inject_canvas_image(content)

    return {"content": content}


@tool(
    "sign_canvas",
    """Add your artistic signature "Code Monet" to the canvas.

Call this tool when you're satisfied with the piece, just before marking it done.
The signature is a theatrical flourish that identifies the work as yours.

The signature is rendered in an elegant cursive script style, positioned to
complement the composition without overwhelming it.

Position options:
- bottom_right (default): Traditional artist signature placement
- bottom_left: Alternative placement for right-heavy compositions
- bottom_center: Centered signature for symmetrical pieces

Size options:
- small: Subtle, unobtrusive (good for detailed work)
- medium (default): Balanced presence
- large: Bold statement (good for minimal compositions)""",
    {
        "type": "object",
        "properties": {
            "position": {
                "type": "string",
                "enum": ["bottom_right", "bottom_left", "bottom_center"],
                "description": "Where to place the signature",
                "default": "bottom_right",
            },
            "size": {
                "type": "string",
                "enum": ["small", "medium", "large"],
                "description": "Size of the signature",
                "default": "medium",
            },
            "color": {
                "type": "string",
                "description": "Optional hex color for signature. If not specified, uses a subtle dark tone that complements the piece.",
            },
        },
        "required": [],
    },
)
async def sign_canvas(args: dict[str, Any]) -> dict[str, Any]:
    """Sign the canvas with 'Code Monet'."""
    return await handle_sign_canvas(args)
