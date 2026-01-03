"""Agent orchestrator - manages the agent loop and callbacks."""

import asyncio
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from drawing_agent.agent import AgentCallbacks, CodeExecutionResult
from drawing_agent.config import settings
from drawing_agent.executor import execute_paths
from drawing_agent.state import state_manager
from drawing_agent.types import (
    AgentPathsEvent,
    AgentStatus,
    AgentTurnComplete,
    CodeExecutionMessage,
    ErrorMessage,
    IterationMessage,
    PieceCompleteMessage,
    StatusMessage,
    ThinkingDeltaMessage,
    ThinkingMessage,
)

if TYPE_CHECKING:
    from drawing_agent.agent import DrawingAgent

logger = logging.getLogger(__name__)


class Broadcaster(Protocol):
    """Protocol for broadcasting messages to clients."""

    async def broadcast(self, message: Any) -> None:
        """Broadcast a message to all connected clients."""
        ...

    @property
    def active_connections(self) -> list[Any]:
        """List of active connections."""
        ...


@dataclass
class AgentOrchestrator:
    """Orchestrates agent turns and manages the agent loop."""

    agent: "DrawingAgent"
    broadcaster: Broadcaster

    async def broadcast_status(self, status: AgentStatus) -> None:
        """Broadcast a status update to all clients."""
        await self.broadcaster.broadcast(StatusMessage(status=status))

    def create_callbacks(self) -> AgentCallbacks:
        """Create callbacks for agent events."""
        return AgentCallbacks(
            on_thinking=self._handle_thinking,
            on_iteration_start=self._handle_iteration_start,
            on_code_start=self._handle_code_start,
            on_code_result=self._handle_code_result,
            on_error=self._handle_error,
        )

    async def _handle_thinking(self, text: str, iteration: int) -> None:
        """Handle streaming thinking updates (delta only)."""
        if text:
            logger.debug(f"Streaming thinking delta: {len(text)} chars")
            await self.broadcaster.broadcast(
                ThinkingDeltaMessage(text=text, iteration=iteration)
            )

    async def _handle_iteration_start(self, current: int, max_iter: int) -> None:
        """Handle when a new iteration starts."""
        logger.info(f"Iteration {current}/{max_iter}")
        await self.broadcaster.broadcast(
            IterationMessage(current=current, max=max_iter)
        )

    async def _handle_code_start(self, iteration: int) -> None:
        """Handle when code execution starts."""
        logger.info(f"Code execution started (iteration {iteration})")
        await self.broadcast_status(AgentStatus.EXECUTING)
        await self.broadcaster.broadcast(
            CodeExecutionMessage(status="started", iteration=iteration)
        )

    async def _handle_code_result(self, result: CodeExecutionResult) -> None:
        """Handle when code execution completes."""
        logger.info(f"Code execution completed (iteration {result.iteration})")
        max_stdout = settings.max_stdout_chars
        max_stderr = settings.max_stderr_chars
        await self.broadcaster.broadcast(
            CodeExecutionMessage(
                status="completed",
                stdout=result.stdout[:max_stdout] if result.stdout else None,
                stderr=result.stderr[:max_stderr] if result.stderr else None,
                return_code=result.return_code,
                iteration=result.iteration,
            )
        )

    async def _handle_error(self, message: str, details: str | None) -> None:
        """Handle agent errors."""
        logger.error(f"Agent error: {message}")
        await self.broadcast_status(AgentStatus.ERROR)
        await self.broadcaster.broadcast(ErrorMessage(message=message, details=details))

    async def run_turn(self) -> bool:
        """Run a single agent turn.

        Returns True if a piece was completed, False otherwise.
        """
        callbacks = self.create_callbacks()

        # Broadcast THINKING status at start of turn
        await self.broadcast_status(AgentStatus.THINKING)

        async def send_message(msg: Any) -> None:
            await self.broadcaster.broadcast(msg)

        done = False

        # Consume streaming events from agent
        async for event in self.agent.run_turn(callbacks=callbacks):
            if isinstance(event, AgentPathsEvent):
                # Draw paths immediately as they're produced
                logger.info(f"Received {len(event.paths)} paths - drawing now")
                await self.broadcast_status(AgentStatus.DRAWING)

                async for _ in execute_paths(event.paths, send_message):
                    pass

                # Back to thinking (agent may produce more paths)
                await self.broadcast_status(AgentStatus.THINKING)

            elif isinstance(event, AgentTurnComplete):
                done = event.done
                logger.info(f"Turn complete. Piece done: {done}")
                # Send complete thinking text as a final message
                if event.thinking:
                    await self.broadcaster.broadcast(
                        ThinkingMessage(text=event.thinking)
                    )

        # Always broadcast IDLE after turn completes
        await self.broadcast_status(AgentStatus.IDLE)

        if done:
            piece_num = state_manager.piece_count
            logger.info(f"Piece {piece_num} complete")
            await self.broadcaster.broadcast(
                PieceCompleteMessage(piece_number=piece_num)
            )

        return done

    async def run_loop(self) -> None:
        """Main agent loop that runs continuously."""
        while True:
            try:
                # Only run when clients are connected (cost control)
                if not self.broadcaster.active_connections:
                    await asyncio.sleep(settings.agent_interval)
                    continue

                if self.agent.paused:
                    await asyncio.sleep(settings.agent_interval)
                    continue

                await self.run_turn()
                await asyncio.sleep(settings.agent_interval)

            except Exception as e:
                logger.error(f"Agent loop error: {e}")
                await self.broadcaster.broadcast(ErrorMessage(message=str(e)))
                await self.broadcast_status(AgentStatus.IDLE)
                await asyncio.sleep(settings.agent_interval)
