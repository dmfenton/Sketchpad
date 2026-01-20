"""Stroke polling and piece number endpoints."""

from typing import Any

from fastapi import APIRouter

from code_monet.auth.dependencies import CurrentUser
from code_monet.routes.canvas import get_user_state

router = APIRouter()


@router.get("/strokes/pending")
async def get_pending_strokes(user: CurrentUser) -> dict[str, Any]:
    """Fetch and clear pending strokes for client-side rendering.

    Returns pre-interpolated strokes that the agent has generated.
    The client should animate these strokes locally.

    Strokes are cleared after fetching - each stroke is only returned once.
    Includes piece_number so client can verify strokes belong to current canvas.
    """
    state = await get_user_state(user)
    piece_number = state.piece_number
    strokes = await state.pop_strokes()
    return {"strokes": strokes, "count": len(strokes), "piece_number": piece_number}


@router.post("/piece_number/{number}")
async def set_piece_number(number: int, user: CurrentUser) -> dict[str, int]:
    """Set piece number for user's workspace."""
    state = await get_user_state(user)
    state.piece_number = number
    await state.save()
    return {"piece_number": number}
