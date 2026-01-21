"""Public gallery endpoints for unauthenticated access."""

import json
import re
from pathlib import Path as FilePath
from typing import Any

import aiofiles
import aiofiles.os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from code_monet.config import settings
from code_monet.db import get_session, repository
from code_monet.rendering import options_for_og_image, render_strokes_async
from code_monet.types import DrawingStyleType, Path

router = APIRouter()


@router.get("/public/gallery")
async def get_public_gallery(limit: int = Query(default=12, le=50)) -> list[dict[str, Any]]:
    """Get public gallery showcasing artwork from users who opted in.

    Returns pieces for the homepage - no authentication required.
    Shows artwork from all users who have set gallery_public=True.
    """
    pieces: list[dict[str, Any]] = []
    workspace_base = FilePath(settings.workspace_base_dir).resolve()

    if not workspace_base.exists():
        return []

    # Get all users with public galleries
    async with get_session() as session:
        public_users = await repository.list_users_with_public_gallery(session)

    if not public_users:
        return []

    # Load gallery pieces from all public users
    for user in public_users:
        gallery_dir = workspace_base / str(user.id) / "gallery"
        if not gallery_dir.exists():
            continue

        # Scan piece files directly (async I/O to avoid blocking)
        for entry_name in await aiofiles.os.listdir(gallery_dir):
            if not entry_name.startswith("piece_") or not entry_name.endswith(".json"):
                continue
            try:
                async with aiofiles.open(gallery_dir / entry_name) as f:
                    data = json.loads(await f.read())
                pieces.append(
                    {
                        "id": f"piece_{data.get('piece_number', 0):06d}",
                        "user_id": str(user.id),
                        "piece_number": data.get("piece_number", 0),
                        "stroke_count": len(data.get("strokes", [])),
                        "created_at": data.get("created_at", ""),
                    }
                )
            except (json.JSONDecodeError, OSError):
                pass

    # Sort by created_at descending (most recent first across all users)
    pieces.sort(key=lambda p: p.get("created_at", ""), reverse=True)

    return pieces[:limit]


@router.get("/public/gallery/{user_id}/{piece_id}/strokes")
async def get_public_piece_strokes(user_id: str, piece_id: str) -> dict[str, Any]:
    """Get strokes for a specific gallery piece.

    Returns the full stroke data for rendering on the homepage.
    Only returns data if the user has opted into public gallery.
    """
    # Validate user_id is a valid UUID format to prevent path traversal
    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    if not re.match(uuid_pattern, user_id, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Invalid user_id")

    # Validate piece_id format (alphanumeric, underscore, hyphen only)
    if not piece_id.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid piece_id")

    # Verify the user has opted into public gallery
    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)
        if not user or not user.gallery_public:
            raise HTTPException(status_code=404, detail="Gallery not found")

    workspace_base = FilePath(settings.workspace_base_dir).resolve()
    gallery_dir = workspace_base / user_id / "gallery"
    piece_file = (gallery_dir / f"{piece_id}.json").resolve()

    # Ensure the resolved path stays within the workspace (prevent path traversal)
    if not str(piece_file).startswith(str(workspace_base)):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not gallery_dir.exists():
        raise HTTPException(status_code=404, detail="Gallery not found")

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


@router.get("/public/gallery/{user_id}/{piece_id}/og-image.png")
async def get_public_piece_og_image(user_id: str, piece_id: str) -> Response:
    """Get OG image for social sharing.

    Renders gallery piece strokes to 1200x630 PNG (optimal OG image size).
    Only returns image if user has opted into public gallery.
    """
    # Validate user_id is UUID format (prevent path traversal)
    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    if not re.match(uuid_pattern, user_id, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Invalid user_id")

    # Validate piece_id format
    if not piece_id.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid piece_id")

    # Verify user has opted into public gallery
    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)
        if not user or not user.gallery_public:
            raise HTTPException(status_code=404, detail="Gallery not found")

    # Load piece strokes
    workspace_base = FilePath(settings.workspace_base_dir).resolve()
    piece_file = (workspace_base / user_id / "gallery" / f"{piece_id}.json").resolve()

    if not str(piece_file).startswith(str(workspace_base)):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not piece_file.exists():
        raise HTTPException(status_code=404, detail="Piece not found")

    try:
        data = json.loads(piece_file.read_text())
        strokes = [Path(**s) for s in data.get("strokes", [])]
        # Parse drawing style with fallback to plotter
        style_str = data.get("drawing_style", "plotter")
        try:
            drawing_style = DrawingStyleType(style_str)
        except ValueError:
            drawing_style = DrawingStyleType.PLOTTER
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to load piece: {e}") from e

    # Render to PNG (1200x630 is optimal OG image size)
    options = options_for_og_image(drawing_style)
    result = await render_strokes_async(strokes, options)
    assert isinstance(result, bytes)
    image_bytes = result

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=604800",  # 7 days (immutable)
        },
    )
