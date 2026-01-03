"""Database-backed workspace state for multi-user isolation."""

import logging
from typing import Any

from drawing_agent.db import Workspace, get_session, repository
from drawing_agent.types import AgentStatus, CanvasState, Path, SavedCanvas

logger = logging.getLogger(__name__)


class WorkspaceState:
    """Per-user workspace state backed by the database.

    Replaces the file-based StateManager for multi-user isolation.
    Each user has their own WorkspaceState instance.
    """

    def __init__(self, user_id: int, workspace_id: int) -> None:
        self.user_id = user_id
        self.workspace_id = workspace_id

        # In-memory state (loaded from DB)
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
        async with get_session() as session:
            workspace = await repository.get_or_create_workspace(session, user_id)
            state = cls(user_id, workspace.id)
            state._load_from_db(workspace)
            return state

    def _load_from_db(self, workspace: Workspace) -> None:
        """Load state from a workspace model."""
        canvas_data = workspace.canvas_state or {}
        self._canvas = CanvasState(
            width=canvas_data.get("width", 800),
            height=canvas_data.get("height", 600),
            strokes=[Path.model_validate(s) for s in canvas_data.get("strokes", [])],
        )
        self._status = AgentStatus(workspace.status)
        self._piece_count = workspace.piece_count
        self._notes = workspace.notes
        self._monologue = workspace.monologue
        self._loaded = True
        logger.info(
            f"Workspace loaded for user {self.user_id}: "
            f"piece {self._piece_count}, {len(self._canvas.strokes)} strokes"
        )

    async def save(self) -> None:
        """Save state to database."""
        async with get_session() as session:
            await repository.update_workspace_canvas(
                session,
                self.workspace_id,
                self._canvas.model_dump(),
            )
            await repository.update_workspace_agent_state(
                session,
                self.workspace_id,
                status=self._status.value,
                notes=self._notes,
                monologue=self._monologue,
                piece_count=self._piece_count,
            )

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
            # Save to gallery in database
            async with get_session() as session:
                strokes_data = [s.model_dump() for s in self._canvas.strokes]
                piece = await repository.create_gallery_piece(
                    session,
                    self.workspace_id,
                    self._piece_count,
                    strokes_data,
                )
                saved_id = f"piece_{piece.piece_number:03d}"
                logger.info(f"Saved piece {self._piece_count} to gallery as {saved_id}")

        # Start fresh
        self._canvas.strokes = []
        self._piece_count += 1
        await self.save()

        return saved_id

    # --- Gallery Operations ---

    async def list_gallery(self) -> list[SavedCanvas]:
        """List gallery pieces for this workspace."""
        async with get_session() as session:
            pieces = await repository.list_gallery_pieces(session, self.workspace_id)
            return [
                SavedCanvas(
                    id=f"piece_{p.piece_number:03d}",
                    strokes=[Path.model_validate(s) for s in p.strokes],
                    created_at=p.created_at.isoformat(),
                    piece_number=p.piece_number,
                )
                for p in pieces
            ]

    async def load_from_gallery(self, piece_number: int) -> list[Path] | None:
        """Load strokes from a gallery piece."""
        async with get_session() as session:
            piece = await repository.get_gallery_piece(session, self.workspace_id, piece_number)
            if piece:
                return [Path.model_validate(s) for s in piece.strokes]
            return None

    def get_gallery_data(self) -> list[dict[str, Any]]:
        """Get gallery data synchronously (cached from last list_gallery call)."""
        # For now, return empty - will be populated by list_gallery
        return []
