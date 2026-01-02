"""File-based workspace management for the agent.

Structure:
  agent_workspace/
    current.json    - active canvas + status
    notes.txt       - persistent agent notes
    history.jsonl   - append-only agent turn log
    gallery/
      piece_001.json
      piece_002.json
      ...
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from drawing_agent.config import settings
from drawing_agent.types import AgentStatus, CanvasState, Path as DrawPath, SavedCanvas


class Workspace:
    """Manages the agent's file-based workspace."""

    def __init__(self, workspace_dir: str | None = None) -> None:
        self.root = Path(workspace_dir or settings.agent_workspace)
        self.root.mkdir(parents=True, exist_ok=True)
        self.gallery_dir = self.root / "gallery"
        self.gallery_dir.mkdir(exist_ok=True)

    # --- Current State ---

    @property
    def current_file(self) -> Path:
        return self.root / "current.json"

    def load_current(self) -> dict[str, Any]:
        """Load current canvas state."""
        if self.current_file.exists():
            try:
                return json.loads(self.current_file.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        return {
            "canvas": {"width": 800, "height": 600, "strokes": []},
            "status": "paused",
            "piece_count": 0,
        }

    def save_current(
        self,
        canvas: CanvasState,
        status: AgentStatus,
        piece_count: int,
    ) -> None:
        """Save current canvas state."""
        data = {
            "canvas": canvas.model_dump(),
            "status": status.value,
            "piece_count": piece_count,
        }
        self.current_file.write_text(json.dumps(data, indent=2))

    # --- Notes ---

    @property
    def notes_file(self) -> Path:
        return self.root / "notes.txt"

    def load_notes(self) -> str:
        """Load agent notes."""
        if self.notes_file.exists():
            return self.notes_file.read_text()
        return ""

    def save_notes(self, notes: str) -> None:
        """Save agent notes."""
        self.notes_file.write_text(notes)

    # --- History (JSONL) ---

    @property
    def history_file(self) -> Path:
        return self.root / "history.jsonl"

    def append_history(self, entry: dict[str, Any]) -> None:
        """Append an entry to the history log."""
        entry["timestamp"] = datetime.now(timezone.utc).isoformat()
        with open(self.history_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def read_history(self, last_n: int = 100) -> list[dict[str, Any]]:
        """Read the last N history entries."""
        if not self.history_file.exists():
            return []
        lines = self.history_file.read_text().strip().split("\n")
        lines = lines[-last_n:] if len(lines) > last_n else lines
        return [json.loads(line) for line in lines if line]

    # --- Gallery ---

    def _piece_filename(self, piece_number: int) -> str:
        return f"piece_{piece_number:03d}.json"

    def save_to_gallery(
        self,
        piece_number: int,
        strokes: list[DrawPath],
    ) -> SavedCanvas:
        """Save a canvas to the gallery."""
        canvas_id = f"piece_{piece_number:03d}"
        saved = SavedCanvas(
            id=canvas_id,
            strokes=strokes,
            created_at=datetime.now(timezone.utc).isoformat(),
            piece_number=piece_number,
        )
        filepath = self.gallery_dir / self._piece_filename(piece_number)
        filepath.write_text(saved.model_dump_json(indent=2))
        return saved

    def load_from_gallery(self, piece_number: int) -> SavedCanvas | None:
        """Load a canvas from the gallery."""
        filepath = self.gallery_dir / self._piece_filename(piece_number)
        if filepath.exists():
            return SavedCanvas.model_validate_json(filepath.read_text())
        return None

    def list_gallery(self) -> list[SavedCanvas]:
        """List all saved canvases in the gallery."""
        canvases = []
        for filepath in sorted(self.gallery_dir.glob("piece_*.json")):
            try:
                canvas = SavedCanvas.model_validate_json(filepath.read_text())
                canvases.append(canvas)
            except (json.JSONDecodeError, OSError):
                continue
        return canvases

    def delete_from_gallery(self, piece_number: int) -> bool:
        """Delete a canvas from the gallery."""
        filepath = self.gallery_dir / self._piece_filename(piece_number)
        if filepath.exists():
            filepath.unlink()
            return True
        return False


# Global workspace instance
workspace = Workspace()
