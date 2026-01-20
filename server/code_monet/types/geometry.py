"""Core geometry types."""

from enum import Enum
from typing import Any, TypedDict

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
