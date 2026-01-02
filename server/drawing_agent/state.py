"""In-memory state with workspace persistence."""

import logging

from drawing_agent.types import AgentStatus, CanvasState, Path
from drawing_agent.workspace import workspace

logger = logging.getLogger(__name__)


class StateManager:
    """Manages in-memory state with file persistence via workspace."""

    def __init__(self) -> None:
        self._canvas: CanvasState = CanvasState()
        self._status: AgentStatus = AgentStatus.PAUSED
        self._piece_count: int = 0
        self._monologue: str = ""
        self._loaded = False

    def load(self) -> None:
        """Load state from workspace."""
        if self._loaded:
            return

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
        logger.info(f"State loaded: piece {self._piece_count}, {len(self._canvas.strokes)} strokes")

    def save(self) -> None:
        """Save state to workspace."""
        workspace.save_current(self._canvas, self._status, self._piece_count)

    @property
    def canvas(self) -> CanvasState:
        self.load()
        return self._canvas

    @property
    def status(self) -> AgentStatus:
        self.load()
        return self._status

    @status.setter
    def status(self, value: AgentStatus) -> None:
        self._status = value

    @property
    def piece_count(self) -> int:
        self.load()
        return self._piece_count

    @piece_count.setter
    def piece_count(self, value: int) -> None:
        self._piece_count = value

    @property
    def monologue(self) -> str:
        if not self._monologue:
            self._monologue = workspace.load_monologue()
        return self._monologue

    @monologue.setter
    def monologue(self, value: str) -> None:
        self._monologue = value
        workspace.save_monologue(value)

    @property
    def notes(self) -> str:
        return workspace.load_notes()

    @notes.setter
    def notes(self, value: str) -> None:
        workspace.save_notes(value)

    def add_stroke(self, path: Path) -> None:
        """Add a stroke to the canvas."""
        self.load()
        self._canvas.strokes.append(path)
        self.save()

    def clear_canvas(self) -> None:
        """Clear the canvas."""
        self.load()
        self._canvas.strokes = []
        self.save()

    def new_canvas(self) -> str | None:
        """Save current canvas to gallery and start fresh. Returns saved ID or None."""
        self.load()

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
