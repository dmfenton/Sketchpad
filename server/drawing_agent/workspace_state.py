"""Filesystem-backed workspace state for multi-user isolation."""

import asyncio
import json
import logging
from datetime import UTC, datetime
from pathlib import Path as FilePath

import aiofiles
import aiofiles.os

from drawing_agent.config import settings
from drawing_agent.types import AgentStatus, CanvasState, Path, SavedCanvas

logger = logging.getLogger(__name__)


def _get_base_dir() -> FilePath:
    """Get the base directory for user workspaces, resolved relative to server dir."""
    # Resolve relative paths from the server directory
    server_dir = FilePath(__file__).parent.parent
    return (server_dir / settings.workspace_base_dir).resolve()


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
        self._write_lock = asyncio.Lock()

        # In-memory state
        self._canvas: CanvasState = CanvasState()
        self._status: AgentStatus = AgentStatus.PAUSED
        self._piece_count: int = 0
        self._notes: str = ""
        self._monologue: str = ""
        self._loaded = False

        # Pending strokes for client-side rendering
        self._pending_strokes: list[dict] = []
        self._stroke_batch_id: int = 0

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @classmethod
    async def load_for_user(cls, user_id: int) -> "WorkspaceState":
        """Load or create workspace state for a user."""
        # Validate user_id is a positive integer (path traversal protection)
        if not isinstance(user_id, int) or user_id <= 0:
            raise ValueError(f"Invalid user_id: {user_id}")

        base_dir = _get_base_dir()
        user_dir = (base_dir / str(user_id)).resolve()

        # Ensure path stays within base directory (path traversal protection)
        if not str(user_dir).startswith(str(base_dir)):
            raise ValueError(f"Invalid user directory path for user {user_id}")

        # Create directories if needed
        await aiofiles.os.makedirs(user_dir, exist_ok=True)
        await aiofiles.os.makedirs(user_dir / "gallery", exist_ok=True)

        state = cls(user_id, user_dir)
        await state._load_from_file()
        return state

    async def _load_from_file(self) -> None:
        """Load state from workspace.json."""
        if await aiofiles.os.path.exists(self._workspace_file):
            try:
                async with aiofiles.open(self._workspace_file) as f:
                    data = json.loads(await f.read())
            except json.JSONDecodeError as e:
                logger.error(
                    f"Corrupted workspace.json for user {self.user_id}: {e}. "
                    "Starting with fresh state."
                )
                # Backup corrupted file for debugging
                backup_file = self._workspace_file.with_suffix(".json.corrupted")
                await aiofiles.os.rename(self._workspace_file, backup_file)
                self._loaded = True
                return

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
            self._pending_strokes = data.get("pending_strokes", [])
            self._stroke_batch_id = data.get("stroke_batch_id", 0)

            logger.info(
                f"Workspace loaded for user {self.user_id}: "
                f"piece {self._piece_count}, {len(self._canvas.strokes)} strokes"
            )
        else:
            logger.info(f"New workspace created for user {self.user_id}")

        self._loaded = True

    async def save(self) -> None:
        """Save state to filesystem atomically."""
        async with self._write_lock:
            data = {
                "canvas": self._canvas.model_dump(),
                "status": self._status.value,
                "piece_count": self._piece_count,
                "notes": self._notes,
                "monologue": self._monologue,
                "pending_strokes": self._pending_strokes,
                "stroke_batch_id": self._stroke_batch_id,
                "updated_at": datetime.now(UTC).isoformat(),
            }

            # Write to temp file first, then atomically rename
            temp_file = self._workspace_file.with_suffix(".json.tmp")
            async with aiofiles.open(temp_file, "w") as f:
                await f.write(json.dumps(data, indent=2))

            # Atomic rename (on POSIX systems)
            await aiofiles.os.replace(temp_file, self._workspace_file)

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

    @property
    def has_pending_strokes(self) -> bool:
        """Check if there are pending strokes to render."""
        return len(self._pending_strokes) > 0

    @property
    def pending_stroke_count(self) -> int:
        """Number of pending strokes."""
        return len(self._pending_strokes)

    @property
    def stroke_batch_id(self) -> int:
        """Current stroke batch ID."""
        return self._stroke_batch_id

    # --- Stroke Queue Operations ---

    async def queue_strokes(self, paths: list[Path]) -> int:
        """Interpolate paths and queue for client-side rendering.

        Returns the batch_id for this set of strokes.
        """
        from drawing_agent.config import settings
        from drawing_agent.interpolation import interpolate_path

        self._stroke_batch_id += 1
        batch_id = self._stroke_batch_id

        for path in paths:
            points = interpolate_path(path, settings.path_steps_per_unit)
            self._pending_strokes.append(
                {
                    "batch_id": batch_id,
                    "path": path.model_dump(),
                    "points": [{"x": p.x, "y": p.y} for p in points],
                }
            )

        await self.save()
        return batch_id

    async def pop_strokes(self) -> list[dict]:
        """Get and clear pending strokes."""
        strokes = self._pending_strokes.copy()
        self._pending_strokes.clear()
        await self.save()
        return strokes

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
        async with self._write_lock:
            saved_id = None

            if self._canvas.strokes:
                # Save to gallery as JSON file (use 6 digits for scalability)
                piece_file = self._gallery_dir / f"piece_{self._piece_count:06d}.json"
                piece_data = {
                    "piece_number": self._piece_count,
                    "strokes": [s.model_dump() for s in self._canvas.strokes],
                    "created_at": datetime.now(UTC).isoformat(),
                }

                # Atomic write for gallery piece
                temp_file = piece_file.with_suffix(".json.tmp")
                async with aiofiles.open(temp_file, "w") as f:
                    await f.write(json.dumps(piece_data, indent=2))
                await aiofiles.os.replace(temp_file, piece_file)

                saved_id = f"piece_{self._piece_count:06d}"
                logger.info(f"Saved piece {self._piece_count} to gallery as {saved_id}")

            # Start fresh
            self._canvas.strokes = []
            self._piece_count += 1
            self._monologue = ""  # Clear thinking for new piece
            self._notes = ""  # Clear notes for new piece

        # Save outside the lock (save() has its own lock)
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
                try:
                    async with aiofiles.open(piece_file) as f:
                        data = json.loads(await f.read())

                    piece_number = data.get("piece_number")
                    if piece_number is None:
                        logger.warning(f"Gallery file {entry} missing piece_number, skipping")
                        continue

                    pieces.append(
                        SavedCanvas(
                            id=f"piece_{piece_number:06d}",
                            strokes=[Path.model_validate(s) for s in data.get("strokes", [])],
                            created_at=data.get("created_at", ""),
                            piece_number=piece_number,
                        )
                    )
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Skipping corrupted gallery file {entry}: {e}")
                    continue

        # Sort by piece number
        pieces.sort(key=lambda p: p.piece_number)
        return pieces

    async def load_from_gallery(self, piece_number: int) -> list[Path] | None:
        """Load strokes from a gallery piece."""
        # Try both 3-digit and 6-digit formats for backwards compatibility
        for fmt in [f"piece_{piece_number:06d}.json", f"piece_{piece_number:03d}.json"]:
            piece_file = self._gallery_dir / fmt
            if await aiofiles.os.path.exists(piece_file):
                try:
                    async with aiofiles.open(piece_file) as f:
                        data = json.loads(await f.read())
                    return [Path.model_validate(s) for s in data.get("strokes", [])]
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Failed to load gallery piece {piece_number}: {e}")
                    return None

        return None
