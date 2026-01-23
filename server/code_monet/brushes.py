"""Brush expansion logic for paint-like stroke rendering.

This module takes a single Path with a brush preset and expands it into
multiple paths that create realistic paint effects like bristle texture,
opacity variation, and edge effects.
"""

import logging
import math
import random

from .types import (
    BRUSH_PRESETS,
    BrushPreset,
    Path,
    PathType,
    Point,
    clamp_value,
)

logger = logging.getLogger(__name__)

# Constants for brush expansion algorithms
EDGE_NOISE_SCALE = 0.3  # Scale factor for edge noise displacement
BRISTLE_OPACITY_VARIANCE = (0.8, 1.2)  # Min/max opacity variation for bristles
BRISTLE_OFFSET_RANDOMNESS = 0.1  # Randomness factor for bristle offsets
STROKE_WIDTH_MIN = 0.5
STROKE_WIDTH_MAX = 30.0


def _clamp_stroke_width(value: float) -> float:
    return clamp_value(value, STROKE_WIDTH_MIN, STROKE_WIDTH_MAX)


def _clamp_points(
    points: list[Point],
    canvas_width: float | None,
    canvas_height: float | None,
) -> list[Point]:
    if canvas_width is None or canvas_height is None or not points:
        return points
    max_x = float(canvas_width)
    max_y = float(canvas_height)
    clamped: list[Point] = []
    changed = False
    for point in points:
        x = clamp_value(point.x, 0.0, max_x)
        y = clamp_value(point.y, 0.0, max_y)
        if x != point.x or y != point.y:
            changed = True
        clamped.append(Point(x=x, y=y))
    return clamped if changed else points


def expand_brush_stroke(
    path: Path,
    preset: BrushPreset | None = None,
    canvas_width: float | None = None,
    canvas_height: float | None = None,
) -> list[Path]:
    """Expand a single path into multiple paths based on brush preset.

    Args:
        path: The original path to expand
        preset: Brush preset to use (or None for default)

    Returns:
        List of paths that together create the brush effect.
        The first path is always the main stroke, followed by bristle strokes.
    """
    if preset is None:
        # Try to get preset from path
        preset = path.get_brush_preset()
        if preset is None:
            # No brush preset specified - return path unchanged
            # (don't apply default brush unless explicitly requested)
            return [path]

    # Get points from path
    points = _get_path_points(path)
    if len(points) < 2:
        # SVG paths or paths with insufficient points can't be expanded
        if path.brush and path.type == PathType.SVG:
            logger.warning(
                f"Brush '{path.brush}' ignored for SVG path - "
                "brush expansion only supports point-based paths"
            )
        return [path]

    # Determine effective stroke width
    base_width = path.stroke_width if path.stroke_width else preset.base_width
    base_width = _clamp_stroke_width(base_width)

    # Calculate velocity-based width variation if pressure_response > 0
    widths = _calculate_velocity_widths(points, base_width, preset.pressure_response)
    widths = [_clamp_stroke_width(width) for width in widths]

    # Apply edge noise if configured
    if preset.edge_noise > 0:
        points = _apply_edge_noise(points, preset.edge_noise, base_width)
    points = _clamp_points(points, canvas_width, canvas_height)

    result_paths: list[Path] = []

    # Create main stroke
    main_path = _create_stroke_path(
        points=points,
        widths=widths,
        color=path.color,
        opacity=_calculate_main_opacity(preset, path.opacity),
        brush=path.brush,
        author=path.author,
    )
    result_paths.append(main_path)

    # Create bristle strokes if configured
    if preset.bristle_count > 0:
        bristle_paths = _create_bristle_strokes(
            points=points,
            widths=widths,
            preset=preset,
            color=path.color,
            author=path.author,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )
        result_paths.extend(bristle_paths)

    return result_paths


def _get_path_points(path: Path) -> list[Point]:
    """Extract points from a path."""
    if path.points:
        return path.points
    # For SVG paths, we'd need to parse them - for now, return empty
    # This could be enhanced to parse SVG d-strings
    return []


def _calculate_velocity_widths(
    points: list[Point],
    base_width: float,
    pressure_response: float,
) -> list[float]:
    """Calculate stroke width at each point based on velocity.

    Slower movement = wider stroke (more paint deposited).
    Faster movement = thinner stroke (paint spread thin).

    Args:
        points: Path points
        base_width: Base stroke width
        pressure_response: 0-1, how much velocity affects width

    Returns:
        List of widths, one per point
    """
    if len(points) <= 1 or pressure_response == 0:
        return [base_width] * len(points)

    # Calculate distances between consecutive points
    distances: list[float] = []
    for i in range(1, len(points)):
        dx = points[i].x - points[i - 1].x
        dy = points[i].y - points[i - 1].y
        distances.append(math.sqrt(dx * dx + dy * dy))

    if not distances:
        return [base_width] * len(points)

    # Normalize distances
    max_dist = max(distances) if distances else 1.0
    if max_dist == 0:
        max_dist = 1.0

    # Width range based on pressure_response
    min_ratio = 1.0 - 0.5 * pressure_response  # e.g., 0.5 at full response
    max_ratio = 1.0 + 0.3 * pressure_response  # e.g., 1.3 at full response

    # Calculate widths - slower = wider, faster = thinner
    widths: list[float] = [base_width * max_ratio]  # Start thick
    for dist in distances:
        normalized_velocity = dist / max_dist
        # Invert: high velocity = thin, low velocity = thick
        width_ratio = max_ratio - normalized_velocity * (max_ratio - min_ratio)
        widths.append(base_width * width_ratio)

    return widths


def _apply_edge_noise(
    points: list[Point],
    noise_amount: float,
    stroke_width: float,
) -> list[Point]:
    """Apply random displacement to points for rough edges.

    Args:
        points: Original points
        noise_amount: 0-1, intensity of noise
        stroke_width: Used to scale noise magnitude

    Returns:
        Points with noise applied
    """
    if noise_amount == 0:
        return points

    # Scale noise by stroke width and noise_amount
    max_displacement = stroke_width * noise_amount * EDGE_NOISE_SCALE

    noisy_points: list[Point] = []
    for i, point in enumerate(points):
        # Don't displace start/end points as much
        edge_factor = 1.0
        if i == 0 or i == len(points) - 1:
            edge_factor = 0.3
        elif i == 1 or i == len(points) - 2:
            edge_factor = 0.6

        dx = random.uniform(-max_displacement, max_displacement) * edge_factor
        dy = random.uniform(-max_displacement, max_displacement) * edge_factor

        noisy_points.append(Point(x=point.x + dx, y=point.y + dy))

    return noisy_points


def _calculate_main_opacity(preset: BrushPreset, path_opacity: float | None) -> float:
    """Calculate opacity for main stroke."""
    base_opacity = path_opacity if path_opacity is not None else 1.0
    return base_opacity * preset.main_opacity


def _create_stroke_path(
    points: list[Point],
    widths: list[float],
    color: str | None,
    opacity: float,
    brush: str | None,
    author: str,
) -> Path:
    """Create a single stroke path with width variation.

    For now, we store the average width since SVG strokes don't support
    variable width directly. The client will render using the taper
    functions in strokeSmoothing.ts based on the brush preset.

    Args:
        points: Stroke points
        widths: Width at each point
        color: Stroke color
        opacity: Stroke opacity
        brush: Brush preset name
        author: Path author

    Returns:
        Path object
    """
    # Calculate average width (client will handle actual tapering)
    avg_width = sum(widths) / len(widths) if widths else 8.0
    avg_width = _clamp_stroke_width(avg_width)

    return Path(
        type=PathType.POLYLINE,
        points=points,
        color=color,
        stroke_width=avg_width,
        opacity=opacity,
        brush=brush,
        author=author,  # type: ignore[arg-type]
    )


def _create_bristle_strokes(
    points: list[Point],
    widths: list[float],
    preset: BrushPreset,
    color: str | None,
    author: str,
    canvas_width: float | None = None,
    canvas_height: float | None = None,
) -> list[Path]:
    """Create bristle sub-strokes offset from the main path.

    Args:
        points: Main stroke points
        widths: Width at each point
        preset: Brush preset
        color: Stroke color
        author: Path author

    Returns:
        List of bristle paths
    """
    if preset.bristle_count <= 0 or len(points) < 2:
        return []

    bristle_paths: list[Path] = []
    avg_width = sum(widths) / len(widths) if widths else preset.base_width
    avg_width = _clamp_stroke_width(avg_width)

    # Calculate bristle offsets
    # Distribute bristles across the stroke width
    total_spread = avg_width * preset.bristle_spread
    bristle_width = _clamp_stroke_width(avg_width * preset.bristle_width_ratio)

    for i in range(preset.bristle_count):
        # Calculate offset position for this bristle
        # Distribute evenly with slight randomness (-0.5 to 0.5)
        offset_ratio = 0.0 if preset.bristle_count == 1 else (i / (preset.bristle_count - 1)) - 0.5

        base_offset = offset_ratio * total_spread

        # Add slight randomness to offset
        random_offset = (
            random.uniform(-BRISTLE_OFFSET_RANDOMNESS, BRISTLE_OFFSET_RANDOMNESS) * total_spread
        )

        offset = base_offset + random_offset

        # Create offset points for this bristle
        bristle_points = _offset_path(points, offset)
        bristle_points = _clamp_points(bristle_points, canvas_width, canvas_height)

        # Vary opacity slightly per bristle
        opacity_variation = random.uniform(*BRISTLE_OPACITY_VARIANCE)
        bristle_opacity = min(1.0, preset.bristle_opacity * opacity_variation)

        bristle_path = Path(
            type=PathType.POLYLINE,
            points=bristle_points,
            color=color,
            stroke_width=bristle_width,
            opacity=bristle_opacity,
            brush=preset.name,  # Keep brush reference for client
            author=author,  # type: ignore[arg-type]
        )
        bristle_paths.append(bristle_path)

    return bristle_paths


def _offset_path(points: list[Point], offset: float) -> list[Point]:
    """Offset a path perpendicular to its direction.

    Args:
        points: Original path points
        offset: Perpendicular offset distance (positive = left, negative = right)

    Returns:
        Offset path points
    """
    if len(points) < 2 or offset == 0:
        return points

    offset_points: list[Point] = []

    for i, point in enumerate(points):
        # Calculate perpendicular direction at this point
        if i == 0:
            # Use direction to next point
            dx = points[1].x - point.x
            dy = points[1].y - point.y
        elif i == len(points) - 1:
            # Use direction from previous point
            dx = point.x - points[i - 1].x
            dy = point.y - points[i - 1].y
        else:
            # Average of directions (smoother)
            dx = points[i + 1].x - points[i - 1].x
            dy = points[i + 1].y - points[i - 1].y

        # Normalize and get perpendicular
        length = math.sqrt(dx * dx + dy * dy)
        if length == 0:
            length = 1.0

        # Perpendicular is (-dy, dx) normalized
        perp_x = -dy / length
        perp_y = dx / length

        # Apply offset
        offset_points.append(
            Point(
                x=point.x + perp_x * offset,
                y=point.y + perp_y * offset,
            )
        )

    return offset_points


def get_brush_names() -> list[str]:
    """Get list of all available brush preset names."""
    return list(BRUSH_PRESETS.keys())


def get_brush_descriptions() -> str:
    """Get formatted descriptions of all brushes for agent prompt."""
    lines = ["Available brushes:"]
    for name, preset in BRUSH_PRESETS.items():
        lines.append(f"  - {name}: {preset.description}")
    return "\n".join(lines)
