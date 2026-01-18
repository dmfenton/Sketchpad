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


class BrushPreset(BaseModel):
    """Brush preset defining how strokes are rendered.

    The server expands a single stroke into multiple sub-strokes
    based on these parameters to create paint-like effects.
    """

    name: str  # Unique identifier (e.g., "oil_round")
    display_name: str  # Human-readable name
    description: str  # For agent prompt

    # Bristle rendering (sub-strokes)
    bristle_count: int = 0  # Number of parallel sub-strokes (0 = solid stroke)
    bristle_spread: float = 0.8  # Distance between bristles (× stroke width)
    bristle_opacity: float = 0.3  # Opacity of each bristle stroke
    bristle_width_ratio: float = 0.3  # Width of bristle (× main width)

    # Main stroke
    main_opacity: float = 0.8  # Opacity of the main/base stroke
    base_width: float = 8.0  # Default stroke width

    # Stroke shape
    taper: float = 0.7  # How much ends taper (0 = none, 1 = full point)
    pressure_response: float = 0.5  # How velocity affects width (0 = none, 1 = full)

    # Edge effects
    edge_noise: float = 0.0  # Random edge displacement (0-1)
    wet_edges: float = 0.0  # Opacity boost at stroke ends (0-1)

    # Smoothing
    smoothing: float = 0.5  # Catmull-Rom tension (0 = sharp, 1 = very smooth)


# ============================================================================
# BRUSH PRESETS
# ============================================================================

BRUSH_OIL_ROUND = BrushPreset(
    name="oil_round",
    display_name="Oil Round",
    description="Classic round oil brush. Soft edges, visible bristle texture. Good for blending and details.",
    bristle_count=5,
    bristle_spread=0.7,
    bristle_opacity=0.25,
    bristle_width_ratio=0.35,
    main_opacity=0.75,
    base_width=10.0,
    taper=0.7,
    pressure_response=0.5,
    smoothing=0.6,
)

BRUSH_OIL_FLAT = BrushPreset(
    name="oil_flat",
    display_name="Oil Flat",
    description="Flat oil brush. Parallel bristle marks, sharp edges. Good for blocking in shapes and bold strokes.",
    bristle_count=8,
    bristle_spread=0.5,
    bristle_opacity=0.2,
    bristle_width_ratio=0.25,
    main_opacity=0.8,
    base_width=12.0,
    taper=0.3,
    pressure_response=0.3,
    smoothing=0.4,
)

BRUSH_OIL_FILBERT = BrushPreset(
    name="oil_filbert",
    display_name="Oil Filbert",
    description="Rounded flat brush. Organic flowing strokes. Good for foliage, clouds, organic shapes.",
    bristle_count=6,
    bristle_spread=0.6,
    bristle_opacity=0.22,
    bristle_width_ratio=0.3,
    main_opacity=0.78,
    base_width=10.0,
    taper=0.6,
    pressure_response=0.4,
    smoothing=0.7,
)

BRUSH_WATERCOLOR = BrushPreset(
    name="watercolor",
    display_name="Watercolor",
    description="Wet watercolor brush. Very translucent with soft edges. Colors pool at stroke ends.",
    bristle_count=0,
    main_opacity=0.35,
    base_width=14.0,
    taper=0.5,
    pressure_response=0.6,
    edge_noise=0.15,
    wet_edges=0.4,
    smoothing=0.8,
)

BRUSH_DRY_BRUSH = BrushPreset(
    name="dry_brush",
    display_name="Dry Brush",
    description="Dry brush technique. Scratchy, broken strokes with visible gaps. Good for texture and grass.",
    bristle_count=12,
    bristle_spread=1.0,
    bristle_opacity=0.5,
    bristle_width_ratio=0.2,
    main_opacity=0.3,
    base_width=10.0,
    taper=0.4,
    pressure_response=0.7,
    smoothing=0.3,
)

BRUSH_PALETTE_KNIFE = BrushPreset(
    name="palette_knife",
    display_name="Palette Knife",
    description="Thick paint application. Sharp edges, heavy texture. Good for impasto effects and bold marks.",
    bristle_count=0,
    main_opacity=0.95,
    base_width=16.0,
    taper=0.1,
    pressure_response=0.8,
    edge_noise=0.05,
    smoothing=0.2,
)

BRUSH_INK = BrushPreset(
    name="ink",
    display_name="Ink Brush",
    description="Asian-style ink brush. Highly pressure-sensitive with elegant taper. Good for calligraphy and expressive lines.",
    bristle_count=0,
    main_opacity=0.9,
    base_width=6.0,
    taper=0.9,
    pressure_response=0.9,
    smoothing=0.7,
)

BRUSH_PENCIL = BrushPreset(
    name="pencil",
    display_name="Pencil",
    description="Graphite pencil. Thin, consistent lines. Good for sketching and outlines.",
    bristle_count=0,
    main_opacity=0.85,
    base_width=2.0,
    taper=0.2,
    pressure_response=0.4,
    smoothing=0.3,
)

BRUSH_CHARCOAL = BrushPreset(
    name="charcoal",
    display_name="Charcoal",
    description="Soft charcoal. Smudgy edges with slight texture. Good for loose sketching and value studies.",
    bristle_count=3,
    bristle_spread=0.4,
    bristle_opacity=0.3,
    bristle_width_ratio=0.5,
    main_opacity=0.6,
    base_width=5.0,
    taper=0.4,
    pressure_response=0.5,
    edge_noise=0.1,
    smoothing=0.5,
)

BRUSH_MARKER = BrushPreset(
    name="marker",
    display_name="Marker",
    description="Flat marker. Solid color with slight edge bleed. Good for fills and graphic illustration.",
    bristle_count=0,
    main_opacity=0.75,
    base_width=8.0,
    taper=0.15,
    pressure_response=0.1,
    wet_edges=0.2,
    smoothing=0.4,
)

BRUSH_AIRBRUSH = BrushPreset(
    name="airbrush",
    display_name="Airbrush",
    description="Soft airbrush. Very smooth gradients with no hard edges. Good for shading and backgrounds.",
    bristle_count=0,
    main_opacity=0.25,
    base_width=20.0,
    taper=0.0,
    pressure_response=0.3,
    smoothing=0.9,
)

BRUSH_SPLATTER = BrushPreset(
    name="splatter",
    display_name="Splatter",
    description="Paint splatter effect. Random dots around the stroke path. Good for texture and effects.",
    bristle_count=20,
    bristle_spread=2.0,
    bristle_opacity=0.6,
    bristle_width_ratio=0.15,
    main_opacity=0.5,
    base_width=8.0,
    taper=0.3,
    pressure_response=0.2,
    edge_noise=0.3,
    smoothing=0.5,
)

# Registry of all brush presets
BRUSH_PRESETS: dict[str, BrushPreset] = {
    "oil_round": BRUSH_OIL_ROUND,
    "oil_flat": BRUSH_OIL_FLAT,
    "oil_filbert": BRUSH_OIL_FILBERT,
    "watercolor": BRUSH_WATERCOLOR,
    "dry_brush": BRUSH_DRY_BRUSH,
    "palette_knife": BRUSH_PALETTE_KNIFE,
    "ink": BRUSH_INK,
    "pencil": BRUSH_PENCIL,
    "charcoal": BRUSH_CHARCOAL,
    "marker": BRUSH_MARKER,
    "airbrush": BRUSH_AIRBRUSH,
    "splatter": BRUSH_SPLATTER,
}

# Default brush for paint mode
DEFAULT_BRUSH = "oil_round"


def get_brush_preset(name: str) -> BrushPreset | None:
    """Get a brush preset by name."""
    return BRUSH_PRESETS.get(name)


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

    # Brush preset (paint mode only)
    brush: str | None = None  # Brush preset name (e.g., "oil_round", "watercolor")

    def get_brush_preset(self) -> BrushPreset | None:
        """Get the brush preset for this path, if any."""
        if self.brush:
            return get_brush_preset(self.brush)
        return None

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
