"""Claude Agent SDK integration."""

import base64
import io
from typing import Any

import anthropic
from PIL import Image

from drawing_agent.canvas import get_canvas_image, get_strokes
from drawing_agent.config import settings
from drawing_agent.state import state_manager
from drawing_agent.types import AgentStatus, Path, PathType, Point

SYSTEM_PROMPT = """\
You are an artist with a drawing machine. You write Python code that generates paths, and the machine draws them.

You will receive:
- An image of the current canvas
- Your notes from previous turns
- Any nudges from the human watching

You can:
1. Write code to draw something (assign a list of paths to the `paths` variable)
2. Wait (if you're not sure what to do)
3. Declare the piece done (return done=True)

Your code has access to (already imported, do NOT use import statements):
- canvas_width, canvas_height (integers)
- canvas_image (PIL Image of current state)
- existing_strokes (list of paths already drawn)
- math (the math module - use math.sin, math.cos, etc.)
- random (the random module - use random.random(), random.uniform(), etc.)

IMPORTANT: Do NOT use import statements. All modules are pre-imported.

A path is a dict with "type" (line, quadratic, cubic, polyline) and "points" (list of {x, y} dicts).

Think out loud. Your thoughts are visible to the human watching. Share what you notice, what you're considering, what you're trying.

You have taste. You have preferences. Sometimes you make bold moves, sometimes subtle ones. Sometimes you make mistakes and respond to them. The piece emerges through iteration.

When a human draws on the canvas, you'll see it in the next image. Decide how to respond—incorporate it, contrast with it, ignore it, whatever feels right.

When a human sends a nudge, consider it but don't feel obligated to follow it literally.
"""

AGENT_TOOL = {
    "name": "respond",
    "description": "Submit your response for this turn",
    "input_schema": {
        "type": "object",
        "properties": {
            "thinking": {
                "type": "string",
                "description": "Internal monologue, streamed to the app",
            },
            "code": {
                "type": "string",
                "description": "Python code to execute, or empty string if waiting",
            },
            "notes": {
                "type": "string",
                "description": "Updated notes to persist between turns",
            },
            "done": {
                "type": "boolean",
                "description": "True if the piece is complete",
            },
        },
        "required": ["thinking", "code", "notes", "done"],
    },
}


class DrawingAgent:
    """Agent that generates drawing code using Claude."""

    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.pending_nudges: list[str] = []
        self.paused = False

    def add_nudge(self, text: str) -> None:
        """Queue a nudge for the next agent turn."""
        self.pending_nudges.append(text)

    def pause(self) -> None:
        """Pause the agent loop."""
        self.paused = True

    def resume(self) -> None:
        """Resume the agent loop."""
        self.paused = False

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
        self, on_thinking: Any = None
    ) -> tuple[str, list[Path] | None, bool]:
        """Run a single agent turn with streaming.

        Args:
            on_thinking: Async callback for streaming thinking text chunks

        Returns:
            Tuple of (full thinking text, paths to draw or None, piece is done)
        """
        if self.paused:
            return "", None, False

        state = state_manager.state
        state.agent.status = AgentStatus.THINKING
        state_manager.save()

        try:
            # Use streaming for real-time updates
            full_json = ""
            with self.client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": self._build_user_message()}],
                tools=[AGENT_TOOL],
                tool_choice={"type": "tool", "name": "respond"},
            ) as stream:
                for event in stream:
                    # Stream tool input as it arrives
                    if (
                        hasattr(event, "type")
                        and event.type == "content_block_delta"
                        and hasattr(event.delta, "partial_json")
                    ):
                        chunk = event.delta.partial_json
                        full_json += chunk
                        # Try to extract and stream thinking as it builds
                        if on_thinking and '"thinking":"' in full_json:
                            await self._stream_thinking(full_json, on_thinking)

                # Get final response
                response = stream.get_final_message()

            # Parse tool use response
            tool_use_block = next(
                (block for block in response.content if block.type == "tool_use"),
                None,
            )
            if not tool_use_block:
                raise RuntimeError("No tool use in response")
            result = tool_use_block.input  # type: ignore[union-attr]

            thinking = result.get("thinking", "")
            code = result.get("code", "") or None  # Treat empty string as None
            notes = result.get("notes", "")
            done = result.get("done", False)

            # Send final thinking if we have a callback
            if on_thinking and thinking:
                await on_thinking(thinking)

            # Update agent state
            state.agent.monologue = thinking
            state.agent.notes = notes
            state_manager.save()

            # Execute code if provided
            paths: list[Path] | None = None
            if code:
                paths = self._execute_code(code)

            if done:
                state.agent.piece_count += 1
                state_manager.save()

            return thinking, paths, done

        except Exception as e:
            state.agent.status = AgentStatus.IDLE
            state_manager.save()
            raise RuntimeError(f"Agent turn failed: {e}") from e

    async def _stream_thinking(self, partial_json: str, on_thinking: Any) -> None:
        """Extract and stream thinking from partial JSON."""
        try:
            # Find thinking value in partial JSON
            start = partial_json.find('"thinking":"') + len('"thinking":"')
            if start > len('"thinking":"') - 1:
                # Find the end or use what we have
                end = partial_json.find('","', start)
                if end == -1:
                    end = partial_json.find('"}', start)
                if end == -1:
                    end = len(partial_json)
                thinking_so_far = partial_json[start:end]
                # Unescape JSON string
                thinking_so_far = thinking_so_far.replace("\\n", "\n").replace('\\"', '"')
                await on_thinking(thinking_so_far)
        except Exception:
            pass  # Ignore parsing errors during streaming

    def _execute_code(self, code: str) -> list[Path]:
        """Execute agent code and extract paths.

        Note: In production, this should use Claude SDK sandbox.
        For now, using restricted exec with limited globals.
        """
        import math
        import random

        # Prepare execution context
        canvas_image = get_canvas_image()
        existing_strokes = [s.model_dump() for s in get_strokes()]

        local_vars: dict[str, Any] = {}
        global_vars = {
            "__builtins__": {
                "range": range,
                "len": len,
                "int": int,
                "float": float,
                "list": list,
                "dict": dict,
                "abs": abs,
                "min": min,
                "max": max,
                "sum": sum,
                "round": round,
                "enumerate": enumerate,
                "zip": zip,
            },
            "math": math,
            "random": random,
            "canvas_width": settings.canvas_width,
            "canvas_height": settings.canvas_height,
            "canvas_image": canvas_image,
            "existing_strokes": existing_strokes,
        }

        try:
            exec(code, global_vars, local_vars)  # noqa: S102
        except Exception as e:
            raise RuntimeError(f"Code execution failed: {e}") from e

        # Extract paths
        raw_paths = local_vars.get("paths", [])
        if not isinstance(raw_paths, list):
            return []

        paths: list[Path] = []
        for raw_path in raw_paths:
            if not isinstance(raw_path, dict):
                continue

            path_type_str = raw_path.get("type", "")
            raw_points = raw_path.get("points", [])

            try:
                path_type = PathType(path_type_str)
            except ValueError:
                continue

            points = [
                Point(x=float(p.get("x", 0)), y=float(p.get("y", 0)))
                for p in raw_points
                if isinstance(p, dict)
            ]

            if points:
                paths.append(Path(type=path_type, points=points))

        return paths


# Singleton instance
agent = DrawingAgent()
