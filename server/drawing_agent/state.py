"""State persistence."""

import json
from pathlib import Path

from drawing_agent.config import settings
from drawing_agent.types import AppState


class StateManager:
    """Manages application state persistence."""

    def __init__(self, state_file: str | None = None) -> None:
        self.state_file = Path(state_file or settings.state_file)
        self._state: AppState | None = None

    def load(self) -> AppState:
        """Load state from disk, or create new state if file doesn't exist."""
        if self._state is not None:
            return self._state

        if self.state_file.exists():
            try:
                data = json.loads(self.state_file.read_text())
                self._state = AppState.model_validate(data)
            except (json.JSONDecodeError, ValueError):
                self._state = AppState()
        else:
            self._state = AppState()

        return self._state

    def save(self) -> None:
        """Persist current state to disk."""
        if self._state is not None:
            self.state_file.write_text(
                self._state.model_dump_json(indent=2),
                encoding="utf-8",
            )

    @property
    def state(self) -> AppState:
        """Get current state, loading if necessary."""
        if self._state is None:
            return self.load()
        return self._state

    def reset(self) -> None:
        """Reset to fresh state."""
        self._state = AppState()
        self.save()


state_manager = StateManager()
