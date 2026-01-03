"""Filesystem-backed workspace state for multi-user isolation."""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path as FilePath
from typing import Any

import aiofiles
import aiofiles.os

from drawing_agent.config import settings
from drawing_agent.types import AgentStatus, CanvasState, Path, SavedCanvas

logger = logging.getLogger(__name__)


class WorkspaceState:
    """Per-user workspace state backed by the filesystem.

    Each user has their own directory under workspace_base_dir:
        users/{user_id}/
            workspace.json      - Current canvas state and agent metadata
            gallery/
                piece_001.json  - Saved artwork
                piece_002.json
    """

    def __init__(self, user_id: int, user_dir: FilePath) -> None:
        self.user_id = user_id
        self._user_dir = user_dir
        self._workspace_file = user_dir / "workspace.json"
        self._gallery_dir = user_dir / "gallery"

        # In-memory state
        self._canvas: CanvasState = CanvasState()
        self._status: AgentStatus = AgentStatus.PAUSED
        self._piece_count: int = 0
        self._notes: str = ""
        self._monologue: str = ""
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @classmethod
    async def load_for_user(cls, user_id: int) -> "WorkspaceState":
        """Load or create workspace state for a user."""
        # Determine user directory
        base_dir = FilePath(settings.workspace_base_dir)
        user_dir = base_dir / str(user_id)

        # Create directories if needed
        await aiofiles.os.makedirs(user_dir, exist_ok=True)
        await aiofiles.os.makedirs(user_dir / "gallery", exist_ok=True)

        state = cls(user_id, user_dir)
        await state._load_from_file()
        return state

    async def _load_from_file(self) -> None:
        """Load state from workspace.json."""
        if await aiofiles.os.path.exists(self._workspace_file):
            async with aiofiles.open(self._workspace_file) as f:
                data = json.loads(await f.read())

            canvas_data = data.get("canvas", {})
            self._canvas = CanvasState(
                width=canvas_data.get("width", 800),
                height=canvas_data.get("height", 600),
                strokes=[Path.model_validate(s) for s in canvas_data.get("strokes", [])],
            )
            self._status = AgentStatus(data.get("status", "paused"))
            self._piece_count = data.get("piece_count", 0)
            self._notes = data.get("notes", "")
            self._monologue = data.get("monologue", "")

            logger.info(
                f"Workspace loaded for user {self.user_id}: "
                f"piece {self._piece_count}, {len(self._canvas.strokes)} strokes"
            )
        else:
            logger.info(f"New workspace created for user {self.user_id}")

        self._loaded = True

    async def save(self) -> None:
        """Save state to filesystem."""
        data = {
            "canvas": self._canvas.model_dump(),
            "status": self._status.value,
            "piece_count": self._piece_count,
            "notes": self._notes,
            "monologue": self._monologue,
        }

        async with aiofiles.open(self._workspace_file, "w") as f:
            await f.write(json.dumps(data, indent=2))

    # --- Properties ---

    @property
    def canvas(self) -> CanvasState:
        return self._canvas

    @property
    def status(self) -> AgentStatus:
        return self._status

    @status.setter
    def status(self, value: AgentStatus) -> None:
        self._status = value

    @property
    def piece_count(self) -> int:
        return self._piece_count

    @piece_count.setter
    def piece_count(self, value: int) -> None:
        self._piece_count = value

    @property
    def notes(self) -> str:
        return self._notes

    @notes.setter
    def notes(self, value: str) -> None:
        self._notes = value

    @property
    def monologue(self) -> str:
        return self._monologue

    @monologue.setter
    def monologue(self, value: str) -> None:
        self._monologue = value

    # --- Canvas Operations ---

    async def add_stroke(self, path: Path) -> None:
        """Add a stroke to the canvas."""
        self._canvas.strokes.append(path)
        await self.save()

    async def clear_canvas(self) -> None:
        """Clear the canvas."""
        self._canvas.strokes = []
        await self.save()

    async def new_canvas(self) -> str | None:
        """Save current canvas to gallery and start fresh. Returns saved ID."""
        saved_id = None

        if self._canvas.strokes:
            # Save to gallery as JSON file
            piece_file = self._gallery_dir / f"piece_{self._piece_count:03d}.json"
            piece_data = {
                "piece_number": self._piece_count,
                "strokes": [s.model_dump() for s in self._canvas.strokes],
                "created_at": datetime.now(UTC).isoformat(),
            }

            async with aiofiles.open(piece_file, "w") as f:
                await f.write(json.dumps(piece_data, indent=2))

            saved_id = f"piece_{self._piece_count:03d}"
            logger.info(f"Saved piece {self._piece_count} to gallery as {saved_id}")

        # Start fresh
        self._canvas.strokes = []
        self._piece_count += 1
        await self.save()

        return saved_id

    # --- Gallery Operations ---

    async def list_gallery(self) -> list[SavedCanvas]:
        """List gallery pieces for this workspace."""
        pieces: list[SavedCanvas] = []

        if not await aiofiles.os.path.exists(self._gallery_dir):
            return pieces

        # List all piece files
        for entry in await aiofiles.os.listdir(self._gallery_dir):
            if entry.startswith("piece_") and entry.endswith(".json"):
                piece_file = self._gallery_dir / entry
                async with aiofiles.open(piece_file) as f:
                    data = json.loads(await f.read())

                pieces.append(
                    SavedCanvas(
                        id=f"piece_{data['piece_number']:03d}",
                        strokes=[Path.model_validate(s) for s in data.get("strokes", [])],
                        created_at=data.get("created_at", ""),
                        piece_number=data["piece_number"],
                    )
                )

        # Sort by piece number
        pieces.sort(key=lambda p: p.piece_number)
        return pieces

    async def load_from_gallery(self, piece_number: int) -> list[Path] | None:
        """Load strokes from a gallery piece."""
        piece_file = self._gallery_dir / f"piece_{piece_number:03d}.json"

        if not await aiofiles.os.path.exists(piece_file):
            return None

        async with aiofiles.open(piece_file) as f:
            data = json.loads(await f.read())

        return [Path.model_validate(s) for s in data.get("strokes", [])]

    def get_gallery_data(self) -> list[dict[str, Any]]:
        """Get gallery data synchronously (cached from last list_gallery call)."""
        # For now, return empty - will be populated by list_gallery
        return []
