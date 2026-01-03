"""Path execution with real-time updates.

This module handles the async execution of paths, sending pen position
updates at the configured frame rate. The pure interpolation logic is
in the interpolation module.

Implements plotter-style pen movement where all pen travel is visible,
including pen-up movements between strokes.
"""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any

from drawing_agent.canvas import add_stroke
from drawing_agent.config import settings
from drawing_agent.interpolation import interpolate_line, interpolate_path
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentStatus,
    Path,
    PenMessage,
    Point,
    StrokeCompleteMessage,
    TravelCompleteMessage,
)

# Track pen position across execute_paths calls for continuous plotter behavior
_pen_position: Point | None = None


def get_pen_position() -> Point | None:
    """Get current pen position."""
    return _pen_position


def reset_pen_position() -> None:
    """Reset pen to home position (used on canvas clear)."""
    global _pen_position
    _pen_position = None


async def execute_paths(
    paths: list[Path],
    send_message: Callable[[Any], Awaitable[None]],
    fps: int | None = None,
    stroke_delay: float | None = None,
) -> AsyncGenerator[None, None]:
    """Execute paths with real-time pen position updates.

    Implements plotter-style movement where ALL pen travel is visible:
    - Pen-up travel between strokes is animated (not teleported)
    - Travel paths are sent to frontend for dashed-line visualization

    Args:
        paths: List of paths to draw
        send_message: Callback to send messages to clients
        fps: Frames per second for updates (default: from settings)
        stroke_delay: Pause between strokes in seconds (default: from settings)

    Yields after each path is complete to allow for cooperative multitasking.
    """
    global _pen_position

    fps = fps or settings.drawing_fps
    stroke_delay = stroke_delay if stroke_delay is not None else settings.stroke_delay
    frame_delay = 1.0 / fps

    # Travel speed is faster than drawing (2x)
    travel_frame_delay = frame_delay / 2

    state_manager.status = AgentStatus.DRAWING
    state_manager.save()

    for path_idx, path in enumerate(paths):
        interpolated = interpolate_path(path, settings.path_steps_per_unit)

        if not interpolated:
            continue

        first_point = interpolated[0]

        # Animate pen-up travel from current position to stroke start
        if _pen_position is not None:
            travel_start = _pen_position
            travel_points = interpolate_line(
                [travel_start, first_point],
                max(2, int(settings.path_steps_per_unit * 50)),  # Fewer steps for travel
            )

            # Send pen-up travel animation
            for point in travel_points:
                await send_message(PenMessage(x=point.x, y=point.y, down=False))
                await asyncio.sleep(travel_frame_delay)

            # Notify frontend that travel is complete (for dashed line)
            await send_message(TravelCompleteMessage(start=travel_start, end=first_point))
        else:
            # First stroke - just move to start position
            await send_message(PenMessage(x=first_point.x, y=first_point.y, down=False))
            await asyncio.sleep(frame_delay)

        # Lower pen and draw
        await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))

        last_point = first_point
        for point in interpolated[1:]:
            last_point = point
            await send_message(PenMessage(x=point.x, y=point.y, down=True))
            await asyncio.sleep(frame_delay)

        # Raise pen and update position
        await send_message(PenMessage(x=last_point.x, y=last_point.y, down=False))
        _pen_position = last_point

        # Mark path complete
        add_stroke(path)
        await send_message(StrokeCompleteMessage(path=path))

        # Pause between strokes for deliberate pacing
        if stroke_delay > 0 and path_idx < len(paths) - 1:
            await asyncio.sleep(stroke_delay)

        yield  # Allow other tasks to run

    # Execution complete
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
