"""Type definitions for the drawing agent."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel


class Point(BaseModel):
    """A 2D point."""

    x: float
    y: float


class PathType(str, Enum):
    """Types of drawable paths."""

    LINE = "line"
    QUADRATIC = "quadratic"
    CUBIC = "cubic"
    POLYLINE = "polyline"


class Path(BaseModel):
    """A drawable path."""

    type: PathType
    points: list[Point]


class AgentStatus(str, Enum):
    """Agent status values."""

    IDLE = "idle"
    THINKING = "thinking"
    EXECUTING = "executing"  # Running code in sandbox
    DRAWING = "drawing"
    PAUSED = "paused"
    ERROR = "error"


class CanvasState(BaseModel):
    """Canvas state."""

    width: int = 800
    height: int = 600
    strokes: list[Path] = []


class ExecutionState(BaseModel):
    """Drawing execution state."""

    active: bool = False
    paths: list[Path] = []
    path_index: int = 0
    point_index: int = 0
    pen_x: float = 0
    pen_y: float = 0
    pen_down: bool = False


class AgentState(BaseModel):
    """Agent state."""

    status: AgentStatus = AgentStatus.IDLE
    monologue: str = ""
    notes: str = ""
    piece_count: int = 0


class SavedCanvas(BaseModel):
    """A saved canvas in the gallery."""

    id: str
    strokes: list[Path]
    created_at: str  # ISO timestamp
    piece_number: int


class GalleryState(BaseModel):
    """Gallery of saved canvases."""

    canvases: list[SavedCanvas] = []


class AppState(BaseModel):
    """Full application state."""

    canvas: CanvasState = CanvasState()
    execution: ExecutionState = ExecutionState()
    agent: AgentState = AgentState()
    gallery: GalleryState = GalleryState()


# WebSocket message types


class PenMessage(BaseModel):
    """Pen position update."""

    type: Literal["pen"] = "pen"
    x: float
    y: float
    down: bool


class StrokeCompleteMessage(BaseModel):
    """Stroke completed."""

    type: Literal["stroke_complete"] = "stroke_complete"
    path: Path


class ThinkingMessage(BaseModel):
    """Agent thinking stream."""

    type: Literal["thinking"] = "thinking"
    text: str


class StatusMessage(BaseModel):
    """Agent status change."""

    type: Literal["status"] = "status"
    status: AgentStatus


class ClearMessage(BaseModel):
    """Canvas cleared."""

    type: Literal["clear"] = "clear"


class NewCanvasMessage(BaseModel):
    """New canvas created, old one saved to gallery."""

    type: Literal["new_canvas"] = "new_canvas"
    saved_id: str | None = None  # ID of saved canvas, None if was empty


class GalleryUpdateMessage(BaseModel):
    """Gallery was updated."""

    type: Literal["gallery_update"] = "gallery_update"
    canvases: list[SavedCanvas]


class LoadCanvasMessage(BaseModel):
    """Load a canvas from gallery."""

    type: Literal["load_canvas"] = "load_canvas"
    strokes: list[Path]
    piece_number: int


class ThinkingDeltaMessage(BaseModel):
    """Incremental thinking text (delta only, not accumulated)."""

    type: Literal["thinking_delta"] = "thinking_delta"
    text: str  # Only the new text since last message
    iteration: int = 1  # Which iteration (1-5)


class CodeExecutionMessage(BaseModel):
    """Code execution started or completed."""

    type: Literal["code_execution"] = "code_execution"
    status: Literal["started", "completed"]
    stdout: str | None = None
    stderr: str | None = None
    return_code: int | None = None
    iteration: int = 1


class ErrorMessage(BaseModel):
    """Error occurred during agent execution."""

    type: Literal["error"] = "error"
    message: str
    details: str | None = None


class PieceCompleteMessage(BaseModel):
    """A piece has been completed."""

    type: Literal["piece_complete"] = "piece_complete"
    piece_number: int


class IterationMessage(BaseModel):
    """Agent iteration update."""

    type: Literal["iteration"] = "iteration"
    current: int  # Current iteration number (1-5)
    max: int = 5  # Maximum iterations



class ClientStrokeMessage(BaseModel):
    """Human stroke from client."""

    type: Literal["stroke"] = "stroke"
    points: list[Point]


class ClientNudgeMessage(BaseModel):
    """Human nudge from client."""

    type: Literal["nudge"] = "nudge"
    text: str


class ClientControlMessage(BaseModel):
    """Control message from client."""

    type: Literal["clear", "pause", "resume"]


ServerMessage = (
    PenMessage
    | StrokeCompleteMessage
    | ThinkingMessage
    | ThinkingDeltaMessage
    | StatusMessage
    | ClearMessage
    | NewCanvasMessage
    | GalleryUpdateMessage
    | LoadCanvasMessage
    | CodeExecutionMessage
    | ErrorMessage
    | PieceCompleteMessage
    | IterationMessage
)
ClientMessage = ClientStrokeMessage | ClientNudgeMessage | ClientControlMessage
