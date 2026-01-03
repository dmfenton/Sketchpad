"""Tests for the drawing agent module."""

import base64
from unittest.mock import patch

import pytest
from PIL import Image

from drawing_agent.agent import DrawingAgent
from drawing_agent.types import AgentTurnComplete


class TestDrawingAgentPauseResume:
    """Tests for agent pause/resume functionality."""

    def test_initial_state(self) -> None:
        agent = DrawingAgent()
        assert agent.paused is True  # Starts paused by default
        assert agent.container_id is None  # SDK manages sessions
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

    def test_reset_container_sets_abort(self) -> None:
        """reset_container sets abort flag (SDK manages actual session)."""
        agent = DrawingAgent()
        agent.reset_container()
        assert agent._abort is True


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


class TestDrawingAgentBuildPrompt:
    """Tests for building the prompt string."""

    def test_build_prompt_basic(self) -> None:
        agent = DrawingAgent()

        with (
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            prompt = agent._build_prompt()

        # Should be a string with canvas info
        assert isinstance(prompt, str)
        assert "Canvas size:" in prompt
        assert "Existing strokes: 0" in prompt
        assert "Piece number: 1" in prompt

    def test_build_prompt_with_notes(self) -> None:
        agent = DrawingAgent()

        with (
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = "Previous work: drew a circle"
            mock_state.piece_count = 1

            prompt = agent._build_prompt()

        # Should include notes
        assert "Your notes:" in prompt
        assert "drew a circle" in prompt

    def test_build_prompt_with_nudges(self) -> None:
        agent = DrawingAgent()
        agent.add_nudge("Draw a tree")
        agent.add_nudge("Use green")

        with (
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            prompt = agent._build_prompt()

        # Should include nudges
        assert "Human nudges:" in prompt
        assert "Draw a tree" in prompt
        assert "Use green" in prompt

        # Nudges should be cleared after building prompt
        assert agent.pending_nudges == []

    def test_build_prompt_clears_nudges(self) -> None:
        agent = DrawingAgent()
        agent.add_nudge("Test nudge")

        with (
            patch("drawing_agent.agent.get_strokes", return_value=[]),
            patch("drawing_agent.agent.state_manager") as mock_state,
        ):
            mock_state.notes = ""
            mock_state.piece_count = 0

            agent._build_prompt()

        # Nudges should be cleared
        assert agent.pending_nudges == []


class TestDrawingAgentContainerManagement:
    """Tests for container/session management."""

    def test_container_id_always_none(self) -> None:
        """container_id always returns None (SDK manages sessions)."""
        agent = DrawingAgent()
        assert agent.container_id is None

    def test_reset_container_disconnects_client(self) -> None:
        """reset_container sets abort flag and triggers disconnect."""
        agent = DrawingAgent()
        agent.reset_container()
        assert agent._abort is True
        # Client disconnect happens async - just verify abort is set
