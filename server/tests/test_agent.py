"""Tests for the drawing agent module."""

import base64
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from drawing_agent.agent import AgentCallbacks, DrawingAgent
from drawing_agent.types import AgentStatus, AgentTurnComplete


class TestDrawingAgentPauseResume:
    """Tests for agent pause/resume functionality."""

    def test_initial_state(self) -> None:
        agent = DrawingAgent()
        assert agent.paused is True  # Starts paused by default
        assert agent.container_id is None
        assert agent.pending_nudges == []

    @pytest.mark.asyncio
    async def test_pause(self) -> None:
        agent = DrawingAgent()
        await agent.pause()
        assert agent.paused is True

    @pytest.mark.asyncio
    async def test_resume(self) -> None:
        agent = DrawingAgent()
        await agent.pause()
        await agent.resume()
        assert agent.paused is False

    def test_add_nudge(self) -> None:
        agent = DrawingAgent()
        agent.add_nudge("Draw a circle")
        agent.add_nudge("Use blue color")
        assert len(agent.pending_nudges) == 2
        assert "Draw a circle" in agent.pending_nudges
        assert "Use blue color" in agent.pending_nudges

    def test_reset_container(self) -> None:
        agent = DrawingAgent()
        agent.container_id = "test-container-123"
        agent.reset_container()
        assert agent.container_id is None


class TestDrawingAgentImageConversion:
    """Tests for image conversion utilities."""

    def test_image_to_base64(self) -> None:
        agent = DrawingAgent()
        # Create a simple test image
        img = Image.new("RGB", (100, 100), color="white")

        result = agent._image_to_base64(img)

        # Should be a valid base64 string
        assert isinstance(result, str)
        assert len(result) > 0

        # Should be decodable
        decoded = base64.standard_b64decode(result)
        assert len(decoded) > 0

    def test_image_to_base64_with_colors(self) -> None:
        agent = DrawingAgent()
        # Create an image with specific content
        img = Image.new("RGB", (50, 50), color="red")

        result = agent._image_to_base64(img)

        # Verify it's a PNG by decoding and checking header
        decoded = base64.standard_b64decode(result)
        # PNG magic bytes
        assert decoded[:4] == b"\x89PNG"


class TestDrawingAgentRunTurn:
    """Tests for agent turn execution."""

    @pytest.mark.asyncio
    async def test_run_turn_when_paused(self) -> None:
        agent = DrawingAgent()
        await agent.pause()

        events = [event async for event in agent.run_turn()]

        # Should yield a single AgentTurnComplete with empty values
        assert len(events) == 1
        assert isinstance(events[0], AgentTurnComplete)
        assert events[0].thinking == ""
        assert events[0].done is False

    @pytest.mark.asyncio
    async def test_run_turn_streams_thinking(self) -> None:
        """Test that thinking callback is called during streaming."""
        agent = DrawingAgent()
        await agent.resume()  # Agent starts paused, resume for test

        # Track thinking callbacks
        thinking_updates: list[tuple[str, int]] = []

        async def on_thinking(text: str, iteration: int) -> None:
            thinking_updates.append((text, iteration))

        callbacks = AgentCallbacks(on_thinking=on_thinking)

        # Mock the API response
        mock_response = MagicMock()
        mock_response.content = []
        mock_response.stop_reason = "end_turn"
        mock_response.container = None

        mock_stream = MagicMock()
        mock_stream.__enter__ = MagicMock(return_value=mock_stream)
        mock_stream.__exit__ = MagicMock(return_value=False)
        mock_stream.get_final_message = MagicMock(return_value=mock_response)

        # Create a mock event with text delta
        mock_event = MagicMock()
        mock_event.type = "content_block_delta"
        mock_event.delta = MagicMock()
        mock_event.delta.text = "I see a blank canvas..."

        mock_stream.__iter__ = MagicMock(return_value=iter([mock_event]))

        with (
            patch.object(agent.client.beta.messages, "stream", return_value=mock_stream),
            patch("drawing_agent.agent.get_canvas_image") as mock_get_canvas,
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0
            mock_state.status = AgentStatus.IDLE

            mock_get_canvas.return_value = Image.new("RGB", (100, 100), "white")

            events = [event async for event in agent.run_turn(callbacks=callbacks)]

        # Should have called thinking callback
        assert len(thinking_updates) > 0
        assert "I see a blank canvas..." in thinking_updates[0][0]
        assert thinking_updates[0][1] == 1  # First iteration

        # Should yield AgentTurnComplete at the end
        assert any(isinstance(e, AgentTurnComplete) for e in events)


class TestDrawingAgentBuildUserMessage:
    """Tests for building user messages."""

    def test_build_user_message_basic(self) -> None:
        agent = DrawingAgent()

        with (
            patch("drawing_agent.agent.get_canvas_image") as mock_get_canvas,
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            mock_get_canvas.return_value = Image.new("RGB", (100, 100), "white")

            message = agent._build_user_message()

        # Should have image and text content
        assert len(message) >= 2
        assert message[0]["type"] == "image"
        assert message[1]["type"] == "text"
        assert "Canvas size:" in message[1]["text"]

    def test_build_user_message_with_notes(self) -> None:
        agent = DrawingAgent()

        with (
            patch("drawing_agent.agent.get_canvas_image") as mock_get_canvas,
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = "Previous work: drew a circle"
            mock_state.piece_count = 1

            mock_get_canvas.return_value = Image.new("RGB", (100, 100), "white")

            message = agent._build_user_message()

        # Should include notes
        notes_content = [
            m for m in message if m["type"] == "text" and "Your notes:" in m.get("text", "")
        ]
        assert len(notes_content) == 1
        assert "drew a circle" in notes_content[0]["text"]

    def test_build_user_message_with_nudges(self) -> None:
        agent = DrawingAgent()
        agent.add_nudge("Draw a tree")
        agent.add_nudge("Use green")

        with (
            patch("drawing_agent.agent.get_canvas_image") as mock_get_canvas,
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            mock_get_canvas.return_value = Image.new("RGB", (100, 100), "white")

            message = agent._build_user_message()

        # Should include nudges
        nudge_content = [
            m for m in message if m["type"] == "text" and "Human nudges:" in m.get("text", "")
        ]
        assert len(nudge_content) == 1
        assert "Draw a tree" in nudge_content[0]["text"]
        assert "Use green" in nudge_content[0]["text"]

        # Nudges should be cleared after building message
        assert agent.pending_nudges == []

    def test_build_user_message_clears_nudges(self) -> None:
        agent = DrawingAgent()
        agent.add_nudge("Test nudge")

        with (
            patch("drawing_agent.agent.get_canvas_image") as mock_get_canvas,
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            mock_get_canvas.return_value = Image.new("RGB", (100, 100), "white")

            agent._build_user_message()

        # Nudges should be cleared
        assert agent.pending_nudges == []


class TestDrawingAgentContainerManagement:
    """Tests for container ID management."""

    def test_container_id_initially_none(self) -> None:
        agent = DrawingAgent()
        assert agent.container_id is None

    def test_container_id_persists(self) -> None:
        agent = DrawingAgent()
        agent.container_id = "container-abc-123"
        assert agent.container_id == "container-abc-123"

    def test_reset_container_clears_id(self) -> None:
        agent = DrawingAgent()
        agent.container_id = "container-abc-123"
        agent.reset_container()
        assert agent.container_id is None
