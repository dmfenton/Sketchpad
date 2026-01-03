"""WebSocket message handlers."""

import logging
from typing import Any

from drawing_agent.agent import agent
from drawing_agent.canvas import (
    add_stroke,
    clear_canvas,
    load_canvas_from_gallery,
    save_current_canvas,
)
from drawing_agent.connections import manager
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentStatus,
    ClearMessage,
    GalleryUpdateMessage,
    LoadCanvasMessage,
    NewCanvasMessage,
    Path,
    PathType,
    Point,
    StatusMessage,
)
from drawing_agent.workspace import workspace

logger = logging.getLogger(__name__)


async def handle_stroke(message: dict[str, Any]) -> None:
    """Handle a stroke from the user."""
    points = [Point(x=p["x"], y=p["y"]) for p in message.get("points", [])]
    if points:
        path = Path(type=PathType.POLYLINE, points=points, author="human")
        add_stroke(path)
        await manager.broadcast({"type": "stroke_complete", "path": path.model_dump()})


async def handle_nudge(message: dict[str, Any]) -> None:
    """Handle a nudge suggestion from the user."""
    text = message.get("text", "")
    if text:
        agent.add_nudge(text)
        logger.info(f"Nudge received: {text}")


async def handle_clear() -> None:
    """Handle canvas clear request."""
    clear_canvas()
    await manager.broadcast(ClearMessage())
    logger.info("Canvas cleared")


async def handle_new_canvas(message: dict[str, Any] | None = None) -> None:
    """Handle new canvas request (save current and start fresh)."""
    saved_id = save_current_canvas()
    agent.reset_container()

    # If direction provided, add it as an initial nudge for the new piece
    direction = message.get("direction") if message else None
    if direction:
        agent.add_nudge(direction)
        logger.info(f"New canvas with direction: {direction}")

    await manager.broadcast(NewCanvasMessage(saved_id=saved_id))
    await manager.broadcast(GalleryUpdateMessage(canvases=workspace.list_gallery()))
    await manager.broadcast({"type": "piece_count", "count": state_manager.piece_count})
    logger.info(f"New canvas (piece #{state_manager.piece_count}), saved: {saved_id}")


async def handle_load_canvas(message: dict[str, Any]) -> None:
    """Handle loading a canvas from gallery."""
    canvas_id = message.get("canvas_id", "")
    strokes = load_canvas_from_gallery(canvas_id)

    if strokes:
        piece_num = int(canvas_id.split("_")[1]) if "_" in canvas_id else 0
        state_manager.canvas.strokes[:] = strokes
        state_manager.save()
        await manager.broadcast(LoadCanvasMessage(strokes=strokes, piece_number=piece_num))
        logger.info(f"Loaded canvas: {canvas_id}")
    else:
        logger.warning(f"Canvas not found: {canvas_id}")


async def handle_pause() -> None:
    """Handle pause request."""
    await agent.pause()
    state_manager.status = AgentStatus.PAUSED
    state_manager.save()
    await manager.broadcast(StatusMessage(status=AgentStatus.PAUSED))
    logger.info("Agent paused")


async def handle_resume() -> None:
    """Handle resume request."""
    await agent.resume()
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
    await manager.broadcast(StatusMessage(status=AgentStatus.IDLE))
    logger.info("Agent resumed")


# Simple dispatch table
HANDLERS: dict[str, Any] = {
    "stroke": handle_stroke,
    "nudge": handle_nudge,
    "clear": handle_clear,
    "new_canvas": handle_new_canvas,
    "load_canvas": handle_load_canvas,
    "pause": handle_pause,
    "resume": handle_resume,
}


async def handle_message(message: dict[str, Any]) -> bool:
    """Route message to handler. Returns True if handled."""
    msg_type = message.get("type")
    handler = HANDLERS.get(msg_type) if msg_type else None

    if handler:
        # Handlers that need the message get it, others don't
        if msg_type in ("stroke", "nudge", "load_canvas", "new_canvas"):
            await handler(message)
        else:
            await handler()
        return True

    if msg_type:
        logger.warning(f"Unknown message type: {msg_type}")
    return False
