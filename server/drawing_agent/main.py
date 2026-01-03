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
from drawing_agent.canvas import get_gallery, render_png, render_svg
from drawing_agent.config import settings
from drawing_agent.handlers import init_handlers
from drawing_agent.handlers import router as message_router
from drawing_agent.orchestrator import AgentOrchestrator
from drawing_agent.state import state_manager

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
orchestrator: AgentOrchestrator | None = None
agent_loop_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[no-untyped-def]
    """Application lifespan handler."""
    global agent_loop_task, orchestrator

    # Load state on startup
    state_manager.load()
    logger.info("State loaded")

    # Initialize handlers with dependencies
    init_handlers(manager, agent)

    # Create orchestrator and start agent loop
    orchestrator = AgentOrchestrator(agent=agent, broadcaster=manager)
    agent_loop_task = asyncio.create_task(orchestrator.run_loop())
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
        logger.info(
            f"Sent init state: {len(state_manager.canvas.strokes)} strokes, "
            f"{len(gallery)} gallery items, piece #{state_manager.piece_count}"
        )

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            await message_router.route(message, websocket)

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
