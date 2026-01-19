"""Agent orchestrator - manages the agent loop and callbacks."""

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

from code_monet.agent import AgentCallbacks, CodeExecutionResult, ToolCallInfo
from code_monet.agent_logger import AgentFileLogger
from code_monet.brushes import expand_brush_stroke
from code_monet.config import settings
from code_monet.types import (
    AgentTurnComplete,
    CodeExecutionMessage,
    DrawingStyleType,
    ErrorMessage,
    IterationMessage,
    Path,
    PieceStateMessage,
    AgentStrokesReadyMessage,
    ThinkingDeltaMessage,
)

if TYPE_CHECKING:
    from code_monet.agent import DrawingAgent

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

    # Event-driven wake-up (replaces polling)
    _wake_event: asyncio.Event = field(default_factory=asyncio.Event)

    # Track piece completion - prevents auto-starting new turns
    _piece_completed: bool = field(default=False)

    def __post_init__(self) -> None:
        # Set up the agent's draw callback to use our _draw_paths method
        self.agent.set_on_draw(self._draw_paths)

    def wake(self) -> None:
        """Signal the agent loop to wake up immediately.

        Call this when:
        - A client connects
        - Agent is resumed
        - A nudge is received
        """
        logger.info("[ORCH] wake() called")
        self._wake_event.set()

    async def _draw_paths(self, paths: list[Path]) -> None:
        """Queue paths for client-side rendering and wait for animation.

        Instead of streaming PenMessages at 60fps, we queue the paths
        and notify clients to fetch them. This decouples agent execution
        from rendering and makes the system more resilient.

        After notifying clients, waits for the estimated animation duration
        so the agent doesn't start thinking while drawing is in progress.

        In paint mode, paths with brush presets are expanded into multiple
        sub-paths (bristle strokes) for realistic paint effects.
        """
        if not paths:
            logger.debug("_draw_paths called with empty paths list")
            return

        state = self.agent.get_state()

        # Expand brush strokes in paint mode
        expanded_paths: list[Path] = []
        is_paint_mode = getattr(state.canvas, "drawing_style", None) == DrawingStyleType.PAINT

        for path in paths:
            if is_paint_mode and path.brush:
                # Expand this path into multiple bristle strokes
                brush_paths = expand_brush_stroke(path)
                expanded_paths.extend(brush_paths)
                logger.debug(f"Expanded brush '{path.brush}' into {len(brush_paths)} paths")
            else:
                expanded_paths.append(path)

        logger.info(
            f">>> Queueing {len(expanded_paths)} paths for client rendering "
            f"(from {len(paths)} original, paint_mode={is_paint_mode})"
        )
        if self.file_logger:
            await self.file_logger.log_drawing(len(expanded_paths))

        # Interpolate paths and queue for client fetch
        batch_id, total_points = await state.queue_strokes(expanded_paths)

        # Notify clients that strokes are ready (include piece_number to prevent cross-canvas rendering)
        await self.broadcaster.broadcast(
            AgentStrokesReadyMessage(
                count=len(paths), batch_id=batch_id, piece_number=state.piece_number
            )
        )

        # Wait for client animation to complete
        # Calculate based on client frame rate, with buffer for network latency
        # Cap to prevent very long waits that block agent responsiveness
        animation_time_ms = (
            total_points * (1000 / settings.client_animation_fps)
        ) + settings.animation_wait_buffer_ms
        animation_time_s = min(animation_time_ms / 1000, settings.max_animation_wait_s)
        logger.info(f">>> Waiting {animation_time_s:.2f}s for {total_points} points to animate")
        await asyncio.sleep(animation_time_s)

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
                tool_name=result.tool_name,
                tool_input=result.tool_input,
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
                piece_number=state.piece_number + 1,
                stroke_count=len(state.canvas.strokes),
            )
            # Log any pending nudges
            if self.agent.pending_nudges:
                await self.file_logger.log_nudge(self.agent.pending_nudges.copy())

        done = False
        thinking_text = ""

        # Consume events from agent - drawing happens in PostToolUse hook
        async for event in self.agent.run_turn(callbacks=callbacks):
            if isinstance(event, AgentTurnComplete):
                done = event.done
                thinking_text = event.thinking or ""
                logger.info(f"Turn complete. Piece done: {done}")

        # Log turn end with thinking
        if self.file_logger:
            if thinking_text:
                await self.file_logger.log_thinking(thinking_text, iteration=1)
            await self.file_logger.log_turn_end(
                piece_done=done,
                thinking_chars=len(thinking_text),
            )

        if done:
            state = self.agent.get_state()
            piece_num = state.piece_number
            logger.info(f"Piece {piece_num} complete")

            # Broadcast piece state with completed=True
            await self.broadcaster.broadcast(PieceStateMessage(number=piece_num, completed=True))

            # Save to gallery (keep canvas visible)
            saved_id = await state.save_to_gallery()
            logger.info(f"Saved piece {piece_num} as {saved_id}")

            # Send gallery update
            gallery_entries = await state.list_gallery()
            await self.broadcaster.broadcast(
                {"type": "gallery_update", "canvases": [e.model_dump() for e in gallery_entries]}
            )

            # Mark piece as completed - orchestrator won't auto-start new turns
            self._piece_completed = True

        return done

    def clear_piece_completed(self) -> None:
        """Clear the piece_completed flag to allow new turns.

        Call this when user requests a new canvas or provides a nudge.
        """
        self._piece_completed = False

    async def run_loop(self) -> None:
        """Main agent loop that runs continuously.

        Uses event-driven wake-up instead of polling to reduce latency:
        - Wakes immediately when signaled (client connect, resume, nudge)
        - Falls back to interval timeout for safety
        """
        logger.info("[ORCH] run_loop started")
        while True:
            try:
                # Wait for wake signal or timeout
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(
                        self._wake_event.wait(),
                        timeout=settings.agent_interval,
                    )

                # Clear event for next wait cycle
                self._wake_event.clear()
                logger.debug("[ORCH] woke up")

                # Only run when clients are connected (cost control)
                if not self.broadcaster.active_connections:
                    logger.debug("[ORCH] skip: no active connections")
                    continue

                if self.agent.paused:
                    logger.debug("[ORCH] skip: agent paused")
                    continue

                if self._piece_completed:
                    logger.debug("[ORCH] skip: piece completed, waiting for user action")
                    continue

                logger.info("[ORCH] running turn...")
                await self.run_turn()

            except Exception as e:
                logger.error(f"Agent loop error: {e}")
                if self.file_logger:
                    await self.file_logger.log_error(f"Agent loop error: {e}")
                await self.broadcaster.broadcast(ErrorMessage(message=str(e)))
