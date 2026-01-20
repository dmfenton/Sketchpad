"""Canvas state and rendering endpoints."""

import asyncio
import io
from typing import Any
from xml.etree import ElementTree as ET

from fastapi import APIRouter
from fastapi.responses import Response
from PIL import Image, ImageDraw

from code_monet.auth.dependencies import CurrentUser
from code_monet.canvas import path_to_point_list, render_path_to_svg_d
from code_monet.db import User
from code_monet.registry import workspace_registry
from code_monet.workspace_state import WorkspaceState

router = APIRouter()


async def get_user_state(user: User) -> WorkspaceState:
    """Get or create workspace state for a user."""
    workspace = workspace_registry.get(user.id)
    if workspace:
        return workspace.state
    # User not connected via WebSocket yet - load state directly
    return await WorkspaceState.load_for_user(user.id)


def _render_user_png_sync(state: WorkspaceState, highlight_human: bool = True) -> bytes:
    """Render user's canvas to PNG (synchronous, CPU-bound)."""
    canvas = state.canvas
    img = Image.new("RGB", (canvas.width, canvas.height), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    for path in canvas.strokes:
        points = path_to_point_list(path)
        if len(points) >= 2:
            color = "#0066CC" if highlight_human and path.author == "human" else "#000000"
            draw.line(points, fill=color, width=2)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def _render_strokes_to_png_sync(strokes: list, width: int = 800, height: int = 600) -> bytes:
    """Render strokes to PNG (synchronous, CPU-bound)."""
    img = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    for path in strokes:
        points = path_to_point_list(path)
        if len(points) >= 2:
            draw.line(points, fill="#000000", width=2)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


async def render_strokes_to_png(strokes: list, width: int = 800, height: int = 600) -> bytes:
    """Render strokes to PNG (async, non-blocking)."""
    return await asyncio.to_thread(_render_strokes_to_png_sync, strokes, width, height)


async def render_user_png(state: WorkspaceState, highlight_human: bool = True) -> bytes:
    """Render user's canvas to PNG (async, non-blocking).

    Offloads rendering to thread pool to avoid blocking the event loop.
    """
    return await asyncio.to_thread(_render_user_png_sync, state, highlight_human)


@router.get("/state")
async def get_state(user: CurrentUser) -> dict[str, Any]:
    """Get current canvas state for authenticated user."""
    state = await get_user_state(user)
    return {
        "canvas": state.canvas.model_dump(),
        "status": state.status.value,
        "piece_number": state.piece_number,
    }


@router.get("/canvas.png")
async def get_canvas_png(user: CurrentUser) -> Response:
    """Get user's canvas as PNG image."""
    state = await get_user_state(user)
    return Response(content=await render_user_png(state), media_type="image/png")


@router.get("/canvas.svg")
async def get_canvas_svg(user: CurrentUser) -> Response:
    """Get user's canvas as SVG image."""
    state = await get_user_state(user)
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
    ET.SubElement(svg, "rect", {"width": "100%", "height": "100%", "fill": "#FFFFFF"})

    for path in canvas.strokes:
        d = render_path_to_svg_d(path)
        if d:
            ET.SubElement(
                svg,
                "path",
                {"d": d, "stroke": "#000000", "stroke-width": "2", "fill": "none"},
            )

    return Response(content=ET.tostring(svg, encoding="unicode"), media_type="image/svg+xml")
