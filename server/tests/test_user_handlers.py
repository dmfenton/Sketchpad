"""Tests for user message handlers."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from code_monet.types import DrawingStyleType, StyleChangeMessage
from code_monet.user_handlers import handle_new_canvas, handle_set_style


class TestHandleNewCanvas:
    """Test handle_new_canvas function."""

    @pytest.fixture
    def mock_workspace(self) -> MagicMock:
        """Create a mock workspace with all required attributes."""
        workspace = MagicMock()
        workspace.user_id = 1
        workspace.state = MagicMock()
        workspace.state.new_canvas = AsyncMock(return_value="piece_001")
        workspace.state.piece_count = 1
        workspace.state.list_gallery = AsyncMock(return_value=[])
        workspace.state.canvas = MagicMock()
        workspace.state.canvas.drawing_style = DrawingStyleType.PLOTTER
        workspace.state.save = AsyncMock()
        workspace.agent = MagicMock()
        workspace.agent.reset_container = MagicMock()
        workspace.agent.add_nudge = MagicMock()
        workspace.agent.resume = AsyncMock()
        workspace.connections = MagicMock()
        workspace.connections.broadcast = AsyncMock()
        workspace.orchestrator = MagicMock()
        workspace.orchestrator.clear_piece_completed = MagicMock()
        workspace.orchestrator.wake = MagicMock()
        return workspace

    @pytest.mark.asyncio
    async def test_new_canvas_without_style(self, mock_workspace: MagicMock) -> None:
        """New canvas without style should not change drawing style."""
        await handle_new_canvas(mock_workspace, {"direction": "landscape"})

        # Style should not be changed
        assert mock_workspace.state.canvas.drawing_style == DrawingStyleType.PLOTTER
        # Direction should be added as nudge
        mock_workspace.agent.add_nudge.assert_called_once_with("landscape")

    @pytest.mark.asyncio
    async def test_new_canvas_with_style_plotter(self, mock_workspace: MagicMock) -> None:
        """New canvas with plotter style should set style atomically."""
        mock_workspace.state.canvas.drawing_style = DrawingStyleType.PAINT  # Start with paint

        await handle_new_canvas(
            mock_workspace, {"direction": "abstract", "drawing_style": "plotter"}
        )

        # Style should be changed to plotter
        assert mock_workspace.state.canvas.drawing_style == DrawingStyleType.PLOTTER
        # Should save the state
        mock_workspace.state.save.assert_called()
        # Should broadcast style change
        broadcast_calls = mock_workspace.connections.broadcast.call_args_list
        style_change_calls = [
            call for call in broadcast_calls if isinstance(call[0][0], StyleChangeMessage)
        ]
        assert len(style_change_calls) == 1
        assert style_change_calls[0][0][0].drawing_style == DrawingStyleType.PLOTTER

    @pytest.mark.asyncio
    async def test_new_canvas_with_style_paint(self, mock_workspace: MagicMock) -> None:
        """New canvas with paint style should set style atomically."""
        await handle_new_canvas(mock_workspace, {"direction": None, "drawing_style": "paint"})

        # Style should be changed to paint
        assert mock_workspace.state.canvas.drawing_style == DrawingStyleType.PAINT
        # Should broadcast style change
        broadcast_calls = mock_workspace.connections.broadcast.call_args_list
        style_change_calls = [
            call for call in broadcast_calls if isinstance(call[0][0], StyleChangeMessage)
        ]
        assert len(style_change_calls) == 1
        assert style_change_calls[0][0][0].drawing_style == DrawingStyleType.PAINT

    @pytest.mark.asyncio
    async def test_new_canvas_with_invalid_style(self, mock_workspace: MagicMock) -> None:
        """New canvas with invalid style should log warning and not change style."""
        original_style = mock_workspace.state.canvas.drawing_style

        await handle_new_canvas(
            mock_workspace, {"direction": "test", "drawing_style": "invalid_style"}
        )

        # Style should not be changed
        assert mock_workspace.state.canvas.drawing_style == original_style
        # Should still process direction
        mock_workspace.agent.add_nudge.assert_called_once_with("test")

    @pytest.mark.asyncio
    async def test_new_canvas_style_applied_before_agent_starts(
        self, mock_workspace: MagicMock
    ) -> None:
        """Style should be applied before agent resumes (atomic operation)."""
        call_order: list[str] = []

        async def track_broadcast(msg: object) -> None:
            if isinstance(msg, StyleChangeMessage):
                call_order.append("style_change")

        async def track_resume() -> None:
            call_order.append("resume")

        mock_workspace.connections.broadcast.side_effect = track_broadcast
        mock_workspace.agent.resume.side_effect = track_resume

        await handle_new_canvas(mock_workspace, {"drawing_style": "paint"})

        # Style change should be broadcast before agent resumes
        style_idx = call_order.index("style_change") if "style_change" in call_order else -1
        resume_idx = call_order.index("resume") if "resume" in call_order else len(call_order)
        assert style_idx < resume_idx, "Style change should happen before agent resume"


class TestHandleSetStyle:
    """Test handle_set_style function."""

    @pytest.fixture
    def mock_workspace(self) -> MagicMock:
        """Create a mock workspace for style tests."""
        workspace = MagicMock()
        workspace.user_id = 1
        workspace.state = MagicMock()
        workspace.state.canvas = MagicMock()
        workspace.state.canvas.drawing_style = DrawingStyleType.PLOTTER
        workspace.state.save = AsyncMock()
        workspace.agent = MagicMock()
        workspace.agent.reset_container = MagicMock()
        workspace.connections = MagicMock()
        workspace.connections.broadcast = AsyncMock()
        return workspace

    @pytest.mark.asyncio
    async def test_set_style_changes_style(self, mock_workspace: MagicMock) -> None:
        """Setting style should update canvas and broadcast change."""
        await handle_set_style(mock_workspace, {"drawing_style": "paint"})

        assert mock_workspace.state.canvas.drawing_style == DrawingStyleType.PAINT
        mock_workspace.state.save.assert_called_once()
        mock_workspace.agent.reset_container.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_style_same_style_no_op(self, mock_workspace: MagicMock) -> None:
        """Setting same style should not trigger any changes."""
        await handle_set_style(mock_workspace, {"drawing_style": "plotter"})

        # Style unchanged, should not save or broadcast
        mock_workspace.state.save.assert_not_called()
        mock_workspace.agent.reset_container.assert_not_called()

    @pytest.mark.asyncio
    async def test_set_style_invalid_style(self, mock_workspace: MagicMock) -> None:
        """Invalid style should broadcast error."""
        await handle_set_style(mock_workspace, {"drawing_style": "invalid"})

        # Should broadcast error
        broadcast_calls = mock_workspace.connections.broadcast.call_args_list
        assert len(broadcast_calls) == 1
        error_msg = broadcast_calls[0][0][0]
        assert error_msg["type"] == "error"
        assert "Invalid drawing style" in error_msg["message"]
