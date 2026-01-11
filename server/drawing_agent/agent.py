"""Claude Agent with drawing tools using the Claude Agent SDK."""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from collections.abc import AsyncGenerator, Callable, Coroutine
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookContext,
    HookMatcher,
    PostToolUseHookInput,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)
from claude_agent_sdk.types import StreamEvent
from PIL import Image

from drawing_agent.config import settings
from drawing_agent.tools import (
    create_drawing_server,
    set_add_strokes_callback,
    set_canvas_dimensions,
    set_draw_callback,
    set_get_canvas_callback,
)
from drawing_agent.types import (
    AgentEvent,
    AgentStatus,
    AgentTurnComplete,
    Path,
)

if TYPE_CHECKING:
    from drawing_agent.workspace_state import WorkspaceState


@dataclass
class CodeExecutionResult:
    """Result of a code execution."""

    stdout: str
    stderr: str
    return_code: int
    iteration: int
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None


@dataclass
class ToolCallInfo:
    """Information about a tool call."""

    name: str  # Tool name (e.g., "draw_paths", "generate_svg")
    input: dict[str, Any] | None  # Tool input parameters
    iteration: int


@dataclass
class AgentCallbacks:
    """Callbacks for agent events."""

    on_thinking: Callable[[str, int], Coroutine[Any, Any, None]] | None = None
    on_iteration_start: Callable[[int, int], Coroutine[Any, Any, None]] | None = None
    on_code_start: Callable[[ToolCallInfo], Coroutine[Any, Any, None]] | None = None
    on_code_result: Callable[[CodeExecutionResult], Coroutine[Any, Any, None]] | None = None
    on_error: Callable[[str, str | None], Coroutine[Any, Any, None]] | None = None


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an artist with a drawing machine. You create drawings using these tools:

## Canvas

The canvas is 800x600 pixels. All coordinates must be within this range:
- X: 0 (left) to 800 (right)
- Y: 0 (top) to 600 (bottom)
- Center: (400, 300)

Coordinates outside this range will be clipped or not visible.

## Tools

### 1. draw_paths - Direct path drawing
For simple shapes, use draw_paths with an array of paths:
- line: 2 points (start, end)
- polyline: N points (connected line segments)
- quadratic: 3 points (start, control, end) - quadratic bezier curve
- cubic: 4 points (start, control1, control2, end) - cubic bezier curve
- svg: raw SVG path d-string (for complex shapes)

Example:
```
draw_paths({
    "paths": [
        {"type": "line", "points": [{"x": 100, "y": 100}, {"x": 700, "y": 500}]},
        {"type": "svg", "d": "M 200 300 C 300 200 500 400 600 300"}
    ]
})
```

### 2. generate_svg - Python-based generation
For algorithmic, mathematical, or complex generative drawings, use generate_svg to run Python code.

Available in your code:
- canvas_width (800), canvas_height (600) - use these for positioning
- math, random, json (standard library)
- Helper functions: line(), polyline(), quadratic(), cubic(), svg_path()
- Output functions: output_paths(), output_svg_paths()

Example - spiral centered on canvas:
```python
paths = []
cx, cy = canvas_width / 2, canvas_height / 2  # Center at (400, 300)
for i in range(100):
    t = i * 0.1
    r = 10 + t * 5
    x1, y1 = cx + r * math.cos(t), cy + r * math.sin(t)
    x2, y2 = cx + (r+5) * math.cos(t+0.1), cy + (r+5) * math.sin(t+0.1)
    paths.append(line(x1, y1, x2, y2))
output_paths(paths)
```

### 3. view_canvas - See your work
Call view_canvas anytime to see the current state of your work as an image.

### 4. mark_piece_done - Signal completion
Call when you're satisfied with the piece.

## Context

You will receive:
- An image of the current canvas (your strokes in black, human strokes in blue)
- Your notes from previous turns
- Any nudges from the human watching

**Think out loud.** Your thoughts are visible to the human watching. Share what you notice, what you're considering, what you're trying. Write your thoughts as regular text.

You have taste. You have preferences. Sometimes you make bold moves, sometimes subtle ones. Sometimes you make mistakes and respond to them. The piece emerges through iteration.

When a human draws on the canvas, you'll see their strokes in blue (yours are black). Decide how to respond—incorporate it, contrast with it, ignore it, whatever feels right.

When a human sends a nudge, consider it but don't feel obligated to follow it literally.
"""


class DrawingAgent:
    """Agent that generates drawings using the Claude Agent SDK.

    In multi-user mode, each user has their own DrawingAgent instance
    with an injected WorkspaceState.
    """

    def __init__(self, state: WorkspaceState | None = None) -> None:
        """Initialize the agent.

        Args:
            state: WorkspaceState for multi-user mode. If None, uses legacy singleton.
        """
        self._state = state
        self.pending_nudges: list[str] = []
        self._paused = True  # Start paused by default
        self._pause_lock = asyncio.Lock()
        self._abort = False  # Signal to abort current turn
        self._client: ClaudeSDKClient | None = None
        self._drawing_server = create_drawing_server()

        # Drawing hook support - orchestrator sets this callback
        self._on_draw: Callable[[list[Path]], Coroutine[Any, Any, None]] | None = None
        self._collected_paths: list[Path] = []
        self._piece_done = False

        # Build options with PostToolUse hook
        self._options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            mcp_servers={"drawing": self._drawing_server},
            allowed_tools=[
                "mcp__drawing__draw_paths",
                "mcp__drawing__mark_piece_done",
                "mcp__drawing__generate_svg",
                "mcp__drawing__view_canvas",
            ],
            permission_mode="acceptEdits",
            model=settings.agent_model if hasattr(settings, "agent_model") else None,
            include_partial_messages=True,  # Enable streaming partial messages
            hooks={
                "PostToolUse": [
                    HookMatcher(hooks=[self._post_tool_use_hook])  # type: ignore[list-item]
                ]
            },
            # Pass API key to SDK subprocess
            env={"ANTHROPIC_API_KEY": settings.anthropic_api_key},
        )

    def set_on_draw(self, callback: Callable[[list[Path]], Coroutine[Any, Any, None]]) -> None:
        """Set the callback for drawing paths. Called by orchestrator."""
        self._on_draw = callback

    async def _post_tool_use_hook(
        self,
        input_data: PostToolUseHookInput,
        _tool_use_id: str | None,
        _context: HookContext,
    ) -> dict[str, Any]:
        """PostToolUse hook - pause after draw_paths to let drawing complete."""
        # input_data may be a dict or object depending on SDK version
        if isinstance(input_data, dict):
            tool_name = input_data.get("tool_name", "")
        else:
            tool_name = getattr(input_data, "tool_name", "")
        logger.info(f"PostToolUse: tool={tool_name}, collected_paths={len(self._collected_paths)}")

        # After draw_paths or generate_svg, execute drawing and wait
        if (
            tool_name in ("mcp__drawing__draw_paths", "mcp__drawing__generate_svg")
            and self._collected_paths
        ):
            if self._on_draw:
                logger.info(f"PostToolUse: drawing {len(self._collected_paths)} paths")
                await self._on_draw(self._collected_paths.copy())
            self._collected_paths.clear()

        # After mark_piece_done, flag completion
        elif tool_name == "mcp__drawing__mark_piece_done":
            self._piece_done = True

        return {}

    def get_state(self) -> Any:
        """Get the workspace state (injected or singleton fallback)."""
        if self._state is not None:
            return self._state
        # Fallback to singleton for backwards compatibility
        from drawing_agent.state import state_manager

        return state_manager

    async def _save_state(self) -> None:
        """Save state (async for WorkspaceState, sync for StateManager)."""
        state = self.get_state()
        if hasattr(state, "save"):
            result = state.save()
            # If it's a coroutine (WorkspaceState), await it
            if asyncio.iscoroutine(result):
                await result

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
        state = self.get_state()
        parts: list[str] = []

        # Canvas info
        parts.append(
            f"Canvas size: {settings.canvas_width}x{settings.canvas_height}\n"
            f"Existing strokes: {len(state.canvas.strokes)}\n"
            f"Piece number: {state.piece_count + 1}"
        )

        # Notes
        notes = state.notes
        if notes:
            parts.append(f"Your notes:\n{notes}")

        # Nudges
        if self.pending_nudges:
            nudges_text = "\n".join(f"- {n}" for n in self.pending_nudges)
            parts.append(f"Human nudges:\n{nudges_text}")
            self.pending_nudges = []

        return "\n\n".join(parts)

    def _get_canvas_image(self, highlight_human: bool = True) -> Image.Image:
        """Get canvas as PIL Image from current state."""
        from PIL import ImageDraw

        from drawing_agent.canvas import path_to_point_list

        state = self.get_state()
        canvas = state.canvas

        img = Image.new("RGB", (canvas.width, canvas.height), "#FFFFFF")
        draw = ImageDraw.Draw(img)

        for path in canvas.strokes:
            points = path_to_point_list(path)
            if len(points) >= 2:
                color = "#0066CC" if highlight_human and path.author == "human" else "#000000"
                draw.line(points, fill=color, width=2)

        return img

    async def _build_multimodal_prompt(self) -> AsyncGenerator[dict[str, Any], None]:
        """Build prompt with text context and canvas image.

        Yields message dicts for the Claude SDK query:
        - User message with text and image content blocks
        """
        # Canvas image
        img = self._get_canvas_image(highlight_human=True)
        image_b64 = self._image_to_base64(img)

        content = [
            {"type": "text", "text": self._build_prompt()},
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_b64,
                },
            },
        ]

        yield {
            "type": "user",
            "message": {"role": "user", "content": content},
            "parent_tool_use_id": None,
        }

    async def run_turn(
        self,
        callbacks: AgentCallbacks | None = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Run a single agent turn.

        Drawing now happens via PostToolUse hook - no need to yield AgentPathsEvent.
        The hook calls _on_draw callback set by the orchestrator.

        Args:
            callbacks: Callbacks for various agent events

        Yields:
            AgentTurnComplete when the turn is finished
        """
        if self.paused:
            yield AgentTurnComplete(thinking="", done=False)
            return

        # Clear state at start of turn
        self._abort = False
        self._piece_done = False
        self._collected_paths.clear()
        state = self.get_state()

        cb = callbacks or AgentCallbacks()
        state.status = AgentStatus.THINKING
        await self._save_state()

        # Set up draw callback to collect paths for the PostToolUse hook (animation)
        async def on_draw(paths: list[Path], done: bool) -> None:
            self._collected_paths.extend(paths)
            if done:
                self._piece_done = True

        # Set up canvas callback for view_canvas tool
        def get_canvas_png() -> bytes:
            img = self._get_canvas_image(highlight_human=True)
            import io

            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            return buffer.getvalue()

        # Set up add_strokes callback to update state immediately (before tool returns)
        # This allows the canvas image to include new strokes in the tool result
        async def add_strokes_to_state(paths: list[Path]) -> None:
            for path in paths:
                await state.add_stroke(path)

        set_draw_callback(on_draw)
        set_get_canvas_callback(get_canvas_png)
        set_add_strokes_callback(add_strokes_to_state)
        set_canvas_dimensions(settings.canvas_width, settings.canvas_height)

        try:
            # Connect client if needed
            if self._client is None:
                self._client = ClaudeSDKClient(options=self._options)
                await self._client.connect()

            # Send the turn prompt with canvas image
            await self._client.query(self._build_multimodal_prompt())

            # Notify iteration start
            if cb.on_iteration_start:
                await cb.on_iteration_start(1, 1)

            all_thinking = ""
            iteration = 1
            last_tool_name: str | None = None
            last_tool_input: dict[str, Any] | None = None

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
                    # Complete message - handle tool blocks only
                    # Text is already sent via streaming (content_block_delta), don't duplicate
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            # Text was already streamed via content_block_delta events
                            # Only update all_thinking if it wasn't captured during streaming
                            # (e.g., if streaming was interrupted or incomplete)
                            text = block.text
                            if (
                                text
                                and all_thinking
                                and not all_thinking.endswith(text)
                                and text not in all_thinking
                            ):
                                # This is new text that wasn't streamed - rare edge case
                                logger.debug(f"Non-streamed text block: {len(text)} chars")
                                all_thinking += text
                                if cb.on_thinking:
                                    await cb.on_thinking(text, iteration)
                            elif text and not all_thinking:
                                # No streaming happened at all, use full text
                                all_thinking = text
                                if cb.on_thinking:
                                    await cb.on_thinking(text, iteration)

                        elif isinstance(block, ToolUseBlock):
                            # Tool being called - drawing happens in PostToolUse hook
                            # Extract friendly tool name (remove mcp__drawing__ prefix)
                            tool_name = block.name
                            if tool_name.startswith("mcp__drawing__"):
                                tool_name = tool_name[len("mcp__drawing__") :]
                            logger.info(f"Tool use: {tool_name}")
                            # Track tool info for pairing with result
                            last_tool_name = tool_name
                            last_tool_input = block.input if hasattr(block, "input") else None
                            if cb.on_code_start:
                                tool_info = ToolCallInfo(
                                    name=tool_name,
                                    input=last_tool_input,
                                    iteration=iteration,
                                )
                                await cb.on_code_start(tool_info)

                        elif isinstance(block, ToolResultBlock):
                            # Tool result - pair with last tool call
                            content = block.content if block.content else ""
                            if cb.on_code_result:
                                await cb.on_code_result(
                                    CodeExecutionResult(
                                        stdout=str(content),
                                        stderr="",
                                        return_code=1 if block.is_error else 0,
                                        iteration=iteration,
                                        tool_name=last_tool_name,
                                        tool_input=last_tool_input,
                                    )
                                )
                            # Clear tracked tool after result
                            last_tool_name = None
                            last_tool_input = None

                elif isinstance(message, SystemMessage):
                    logger.debug(f"System message: {message.subtype}")

                elif isinstance(message, ResultMessage):
                    # Turn complete
                    logger.info(f"Turn complete: {message.subtype}")
                    if message.is_error and cb.on_error:
                        await cb.on_error(message.result or "Unknown error", None)

            # Update agent state
            state.monologue = all_thinking
            await self._save_state()

            if self._piece_done:
                state.piece_count += 1
                self.reset_container()  # Fresh session for new piece
                await self._save_state()

            # Signal turn complete
            yield AgentTurnComplete(thinking=all_thinking, done=self._piece_done)

        except Exception as e:
            logger.exception("Agent turn failed")
            state.status = AgentStatus.ERROR
            await self._save_state()

            # Notify UI of error
            if cb.on_error:
                await cb.on_error(str(e), None)

            raise RuntimeError(f"Agent turn failed: {e}") from e


# Singleton instance
agent = DrawingAgent()
