"""Health and version endpoints."""

import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint - no auth required."""
    return {"status": "ok"}


@router.get("/version")
async def version() -> dict[str, str | None]:
    """Version info endpoint - no auth required."""
    return {
        "version": os.environ.get("APP_VERSION", "dev"),
        "commit": os.environ.get("APP_COMMIT"),
        "build_time": os.environ.get("APP_BUILD_TIME"),
    }
