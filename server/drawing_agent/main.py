"""FastAPI application with WebSocket support."""

import asyncio
import contextlib
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from drawing_agent.agent import agent
from drawing_agent.canvas import (
    add_stroke,
    clear_canvas,
    get_gallery,
    load_canvas_from_gallery,
    render_png,
    render_svg,
    save_current_canvas,
)
from drawing_agent.config import settings
from drawing_agent.executor import execute_paths
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
    ThinkingMessage,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: Any) -> None:
        """Broadcast message to all connected clients."""
        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)

        failed_connections: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")
                failed_connections.append(connection)

        # Remove failed connections
        for conn in failed_connections:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
                logger.info(f"Removed failed connection. Total: {len(self.active_connections)}")

    async def send_to(self, websocket: WebSocket, message: Any) -> None:
        """Send message to specific client."""
        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)
        await websocket.send_text(data)


manager = ConnectionManager()
agent_loop_task: asyncio.Task[None] | None = None


async def agent_loop() -> None:
    """Main agent loop that runs continuously."""
    last_thinking = ""

    async def stream_thinking(text: str) -> None:
        """Callback to stream thinking updates to clients."""
        nonlocal last_thinking
        # Only send if there's new content
        if text and text != last_thinking:
            logger.info(f"Streaming thinking ({len(text)} chars) to {len(manager.active_connections)} clients")
            await manager.broadcast(ThinkingMessage(text=text))
            last_thinking = text

    while True:
        try:
            # Only run when clients are connected (cost control)
            if not manager.active_connections:
                await asyncio.sleep(settings.agent_interval)
                continue

            if agent.paused:
                # Ensure UI shows paused/idle state
                await asyncio.sleep(settings.agent_interval)
                continue

            # Broadcast THINKING status at start of turn
            await manager.broadcast(StatusMessage(status=AgentStatus.THINKING))
            last_thinking = ""  # Reset for new turn

            thinking, paths, done = await agent.run_turn(on_thinking=stream_thinking)

            # Execute paths if any
            if paths:
                await manager.broadcast(StatusMessage(status=AgentStatus.DRAWING))

                async def send_message(msg: Any) -> None:
                    await manager.broadcast(msg)

                async for _ in execute_paths(paths, send_message):
                    pass  # Yield points handled in execute_paths

            # Always broadcast IDLE after turn completes
            await manager.broadcast(StatusMessage(status=AgentStatus.IDLE))

            if done:
                logger.info(
                    f"Piece {state_manager.piece_count} complete"
                )

            # Wait before next turn
            await asyncio.sleep(settings.agent_interval)

        except Exception as e:
            logger.error(f"Agent loop error: {e}")
            await manager.broadcast(StatusMessage(status=AgentStatus.IDLE))
            await asyncio.sleep(settings.agent_interval)


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[no-untyped-def]
    """Application lifespan handler."""
    global agent_loop_task

    # Load state on startup
    state_manager.load()
    logger.info("State loaded")

    # Start agent loop
    agent_loop_task = asyncio.create_task(agent_loop())
    logger.info("Agent loop started")

    yield

    # Cleanup
    if agent_loop_task:
        agent_loop_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await agent_loop_task

    state_manager.save()
    logger.info("State saved")


app = FastAPI(
    title="Drawing Agent",
    description="Autonomous AI artist server",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/state")
async def get_state() -> dict[str, Any]:
    """Get current state summary."""
    return {
        "canvas": state_manager.canvas.model_dump(),
        "status": state_manager.status.value,
        "piece_count": state_manager.piece_count,
    }


@app.get("/canvas.png")
async def get_canvas_png() -> Response:
    """Get canvas as PNG."""
    return Response(content=render_png(), media_type="image/png")


@app.get("/canvas.svg")
async def get_canvas_svg() -> Response:
    """Get canvas as SVG."""
    return Response(content=render_svg(), media_type="image/svg+xml")


@app.get("/gallery")
async def get_gallery_list() -> list[dict]:
    """Get list of saved canvases."""
    return get_gallery()


@app.post("/piece_count/{count}")
async def set_piece_count(count: int) -> dict[str, int]:
    """Set the piece count."""
    state_manager.piece_count = count
    state_manager.save()
    return {"piece_count": count}


@app.get("/debug/agent")
async def get_agent_debug() -> dict[str, Any]:
    """Get agent debug info for Claude inspection."""
    notes = state_manager.notes
    monologue = state_manager.monologue
    return {
        "paused": agent.paused,
        "container_id": agent.container_id,
        "pending_nudges": agent.pending_nudges,
        "status": state_manager.status.value,
        "piece_count": state_manager.piece_count,
        "notes": notes[:500] if notes else None,
        "monologue_preview": monologue[:500] if monologue else None,
        "stroke_count": len(state_manager.canvas.strokes),
        "connected_clients": len(manager.active_connections),
    }


@app.get("/debug/logs")
async def get_debug_logs(lines: int = 100) -> dict[str, Any]:
    """Get recent log lines from server log file."""
    from pathlib import Path

    log_path = Path(__file__).parent.parent / "logs" / "server.log"
    if not log_path.exists():
        return {"error": "Log file not found. Use 'make server-bg' to start with logging."}

    try:
        with open(log_path) as f:
            all_lines = f.readlines()
            recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return {
                "total_lines": len(all_lines),
                "returned_lines": len(recent),
                "logs": "".join(recent),
            }
    except Exception as e:
        return {"error": str(e)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time communication."""
    await manager.connect(websocket)

    try:
        # Send current state to new client
        gallery = get_gallery()
        await manager.send_to(
            websocket,
            {
                "type": "init",
                "strokes": [s.model_dump() for s in state_manager.canvas.strokes],
                "gallery": gallery,
                "status": state_manager.status.value,
                "paused": agent.paused,
                "piece_count": state_manager.piece_count,
                "monologue": state_manager.monologue or "",
            },
        )
        logger.info(f"Sent init state: {len(state_manager.canvas.strokes)} strokes, {len(gallery)} gallery items, piece #{state_manager.piece_count}")
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            match msg_type:
                case "stroke":
                    # Human drew something
                    points = [
                        Point(x=p["x"], y=p["y"]) for p in message.get("points", [])
                    ]
                    if points:
                        path = Path(type=PathType.POLYLINE, points=points)
                        add_stroke(path)
                        # Broadcast to other clients
                        await manager.broadcast(
                            {"type": "stroke_complete", "path": path.model_dump()}
                        )

                case "nudge":
                    # Human suggestion
                    text = message.get("text", "")
                    if text:
                        agent.add_nudge(text)
                        logger.info(f"Nudge received: {text}")

                case "clear":
                    # Clear canvas
                    clear_canvas()
                    await manager.broadcast(ClearMessage())
                    logger.info("Canvas cleared")

                case "new_canvas":
                    # Save current canvas and create new one (increments piece_count)
                    saved_id = save_current_canvas()
                    agent.reset_container()  # Fresh container for new piece
                    await manager.broadcast(NewCanvasMessage(saved_id=saved_id))
                    # Also send gallery update
                    from drawing_agent.workspace import workspace
                    await manager.broadcast(
                        GalleryUpdateMessage(canvases=workspace.list_gallery())
                    )
                    # Send updated piece count
                    await manager.broadcast(
                        {"type": "piece_count", "count": state_manager.piece_count}
                    )
                    logger.info(f"New canvas created (piece #{state_manager.piece_count}), saved old as: {saved_id}")

                case "load_canvas":
                    # Load a canvas from gallery
                    canvas_id = message.get("canvas_id", "")
                    strokes = load_canvas_from_gallery(canvas_id)
                    if strokes:
                        # Extract piece number from canvas_id (e.g., "piece_071" -> 71)
                        piece_num = int(canvas_id.split("_")[1]) if "_" in canvas_id else 0
                        state_manager.canvas.strokes[:] = strokes
                        state_manager.save()
                        await manager.broadcast(LoadCanvasMessage(strokes=strokes, piece_number=piece_num))
                        logger.info(f"Loaded canvas: {canvas_id}")
                    else:
                        logger.warning(f"Canvas not found: {canvas_id}")

                case "pause":
                    await agent.pause()
                    state_manager.status = AgentStatus.PAUSED
                    state_manager.save()
                    await manager.broadcast(StatusMessage(status=AgentStatus.PAUSED))
                    logger.info("Agent paused")

                case "resume":
                    await agent.resume()
                    state_manager.status = AgentStatus.IDLE
                    state_manager.save()
                    await manager.broadcast(StatusMessage(status=AgentStatus.IDLE))
                    logger.info("Agent resumed")

                case _:
                    logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run(
        "drawing_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_excludes=["logs/*"],
    )
