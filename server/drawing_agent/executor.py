"""Path execution with real-time updates.

This module handles the async execution of paths, sending pen position
updates at the configured frame rate. The pure interpolation logic is
in the interpolation module.

Pen plotter motion profile:
- Trapezoidal velocity: accelerate, cruise, decelerate
- Pen settling delay after lowering (servo stabilization)
- Smooth diagonal travel between strokes
"""

import asyncio
import math
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import TYPE_CHECKING, Any

from drawing_agent.config import settings
from drawing_agent.interpolation import distance, interpolate_path, lerp_point
from drawing_agent.types import (
    AgentStatus,
    Path,
    PenMessage,
    Point,
    StrokeCompleteMessage,
)

if TYPE_CHECKING:
    from drawing_agent.workspace_state import WorkspaceState


def ease_in_out(t: float) -> float:
    """Attempt at smoothstep easing for slow-fast-slow motion profile."""
    return t * t * (3.0 - 2.0 * t)


def apply_easing(points: list[Point]) -> list[Point]:
    """Resample points with easing for pen plotter motion.

    Takes uniformly spaced points and redistributes them so movement
    starts slow, speeds up in the middle, and slows down at the end.
    """
    if len(points) < 3:
        return points

    n = len(points)
    result: list[Point] = [points[0]]

    for i in range(1, n):
        # Map linear progress to eased progress
        linear_t = i / (n - 1)
        eased_t = ease_in_out(linear_t)

        # Find the two points to interpolate between
        float_idx = eased_t * (n - 1)
        idx_low = int(math.floor(float_idx))
        idx_high = min(idx_low + 1, n - 1)
        frac = float_idx - idx_low

        # Interpolate between adjacent original points
        p = lerp_point(points[idx_low], points[idx_high], frac)
        result.append(p)

    return result


def interpolate_travel(start: Point, end: Point, steps_per_unit: float) -> list[Point]:
    """Interpolate a straight-line travel path between two points.

    Returns points for pen-up travel from start to end (pen plotter behavior).
    """
    dist = distance(start, end)
    if dist < 1.0:
        return [end]  # Skip travel for very short distances

    num_steps = max(2, int(dist * steps_per_unit))
    return [lerp_point(start, end, i / num_steps) for i in range(1, num_steps + 1)]


def _get_next_path_start(
    paths: list[Path], current_idx: int, steps_per_unit: float
) -> Point | None:
    """Get the first point of the next non-empty path, if any."""
    for i in range(current_idx + 1, len(paths)):
        interpolated = interpolate_path(paths[i], steps_per_unit)
        if interpolated:
            return interpolated[0]
    return None


async def execute_paths(
    paths: list[Path],
    send_message: Callable[[Any], Awaitable[None]],
    state: "WorkspaceState",
    fps: int | None = None,
    stroke_delay: float | None = None,
    skip_state_update: bool = False,
) -> AsyncGenerator[None, None]:
    """Execute paths with real-time pen position updates.

    Args:
        paths: List of paths to draw
        send_message: Callback to send messages to clients
        state: Workspace state for the user
        fps: Frames per second for updates (default: from settings)
        stroke_delay: Pause between strokes in seconds (default: from settings)
        skip_state_update: If True, skip adding strokes to state (already added by tool handler)

    Yields after each path is complete to allow for cooperative multitasking.
    """
    fps = fps or settings.drawing_fps
    stroke_delay = stroke_delay if stroke_delay is not None else settings.stroke_delay
    frame_delay = 1.0 / fps
    travel_steps_per_unit = settings.path_steps_per_unit * settings.travel_speed_multiplier
    pen_settle_delay = settings.pen_settle_delay
    pen_lift_threshold = settings.pen_lift_threshold

    state.status = AgentStatus.DRAWING
    await state.save()

    # Track pen position and state for continuous drawing optimization
    pen_position: Point | None = None
    pen_is_down: bool = False

    for path_idx, path in enumerate(paths):
        interpolated = interpolate_path(path, settings.path_steps_per_unit)

        if not interpolated:
            continue

        first_point = interpolated[0]

        # Check if we can continue drawing without lifting (pen already down and close)
        if pen_is_down and pen_position is not None:
            dist_to_start = distance(pen_position, first_point)
            if dist_to_start <= pen_lift_threshold:
                # Pen stays down - draw directly to start if not already there
                if dist_to_start > 0.1:
                    await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))
                    await asyncio.sleep(frame_delay)
            else:
                # Too far - need to lift, travel, and lower
                await send_message(PenMessage(x=pen_position.x, y=pen_position.y, down=False))
                pen_is_down = False
                travel_points = interpolate_travel(pen_position, first_point, travel_steps_per_unit)
                travel_points = apply_easing(travel_points)
                for point in travel_points:
                    await send_message(PenMessage(x=point.x, y=point.y, down=False))
                    await asyncio.sleep(frame_delay)
                await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))
                pen_is_down = True
                if pen_settle_delay > 0:
                    await asyncio.sleep(pen_settle_delay)
        elif pen_position is not None:
            # Pen is up, travel to start
            travel_points = interpolate_travel(pen_position, first_point, travel_steps_per_unit)
            travel_points = apply_easing(travel_points)
            for point in travel_points:
                await send_message(PenMessage(x=point.x, y=point.y, down=False))
                await asyncio.sleep(frame_delay)
            await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))
            pen_is_down = True
            if pen_settle_delay > 0:
                await asyncio.sleep(pen_settle_delay)
        else:
            # First stroke: move to start and lower pen
            await send_message(PenMessage(x=first_point.x, y=first_point.y, down=False))
            await asyncio.sleep(frame_delay)
            await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))
            pen_is_down = True
            if pen_settle_delay > 0:
                await asyncio.sleep(pen_settle_delay)

        # Draw stroke with easing
        eased_points = apply_easing(interpolated)
        for point in eased_points[1:]:
            await send_message(PenMessage(x=point.x, y=point.y, down=True))
            await asyncio.sleep(frame_delay)

        # Track where pen ended
        pen_position = eased_points[-1]

        # Check if next path starts close - if so, keep pen down
        next_start = _get_next_path_start(paths, path_idx, settings.path_steps_per_unit)
        if next_start is not None and distance(pen_position, next_start) <= pen_lift_threshold:
            # Keep pen down for continuous drawing
            pass
        else:
            # Raise pen
            await send_message(PenMessage(x=pen_position.x, y=pen_position.y, down=False))
            pen_is_down = False

        # Mark path complete (skip state update if already done by tool handler)
        if not skip_state_update:
            await state.add_stroke(path)
        await send_message(StrokeCompleteMessage(path=path))

        # Pause between strokes (skip if pen stayed down for continuous drawing)
        if stroke_delay > 0 and path_idx < len(paths) - 1 and not pen_is_down:
            await asyncio.sleep(stroke_delay)

        yield  # Allow other tasks to run

    # Ensure pen is up at the end
    if pen_is_down and pen_position is not None:
        await send_message(PenMessage(x=pen_position.x, y=pen_position.y, down=False))

    # Execution complete
    state.status = AgentStatus.IDLE
    await state.save()
