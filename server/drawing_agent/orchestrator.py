"""Agent orchestrator - manages the agent loop and callbacks."""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

from drawing_agent.agent import AgentCallbacks, CodeExecutionResult, ToolCallInfo
from drawing_agent.agent_logger import AgentFileLogger
from drawing_agent.config import settings
from drawing_agent.executor import execute_paths
from drawing_agent.types import (
    AgentStatus,
    AgentTurnComplete,
    CodeExecutionMessage,
    ErrorMessage,
    IterationMessage,
    Path,
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
    """Orchestrates agent turns and manages the agent loop.

    Drawing is handled by the agent's PostToolUse hook, which calls
    the _draw_paths method on this orchestrator.
    """

    agent: "DrawingAgent"
    broadcaster: Broadcaster
    file_logger: AgentFileLogger | None = field(default=None)

    def __post_init__(self) -> None:
        # Set up the agent's draw callback to use our _draw_paths method
        self.agent.set_on_draw(self._draw_paths)

    async def _draw_paths(self, paths: list[Path]) -> None:
        """Draw paths - called by agent's PostToolUse hook.

        This blocks until all paths are drawn, which pauses Claude
        until drawing is complete.
        """
        if not paths:
            logger.debug("_draw_paths called with empty paths list")
            return

        logger.info(f">>> Drawing {len(paths)} paths")
        if self.file_logger:
            await self.file_logger.log_drawing(len(paths))
        await self.broadcast_status(AgentStatus.DRAWING)

        async def send_message(msg: Any) -> None:
            await self.broadcaster.broadcast(msg)

        state = self.agent.get_state()
        async for _ in execute_paths(paths, send_message, state=state):
            pass

        # Back to thinking after drawing
        await self.broadcast_status(AgentStatus.THINKING)

    async def broadcast_status(self, status: AgentStatus) -> None:
        """Broadcast a status update to all clients."""
        if self.file_logger:
            await self.file_logger.log_status_change(status.value)
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
            # Note: We log complete thinking in run_turn, not deltas
            await self.broadcaster.broadcast(ThinkingDeltaMessage(text=text, iteration=iteration))

    async def _handle_iteration_start(self, current: int, max_iter: int) -> None:
        """Handle when a new iteration starts."""
        logger.info(f"Iteration {current}/{max_iter}")
        if self.file_logger:
            await self.file_logger.log_iteration_start(current, max_iter)
        await self.broadcaster.broadcast(IterationMessage(current=current, max=max_iter))

    async def _handle_code_start(self, tool_info: ToolCallInfo) -> None:
        """Handle when code execution starts."""
        logger.info(f"Tool call started: {tool_info.name} (iteration {tool_info.iteration})")
        if self.file_logger:
            await self.file_logger.log_code_start(tool_info.iteration)
        await self.broadcast_status(AgentStatus.EXECUTING)
        await self.broadcaster.broadcast(
            CodeExecutionMessage(
                status="started",
                tool_name=tool_info.name,
                tool_input=tool_info.input,
                iteration=tool_info.iteration,
            )
        )

    async def _handle_code_result(self, result: CodeExecutionResult) -> None:
        """Handle when code execution completes."""
        logger.info(f"Code execution completed (iteration {result.iteration})")
        if self.file_logger:
            await self.file_logger.log_code_result(
                iteration=result.iteration,
                stdout=result.stdout,
                stderr=result.stderr,
                return_code=result.return_code,
            )
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
        if self.file_logger:
            await self.file_logger.log_error(message, details)
        await self.broadcast_status(AgentStatus.ERROR)
        await self.broadcaster.broadcast(ErrorMessage(message=message, details=details))

    async def run_turn(self) -> bool:
        """Run a single agent turn.

        Returns True if a piece was completed, False otherwise.
        """
        logger.info("=== Starting agent turn ===")
        callbacks = self.create_callbacks()
        state = self.agent.get_state()

        # Log turn start
        if self.file_logger:
            await self.file_logger.log_turn_start(
                piece_number=state.piece_count + 1,
                stroke_count=len(state.canvas.strokes),
            )
            # Log any pending nudges
            if self.agent.pending_nudges:
                await self.file_logger.log_nudge(self.agent.pending_nudges.copy())

        # Broadcast THINKING status at start of turn
        await self.broadcast_status(AgentStatus.THINKING)

        done = False
        thinking_text = ""

        # Consume events from agent - drawing happens in PostToolUse hook
        async for event in self.agent.run_turn(callbacks=callbacks):
            if isinstance(event, AgentTurnComplete):
                done = event.done
                thinking_text = event.thinking or ""
                logger.info(f"Turn complete. Piece done: {done}")
                # Send complete thinking text as a final message
                if event.thinking:
                    await self.broadcaster.broadcast(ThinkingMessage(text=event.thinking))

        # Log turn end with thinking
        if self.file_logger:
            if thinking_text:
                await self.file_logger.log_thinking(thinking_text, iteration=1)
            await self.file_logger.log_turn_end(
                piece_done=done,
                thinking_chars=len(thinking_text),
            )

        # Always broadcast IDLE after turn completes
        await self.broadcast_status(AgentStatus.IDLE)

        if done:
            piece_num = self.agent.get_state().piece_count
            logger.info(f"Piece {piece_num} complete")
            await self.broadcaster.broadcast(PieceCompleteMessage(piece_number=piece_num))

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
                if self.file_logger:
                    await self.file_logger.log_error(f"Agent loop error: {e}")
                await self.broadcaster.broadcast(ErrorMessage(message=str(e)))
                await self.broadcast_status(AgentStatus.IDLE)
                await asyncio.sleep(settings.agent_interval)
