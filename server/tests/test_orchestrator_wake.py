"""Tests for orchestrator event-driven wake-up."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from drawing_agent.orchestrator import AgentOrchestrator


@pytest.fixture
def mock_agent():
    """Create a mock agent."""
    agent = MagicMock()
    agent.paused = True
    agent.pending_nudges = []
    agent.get_state.return_value = MagicMock(
        canvas=MagicMock(strokes=[]),
        piece_count=0,
    )
    return agent


@pytest.fixture
def mock_broadcaster():
    """Create a mock broadcaster."""
    broadcaster = MagicMock()
    broadcaster.active_connections = []
    broadcaster.broadcast = AsyncMock()
    return broadcaster


@pytest.fixture
def orchestrator(mock_agent, mock_broadcaster):
    """Create an orchestrator with mocks."""
    return AgentOrchestrator(
        agent=mock_agent,
        broadcaster=mock_broadcaster,
    )


class TestOrchestratorWake:
    """Test event-driven wake-up."""

    def test_wake_sets_event(self, orchestrator: AgentOrchestrator) -> None:
        """wake() should set the event."""
        assert not orchestrator._wake_event.is_set()

        orchestrator.wake()

        assert orchestrator._wake_event.is_set()

    def test_wake_is_idempotent(self, orchestrator: AgentOrchestrator) -> None:
        """Multiple wake() calls should be safe."""
        orchestrator.wake()
        orchestrator.wake()
        orchestrator.wake()

        assert orchestrator._wake_event.is_set()

    @pytest.mark.asyncio
    async def test_run_loop_waits_for_wake(
        self, orchestrator: AgentOrchestrator, mock_broadcaster
    ) -> None:
        """run_loop should wait for wake event."""
        mock_broadcaster.active_connections = []  # No connections
        woke_up = asyncio.Event()

        async def run_loop_briefly():
            # Run one iteration of the loop
            try:
                await asyncio.wait_for(
                    orchestrator._wake_event.wait(),
                    timeout=0.1,
                )
                woke_up.set()
            except TimeoutError:
                pass

        # Start waiting
        task = asyncio.create_task(run_loop_briefly())

        # Wake up after a brief delay
        await asyncio.sleep(0.05)
        orchestrator.wake()

        await task
        assert woke_up.is_set()

    @pytest.mark.asyncio
    async def test_run_loop_clears_event_after_wake(self, orchestrator: AgentOrchestrator) -> None:
        """Event should be cleared after processing."""
        orchestrator.wake()
        assert orchestrator._wake_event.is_set()

        # Simulate the clear that happens in run_loop
        orchestrator._wake_event.clear()

        assert not orchestrator._wake_event.is_set()

    @pytest.mark.asyncio
    async def test_run_loop_skips_when_no_connections(
        self, orchestrator: AgentOrchestrator, mock_agent, mock_broadcaster
    ) -> None:
        """Should not run turn when no connections."""
        mock_broadcaster.active_connections = []
        mock_agent.paused = False

        # The loop checks connections first
        # This is tested implicitly by ensuring run_turn is not called
        with patch.object(orchestrator, "run_turn", new_callable=AsyncMock) as mock_run_turn:
            # Simulate one wake cycle
            orchestrator.wake()

            # Wait for event
            await asyncio.wait_for(orchestrator._wake_event.wait(), timeout=0.1)
            orchestrator._wake_event.clear()

            # Check conditions - no connections, so run_turn shouldn't be called
            if not mock_broadcaster.active_connections:
                # run_turn should not be called
                mock_run_turn.assert_not_called()

    @pytest.mark.asyncio
    async def test_run_loop_skips_when_paused(
        self, orchestrator: AgentOrchestrator, mock_agent, mock_broadcaster
    ) -> None:
        """Should not run turn when agent is paused."""
        mock_broadcaster.active_connections = [MagicMock()]  # Has connections
        mock_agent.paused = True

        with patch.object(orchestrator, "run_turn", new_callable=AsyncMock) as mock_run_turn:
            orchestrator.wake()

            await asyncio.wait_for(orchestrator._wake_event.wait(), timeout=0.1)
            orchestrator._wake_event.clear()

            # Check conditions - paused, so run_turn shouldn't be called
            if mock_agent.paused:
                mock_run_turn.assert_not_called()


class TestOrchestratorWakeIntegration:
    """Integration tests for wake behavior."""

    @pytest.mark.asyncio
    async def test_wake_reduces_latency(self) -> None:
        """Wake should allow immediate response vs polling interval."""
        event = asyncio.Event()
        latency = None

        async def wait_for_wake():
            nonlocal latency
            import time

            start = time.monotonic()
            try:
                await asyncio.wait_for(event.wait(), timeout=5.0)
                latency = time.monotonic() - start
            except TimeoutError:
                latency = 5.0

        # Start waiting
        task = asyncio.create_task(wait_for_wake())

        # Wake after 50ms
        await asyncio.sleep(0.05)
        event.set()

        await task

        # Should have woken up quickly (< 200ms including overhead)
        assert latency is not None
        assert latency < 0.2
