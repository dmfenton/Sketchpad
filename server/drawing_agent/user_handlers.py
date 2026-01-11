"""WebSocket message handlers for multi-user workspaces.

Each handler receives the ActiveWorkspace context for the authenticated user.
"""

import logging
from typing import Any

from drawing_agent.registry import ActiveWorkspace
from drawing_agent.types import (
    AgentStatus,
    ClearMessage,
    NewCanvasMessage,
    Path,
    PathType,
    Point,
    StatusMessage,
)

logger = logging.getLogger(__name__)


async def handle_stroke(workspace: ActiveWorkspace, message: dict[str, Any]) -> None:
    """Handle a stroke from the user."""
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

    # Notify client to refetch gallery (client uses REST to get actual data)
    await workspace.connections.broadcast({"type": "gallery_changed"})
    await workspace.connections.broadcast(
        {"type": "piece_count", "count": workspace.state.piece_count}
    )

    # Auto-start the agent on new canvas
    await workspace.agent.resume()
    workspace.state.status = AgentStatus.IDLE
    await workspace.state.save()
    await workspace.connections.broadcast(StatusMessage(status=AgentStatus.IDLE))
    await workspace.connections.broadcast({"type": "paused", "paused": False})

    logger.info(
        f"User {workspace.user_id}: new canvas (piece #{workspace.state.piece_count}), saved: {saved_id}, auto-started"
    )


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
    logger.info(f"User {workspace.user_id}: agent resumed")


# Dispatch table
HANDLERS: dict[str, Any] = {
    "stroke": handle_stroke,
    "nudge": handle_nudge,
    "clear": handle_clear,
    "new_canvas": handle_new_canvas,
    "pause": handle_pause,
    "resume": handle_resume,
}


async def handle_user_message(workspace: ActiveWorkspace, message: dict[str, Any]) -> bool:
    """Route message to handler. Returns True if handled."""
    msg_type = message.get("type")
    handler = HANDLERS.get(msg_type) if msg_type else None

    if handler:
        # Handlers that need the message get it, others don't
        if msg_type in ("stroke", "nudge", "new_canvas", "resume"):
            await handler(workspace, message)
        else:
            await handler(workspace)
        return True

    if msg_type:
        logger.warning(f"User {workspace.user_id}: unknown message type: {msg_type}")
    return False
