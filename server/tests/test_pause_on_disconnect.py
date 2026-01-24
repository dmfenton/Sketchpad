"""Tests for pause-on-disconnect and auto-resume functionality."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from code_monet.types import AgentStatus, PauseReason
from code_monet.workspace import WorkspaceState


class TestPauseReasonPersistence:
    """Test pause_reason is correctly saved and loaded."""

    @pytest.mark.asyncio
    async def test_pause_reason_persisted_on_save(self, tmp_path: Path) -> None:
        """Verify pause_reason survives save/load cycle."""
        workspace_dir = tmp_path / "test_user"
        workspace_dir.mkdir(parents=True)
        (workspace_dir / "gallery").mkdir()

        # Create workspace and set pause_reason
        state = WorkspaceState("test_user", workspace_dir)
        state._loaded = True
        state.pause_reason = PauseReason.USER
        await state.save()

        # Read the raw JSON to verify it was persisted
        workspace_file = workspace_dir / "workspace.json"
        data = json.loads(workspace_file.read_text())
        assert data["pause_reason"] == "user"

    @pytest.mark.asyncio
    async def test_pause_reason_loaded_from_file(self, tmp_path: Path) -> None:
        """Verify pause_reason is loaded correctly from saved state."""
        workspace_dir = tmp_path / "test_user"
        workspace_dir.mkdir(parents=True)

        # Create workspace file with pause_reason set
        workspace_file = workspace_dir / "workspace.json"
        workspace_file.write_text(
            json.dumps(
                {
                    "canvas": {"width": 800, "height": 600, "strokes": []},
                    "status": "paused",
                    "pause_reason": "disconnect",
                    "piece_number": 0,
                    "notes": "",
                    "monologue": "",
                }
            )
        )

        # Load and verify
        state = WorkspaceState("test_user", workspace_dir)
        await state._load_from_file()
        assert state.pause_reason == PauseReason.DISCONNECT

    @pytest.mark.asyncio
    async def test_pause_reason_defaults_to_none(self, tmp_path: Path) -> None:
        """Verify pause_reason defaults to NONE for legacy workspaces."""
        workspace_dir = tmp_path / "test_user"
        workspace_dir.mkdir(parents=True)

        # Create workspace file WITHOUT pause_reason (legacy format)
        workspace_file = workspace_dir / "workspace.json"
        workspace_file.write_text(
            json.dumps(
                {
                    "canvas": {"width": 800, "height": 600, "strokes": []},
                    "status": "paused",
                    "piece_number": 0,
                    "notes": "",
                    "monologue": "",
                }
            )
        )

        # Load and verify default
        state = WorkspaceState("test_user", workspace_dir)
        await state._load_from_file()
        assert state.pause_reason == PauseReason.NONE

    @pytest.mark.asyncio
    async def test_invalid_pause_reason_defaults_to_none(self, tmp_path: Path) -> None:
        """Verify invalid pause_reason value defaults to NONE."""
        workspace_dir = tmp_path / "test_user"
        workspace_dir.mkdir(parents=True)

        # Create workspace file with invalid pause_reason
        workspace_file = workspace_dir / "workspace.json"
        workspace_file.write_text(
            json.dumps(
                {
                    "canvas": {"width": 800, "height": 600, "strokes": []},
                    "status": "paused",
                    "pause_reason": "invalid_value",
                    "piece_number": 0,
                    "notes": "",
                    "monologue": "",
                }
            )
        )

        # Load and verify fallback
        state = WorkspaceState("test_user", workspace_dir)
        await state._load_from_file()
        assert state.pause_reason == PauseReason.NONE


class TestOnDisconnectPause:
    """Test registry pauses agent on last disconnect."""

    @pytest.mark.asyncio
    async def test_disconnect_pauses_agent_when_empty(self) -> None:
        """When last client disconnects, agent should be paused."""
        from code_monet.registry import ActiveWorkspace, UserConnectionManager, WorkspaceRegistry

        # Create mocks
        mock_state = MagicMock()
        mock_state.status = AgentStatus.IDLE
        mock_state.pause_reason = PauseReason.NONE
        mock_state.save = AsyncMock()

        mock_agent = MagicMock()
        mock_agent.paused = False
        mock_agent.pause = AsyncMock()

        mock_websocket = MagicMock()
        connections = UserConnectionManager(user_id="test_user")
        connections.add(mock_websocket)

        workspace = ActiveWorkspace(
            user_id="test_user",
            state=mock_state,
            connections=connections,
            agent=mock_agent,
        )

        registry = WorkspaceRegistry()
        registry._workspaces["test_user"] = workspace

        # Disconnect the only client
        await registry.on_disconnect("test_user", mock_websocket)

        # Verify agent was paused with DISCONNECT reason
        mock_agent.pause.assert_awaited_once()
        assert mock_state.status == AgentStatus.PAUSED
        assert mock_state.pause_reason == PauseReason.DISCONNECT
        mock_state.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_does_not_pause_if_other_clients(self) -> None:
        """When one client disconnects but others remain, don't pause."""
        from code_monet.registry import ActiveWorkspace, UserConnectionManager, WorkspaceRegistry

        mock_state = MagicMock()
        mock_state.status = AgentStatus.IDLE
        mock_state.pause_reason = PauseReason.NONE
        mock_state.save = AsyncMock()

        mock_agent = MagicMock()
        mock_agent.paused = False
        mock_agent.pause = AsyncMock()

        mock_ws1 = MagicMock()
        mock_ws2 = MagicMock()
        connections = UserConnectionManager(user_id="test_user")
        connections.add(mock_ws1)
        connections.add(mock_ws2)

        workspace = ActiveWorkspace(
            user_id="test_user",
            state=mock_state,
            connections=connections,
            agent=mock_agent,
        )

        registry = WorkspaceRegistry()
        registry._workspaces["test_user"] = workspace

        # Disconnect one client (one remains)
        await registry.on_disconnect("test_user", mock_ws1)

        # Agent should NOT be paused
        mock_agent.pause.assert_not_awaited()
        assert mock_state.pause_reason == PauseReason.NONE

    @pytest.mark.asyncio
    async def test_disconnect_does_not_pause_if_already_user_paused(self) -> None:
        """If user already paused, don't override pause_reason on disconnect."""
        from code_monet.registry import ActiveWorkspace, UserConnectionManager, WorkspaceRegistry

        mock_state = MagicMock()
        mock_state.status = AgentStatus.PAUSED
        mock_state.pause_reason = PauseReason.USER
        mock_state.save = AsyncMock()

        mock_agent = MagicMock()
        mock_agent.paused = True  # Already paused
        mock_agent.pause = AsyncMock()

        mock_websocket = MagicMock()
        connections = UserConnectionManager(user_id="test_user")
        connections.add(mock_websocket)

        workspace = ActiveWorkspace(
            user_id="test_user",
            state=mock_state,
            connections=connections,
            agent=mock_agent,
        )

        registry = WorkspaceRegistry()
        registry._workspaces["test_user"] = workspace

        # Disconnect
        await registry.on_disconnect("test_user", mock_websocket)

        # Agent.pause should NOT be called again (already paused)
        mock_agent.pause.assert_not_awaited()
        # pause_reason should remain USER, not be overwritten to DISCONNECT
        assert mock_state.pause_reason == PauseReason.USER
