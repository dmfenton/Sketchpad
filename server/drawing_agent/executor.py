"""Path execution with real-time updates.

This module handles the async execution of paths, sending pen position
updates at the configured frame rate. The pure interpolation logic is
in the interpolation module.
"""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import TYPE_CHECKING, Any

from drawing_agent.config import settings
from drawing_agent.interpolation import interpolate_path
from drawing_agent.types import (
    AgentStatus,
    Path,
    PenMessage,
    StrokeCompleteMessage,
)

if TYPE_CHECKING:
    from drawing_agent.workspace_state import WorkspaceState


async def execute_paths(
    paths: list[Path],
    send_message: Callable[[Any], Awaitable[None]],
    state: "WorkspaceState",
    fps: int | None = None,
    stroke_delay: float | None = None,
) -> AsyncGenerator[None, None]:
    """Execute paths with real-time pen position updates.

    Args:
        paths: List of paths to draw
        send_message: Callback to send messages to clients
        state: Workspace state for the user
        fps: Frames per second for updates (default: from settings)
        stroke_delay: Pause between strokes in seconds (default: from settings)

    Yields after each path is complete to allow for cooperative multitasking.
    """
    fps = fps or settings.drawing_fps
    stroke_delay = stroke_delay if stroke_delay is not None else settings.stroke_delay
    frame_delay = 1.0 / fps

    state.status = AgentStatus.DRAWING
    await state.save()

    for path_idx, path in enumerate(paths):
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
        await state.add_stroke(path)
        await send_message(StrokeCompleteMessage(path=path))

        # Pause between strokes for deliberate pacing
        if stroke_delay > 0 and path_idx < len(paths) - 1:
            await asyncio.sleep(stroke_delay)

        yield  # Allow other tasks to run

    # Execution complete
    state.status = AgentStatus.IDLE
    await state.save()
