"""Filesystem-backed workspace state for multi-user isolation."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from pathlib import Path as FilePath
from typing import TYPE_CHECKING

import aiofiles
import aiofiles.os

from code_monet.config import settings
from code_monet.types import (
    AgentStatus,
    CanvasState,
    DrawingStyleType,
    GalleryEntry,
    Path,
    PendingStrokeDict,
    SavedCanvas,
)

if TYPE_CHECKING:
    from code_monet.config import Settings

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

    def __init__(self, user_id: str, user_dir: FilePath) -> None:
        self.user_id = user_id
        self._user_dir = user_dir
        self._workspace_file = user_dir / "workspace.json"
        self._gallery_dir = user_dir / "gallery"
        self._write_lock = asyncio.Lock()
        self._stroke_lock = asyncio.Lock()  # Protects stroke/canvas modifications

        # In-memory state
        self._canvas: CanvasState = CanvasState()
        self._status: AgentStatus = AgentStatus.PAUSED
        self._piece_number: int = 0
        self._notes: str = ""
        self._monologue: str = ""
        self._current_piece_title: str | None = None  # Title for current piece
        self._loaded = False

        # Pending strokes for client-side rendering
        self._pending_strokes: list[PendingStrokeDict] = []
        self._stroke_batch_id: int = 0

        # Save debouncing - coalesce rapid saves
        self._save_pending: bool = False
        self._save_task: asyncio.Task[None] | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def workspace_dir(self) -> str:
        """Return the user's workspace directory path as string."""
        return str(self._user_dir)

    @classmethod
    async def load_for_user(cls, user_id: str) -> WorkspaceState:
        """Load or create workspace state for a user."""
        # Validate user_id is a valid UUID string (path traversal protection)
        import re

        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
        )
        if not isinstance(user_id, str) or not uuid_pattern.match(user_id):
            raise ValueError(f"Invalid user_id (must be UUID): {user_id}")

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
            # Parse drawing_style with fallback to plotter
            style_str = canvas_data.get("drawing_style", "plotter")
            try:
                drawing_style = DrawingStyleType(style_str)
            except ValueError:
                logger.warning(f"Invalid drawing_style '{style_str}', defaulting to plotter")
                drawing_style = DrawingStyleType.PLOTTER

            self._canvas = CanvasState(
                width=canvas_data.get("width", 800),
                height=canvas_data.get("height", 600),
                strokes=[Path.model_validate(s) for s in canvas_data.get("strokes", [])],
                drawing_style=drawing_style,
            )
            self._status = AgentStatus(data.get("status", "paused"))
            self._piece_number = data.get("piece_number", 0)
            self._notes = data.get("notes", "")
            self._monologue = data.get("monologue", "")
            self._current_piece_title = data.get("current_piece_title")
            self._pending_strokes = data.get("pending_strokes", [])
            self._stroke_batch_id = data.get("stroke_batch_id", 0)

            logger.info(
                f"Workspace loaded for user {self.user_id}: "
                f"piece {self._piece_number}, {len(self._canvas.strokes)} strokes"
            )
        else:
            logger.info(f"New workspace created for user {self.user_id}")

        self._loaded = True

    async def save(self, debounce_ms: int = 0) -> None:
        """Save state to filesystem atomically.

        Args:
            debounce_ms: If > 0, debounce saves by this many milliseconds.
                         Multiple calls within the window will be coalesced.

        Enforces max_workspace_size_bytes limit to prevent disk exhaustion.
        """
        from code_monet.config import settings as app_settings

        if debounce_ms > 0:
            # Debounced save - schedule and return immediately
            self._save_pending = True
            if self._save_task is None or self._save_task.done():
                self._save_task = asyncio.create_task(self._debounced_save(debounce_ms))
            return

        await self._do_save(app_settings)

    async def _debounced_save(self, debounce_ms: int) -> None:
        """Wait for debounce period then save if still pending."""
        from code_monet.config import settings as app_settings

        await asyncio.sleep(debounce_ms / 1000.0)
        if self._save_pending:
            self._save_pending = False
            await self._do_save(app_settings)

    async def _do_save(self, app_settings: Settings) -> None:
        """Actually perform the save."""
        async with self._write_lock:
            data = {
                "canvas": self._canvas.model_dump(),
                "status": self._status.value,
                "piece_number": self._piece_number,
                "notes": self._notes,
                "monologue": self._monologue,
                "current_piece_title": self._current_piece_title,
                "pending_strokes": self._pending_strokes,
                "stroke_batch_id": self._stroke_batch_id,
                "updated_at": datetime.now(UTC).isoformat(),
            }

            # Serialize and check size
            json_data = json.dumps(data, indent=2)
            if len(json_data) > app_settings.max_workspace_size_bytes:
                logger.warning(
                    f"User {self.user_id}: workspace size ({len(json_data)} bytes) "
                    f"exceeds limit ({app_settings.max_workspace_size_bytes} bytes), "
                    "truncating old strokes"
                )
                # Remove oldest strokes until under limit
                while (
                    len(json_data) > app_settings.max_workspace_size_bytes
                    and len(self._canvas.strokes) > 10
                ):
                    self._canvas.strokes = self._canvas.strokes[10:]
                    data["canvas"] = self._canvas.model_dump()
                    json_data = json.dumps(data, indent=2)

            # Write to temp file first, then atomically rename
            temp_file = self._workspace_file.with_suffix(".json.tmp")
            async with aiofiles.open(temp_file, "w") as f:
                await f.write(json_data)

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
    def piece_number(self) -> int:
        return self._piece_number

    @piece_number.setter
    def piece_number(self, value: int) -> None:
        self._piece_number = value

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
    def current_piece_title(self) -> str | None:
        return self._current_piece_title

    @current_piece_title.setter
    def current_piece_title(self, value: str | None) -> None:
        self._current_piece_title = value

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

    async def queue_strokes(self, paths: list[Path]) -> tuple[int, int]:
        """Interpolate paths and queue for client-side rendering.

        Returns (batch_id, total_point_count) for this set of strokes.
        Thread-safe: uses stroke lock to prevent race conditions.
        Enforces max_pending_strokes limit to prevent memory exhaustion.
        """
        from code_monet.config import settings
        from code_monet.interpolation import interpolate_path

        total_points = 0

        async with self._stroke_lock:
            # Check pending strokes limit
            if len(self._pending_strokes) >= settings.max_pending_strokes:
                logger.warning(
                    f"User {self.user_id}: pending strokes limit reached "
                    f"({settings.max_pending_strokes}), dropping oldest"
                )
                # Drop oldest strokes to make room
                drop_count = len(paths)
                self._pending_strokes = self._pending_strokes[drop_count:]

            self._stroke_batch_id += 1
            batch_id = self._stroke_batch_id

            for path in paths:
                points = interpolate_path(path, settings.path_steps_per_unit)
                total_points += len(points)
                self._pending_strokes.append(
                    {
                        "batch_id": batch_id,
                        "path": path.model_dump(),
                        "points": [{"x": p.x, "y": p.y} for p in points],
                    }
                )

        await self.save()
        return batch_id, total_points

    async def pop_strokes(self) -> list[PendingStrokeDict]:
        """Get and clear pending strokes.

        Thread-safe: uses stroke lock to prevent race conditions.
        """
        async with self._stroke_lock:
            strokes = self._pending_strokes.copy()
            self._pending_strokes.clear()
        await self.save()
        return strokes

    # --- Canvas Operations ---

    async def add_stroke(self, path: Path) -> None:
        """Add a stroke to the canvas.

        Thread-safe: uses stroke lock to prevent race conditions.
        """
        async with self._stroke_lock:
            self._canvas.strokes.append(path)
        await self.save()

    async def clear_canvas(self) -> None:
        """Clear the canvas.

        Thread-safe: uses stroke lock to prevent race conditions.
        """
        async with self._stroke_lock:
            self._canvas.strokes = []
        await self.save()

    async def save_to_gallery(self) -> str | None:
        """Save current canvas to gallery without clearing. Returns saved ID."""
        async with self._write_lock:
            if not self._canvas.strokes:
                return None

            # Save to gallery as JSON file (use 6 digits for scalability)
            piece_file = self._gallery_dir / f"piece_{self._piece_number:06d}.json"
            created_at = datetime.now(UTC).isoformat()
            piece_data = {
                "piece_number": self._piece_number,
                "strokes": [s.model_dump() for s in self._canvas.strokes],
                "created_at": created_at,
                "drawing_style": self._canvas.drawing_style.value,
                "title": self._current_piece_title,
            }

            # Atomic write for gallery piece
            temp_file = piece_file.with_suffix(".json.tmp")
            async with aiofiles.open(temp_file, "w") as f:
                await f.write(json.dumps(piece_data, indent=2))
            await aiofiles.os.replace(temp_file, piece_file)

            saved_id = f"piece_{self._piece_number:06d}"
            title_info = (
                f' titled "{self._current_piece_title}"' if self._current_piece_title else ""
            )
            logger.info(f"Saved piece {self._piece_number}{title_info} to gallery as {saved_id}")

        await self.save()
        return saved_id

    async def new_canvas(self) -> str | None:
        """Save current canvas to gallery and start fresh. Returns saved ID."""
        # First save to gallery
        saved_id = await self.save_to_gallery()

        # Then clear for new canvas
        async with self._write_lock:
            self._canvas.strokes = []
            self._piece_number += 1
            self._monologue = ""  # Clear thinking for new piece
            self._notes = ""  # Clear notes for new piece
            self._current_piece_title = None  # Clear title for new piece

        # Clear pending strokes from previous canvas to prevent them
        # from being rendered on the new canvas
        async with self._stroke_lock:
            self._pending_strokes.clear()

        await self.save()
        return saved_id

    # --- Gallery Operations ---

    async def list_gallery(self) -> list[GalleryEntry]:
        """List gallery pieces by scanning piece files."""
        if not await aiofiles.os.path.exists(self._gallery_dir):
            return []

        result = []
        for entry in await aiofiles.os.listdir(self._gallery_dir):
            if not entry.startswith("piece_") or not entry.endswith(".json"):
                continue

            piece_file = self._gallery_dir / entry
            try:
                async with aiofiles.open(piece_file) as f:
                    data = json.loads(await f.read())

                piece_number = data.get("piece_number")
                if piece_number is None:
                    continue

                style_str = data.get("drawing_style", "plotter")
                try:
                    drawing_style = DrawingStyleType(style_str)
                except ValueError:
                    drawing_style = DrawingStyleType.PLOTTER

                result.append(
                    GalleryEntry(
                        id=f"piece_{piece_number:06d}",
                        created_at=data.get("created_at", ""),
                        piece_number=piece_number,
                        stroke_count=len(data.get("strokes", [])),
                        drawing_style=drawing_style,
                        title=data.get("title"),
                    )
                )
            except (json.JSONDecodeError, OSError):
                continue

        result.sort(key=lambda p: p.piece_number)
        return result

    async def list_gallery_with_strokes(self) -> list[SavedCanvas]:
        """List gallery pieces with full stroke data.

        This loads all strokes for each piece - use sparingly.
        For listings, prefer list_gallery() which returns metadata only.
        """
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

                    # Parse drawing_style with fallback
                    style_str = data.get("drawing_style", "plotter")
                    try:
                        drawing_style = DrawingStyleType(style_str)
                    except ValueError:
                        drawing_style = DrawingStyleType.PLOTTER

                    pieces.append(
                        SavedCanvas(
                            id=f"piece_{piece_number:06d}",
                            strokes=[Path.model_validate(s) for s in data.get("strokes", [])],
                            created_at=data.get("created_at", ""),
                            piece_number=piece_number,
                            drawing_style=drawing_style,
                            title=data.get("title"),
                        )
                    )
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Skipping corrupted gallery file {entry}: {e}")
                    continue

        # Sort by piece number
        pieces.sort(key=lambda p: p.piece_number)
        return pieces

    async def load_from_gallery(
        self, piece_number: int
    ) -> tuple[list[Path], DrawingStyleType] | None:
        """Load strokes and drawing style from a gallery piece.

        Returns (strokes, drawing_style) tuple or None if not found.
        """
        # Try both 3-digit and 6-digit formats for backwards compatibility
        for fmt in [f"piece_{piece_number:06d}.json", f"piece_{piece_number:03d}.json"]:
            piece_file = self._gallery_dir / fmt
            if await aiofiles.os.path.exists(piece_file):
                try:
                    async with aiofiles.open(piece_file) as f:
                        data = json.loads(await f.read())

                    strokes = [Path.model_validate(s) for s in data.get("strokes", [])]

                    # Parse drawing_style with fallback
                    style_str = data.get("drawing_style", "plotter")
                    try:
                        drawing_style = DrawingStyleType(style_str)
                    except ValueError:
                        drawing_style = DrawingStyleType.PLOTTER

                    return (strokes, drawing_style)
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Failed to load gallery piece {piece_number}: {e}")
                    return None

        return None
