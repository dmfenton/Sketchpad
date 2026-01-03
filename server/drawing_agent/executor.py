"""Path execution with real-time updates.

This module handles the async execution of paths, sending pen position
updates at the configured frame rate. The pure interpolation logic is
in the interpolation module.
"""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any

from drawing_agent.canvas import add_stroke
from drawing_agent.config import settings
from drawing_agent.interpolation import interpolate_path
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentStatus,
    Path,
    PenMessage,
    StrokeCompleteMessage,
)


async def execute_paths(
    paths: list[Path],
    send_message: Callable[[Any], Awaitable[None]],
    fps: int | None = None,
) -> AsyncGenerator[None, None]:
    """Execute paths with real-time pen position updates.

    Args:
        paths: List of paths to execute
        send_message: Async callback to send messages to clients
        fps: Frames per second for animation (defaults to settings.drawing_fps)

    Yields after each path is complete to allow for cooperative multitasking.
    """
    if fps is None:
        fps = settings.drawing_fps
    frame_delay = 1.0 / fps

    state_manager.status = AgentStatus.DRAWING
    state_manager.save()

    for path in paths:
        # Use config value for interpolation
        interpolated = interpolate_path(path, settings.path_steps_per_unit)

        if not interpolated:
            continue

        # Move to start (pen up)
        first_point = interpolated[0]
        await send_message(PenMessage(x=first_point.x, y=first_point.y, down=False))
        await asyncio.sleep(frame_delay)

        # Lower pen and draw
        await send_message(PenMessage(x=first_point.x, y=first_point.y, down=True))

        last_point = first_point
        for point in interpolated[1:]:
            last_point = point
            await send_message(PenMessage(x=point.x, y=point.y, down=True))
            await asyncio.sleep(frame_delay)

        # Raise pen
        await send_message(PenMessage(x=last_point.x, y=last_point.y, down=False))

        # Mark path complete
        add_stroke(path)
        await send_message(StrokeCompleteMessage(path=path))

        yield  # Allow other tasks to run

    # Execution complete
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
