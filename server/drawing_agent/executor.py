"""Path execution with interpolation and timing."""

import asyncio
import math
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any

from drawing_agent.canvas import add_stroke
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentStatus,
    Path,
    PathType,
    PenMessage,
    Point,
    StrokeCompleteMessage,
)


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation."""
    return a + (b - a) * t


def lerp_point(p1: Point, p2: Point, t: float) -> Point:
    """Linearly interpolate between two points."""
    return Point(x=lerp(p1.x, p2.x, t), y=lerp(p1.y, p2.y, t))


def quadratic_bezier(p0: Point, p1: Point, p2: Point, t: float) -> Point:
    """Evaluate quadratic bezier at t."""
    one_minus_t = 1 - t
    return Point(
        x=one_minus_t**2 * p0.x + 2 * one_minus_t * t * p1.x + t**2 * p2.x,
        y=one_minus_t**2 * p0.y + 2 * one_minus_t * t * p1.y + t**2 * p2.y,
    )


def cubic_bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: float) -> Point:
    """Evaluate cubic bezier at t."""
    one_minus_t = 1 - t
    return Point(
        x=(
            one_minus_t**3 * p0.x
            + 3 * one_minus_t**2 * t * p1.x
            + 3 * one_minus_t * t**2 * p2.x
            + t**3 * p3.x
        ),
        y=(
            one_minus_t**3 * p0.y
            + 3 * one_minus_t**2 * t * p1.y
            + 3 * one_minus_t * t**2 * p2.y
            + t**3 * p3.y
        ),
    )


def estimate_path_length(path: Path) -> float:
    """Estimate the length of a path for timing calculations."""
    if len(path.points) < 2:
        return 0

    points = path.points
    total = 0.0

    match path.type:
        case PathType.LINE:
            dx = points[1].x - points[0].x
            dy = points[1].y - points[0].y
            total = math.sqrt(dx * dx + dy * dy)

        case PathType.POLYLINE:
            for i in range(len(points) - 1):
                dx = points[i + 1].x - points[i].x
                dy = points[i + 1].y - points[i].y
                total += math.sqrt(dx * dx + dy * dy)

        case PathType.QUADRATIC | PathType.CUBIC:
            # Approximate with linear segments
            steps = 20
            prev = points[0]
            for i in range(1, steps + 1):
                t = i / steps
                if path.type == PathType.QUADRATIC and len(points) >= 3:
                    curr = quadratic_bezier(points[0], points[1], points[2], t)
                elif path.type == PathType.CUBIC and len(points) >= 4:
                    curr = cubic_bezier(points[0], points[1], points[2], points[3], t)
                else:
                    break
                dx = curr.x - prev.x
                dy = curr.y - prev.y
                total += math.sqrt(dx * dx + dy * dy)
                prev = curr

    return total


def interpolate_path(path: Path, steps_per_unit: float = 0.5) -> list[Point]:
    """Interpolate a path into discrete points for drawing."""
    if len(path.points) < 2:
        return list(path.points)

    points = path.points
    length = estimate_path_length(path)
    num_steps = max(2, int(length * steps_per_unit))

    interpolated: list[Point] = []

    match path.type:
        case PathType.LINE:
            for i in range(num_steps + 1):
                t = i / num_steps
                interpolated.append(lerp_point(points[0], points[1], t))

        case PathType.POLYLINE:
            # For polylines, interpolate between each consecutive pair
            for seg_idx in range(len(points) - 1):
                p1, p2 = points[seg_idx], points[seg_idx + 1]
                dx = p2.x - p1.x
                dy = p2.y - p1.y
                seg_length = math.sqrt(dx * dx + dy * dy)
                seg_steps = max(1, int(seg_length * steps_per_unit))

                for i in range(seg_steps + 1):
                    if seg_idx > 0 and i == 0:
                        continue  # Skip duplicate points
                    t = i / seg_steps
                    interpolated.append(lerp_point(p1, p2, t))

        case PathType.QUADRATIC:
            if len(points) >= 3:
                for i in range(num_steps + 1):
                    t = i / num_steps
                    interpolated.append(quadratic_bezier(points[0], points[1], points[2], t))

        case PathType.CUBIC:
            if len(points) >= 4:
                for i in range(num_steps + 1):
                    t = i / num_steps
                    interpolated.append(cubic_bezier(points[0], points[1], points[2], points[3], t))

    return interpolated


async def execute_paths(
    paths: list[Path],
    send_message: Callable[[Any], Awaitable[None]],
    fps: int = 60,
) -> AsyncGenerator[None, None]:
    """Execute paths with real-time pen position updates.

    Yields after each path is complete to allow for cooperative multitasking.
    """
    frame_delay = 1.0 / fps

    # Local execution state (no persistence needed)
    pen_x = 0.0
    pen_y = 0.0

    state_manager.status = AgentStatus.DRAWING
    state_manager.save()

    for path in paths:
        interpolated = interpolate_path(path)

        if not interpolated:
            continue

        # Move to start (pen up)
        first_point = interpolated[0]
        pen_x = first_point.x
        pen_y = first_point.y
        await send_message(PenMessage(x=first_point.x, y=first_point.y, down=False))
        await asyncio.sleep(frame_delay)

        # Lower pen and draw
        await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))

        for point in interpolated[1:]:
            pen_x = point.x
            pen_y = point.y
            await send_message(PenMessage(x=point.x, y=point.y, down=True))
            await asyncio.sleep(frame_delay)

        # Raise pen
        await send_message(PenMessage(x=pen_x, y=pen_y, down=False))

        # Mark path complete
        add_stroke(path)
        await send_message(StrokeCompleteMessage(path=path))

        yield  # Allow other tasks to run

    # Execution complete
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
