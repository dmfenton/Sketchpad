"""Workspace registry for multi-user isolation."""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from drawing_agent.workspace_state import WorkspaceState

logger = logging.getLogger(__name__)

# Grace period before deactivating idle workspace (seconds)
IDLE_GRACE_PERIOD = 300  # 5 minutes


class UserConnectionManager:
    """WebSocket connection manager scoped to a single user.

    Each user has their own connection manager that only broadcasts
    to that user's connections.
    """

    def __init__(self, user_id: int) -> None:
        self.user_id = user_id
        self.connections: list[WebSocket] = []

    def add(self, websocket: WebSocket) -> None:
        """Add a WebSocket connection."""
        self.connections.append(websocket)
        logger.info(f"User {self.user_id}: connection added. Total: {len(self.connections)}")

    def remove(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self.connections:
            self.connections.remove(websocket)
        logger.info(f"User {self.user_id}: connection removed. Total: {len(self.connections)}")

    @property
    def connection_count(self) -> int:
        return len(self.connections)

    @property
    def is_empty(self) -> bool:
        return len(self.connections) == 0

    @property
    def active_connections(self) -> list[WebSocket]:
        """Alias for connections - required by Broadcaster protocol."""
        return self.connections

    async def broadcast(self, message: Any) -> None:
        """Broadcast message to all user's connections."""
        if not self.connections:
            return

        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)

        failed: list[WebSocket] = []
        for conn in self.connections:
            try:
                await conn.send_text(data)
            except Exception as e:
                logger.error(f"User {self.user_id} broadcast error: {e}")
                failed.append(conn)

        for conn in failed:
            self.remove(conn)

    async def send_to(self, websocket: WebSocket, message: Any) -> None:
        """Send message to a specific connection."""
        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)
        await websocket.send_text(data)


@dataclass
class ActiveWorkspace:
    """Bundle of components for an active user workspace.

    Created when a user connects, destroyed after idle timeout.
    """

    user_id: int
    state: WorkspaceState
    connections: UserConnectionManager
    agent: Any = None  # DrawingAgent - set after creation to avoid circular import
    orchestrator: Any = None  # AgentOrchestrator - set after creation
    loop_task: asyncio.Task[None] | None = None
    _idle_task: asyncio.Task[None] | None = field(default=None, repr=False)

    async def start_agent_loop(self) -> None:
        """Start the agent orchestrator loop."""
        if self.orchestrator and self.loop_task is None:
            self.loop_task = asyncio.create_task(self.orchestrator.run_loop())
            logger.info(f"User {self.user_id}: agent loop started")

    async def stop_agent_loop(self) -> None:
        """Stop the agent orchestrator loop."""
        import contextlib

        if self.loop_task and not self.loop_task.done():
            self.loop_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.loop_task
            self.loop_task = None
            logger.info(f"User {self.user_id}: agent loop stopped")


class WorkspaceRegistry:
    """Manages active workspaces for all users.

    Handles:
    - Lazy activation when user connects
    - Deactivation after idle timeout
    - Workspace lookup by user ID
    """

    def __init__(self) -> None:
        self._workspaces: dict[int, ActiveWorkspace] = {}
        self._lock = asyncio.Lock()

    async def get_or_activate(self, user_id: int) -> ActiveWorkspace:
        """Get existing workspace or activate a new one."""
        async with self._lock:
            if user_id in self._workspaces:
                ws = self._workspaces[user_id]
                # Cancel any pending deactivation
                if ws._idle_task and not ws._idle_task.done():
                    ws._idle_task.cancel()
                    ws._idle_task = None
                return ws

            # Create new active workspace
            workspace = await self._activate_workspace(user_id)
            self._workspaces[user_id] = workspace
            return workspace

    async def _activate_workspace(self, user_id: int) -> ActiveWorkspace:
        """Create and initialize a new active workspace."""
        # Lazy imports to avoid circular dependencies
        from drawing_agent.agent import DrawingAgent
        from drawing_agent.agent_logger import AgentFileLogger
        from drawing_agent.config import settings
        from drawing_agent.orchestrator import AgentOrchestrator

        logger.info(f"Activating workspace for user {user_id}")

        # Load state from database
        state = await WorkspaceState.load_for_user(user_id)

        # Create per-user file logger for agent activity
        file_logger: AgentFileLogger | None = None
        if settings.agent_logs_enabled:
            file_logger = AgentFileLogger(
                user_dir=state._user_dir,
                max_log_files=settings.agent_logs_max_files,
            )
            logger.info(f"User {user_id}: agent file logging enabled")

        # Create per-user components
        connections = UserConnectionManager(user_id)
        agent = DrawingAgent(state)
        orchestrator = AgentOrchestrator(
            agent=agent,
            broadcaster=connections,
            file_logger=file_logger,
        )

        workspace = ActiveWorkspace(
            user_id=user_id,
            state=state,
            connections=connections,
            agent=agent,
            orchestrator=orchestrator,
        )

        # Start agent loop
        await workspace.start_agent_loop()

        return workspace

    async def on_disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Handle user disconnect - schedule deactivation if no connections remain."""
        async with self._lock:
            if user_id not in self._workspaces:
                return

            ws = self._workspaces[user_id]
            ws.connections.remove(websocket)

            if ws.connections.is_empty:
                # Schedule deactivation after grace period
                ws._idle_task = asyncio.create_task(
                    self._deactivate_after_delay(user_id, IDLE_GRACE_PERIOD)
                )

    async def _deactivate_after_delay(self, user_id: int, delay: float) -> None:
        """Deactivate workspace after delay if still idle."""
        await asyncio.sleep(delay)

        async with self._lock:
            if user_id not in self._workspaces:
                return

            ws = self._workspaces[user_id]

            # Only deactivate if still no connections
            if ws.connections.is_empty:
                await self._deactivate_workspace(user_id)

    async def _deactivate_workspace(self, user_id: int) -> None:
        """Deactivate and remove a workspace."""
        if user_id not in self._workspaces:
            return

        ws = self._workspaces[user_id]
        logger.info(f"Deactivating workspace for user {user_id}")

        # Stop agent loop
        await ws.stop_agent_loop()

        # Save state one final time
        await ws.state.save()

        # Remove from registry
        del self._workspaces[user_id]

    async def shutdown_all(self) -> None:
        """Shutdown all active workspaces (for server shutdown)."""
        async with self._lock:
            user_ids = list(self._workspaces.keys())

        for user_id in user_ids:
            await self._deactivate_workspace(user_id)

        logger.info("All workspaces deactivated")

    def get(self, user_id: int) -> ActiveWorkspace | None:
        """Get workspace by user ID without activating."""
        return self._workspaces.get(user_id)

    @property
    def active_count(self) -> int:
        """Number of active workspaces."""
        return len(self._workspaces)


# Global registry instance
workspace_registry = WorkspaceRegistry()
