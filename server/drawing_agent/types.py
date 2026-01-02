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
    DRAWING = "drawing"


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


class AppState(BaseModel):
    """Full application state."""

    canvas: CanvasState = CanvasState()
    execution: ExecutionState = ExecutionState()
    agent: AgentState = AgentState()


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


ServerMessage = PenMessage | StrokeCompleteMessage | ThinkingMessage | StatusMessage | ClearMessage
ClientMessage = ClientStrokeMessage | ClientNudgeMessage | ClientControlMessage
