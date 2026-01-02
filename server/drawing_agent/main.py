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

from drawing_agent.agent import AgentCallbacks, CodeExecutionResult, agent
from drawing_agent.canvas import add_stroke, clear_canvas, render_png, render_svg
from drawing_agent.config import settings
from drawing_agent.executor import execute_paths
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentStatus,
    ClearMessage,
    CodeExecutionMessage,
    ErrorMessage,
    IterationMessage,
    Path,
    PathType,
    PieceCompleteMessage,
    Point,
    StatusMessage,
    ThinkingDeltaMessage,
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

    async def on_thinking(text: str, iteration: int) -> None:
        """Callback to stream thinking updates to clients (delta only)."""
        if text:
            await manager.broadcast(ThinkingDeltaMessage(text=text, iteration=iteration))

    async def on_iteration_start(current: int, max_iter: int) -> None:
        """Callback when a new iteration starts."""
        logger.info(f"Iteration {current}/{max_iter}")
        await manager.broadcast(IterationMessage(current=current, max=max_iter))

    async def on_code_start(iteration: int) -> None:
        """Callback when code execution starts."""
        logger.info(f"Code execution started (iteration {iteration})")
        await manager.broadcast(StatusMessage(status=AgentStatus.EXECUTING))
        await manager.broadcast(CodeExecutionMessage(status="started", iteration=iteration))

    async def on_code_result(result: CodeExecutionResult) -> None:
        """Callback when code execution completes."""
        logger.info(f"Code execution completed (iteration {result.iteration})")
        await manager.broadcast(
            CodeExecutionMessage(
                status="completed",
                stdout=result.stdout[:2000] if result.stdout else None,  # Limit size
                stderr=result.stderr[:500] if result.stderr else None,
                return_code=result.return_code,
                iteration=result.iteration,
            )
        )

    async def on_error(message: str, details: str | None) -> None:
        """Callback when an error occurs."""
        logger.error(f"Agent error: {message}")
        await manager.broadcast(StatusMessage(status=AgentStatus.ERROR))
        await manager.broadcast(ErrorMessage(message=message, details=details))

    callbacks = AgentCallbacks(
        on_thinking=on_thinking,
        on_iteration_start=on_iteration_start,
        on_code_start=on_code_start,
        on_code_result=on_code_result,
        on_error=on_error,
    )

    while True:
        try:
            if agent.paused:
                # Ensure UI shows paused/idle state
                await asyncio.sleep(settings.agent_interval)
                continue

            # Broadcast THINKING status at start of turn
            await manager.broadcast(StatusMessage(status=AgentStatus.THINKING))

            thinking, paths, done = await agent.run_turn(callbacks=callbacks)

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
                piece_num = state_manager.state.agent.piece_count
                logger.info(f"Piece {piece_num} complete")
                await manager.broadcast(PieceCompleteMessage(piece_number=piece_num))

            # Wait before next turn
            await asyncio.sleep(settings.agent_interval)

        except Exception as e:
            logger.error(f"Agent loop error: {e}")
            await manager.broadcast(ErrorMessage(message=str(e)))
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
    """Get full application state."""
    return state_manager.state.model_dump()


@app.get("/canvas.png")
async def get_canvas_png() -> Response:
    """Get canvas as PNG."""
    return Response(content=render_png(), media_type="image/png")


@app.get("/canvas.svg")
async def get_canvas_svg() -> Response:
    """Get canvas as SVG."""
    return Response(content=render_svg(), media_type="image/svg+xml")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time communication."""
    await manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            match msg_type:
                case "stroke":
                    # Human drew something
                    points = [Point(x=p["x"], y=p["y"]) for p in message.get("points", [])]
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

                case "pause":
                    await agent.pause()
                    state_manager.state.agent.status = AgentStatus.PAUSED
                    state_manager.save()
                    await manager.broadcast(StatusMessage(status=AgentStatus.PAUSED))
                    logger.info("Agent paused")

                case "resume":
                    await agent.resume()
                    state_manager.state.agent.status = AgentStatus.IDLE
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
    )
