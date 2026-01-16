"""WebSocket message handlers for multi-user workspaces.

Each handler receives the ActiveWorkspace context for the authenticated user.
"""

import logging
from typing import Any

from code_monet.config import settings
from code_monet.rate_limiter import RateLimiter, RateLimiterConfig
from code_monet.registry import ActiveWorkspace
from code_monet.types import (
    AgentStatus,
    ClearMessage,
    LoadCanvasMessage,
    NewCanvasMessage,
    Path,
    PathType,
    Point,
    StatusMessage,
)

logger = logging.getLogger(__name__)

# Rate limiter for user strokes
_stroke_limiter = RateLimiter(
    RateLimiterConfig(
        max_requests=settings.max_strokes_per_minute,
        window_seconds=60.0,
    )
)


async def handle_stroke(workspace: ActiveWorkspace, message: dict[str, Any]) -> None:
    """Handle a stroke from the user."""
    # Rate limit check
    if not _stroke_limiter.is_allowed(workspace.user_id):
        remaining_info = f"({_stroke_limiter.remaining(workspace.user_id)} remaining)"
        logger.warning(f"User {workspace.user_id}: stroke rate limited {remaining_info}")
        await workspace.connections.broadcast(
            {"type": "error", "message": "Drawing too fast. Please slow down."}
        )
        return

    points = [Point(x=p["x"], y=p["y"]) for p in message.get("points", [])]
    if points:
        path = Path(type=PathType.POLYLINE, points=points, author="human")
        await workspace.state.add_stroke(path)
        await workspace.connections.broadcast(
            {"type": "stroke_complete", "path": path.model_dump()}
        )


async def handle_nudge(workspace: ActiveWorkspace, message: dict[str, Any]) -> None:
    """Handle a nudge suggestion from the user."""
    text = message.get("text", "")
    if text:
        workspace.agent.add_nudge(text)
        # Wake the orchestrator immediately to process the nudge
        if workspace.orchestrator:
            workspace.orchestrator.wake()
        logger.info(f"User {workspace.user_id} nudge: {text}")


async def handle_clear(workspace: ActiveWorkspace) -> None:
    """Handle canvas clear request."""
    await workspace.state.clear_canvas()
    await workspace.connections.broadcast(ClearMessage())
    logger.info(f"User {workspace.user_id}: canvas cleared")


async def handle_new_canvas(
    workspace: ActiveWorkspace, message: dict[str, Any] | None = None
) -> None:
    """Handle new canvas request (save current and start fresh)."""
    saved_id = await workspace.state.new_canvas()
    workspace.agent.reset_container()

    # If direction provided, add it as an initial nudge for the new piece
    direction = message.get("direction") if message else None
    if direction:
        workspace.agent.add_nudge(direction)
        logger.info(f"User {workspace.user_id}: new canvas with direction: {direction}")

    await workspace.connections.broadcast(NewCanvasMessage(saved_id=saved_id))

    # Send updated gallery
    gallery_pieces = await workspace.state.list_gallery()
    gallery_data = [
        {
            "id": p.id,
            "created_at": p.created_at,
            "piece_number": p.piece_number,
            "stroke_count": len(p.strokes),
        }
        for p in gallery_pieces
    ]
    # Send as raw dict - app expects stroke_count metadata, not full strokes
    await workspace.connections.broadcast({"type": "gallery_update", "canvases": gallery_data})
    await workspace.connections.broadcast(
        {"type": "piece_count", "count": workspace.state.piece_count}
    )

    # Auto-start the agent on new canvas
    await workspace.agent.resume()
    workspace.state.status = AgentStatus.IDLE
    await workspace.state.save()
    await workspace.connections.broadcast(StatusMessage(status=AgentStatus.IDLE))
    await workspace.connections.broadcast({"type": "paused", "paused": False})
    # Wake the orchestrator immediately to start working
    if workspace.orchestrator:
        workspace.orchestrator.wake()

    logger.info(
        f"User {workspace.user_id}: new canvas (piece #{workspace.state.piece_count}), saved: {saved_id}, auto-started"
    )


async def handle_load_canvas(workspace: ActiveWorkspace, message: dict[str, Any]) -> None:
    """Handle loading a canvas from gallery."""
    canvas_id = message.get("canvas_id", "")

    # Extract piece number from canvas_id (e.g., "piece_074")
    if canvas_id.startswith("piece_"):
        try:
            piece_num = int(canvas_id.split("_")[1])
            strokes = await workspace.state.load_from_gallery(piece_num)

            if strokes:
                workspace.state.canvas.strokes[:] = strokes
                await workspace.state.save()
                await workspace.connections.broadcast(
                    LoadCanvasMessage(strokes=strokes, piece_number=piece_num)
                )
                logger.info(f"User {workspace.user_id}: loaded canvas {canvas_id}")
                return
        except (ValueError, IndexError):
            pass

    logger.warning(f"User {workspace.user_id}: canvas not found: {canvas_id}")


async def handle_pause(workspace: ActiveWorkspace) -> None:
    """Handle pause request."""
    await workspace.agent.pause()
    workspace.state.status = AgentStatus.PAUSED
    await workspace.state.save()
    await workspace.connections.broadcast(StatusMessage(status=AgentStatus.PAUSED))
    logger.info(f"User {workspace.user_id}: agent paused")


async def handle_resume(workspace: ActiveWorkspace, message: dict[str, Any] | None = None) -> None:
    """Handle resume request with optional direction."""
    # If direction provided, add it as a nudge before resuming
    direction = message.get("direction") if message else None
    if direction:
        workspace.agent.add_nudge(direction)
        logger.info(f"User {workspace.user_id}: resume with direction: {direction}")

    await workspace.agent.resume()
    workspace.state.status = AgentStatus.IDLE
    await workspace.state.save()
    await workspace.connections.broadcast(StatusMessage(status=AgentStatus.IDLE))
    await workspace.connections.broadcast({"type": "paused", "paused": False})
    # Wake the orchestrator immediately to start working
    if workspace.orchestrator:
        workspace.orchestrator.wake()
    logger.info(f"User {workspace.user_id}: agent resumed")


# Dispatch table
HANDLERS: dict[str, Any] = {
    "stroke": handle_stroke,
    "nudge": handle_nudge,
    "clear": handle_clear,
    "new_canvas": handle_new_canvas,
    "load_canvas": handle_load_canvas,
    "pause": handle_pause,
    "resume": handle_resume,
}


async def handle_user_message(workspace: ActiveWorkspace, message: dict[str, Any]) -> bool:
    """Route message to handler. Returns True if handled."""
    msg_type = message.get("type")
    handler = HANDLERS.get(msg_type) if msg_type else None

    logger.info(f"[MSG] User {workspace.user_id}: received type={msg_type}")

    if handler:
        # Handlers that need the message get it, others don't
        if msg_type in ("stroke", "nudge", "load_canvas", "new_canvas", "resume"):
            await handler(workspace, message)
        else:
            await handler(workspace)
        logger.info(f"[MSG] User {workspace.user_id}: {msg_type} handled OK")
        return True

    if msg_type:
        logger.warning(f"User {workspace.user_id}: unknown message type: {msg_type}")
    return False
