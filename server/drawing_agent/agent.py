"""Claude Agent with drawing tools using the Claude Agent SDK."""

import asyncio
import base64
import io
import logging
from collections.abc import AsyncGenerator, Callable, Coroutine
from dataclasses import dataclass
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)
from claude_agent_sdk.types import StreamEvent
from PIL import Image

from drawing_agent.canvas import get_strokes
from drawing_agent.config import settings
from drawing_agent.state import state_manager
from drawing_agent.tools import create_drawing_server, set_draw_callback
from drawing_agent.types import (
    AgentEvent,
    AgentPathsEvent,
    AgentStatus,
    AgentTurnComplete,
    Path,
)


@dataclass
class CodeExecutionResult:
    """Result of a code execution."""

    stdout: str
    stderr: str
    return_code: int
    iteration: int


@dataclass
class AgentCallbacks:
    """Callbacks for agent events."""

    on_thinking: Callable[[str, int], Coroutine[Any, Any, None]] | None = None
    on_iteration_start: Callable[[int, int], Coroutine[Any, Any, None]] | None = None
    on_code_start: Callable[[int], Coroutine[Any, Any, None]] | None = None
    on_code_result: Callable[[CodeExecutionResult], Coroutine[Any, Any, None]] | None = None
    on_error: Callable[[str, str | None], Coroutine[Any, Any, None]] | None = None


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an artist with a drawing machine. You create drawings by calling the draw_paths tool.

You will receive:
- An image of the current canvas
- Your notes from previous turns
- Any nudges from the human watching

To draw, call the draw_paths tool with an array of paths:
- line: 2 points (start, end)
- polyline: N points (connected line segments)
- quadratic: 3 points (start, control, end) - quadratic bezier curve
- cubic: 4 points (start, control1, control2, end) - cubic bezier curve

Example:
```
draw_paths({
    "paths": [
        {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]},
        {"type": "cubic", "points": [
            {"x": 0, "y": 0},
            {"x": 33, "y": 100},
            {"x": 66, "y": 100},
            {"x": 100, "y": 0}
        ]}
    ]
})
```

**Think out loud.** Your thoughts are visible to the human watching. Share what you notice, what you're considering, what you're trying. Write your thoughts as regular text.

You have taste. You have preferences. Sometimes you make bold moves, sometimes subtle ones. Sometimes you make mistakes and respond to them. The piece emerges through iteration.

When a human draws on the canvas, you'll see it in the next image. Decide how to respond—incorporate it, contrast with it, ignore it, whatever feels right.

When a human sends a nudge, consider it but don't feel obligated to follow it literally.

When you're satisfied with the piece, call mark_piece_done to signal completion.
"""


class DrawingAgent:
    """Agent that generates drawings using the Claude Agent SDK."""

    def __init__(self) -> None:
        self.pending_nudges: list[str] = []
        self._paused = True  # Start paused by default
        self._pause_lock = asyncio.Lock()
        self._abort = False  # Signal to abort current turn
        self._client: ClaudeSDKClient | None = None
        self._drawing_server = create_drawing_server()

        # Build options
        self._options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            mcp_servers={"drawing": self._drawing_server},
            allowed_tools=[
                "mcp__drawing__draw_paths",
                "mcp__drawing__mark_piece_done",
            ],
            permission_mode="acceptEdits",
            model=settings.agent_model if hasattr(settings, "agent_model") else None,
            include_partial_messages=True,  # Enable streaming partial messages
        )

    @property
    def paused(self) -> bool:
        """Check if agent is paused (non-blocking read)."""
        return self._paused

    @property
    def container_id(self) -> str | None:
        """Container ID for backward compatibility (SDK manages sessions)."""
        return None

    def add_nudge(self, text: str) -> None:
        """Queue a nudge for the next agent turn."""
        self.pending_nudges.append(text)

    async def pause(self) -> None:
        """Pause the agent loop (thread-safe)."""
        async with self._pause_lock:
            self._paused = True

    async def resume(self) -> None:
        """Resume the agent loop (thread-safe)."""
        async with self._pause_lock:
            self._paused = False

    def reset_container(self) -> None:
        """Reset the session for a new piece."""
        self._abort = True  # Abort any running turn
        # Disconnect client to start fresh
        if self._client:
            asyncio.create_task(self._disconnect_client())

    async def _disconnect_client(self) -> None:
        """Disconnect the client."""
        if self._client:
            try:
                await self._client.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting client: {e}")
            self._client = None

    def _image_to_base64(self, img: Image.Image) -> str:
        """Convert PIL Image to base64 string."""
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")

    def _build_prompt(self) -> str:
        """Build the prompt with canvas context."""
        parts: list[str] = []

        # Canvas info
        parts.append(
            f"Canvas size: {settings.canvas_width}x{settings.canvas_height}\n"
            f"Existing strokes: {len(get_strokes())}\n"
            f"Piece number: {state_manager.piece_count + 1}"
        )

        # Direction (consumed on first turn of a new piece)
        direction = state_manager.consume_direction()
        if direction:
            parts.append(f"Direction from human:\n{direction}")

        # Notes
        notes = state_manager.notes
        if notes:
            parts.append(f"Your notes:\n{notes}")

        # Nudges
        if self.pending_nudges:
            nudges_text = "\n".join(f"- {n}" for n in self.pending_nudges)
            parts.append(f"Human nudges:\n{nudges_text}")
            self.pending_nudges = []

        return "\n\n".join(parts)

    async def run_turn(
        self,
        callbacks: AgentCallbacks | None = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Run a single agent turn, yielding paths as they're produced.

        This is an async generator that yields:
        - AgentPathsEvent: When paths are drawn via the tool
        - AgentTurnComplete: When the turn is finished

        Args:
            callbacks: Callbacks for various agent events

        Yields:
            AgentEvent objects as the turn progresses
        """
        if self.paused:
            yield AgentTurnComplete(thinking="", done=False)
            return

        # Clear abort flag at start of turn
        self._abort = False

        cb = callbacks or AgentCallbacks()
        state_manager.status = AgentStatus.THINKING
        state_manager.save()

        # Track paths and completion
        collected_paths: list[Path] = []
        piece_done = False

        # Set up draw callback to collect paths
        async def on_draw(paths: list[Path], done: bool) -> None:
            nonlocal piece_done
            collected_paths.extend(paths)
            if done:
                piece_done = True

        set_draw_callback(on_draw)

        try:
            # Connect client if needed
            if self._client is None:
                self._client = ClaudeSDKClient(options=self._options)
                await self._client.connect()

            # Send the turn prompt
            prompt = self._build_prompt()
            await self._client.query(prompt)

            # Notify iteration start
            if cb.on_iteration_start:
                await cb.on_iteration_start(1, 1)

            all_thinking = ""
            iteration = 1

            # Process response messages
            async for message in self._client.receive_response():
                # Check for abort
                if self._abort:
                    logger.info("Turn aborted - new canvas requested")
                    yield AgentTurnComplete(thinking=all_thinking, done=False)
                    return

                if isinstance(message, StreamEvent):
                    # Handle streaming events for real-time text
                    event = message.event
                    event_type = event.get("type", "")

                    if event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text and cb.on_thinking:
                                all_thinking += text
                                await cb.on_thinking(text, iteration)

                elif isinstance(message, AssistantMessage):
                    # Complete message - handle text and tool blocks
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            # Send complete text block (may overlap with stream, but ensures nothing is missed)
                            text = block.text
                            # Check if this text wasn't already sent via streaming
                            if text and text not in all_thinking:
                                all_thinking += text + "\n"
                                if cb.on_thinking:
                                    await cb.on_thinking(text, iteration)

                        elif isinstance(block, ToolUseBlock):
                            # Tool being called
                            logger.info(f"Tool use: {block.name}")
                            if cb.on_code_start:
                                await cb.on_code_start(iteration)

                            # Check if paths were collected (tool was executed)
                            if collected_paths:
                                logger.info(f"Yielding {len(collected_paths)} paths")
                                yield AgentPathsEvent(paths=collected_paths.copy())
                                collected_paths.clear()

                        elif isinstance(block, ToolResultBlock):
                            # Tool result
                            content = block.content if block.content else ""
                            if cb.on_code_result:
                                await cb.on_code_result(
                                    CodeExecutionResult(
                                        stdout=str(content),
                                        stderr="",
                                        return_code=1 if block.is_error else 0,
                                        iteration=iteration,
                                    )
                                )

                elif isinstance(message, SystemMessage):
                    logger.debug(f"System message: {message.subtype}")

                elif isinstance(message, ResultMessage):
                    # Turn complete
                    logger.info(f"Turn complete: {message.subtype}")
                    if message.is_error and cb.on_error:
                        await cb.on_error(message.result or "Unknown error", None)

            # Yield any remaining paths
            if collected_paths:
                yield AgentPathsEvent(paths=collected_paths.copy())
                collected_paths.clear()

            # Update agent state
            state_manager.monologue = all_thinking
            state_manager.save()

            if piece_done:
                state_manager.piece_count += 1
                self.reset_container()  # Fresh session for new piece
                state_manager.save()

            # Signal turn complete
            yield AgentTurnComplete(thinking=all_thinking, done=piece_done)

        except Exception as e:
            logger.exception("Agent turn failed")
            state_manager.status = AgentStatus.ERROR
            state_manager.save()

            # Notify UI of error
            if cb.on_error:
                await cb.on_error(str(e), None)

            raise RuntimeError(f"Agent turn failed: {e}") from e


# Singleton instance
agent = DrawingAgent()
