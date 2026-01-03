"""FastAPI application with WebSocket support."""

import asyncio
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
from drawing_agent.connections import manager
from drawing_agent.handlers import handle_message
from drawing_agent.orchestrator import AgentOrchestrator
from drawing_agent.shutdown import shutdown_manager
from drawing_agent.state import state_manager

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

orchestrator: AgentOrchestrator | None = None
agent_loop_task: asyncio.Task[None] | None = None


async def save_state_callback() -> None:
    """Callback to save state during shutdown."""
    try:
        state_manager.save()
        logger.info("State saved successfully")
    except Exception as e:
        logger.error(f"Failed to save state during shutdown: {e}")


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[no-untyped-def]
    """Application lifespan handler with graceful shutdown."""
    global agent_loop_task, orchestrator

    logger.info("=== Server startup initiated ===")

    state_manager.load()
    logger.info("State loaded")

    orchestrator = AgentOrchestrator(agent=agent, broadcaster=manager)
    agent_loop_task = asyncio.create_task(orchestrator.run_loop())
    logger.info("Agent loop started")

    # Register task and cleanup callback with shutdown manager
    shutdown_manager.register_task(agent_loop_task)
    shutdown_manager.add_cleanup_callback(save_state_callback)

    # Install signal handlers
    shutdown_manager.install_signal_handlers()

    logger.info("=== Server startup completed ===")

    yield

    # Shutdown - delegate to shutdown manager
    # Note: Connections are already registered individually in the WebSocket endpoint
    logger.info("Lifespan shutdown triggered")
    await shutdown_manager.shutdown()


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
    return {"status": "ok"}


@app.get("/state")
async def get_state() -> dict[str, Any]:
    return {
        "canvas": state_manager.canvas.model_dump(),
        "status": state_manager.status.value,
        "piece_count": state_manager.piece_count,
    }


@app.get("/canvas.png")
async def get_canvas_png() -> Response:
    return Response(content=render_png(), media_type="image/png")


@app.get("/canvas.svg")
async def get_canvas_svg() -> Response:
    return Response(content=render_svg(), media_type="image/svg+xml")


@app.get("/gallery")
async def get_gallery_list() -> list[dict[str, Any]]:
    return get_gallery()


@app.post("/piece_count/{count}")
async def set_piece_count(count: int) -> dict[str, int]:
    state_manager.piece_count = count
    state_manager.save()
    return {"piece_count": count}


@app.get("/debug/agent")
async def get_agent_debug() -> dict[str, Any]:
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
    # Reject new connections during shutdown (must accept first per ASGI spec)
    if shutdown_manager.is_shutting_down:
        await websocket.accept()
        await websocket.close(code=1001, reason="Server shutting down")
        return

    await manager.connect(websocket)
    await shutdown_manager.register_connection(websocket)

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
            f"Sent init: {len(state_manager.canvas.strokes)} strokes, "
            f"{len(gallery)} gallery, piece #{state_manager.piece_count}"
        )

        while True:
            # Check shutdown between receives
            if shutdown_manager.is_shutting_down:
                break

            data = await websocket.receive_text()
            await handle_message(json.loads(data))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await shutdown_manager.unregister_connection(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
        await shutdown_manager.unregister_connection(websocket)


if __name__ == "__main__":
    uvicorn.run(
        "drawing_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_excludes=["logs/*"],
    )
