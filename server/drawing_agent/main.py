"""FastAPI application with WebSocket support."""

import asyncio
import io
import json
import logging
import traceback
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageDraw
from pydantic import BaseModel

from drawing_agent.auth import auth_router
from drawing_agent.auth.dependencies import CurrentUser
from drawing_agent.auth.jwt import TokenError, get_user_id_from_token
from drawing_agent.auth.rate_limit import TRACES_BY_IP, rate_limiter
from drawing_agent.canvas import path_to_point_list
from drawing_agent.config import settings
from drawing_agent.db import User, get_session, repository
from drawing_agent.registry import workspace_registry
from drawing_agent.share import share_router
from drawing_agent.shutdown import shutdown_manager
from drawing_agent.tracing import get_current_trace_id, record_client_spans, setup_tracing
from drawing_agent.user_handlers import handle_user_message
from drawing_agent.workspace_state import WorkspaceState

# Configure logging with clean format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)5s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)

# Silence noisy loggers
logging.getLogger("watchfiles").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("anthropic").setLevel(logging.WARNING)
logging.getLogger("PIL").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


async def shutdown_all_workspaces() -> None:
    """Callback to shutdown all active workspaces during shutdown."""
    try:
        await workspace_registry.shutdown_all()
        logger.info("All workspaces shutdown successfully")
    except Exception as e:
        logger.error(f"Failed to shutdown workspaces: {e}")


async def run_migrations() -> None:
    """Run database migrations on startup."""
    from alembic.config import Config

    from alembic import command

    # Run alembic upgrade head
    alembic_cfg = Config("alembic.ini")
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
    logger.info("Database migrations completed")


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[no-untyped-def]
    """Application lifespan handler with graceful shutdown."""
    logger.info("=== Server startup initiated ===")

    # Validate required settings
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET environment variable must be set")
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters")

    # Run database migrations
    await run_migrations()

    # Register cleanup callback with shutdown manager
    shutdown_manager.add_cleanup_callback(shutdown_all_workspaces)

    # Install signal handlers only in production mode
    # In dev mode, uvicorn's reloader handles signals for hot reload
    if not settings.dev_mode:
        shutdown_manager.install_signal_handlers()
    else:
        logger.info("Dev mode: skipping custom signal handlers (uvicorn handles reload)")

    logger.info("=== Server startup completed (multi-user mode) ===")

    yield

    # Shutdown - delegate to shutdown manager
    logger.info("Lifespan shutdown triggered")
    await shutdown_manager.shutdown()


app = FastAPI(
    title="Code Monet",
    description="Autonomous AI artist",
    version="0.1.0",
    lifespan=lifespan,
)

# Initialize OpenTelemetry tracing
setup_tracing(app)

# CORS configuration
# Since we use JWT tokens (not cookies), we don't need allow_credentials=True
# This allows native apps and any web origin to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add auth routes
app.include_router(auth_router)

# Add share routes (public + authenticated)
app.include_router(share_router)


# Global exception handler to log all unhandled errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch all unhandled exceptions and log them with full traceback."""
    trace_id = get_current_trace_id()
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}\n"
        f"trace_id={trace_id}\n"
        f"{''.join(tb)}"
    )
    content: dict[str, Any] = {"detail": "Internal Server Error"}
    if trace_id:
        content["trace_id"] = trace_id
    return JSONResponse(status_code=500, content=content)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint - no auth required."""
    return {"status": "ok"}


@app.get("/version")
async def version() -> dict[str, str | None]:
    """Version info endpoint - no auth required."""
    import os

    return {
        "version": os.environ.get("APP_VERSION", "dev"),
        "commit": os.environ.get("APP_COMMIT"),
        "build_time": os.environ.get("APP_BUILD_TIME"),
    }


# ============== Client Tracing ==============


class ClientSpan(BaseModel):
    """A span from the mobile/web client."""

    traceId: str
    spanId: str
    parentSpanId: str | None = None
    name: str
    startTime: int  # Unix timestamp in ms
    endTime: int | None = None
    attributes: dict[str, str | int | float | bool] = {}
    status: str = "ok"
    error: str | None = None


class TracesRequest(BaseModel):
    """Request body for POST /traces."""

    spans: list[ClientSpan]


@app.post("/traces")
async def receive_traces(traces_request: TracesRequest, request: Request) -> dict[str, int]:
    """Receive traces from mobile/web clients.

    Accepts spans from client-side tracing and forwards them to X-Ray
    via the OpenTelemetry collector. This enables end-to-end distributed
    tracing from mobile app through the server.

    No authentication required to minimize overhead on the client.
    Spans are tagged with client.source=mobile for filtering.
    Rate limited to 60 requests/minute per IP.
    """
    # Rate limit by IP (check X-Forwarded-For for clients behind proxy)
    forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    client_ip = forwarded_for or (request.client.host if request.client else "unknown")
    if not rate_limiter.is_allowed(f"traces:{client_ip}", TRACES_BY_IP):
        raise HTTPException(status_code=429, detail="Too many requests")

    # Convert Pydantic models to dicts for the tracing function
    spans_data = [span.model_dump() for span in traces_request.spans]
    recorded = record_client_spans(spans_data)
    return {"received": recorded}


@app.get("/.well-known/apple-app-site-association")
async def apple_app_site_association() -> JSONResponse:
    """Apple App Site Association file for Universal Links.

    This tells iOS which URLs should open the app instead of Safari.
    Requires APPLE_TEAM_ID env var to be set.
    """
    if not settings.apple_team_id:
        return JSONResponse(
            content={"error": "APPLE_TEAM_ID not configured"},
            status_code=500,
        )

    app_id = f"{settings.apple_team_id}.{settings.ios_bundle_id}"

    aasa = {
        "applinks": {
            "apps": [],
            "details": [
                {
                    "appID": app_id,
                    "paths": ["/auth/verify*"],
                }
            ],
        },
        "webcredentials": {
            "apps": [app_id],
        },
    }

    return JSONResponse(
        content=aasa,
        media_type="application/json",
    )


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


async def render_user_png(state: WorkspaceState, highlight_human: bool = True) -> bytes:
    """Render user's canvas to PNG (async, non-blocking).

    Offloads rendering to thread pool to avoid blocking the event loop.
    """
    return await asyncio.to_thread(_render_user_png_sync, state, highlight_human)


@app.get("/state")
async def get_state(user: CurrentUser) -> dict[str, Any]:
    """Get current canvas state for authenticated user."""
    state = await get_user_state(user)
    return {
        "canvas": state.canvas.model_dump(),
        "status": state.status.value,
        "piece_count": state.piece_count,
    }


@app.get("/canvas.png")
async def get_canvas_png(user: CurrentUser) -> Response:
    """Get user's canvas as PNG image."""
    state = await get_user_state(user)
    return Response(content=await render_user_png(state), media_type="image/png")


@app.get("/canvas.svg")
async def get_canvas_svg(user: CurrentUser) -> Response:
    """Get user's canvas as SVG image."""
    from xml.etree import ElementTree as ET

    from drawing_agent.canvas import render_path_to_svg_d

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


@app.get("/gallery")
async def get_gallery_list(user: CurrentUser) -> list[dict[str, Any]]:
    """Get user's gallery pieces."""
    state = await get_user_state(user)
    pieces = await state.list_gallery()
    return [
        {
            "id": p.id,
            "created_at": p.created_at,
            "piece_number": p.piece_number,
            "stroke_count": p.num_strokes,
        }
        for p in pieces
    ]


@app.get("/public/gallery")
async def get_public_gallery(limit: int = Query(default=12, le=50)) -> list[dict[str, Any]]:
    """Get public gallery showcasing recent artwork across all users.

    Returns featured pieces for the homepage - no authentication required.
    """
    from pathlib import Path as FilePath

    pieces: list[dict[str, Any]] = []
    workspace_base = FilePath(settings.workspace_base_dir)

    if not workspace_base.exists():
        return []

    # Scan all user gallery directories
    for user_dir in workspace_base.iterdir():
        if not user_dir.is_dir():
            continue

        gallery_dir = user_dir / "gallery"
        if not gallery_dir.exists():
            continue

        # Load gallery index if it exists
        index_file = gallery_dir / "index.json"
        if index_file.exists():
            try:
                index_data = json.loads(index_file.read_text())
                for entry in index_data.get("pieces", []):
                    pieces.append(
                        {
                            "id": entry.get("id", ""),
                            "user_id": user_dir.name,
                            "piece_number": entry.get("piece_number", 0),
                            "stroke_count": entry.get("stroke_count", 0),
                            "created_at": entry.get("created_at", ""),
                        }
                    )
            except (json.JSONDecodeError, OSError):
                pass

    # Sort by created_at descending (most recent first)
    pieces.sort(key=lambda p: p.get("created_at", ""), reverse=True)

    return pieces[:limit]


@app.get("/public/gallery/{user_id}/{piece_id}/strokes")
async def get_public_piece_strokes(user_id: str, piece_id: str) -> dict[str, Any]:
    """Get strokes for a specific gallery piece.

    Returns the full stroke data for rendering on the homepage.
    """
    from pathlib import Path as FilePath

    workspace_base = FilePath(settings.workspace_base_dir)
    gallery_dir = workspace_base / user_id / "gallery"

    if not gallery_dir.exists():
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Find the piece file
    piece_file = gallery_dir / f"{piece_id}.json"
    if not piece_file.exists():
        raise HTTPException(status_code=404, detail="Piece not found")

    try:
        data = json.loads(piece_file.read_text())
        return {
            "id": piece_id,
            "strokes": data.get("strokes", []),
            "piece_number": data.get("piece_number", 0),
            "created_at": data.get("created_at", ""),
        }
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to load piece: {e}") from e


@app.get("/strokes/pending")
async def get_pending_strokes(user: CurrentUser) -> dict[str, Any]:
    """Fetch and clear pending strokes for client-side rendering.

    Returns pre-interpolated strokes that the agent has generated.
    The client should animate these strokes locally.

    Strokes are cleared after fetching - each stroke is only returned once.
    """
    state = await get_user_state(user)
    strokes = await state.pop_strokes()
    return {"strokes": strokes, "count": len(strokes)}


@app.post("/piece_count/{count}")
async def set_piece_count(count: int, user: CurrentUser) -> dict[str, int]:
    """Set piece count for user's workspace."""
    state = await get_user_state(user)
    state.piece_count = count
    await state.save()
    return {"piece_count": count}


@app.get("/auth/dev-token")
async def get_dev_token() -> dict[str, str]:
    """Generate a dev token for testing (dev mode only)."""
    if not settings.dev_mode:
        raise HTTPException(status_code=403, detail="Dev tokens only available in dev mode")

    from drawing_agent.auth.jwt import create_access_token

    # Get or create a dev user
    async with get_session() as session:
        dev_email = "dev@local.test"
        dev_user = await repository.get_user_by_email(session, dev_email)
        if not dev_user:
            from drawing_agent.auth.password import hash_password

            dev_user = await repository.create_user(
                session, dev_email, hash_password("devpassword")
            )

    token = create_access_token(dev_user.id, dev_user.email)
    return {"access_token": token, "user_id": str(dev_user.id)}


@app.get("/debug/agent")
async def get_agent_debug(user: CurrentUser) -> dict[str, Any]:
    """Get agent debug info for user's workspace."""
    workspace = workspace_registry.get(user.id)
    if not workspace:
        # Return state from file if no active workspace
        state = await get_user_state(user)
        return {
            "paused": True,
            "status": state.status.value,
            "piece_count": state.piece_count,
            "notes": state.notes[:500] if state.notes else None,
            "monologue": state.monologue[:500] if state.monologue else None,
            "stroke_count": len(state.canvas.strokes),
            "connected_clients": 0,
        }

    state = workspace.state
    return {
        "paused": workspace.agent.paused,
        "status": state.status.value,
        "piece_count": state.piece_count,
        "notes": state.notes[:500] if state.notes else None,
        "monologue": state.monologue[:500] if state.monologue else None,
        "stroke_count": len(state.canvas.strokes),
        "connected_clients": workspace.connections.connection_count,
    }


@app.get("/debug/workspace")
async def get_workspace_debug(user: CurrentUser) -> dict[str, Any]:
    """Get workspace files and state for debugging."""
    from pathlib import Path

    workspace_dir = Path("agent_workspace") / "users" / str(user.id)

    files = []
    if workspace_dir.exists():
        for file_path in workspace_dir.rglob("*"):
            if file_path.is_file():
                stat = file_path.stat()
                files.append(
                    {
                        "name": file_path.name,
                        "path": str(file_path.relative_to(workspace_dir)),
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                    }
                )

    return {"files": files}


@app.get("/debug/logs")
async def get_debug_logs(_user: CurrentUser, lines: int = 100) -> dict[str, Any]:
    """Get recent server logs."""
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


@app.get("/debug/agent-logs")
async def get_agent_logs(
    user: CurrentUser,
    filename: str | None = Query(default=None),
    count: int = Query(default=5, ge=1, le=50),
) -> dict[str, Any]:
    """Get agent activity logs for the authenticated user.

    Each agent turn creates a separate timestamped log file containing:
    - Turn start/end timestamps
    - Agent thinking/monologue text
    - Code execution results
    - Drawing commands
    - Errors

    Args:
        filename: Specific log file to read (e.g., "turn_20240115_143022.log")
        count: Number of recent log files to return (default 5, max 50)

    Returns:
        If filename provided: Dict with single log file content
        Otherwise: Dict with list of recent log files and their content
    """
    from drawing_agent.agent_logger import AgentFileLogger

    state = await get_user_state(user)
    file_logger = AgentFileLogger(user_dir=state._user_dir)

    if filename:
        # Read specific file - TypedDict is compatible with dict[str, Any]
        result = await file_logger.read_log_file(filename)
        return dict(result)

    # Return list of recent log files with content
    files = await file_logger.list_log_files()
    logs = await file_logger.read_latest_logs(count=count)

    return {
        "total_files": len(files),
        "returned_files": len(logs),
        "logs": [dict(log) for log in logs],
    }


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    trace_id: str | None = Query(default=None),
) -> None:
    """WebSocket endpoint with JWT authentication and per-user routing.

    Connect with: ws://host/ws?token=<jwt_access_token>&trace_id=<client_trace_id>

    Each authenticated user gets their own workspace with:
    - Isolated canvas state
    - Personal agent instance
    - Private gallery

    The optional trace_id parameter allows distributed tracing correlation
    with mobile client spans.
    """
    # Must accept before any operations per ASGI spec
    await websocket.accept()

    # Reject during shutdown
    if shutdown_manager.is_shutting_down:
        await websocket.close(code=1001, reason="Server shutting down")
        return

    # Validate token
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    try:
        user_id = get_user_id_from_token(token, expected_type="access")
    except TokenError as e:
        await websocket.close(code=4001, reason=str(e))
        return
    except Exception as e:
        logger.warning(f"WebSocket auth failed with unexpected error: {e}")
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Verify user exists and is active
    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)

    if user is None or not user.is_active:
        await websocket.close(code=4001, reason="User not found or inactive")
        return

    logger.info(f"WebSocket authenticated: user {user.email} (id={user_id})")

    # Record client trace ID for distributed tracing correlation
    if trace_id:
        from opentelemetry import trace as otel_trace

        current_span = otel_trace.get_current_span()
        if current_span.is_recording():
            current_span.set_attribute("client.trace_id", trace_id)
            current_span.set_attribute("client.source", "mobile")
        logger.debug(f"Client trace_id: {trace_id}")

    # Get or create user's workspace
    workspace = await workspace_registry.get_or_activate(user_id)
    if not workspace.connections.add(websocket):
        await websocket.close(code=4003, reason="Too many connections")
        return
    await shutdown_manager.register_connection(websocket)

    try:
        # Send current state to new client
        gallery_pieces = await workspace.state.list_gallery()
        gallery_data = [
            {
                "id": p.id,
                "created_at": p.created_at,
                "piece_number": p.piece_number,
                "stroke_count": p.num_strokes,
            }
            for p in gallery_pieces
        ]

        await workspace.connections.send_to(
            websocket,
            {
                "type": "init",
                "strokes": [s.model_dump() for s in workspace.state.canvas.strokes],
                "gallery": gallery_data,
                "status": workspace.state.status.value,
                "paused": workspace.agent.paused,
                "piece_count": workspace.state.piece_count,
                "monologue": workspace.state.monologue or "",
            },
        )
        logger.info(
            f"User {user_id}: sent init with {len(workspace.state.canvas.strokes)} strokes, "
            f"{len(gallery_data)} gallery, piece #{workspace.state.piece_count}"
        )

        # Notify if there are pending strokes to fetch (reconnection scenario)
        if workspace.state.has_pending_strokes:
            await workspace.connections.send_to(
                websocket,
                {
                    "type": "strokes_ready",
                    "count": workspace.state.pending_stroke_count,
                    "batch_id": workspace.state.stroke_batch_id,
                },
            )
            logger.info(
                f"User {user_id}: notified of {workspace.state.pending_stroke_count} pending strokes"
            )

        while True:
            # Check shutdown between receives
            if shutdown_manager.is_shutting_down:
                break

            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON from user {user_id}: {e}")
                await workspace.connections.send_to(
                    websocket,
                    {"type": "error", "message": "Invalid JSON format"},
                )
                continue

            try:
                await handle_user_message(workspace, message)
            except Exception as e:
                logger.exception(f"Handler error for user {user_id}")
                await workspace.connections.send_to(
                    websocket,
                    {"type": "error", "message": f"Error processing message: {e}"},
                )

    except WebSocketDisconnect:
        await workspace_registry.on_disconnect(user_id, websocket)
        await shutdown_manager.unregister_connection(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await workspace_registry.on_disconnect(user_id, websocket)
        await shutdown_manager.unregister_connection(websocket)


if __name__ == "__main__":
    uvicorn.run(
        "drawing_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_excludes=["logs/*"],
    )
