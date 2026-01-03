"""WebSocket message handlers."""

import logging
from typing import TYPE_CHECKING, Any

from fastapi import WebSocket

from drawing_agent.canvas import (
    add_stroke,
    clear_canvas,
    load_canvas_from_gallery,
    save_current_canvas,
)
from drawing_agent.message_router import MessageRouter
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

if TYPE_CHECKING:
    from drawing_agent.agent import DrawingAgent
    from drawing_agent.main import ConnectionManager

logger = logging.getLogger(__name__)

# Create the router instance
router = MessageRouter()

# These will be set by main.py during initialization
_manager: "ConnectionManager | None" = None
_agent: "DrawingAgent | None" = None


def init_handlers(manager: "ConnectionManager", agent: "DrawingAgent") -> None:
    """Initialize handlers with required dependencies."""
    global _manager, _agent
    _manager = manager
    _agent = agent


def get_manager() -> "ConnectionManager":
    """Get the connection manager (raises if not initialized)."""
    if _manager is None:
        raise RuntimeError("Handlers not initialized. Call init_handlers first.")
    return _manager


def get_agent() -> "DrawingAgent":
    """Get the agent (raises if not initialized)."""
    if _agent is None:
        raise RuntimeError("Handlers not initialized. Call init_handlers first.")
    return _agent


@router.handler("stroke")
async def handle_stroke(message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle a stroke from the user."""
    points = [Point(x=p["x"], y=p["y"]) for p in message.get("points", [])]
    if points:
        path = Path(type=PathType.POLYLINE, points=points)
        add_stroke(path)
        # Broadcast to other clients
        await get_manager().broadcast(
            {"type": "stroke_complete", "path": path.model_dump()}
        )


@router.handler("nudge")
async def handle_nudge(message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle a nudge suggestion from the user."""
    text = message.get("text", "")
    if text:
        get_agent().add_nudge(text)
        logger.info(f"Nudge received: {text}")


@router.handler("clear")
async def handle_clear(_message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle canvas clear request."""
    clear_canvas()
    await get_manager().broadcast(ClearMessage())
    logger.info("Canvas cleared")


@router.handler("new_canvas")
async def handle_new_canvas(_message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle new canvas request (save current and start fresh)."""
    manager = get_manager()
    agent = get_agent()

    saved_id = save_current_canvas()
    agent.reset_container()  # Fresh container for new piece
    await manager.broadcast(NewCanvasMessage(saved_id=saved_id))

    # Also send gallery update
    await manager.broadcast(GalleryUpdateMessage(canvases=workspace.list_gallery()))

    # Send updated piece count
    await manager.broadcast({"type": "piece_count", "count": state_manager.piece_count})
    logger.info(
        f"New canvas created (piece #{state_manager.piece_count}), saved old as: {saved_id}"
    )


@router.handler("load_canvas")
async def handle_load_canvas(message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle loading a canvas from gallery."""
    canvas_id = message.get("canvas_id", "")
    strokes = load_canvas_from_gallery(canvas_id)

    if strokes:
        # Extract piece number from canvas_id (e.g., "piece_071" -> 71)
        piece_num = int(canvas_id.split("_")[1]) if "_" in canvas_id else 0
        state_manager.canvas.strokes[:] = strokes
        state_manager.save()
        await get_manager().broadcast(
            LoadCanvasMessage(strokes=strokes, piece_number=piece_num)
        )
        logger.info(f"Loaded canvas: {canvas_id}")
    else:
        logger.warning(f"Canvas not found: {canvas_id}")


@router.handler("pause")
async def handle_pause(_message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle pause request."""
    agent = get_agent()
    manager = get_manager()

    await agent.pause()
    state_manager.status = AgentStatus.PAUSED
    state_manager.save()
    await manager.broadcast(StatusMessage(status=AgentStatus.PAUSED))
    logger.info("Agent paused")


@router.handler("resume")
async def handle_resume(_message: dict[str, Any], _websocket: WebSocket) -> None:
    """Handle resume request."""
    agent = get_agent()
    manager = get_manager()

    await agent.resume()
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
    await manager.broadcast(StatusMessage(status=AgentStatus.IDLE))
    logger.info("Agent resumed")
