"""Graceful shutdown management for the Drawing Agent server."""

import asyncio
import logging
import signal
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ShutdownManager:
    """Coordinates graceful shutdown of server components.

    Handles:
    - Signal registration (SIGTERM, SIGINT)
    - WebSocket connection draining
    - Task cancellation with timeout
    - State persistence via cleanup callbacks
    """

    shutdown_timeout: float = 10.0  # Max time for agent task cancellation
    drain_timeout: float = 5.0  # Max time for WebSocket drain

    _shutdown_event: asyncio.Event = field(default_factory=asyncio.Event)
    _tasks: list[asyncio.Task[Any]] = field(default_factory=list)
    _connections: set[WebSocket] = field(default_factory=set)
    _connections_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _cleanup_callbacks: list[Callable[[], Coroutine[Any, Any, None]]] = field(default_factory=list)
    _signal_task: asyncio.Task[None] | None = field(default=None)

    def register_task(self, task: asyncio.Task[Any]) -> None:
        """Register a task that should be cancelled on shutdown."""
        self._tasks.append(task)

    async def register_connection(self, conn: WebSocket) -> None:
        """Register a WebSocket connection for graceful close."""
        async with self._connections_lock:
            self._connections.add(conn)

    async def unregister_connection(self, conn: WebSocket) -> None:
        """Unregister a WebSocket connection."""
        async with self._connections_lock:
            self._connections.discard(conn)

    def add_cleanup_callback(self, callback: Callable[[], Coroutine[Any, Any, None]]) -> None:
        """Add a callback to run during shutdown."""
        self._cleanup_callbacks.append(callback)

    @property
    def is_shutting_down(self) -> bool:
        """Check if shutdown has been initiated."""
        return self._shutdown_event.is_set()

    def install_signal_handlers(self) -> None:
        """Install SIGTERM and SIGINT handlers."""
        loop = asyncio.get_running_loop()

        def make_handler(sig: signal.Signals) -> Callable[[], None]:
            def handler() -> None:
                self._signal_task = asyncio.create_task(self._handle_signal(sig))

            return handler

        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, make_handler(sig))
        logger.info("Signal handlers installed for SIGTERM and SIGINT")

    async def _handle_signal(self, sig: signal.Signals) -> None:
        """Handle shutdown signal.

        Note: This only sets the shutdown event. The actual shutdown sequence
        is triggered by uvicorn's graceful shutdown which exits the lifespan
        context manager.
        """
        logger.info(f"Received signal {sig.name}, initiating graceful shutdown")
        self._shutdown_event.set()

    async def drain_connections(self) -> None:
        """Gracefully close all WebSocket connections."""
        async with self._connections_lock:
            connections_to_close = list(self._connections)

        if not connections_to_close:
            logger.info("No WebSocket connections to drain")
            return

        logger.info(f"Draining {len(connections_to_close)} WebSocket connection(s)")

        close_tasks = [self._close_connection(conn) for conn in connections_to_close]

        if close_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*close_tasks, return_exceptions=True),
                    timeout=self.drain_timeout,
                )
                logger.info("All WebSocket connections closed")
            except TimeoutError:
                logger.warning(f"WebSocket drain timed out after {self.drain_timeout}s")

    async def _close_connection(self, conn: WebSocket) -> None:
        """Close a single WebSocket connection gracefully."""
        try:
            await conn.close(code=1001, reason="Server shutting down")
        except Exception as e:
            logger.debug(f"Error closing WebSocket: {e}")
        finally:
            await self.unregister_connection(conn)

    async def cancel_tasks(self) -> None:
        """Cancel all registered tasks with timeout."""
        if not self._tasks:
            logger.info("No tasks to cancel")
            return

        logger.info(f"Cancelling {len(self._tasks)} task(s)")

        for task in self._tasks:
            if not task.done():
                task.cancel()

        if self._tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._tasks, return_exceptions=True),
                    timeout=self.shutdown_timeout,
                )
                logger.info("All tasks cancelled successfully")
            except TimeoutError:
                logger.warning(f"Task cancellation timed out after {self.shutdown_timeout}s")

        self._tasks.clear()

    async def run_cleanup_callbacks(self) -> None:
        """Run all registered cleanup callbacks."""
        if not self._cleanup_callbacks:
            return

        logger.info(f"Running {len(self._cleanup_callbacks)} cleanup callback(s)")

        for callback in self._cleanup_callbacks:
            try:
                await callback()
            except Exception as e:
                logger.error(f"Cleanup callback failed: {e}")

    async def shutdown(self) -> None:
        """Execute full graceful shutdown sequence.

        Order:
        1. Signal shutdown event
        2. Drain WebSocket connections
        3. Cancel registered tasks
        4. Run cleanup callbacks (state save, etc.)
        """
        logger.info("=== Graceful shutdown started ===")

        self._shutdown_event.set()

        # Step 1: Drain WebSocket connections
        logger.info("Step 1/3: Draining WebSocket connections")
        await self.drain_connections()

        # Step 2: Cancel tasks
        logger.info("Step 2/3: Cancelling background tasks")
        await self.cancel_tasks()

        # Step 3: Run cleanup callbacks
        logger.info("Step 3/3: Running cleanup callbacks")
        await self.run_cleanup_callbacks()

        logger.info("=== Graceful shutdown completed ===")


# Singleton instance
shutdown_manager = ShutdownManager()
