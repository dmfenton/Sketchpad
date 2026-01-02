"""Claude Agent with code execution sandbox integration."""

import base64
import io
import logging
from collections.abc import Callable, Coroutine
from typing import Any

import anthropic
from PIL import Image

from drawing_agent.canvas import get_canvas_image, get_strokes
from drawing_agent.config import settings
from drawing_agent.state import state_manager
from drawing_agent.svg_parser import extract_paths_from_output
from drawing_agent.types import AgentStatus, Path

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an artist with a drawing machine. You have access to a full Python environment with a code execution sandbox.

You will receive:
- An image of the current canvas
- Your notes from previous turns
- Any nudges from the human watching

Your environment includes:
- Python 3.11 with numpy, scipy, matplotlib, Pillow, and full standard library
- Filesystem: read/write files that persist between turns in your workspace
- Bash: run any shell command

To draw, you have two options:

1. **Output JSON paths to stdout** (preferred for simple drawings):
```python
import json
paths = [
    {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]},
    {"type": "polyline", "points": [{"x": 0, "y": 0}, {"x": 50, "y": 50}, {"x": 100, "y": 0}]},
    {"type": "quadratic", "points": [{"x": 0, "y": 0}, {"x": 50, "y": 100}, {"x": 100, "y": 0}]},
    {"type": "cubic", "points": [{"x": 0, "y": 0}, {"x": 33, "y": 100}, {"x": 66, "y": 100}, {"x": 100, "y": 0}]},
]
print(json.dumps(paths))
```

2. **Create an SVG file** (for complex drawings):
Write an SVG file to /tmp/drawing.svg and it will be parsed into drawable paths.

Path types:
- `line`: 2 points (start, end)
- `polyline`: N points (connected line segments)
- `quadratic`: 3 points (start, control, end) - quadratic bezier curve
- `cubic`: 4 points (start, control1, control2, end) - cubic bezier curve

**Think out loud.** Your thoughts are visible to the human watching. Share what you notice, what you're considering, what you're trying. Write your thoughts as regular text before using the code execution tool.

You have taste. You have preferences. Sometimes you make bold moves, sometimes subtle ones. Sometimes you make mistakes and respond to them. The piece emerges through iteration.

When a human draws on the canvas, you'll see it in the next image. Decide how to respond—incorporate it, contrast with it, ignore it, whatever feels right.

When a human sends a nudge, consider it but don't feel obligated to follow it literally.

To signal that a piece is complete, print "PIECE_DONE" to stdout in your final code execution.
"""


class DrawingAgent:
    """Agent that generates drawing code using Claude's code execution sandbox."""

    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.pending_nudges: list[str] = []
        self.paused = False
        self.container_id: str | None = None

    def add_nudge(self, text: str) -> None:
        """Queue a nudge for the next agent turn."""
        self.pending_nudges.append(text)

    def pause(self) -> None:
        """Pause the agent loop."""
        self.paused = True

    def resume(self) -> None:
        """Resume the agent loop."""
        self.paused = False

    def reset_container(self) -> None:
        """Reset the container for a new piece."""
        self.container_id = None

    def _image_to_base64(self, img: Image.Image) -> str:
        """Convert PIL Image to base64 string."""
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")

    def _build_user_message(self) -> list[dict[str, Any]]:
        """Build the user message with canvas image and context."""
        state = state_manager.state
        canvas_image = get_canvas_image()

        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": self._image_to_base64(canvas_image),
                },
            },
            {
                "type": "text",
                "text": f"Canvas size: {settings.canvas_width}x{settings.canvas_height}\n"
                f"Existing strokes: {len(get_strokes())}\n"
                f"Piece number: {state.agent.piece_count + 1}",
            },
        ]

        if state.agent.notes:
            content.append({"type": "text", "text": f"Your notes:\n{state.agent.notes}"})

        if self.pending_nudges:
            nudges_text = "\n".join(f"- {n}" for n in self.pending_nudges)
            content.append({"type": "text", "text": f"Human nudges:\n{nudges_text}"})
            self.pending_nudges = []

        return content

    async def run_turn(
        self,
        on_thinking: Callable[[str], Coroutine[Any, Any, None]] | None = None,
    ) -> tuple[str, list[Path] | None, bool]:
        """Run a single agent turn with streaming and code execution.

        Args:
            on_thinking: Async callback for streaming thinking text

        Returns:
            Tuple of (full thinking text, paths to draw or None, piece is done)
        """
        if self.paused:
            return "", None, False

        state = state_manager.state
        state.agent.status = AgentStatus.THINKING
        state_manager.save()

        try:
            messages: list[dict[str, Any]] = [
                {"role": "user", "content": self._build_user_message()}
            ]

            all_thinking = ""
            all_paths: list[Path] = []
            done = False
            max_iterations = 5  # Prevent infinite loops

            for iteration in range(max_iterations):
                logger.info(f"Agent iteration {iteration + 1}")

                # Build API call parameters
                api_params: dict[str, Any] = {
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 8192,
                    "system": SYSTEM_PROMPT,
                    "messages": messages,
                    "tools": [{"type": "code_execution_20250825", "name": "code_execution"}],
                }

                # Reuse container if we have one
                if self.container_id:
                    api_params["container"] = self.container_id

                # Make API call with streaming
                thinking_buffer = ""
                response_content: list[Any] = []

                with self.client.beta.messages.stream(
                    betas=["code-execution-2025-08-25"],
                    **api_params,
                ) as stream:
                    for event in stream:
                        if (
                            hasattr(event, "type")
                            and event.type == "content_block_delta"
                            and hasattr(event.delta, "text")
                        ):
                            # Stream thinking text to UI
                            text_chunk = event.delta.text
                            thinking_buffer += text_chunk
                            if on_thinking:
                                await on_thinking(thinking_buffer)

                    # Get final response
                    response = stream.get_final_message()
                    response_content = list(response.content)

                # Store container ID for reuse
                if hasattr(response, "container") and response.container:
                    self.container_id = response.container.id
                    logger.info(f"Container ID: {self.container_id}")

                # Accumulate thinking text
                if thinking_buffer:
                    all_thinking += thinking_buffer + "\n"

                # Process response content
                has_tool_use = False

                for block in response_content:
                    if block.type == "text":
                        # Additional text (already captured via streaming)
                        pass

                    elif block.type == "server_tool_use":
                        # Code execution tool use
                        has_tool_use = True
                        logger.info(f"Code execution tool use: {block.id}")

                    elif block.type == "code_execution_tool_result":
                        # Process code execution result
                        result = block.content
                        stdout = getattr(result, "stdout", "") or ""
                        stderr = getattr(result, "stderr", "") or ""
                        return_code = getattr(result, "return_code", 0)

                        logger.info(f"Code execution result: return_code={return_code}")
                        if stdout:
                            logger.info(f"stdout: {stdout[:500]}...")
                        if stderr:
                            logger.warning(f"stderr: {stderr[:500]}...")

                        # Check for PIECE_DONE signal
                        if "PIECE_DONE" in stdout:
                            done = True
                            stdout = stdout.replace("PIECE_DONE", "").strip()

                        # Extract paths from stdout (JSON format)
                        paths = extract_paths_from_output(stdout)
                        if paths:
                            all_paths.extend(paths)
                            logger.info(f"Extracted {len(paths)} paths from stdout")

                        # Check for SVG file creation
                        # Note: In a full implementation, we'd use the Files API to retrieve
                        # files created in the container. For now, we'll rely on stdout.

                # Check stop reason
                stop_reason = response.stop_reason if hasattr(response, "stop_reason") else None
                logger.info(f"Stop reason: {stop_reason}")

                # If no tool use or end_turn, we're done with this turn
                if not has_tool_use or stop_reason == "end_turn":
                    break

                # If tool was used, add assistant response and continue
                if has_tool_use:
                    messages.append({"role": "assistant", "content": response_content})
                    # The tool result is automatically handled by the API

            # Update agent state
            state.agent.monologue = all_thinking
            state_manager.save()

            if done:
                state.agent.piece_count += 1
                self.reset_container()  # Fresh container for new piece
                state_manager.save()

            return all_thinking, all_paths if all_paths else None, done

        except Exception as e:
            logger.exception("Agent turn failed")
            state.agent.status = AgentStatus.IDLE
            state_manager.save()
            raise RuntimeError(f"Agent turn failed: {e}") from e


# Singleton instance
agent = DrawingAgent()
