"""In-memory state with workspace persistence."""

import logging

from drawing_agent.types import AgentStatus, CanvasState, Path
from drawing_agent.workspace import workspace

logger = logging.getLogger(__name__)


class StateNotLoadedError(RuntimeError):
    """Raised when state is accessed before loading."""

    def __init__(self) -> None:
        super().__init__("State not loaded. Call state_manager.load() first.")


class StateManager:
    """Manages in-memory state with file persistence via workspace.

    State must be explicitly loaded before use via the load() method.
    This avoids hidden side effects in property getters.
    """

    def __init__(self) -> None:
        self._canvas: CanvasState = CanvasState()
        self._status: AgentStatus = AgentStatus.PAUSED
        self._piece_count: int = 0
        self._monologue: str = ""
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Check if state has been loaded."""
        return self._loaded

    def _ensure_loaded(self) -> None:
        """Raise if state hasn't been loaded."""
        if not self._loaded:
            raise StateNotLoadedError()

    def load(self) -> "StateManager":
        """Load state from workspace. Returns self for chaining."""
        if self._loaded:
            return self

        # Load current canvas state
        current = workspace.load_current()
        canvas_data = current.get("canvas", {})
        self._canvas = CanvasState(
            width=canvas_data.get("width", 800),
            height=canvas_data.get("height", 600),
            strokes=[Path.model_validate(s) for s in canvas_data.get("strokes", [])],
        )
        self._status = AgentStatus(current.get("status", "paused"))
        self._piece_count = current.get("piece_count", 0)

        self._loaded = True
        logger.info(
            f"State loaded: piece {self._piece_count}, {len(self._canvas.strokes)} strokes"
        )
        return self

    def save(self) -> None:
        """Save state to workspace."""
        self._ensure_loaded()
        workspace.save_current(self._canvas, self._status, self._piece_count)

    @property
    def canvas(self) -> CanvasState:
        """Get canvas state. Raises if not loaded."""
        self._ensure_loaded()
        return self._canvas

    @property
    def status(self) -> AgentStatus:
        """Get agent status. Raises if not loaded."""
        self._ensure_loaded()
        return self._status

    @status.setter
    def status(self, value: AgentStatus) -> None:
        """Set agent status."""
        self._ensure_loaded()
        self._status = value

    @property
    def piece_count(self) -> int:
        """Get piece count. Raises if not loaded."""
        self._ensure_loaded()
        return self._piece_count

    @piece_count.setter
    def piece_count(self, value: int) -> None:
        """Set piece count."""
        self._ensure_loaded()
        self._piece_count = value

    @property
    def monologue(self) -> str:
        """Get agent monologue (lazily loaded from workspace)."""
        if not self._monologue:
            self._monologue = workspace.load_monologue()
        return self._monologue

    @monologue.setter
    def monologue(self, value: str) -> None:
        """Set agent monologue (persisted to workspace)."""
        self._monologue = value
        workspace.save_monologue(value)

    @property
    def notes(self) -> str:
        """Get agent notes (loaded from workspace each time)."""
        return workspace.load_notes()

    @notes.setter
    def notes(self, value: str) -> None:
        """Set agent notes (persisted to workspace)."""
        workspace.save_notes(value)

    def add_stroke(self, path: Path) -> None:
        """Add a stroke to the canvas."""
        self._ensure_loaded()
        self._canvas.strokes.append(path)
        self.save()

    def clear_canvas(self) -> None:
        """Clear the canvas."""
        self._ensure_loaded()
        self._canvas.strokes = []
        self.save()

    def new_canvas(self) -> str | None:
        """Save current canvas to gallery and start fresh. Returns saved ID or None."""
        self._ensure_loaded()

        saved_id = None
        if self._canvas.strokes:
            saved = workspace.save_to_gallery(self._piece_count, self._canvas.strokes)
            saved_id = saved.id
            logger.info(f"Saved piece {self._piece_count} to gallery as {saved_id}")

        # Start fresh
        self._canvas.strokes = []
        self._piece_count += 1
        self.save()

        return saved_id


state_manager = StateManager()
