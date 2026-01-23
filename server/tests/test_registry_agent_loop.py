"""Tests for workspace registry agent loop behavior."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from code_monet.registry import ActiveWorkspace


@pytest.mark.asyncio
async def test_start_agent_loop_restarts_when_done() -> None:
    orchestrator = MagicMock()
    orchestrator.run_loop = AsyncMock()

    workspace = ActiveWorkspace(
        user_id="user-1",
        state=MagicMock(),
        connections=MagicMock(),
        agent=MagicMock(),
        orchestrator=orchestrator,
    )

    await workspace.start_agent_loop()
    first_task = workspace.loop_task
    assert first_task is not None

    await asyncio.sleep(0)
    assert first_task.done()

    await workspace.start_agent_loop()
    assert workspace.loop_task is not None
    assert workspace.loop_task is not first_task
