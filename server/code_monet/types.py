"""Type definitions for the drawing agent."""

from enum import Enum
from typing import Any, Literal, TypedDict

from pydantic import BaseModel


class PointDict(TypedDict):
    """Dictionary representation of a point."""

    x: float
    y: float


class PendingStrokeDict(TypedDict):
    """Dictionary representation of a pending stroke for animation."""

    batch_id: int
    path: dict[str, Any]  # Serialized Path model
    points: list[PointDict]


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
    SVG = "svg"  # Raw SVG path d-string


class DrawingStyleType(str, Enum):
    """Drawing style modes."""

    PLOTTER = "plotter"  # Monochrome pen plotter style (black lines)
    PAINT = "paint"  # Full color painting style


class StrokeStyle(BaseModel):
    """Style properties for a stroke.

    Used both as path-level style and as style defaults.
    """

    color: str = "#1a1a2e"  # Hex color (default: dark)
    stroke_width: float = 2.5  # Stroke width in canvas units
    opacity: float = 1.0  # 0-1 alpha value
    stroke_linecap: Literal["round", "butt", "square"] = "round"
    stroke_linejoin: Literal["round", "miter", "bevel"] = "round"


class DrawingStyleConfig(BaseModel):
    """Configuration for a drawing style.

    Defines the capabilities and defaults for each style mode.
    """

    type: DrawingStyleType
    name: str  # Human-readable name
    description: str  # For agent prompt

    # Default styles
    agent_stroke: StrokeStyle  # Default style for agent strokes
    human_stroke: StrokeStyle  # Default style for human strokes

    # Capabilities
    supports_color: bool = False  # Can paths have custom colors?
    supports_variable_width: bool = False  # Can paths have custom widths?
    supports_opacity: bool = False  # Can paths have custom opacity?

    # Color palette (if restricted, None = any color)
    color_palette: list[str] | None = None


# Pre-defined drawing styles
PLOTTER_STYLE = DrawingStyleConfig(
    type=DrawingStyleType.PLOTTER,
    name="Plotter",
    description="Monochrome pen plotter style with crisp black lines",
    agent_stroke=StrokeStyle(
        color="#1a1a2e",  # Dark
        stroke_width=2.5,
        opacity=1.0,
    ),
    human_stroke=StrokeStyle(
        color="#0066CC",  # Blue for visibility
        stroke_width=2.5,
        opacity=1.0,
    ),
    supports_color=False,
    supports_variable_width=False,
    supports_opacity=False,
)

PAINT_STYLE = DrawingStyleConfig(
    type=DrawingStyleType.PAINT,
    name="Paint",
    description="Full color painting style with expressive brush strokes",
    agent_stroke=StrokeStyle(
        color="#1a1a2e",  # Default dark, but can be overridden
        stroke_width=8.0,  # Thicker for brush effect
        opacity=0.85,
    ),
    human_stroke=StrokeStyle(
        color="#e94560",  # Rose
        stroke_width=8.0,  # Thicker for brush effect
        opacity=0.85,
    ),
    supports_color=True,
    supports_variable_width=True,
    supports_opacity=True,
    # Curated color palette for the agent
    color_palette=[
        "#1a1a2e",  # Dark (near black)
        "#e94560",  # Rose/crimson
        "#7b68ee",  # Violet
        "#4ecdc4",  # Teal
        "#ffd93d",  # Gold
        "#ff6b6b",  # Coral
        "#4ade80",  # Green
        "#3b82f6",  # Blue
        "#f97316",  # Orange
        "#a855f7",  # Purple
        "#ffffff",  # White
    ],
)

# Style registry
DRAWING_STYLES: dict[DrawingStyleType, DrawingStyleConfig] = {
    DrawingStyleType.PLOTTER: PLOTTER_STYLE,
    DrawingStyleType.PAINT: PAINT_STYLE,
}


def get_style_config(style_type: DrawingStyleType) -> DrawingStyleConfig:
    """Get the configuration for a drawing style."""
    return DRAWING_STYLES[style_type]


class Path(BaseModel):
    """A drawable path."""

    type: PathType
    points: list[Point] = []  # Empty for SVG paths
    d: str | None = None  # SVG path d-string (for type=svg)
    author: Literal["agent", "human"] = "agent"

    # Style properties (optional - use style defaults if not set)
    color: str | None = None  # Hex color
    stroke_width: float | None = None  # Stroke width
    opacity: float | None = None  # 0-1 alpha

    def get_effective_style(self, style_config: DrawingStyleConfig) -> StrokeStyle:
        """Get the effective style for this path, merging with defaults.

        Args:
            style_config: The active drawing style configuration

        Returns:
            Complete stroke style with all properties resolved
        """
        default = style_config.agent_stroke if self.author == "agent" else style_config.human_stroke

        # In plotter mode, always use defaults (ignore path-level styles)
        if style_config.type == DrawingStyleType.PLOTTER:
            return default

        # In paint mode, allow overrides
        return StrokeStyle(
            color=self.color if self.color and style_config.supports_color else default.color,
            stroke_width=(
                self.stroke_width
                if self.stroke_width and style_config.supports_variable_width
                else default.stroke_width
            ),
            opacity=(
                self.opacity
                if self.opacity is not None and style_config.supports_opacity
                else default.opacity
            ),
            stroke_linecap=default.stroke_linecap,
            stroke_linejoin=default.stroke_linejoin,
        )


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
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER  # Active style


class AgentState(BaseModel):
    """Agent state."""

    status: AgentStatus = AgentStatus.IDLE
    monologue: str = ""
    notes: str = ""
    piece_number: int = 0


class GalleryEntry(BaseModel):
    """Gallery entry for listings (metadata only, no strokes)."""

    id: str
    created_at: str  # ISO timestamp
    piece_number: int
    stroke_count: int
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER


class SavedCanvas(BaseModel):
    """Full saved canvas with strokes (for loading)."""

    id: str
    strokes: list[Path]
    created_at: str  # ISO timestamp
    piece_number: int
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER

    @property
    def num_strokes(self) -> int:
        """Get stroke count."""
        return len(self.strokes)

    def to_gallery_entry(self) -> GalleryEntry:
        """Convert to gallery entry (metadata only)."""
        return GalleryEntry(
            id=self.id,
            created_at=self.created_at,
            piece_number=self.piece_number,
            stroke_count=self.num_strokes,
            drawing_style=self.drawing_style,
        )


class GalleryState(BaseModel):
    """Gallery of saved canvases."""

    canvases: list[SavedCanvas] = []


class AppState(BaseModel):
    """Full application state."""

    canvas: CanvasState = CanvasState()
    agent: AgentState = AgentState()
    gallery: GalleryState = GalleryState()


# WebSocket message types


class StrokeCompleteMessage(BaseModel):
    """Stroke completed."""

    type: Literal["stroke_complete"] = "stroke_complete"
    path: Path


class PausedMessage(BaseModel):
    """Pause state change notification."""

    type: Literal["paused"] = "paused"
    paused: bool


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
    canvases: list[GalleryEntry]


class LoadCanvasMessage(BaseModel):
    """Load a canvas from gallery."""

    type: Literal["load_canvas"] = "load_canvas"
    strokes: list[Path]
    piece_number: int
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER
    style_config: DrawingStyleConfig | None = None


class ThinkingDeltaMessage(BaseModel):
    """Incremental thinking text (delta only, not accumulated)."""

    type: Literal["thinking_delta"] = "thinking_delta"
    text: str  # Only the new text since last message
    iteration: int = 1  # Which iteration (1-5)


class CodeExecutionMessage(BaseModel):
    """Code execution started or completed."""

    type: Literal["code_execution"] = "code_execution"
    status: Literal["started", "completed"]
    tool_name: str | None = None  # e.g., "draw_paths", "generate_svg", "view_canvas"
    tool_input: dict[str, Any] | None = None  # Tool input for context (e.g., path count, code)
    stdout: str | None = None
    stderr: str | None = None
    return_code: int | None = None
    iteration: int = 1


class ErrorMessage(BaseModel):
    """Error occurred during agent execution."""

    type: Literal["error"] = "error"
    message: str
    details: str | None = None


class PieceStateMessage(BaseModel):
    """Piece state update (count and completion status)."""

    type: Literal["piece_state"] = "piece_state"
    number: int
    completed: bool  # True if piece just finished


class IterationMessage(BaseModel):
    """Agent iteration update."""

    type: Literal["iteration"] = "iteration"
    current: int  # Current iteration number (1-5)
    max: int = 5  # Maximum iterations


class StrokesReadyMessage(BaseModel):
    """Notification that strokes are ready to be fetched via REST API."""

    type: Literal["strokes_ready"] = "strokes_ready"
    count: int  # Number of strokes ready
    batch_id: int  # For ordering/deduplication
    piece_number: int  # Canvas/piece number to prevent cross-canvas rendering


class StyleChangeMessage(BaseModel):
    """Drawing style changed."""

    type: Literal["style_change"] = "style_change"
    drawing_style: DrawingStyleType
    style_config: DrawingStyleConfig  # Full config for frontend


class ClientSetStyleMessage(BaseModel):
    """Client request to change drawing style."""

    type: Literal["set_style"] = "set_style"
    drawing_style: DrawingStyleType


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


class ClientNewCanvasMessage(BaseModel):
    """New canvas request from client."""

    type: Literal["new_canvas"] = "new_canvas"
    direction: str | None = None  # Optional direction for the agent
    drawing_style: DrawingStyleType | None = None  # Optional style for the new canvas


ServerMessage = (
    StrokeCompleteMessage
    | ThinkingDeltaMessage
    | PausedMessage
    | ClearMessage
    | NewCanvasMessage
    | GalleryUpdateMessage
    | LoadCanvasMessage
    | CodeExecutionMessage
    | ErrorMessage
    | PieceStateMessage
    | IterationMessage
    | StrokesReadyMessage
    | StyleChangeMessage
)
ClientMessage = (
    ClientStrokeMessage
    | ClientNudgeMessage
    | ClientControlMessage
    | ClientNewCanvasMessage
    | ClientSetStyleMessage
)


# Agent streaming events


class AgentPathsEvent(BaseModel):
    """Paths produced during agent turn - draw these immediately."""

    type: Literal["paths"] = "paths"
    paths: list[Path]


class AgentTurnComplete(BaseModel):
    """Agent turn completed."""

    type: Literal["turn_complete"] = "turn_complete"
    thinking: str
    done: bool  # True if piece is complete


AgentEvent = AgentPathsEvent | AgentTurnComplete
