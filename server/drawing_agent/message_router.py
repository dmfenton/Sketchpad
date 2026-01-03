"""WebSocket message routing with handler registry pattern."""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class MessageHandler(Protocol):
    """Protocol for message handlers."""

    async def __call__(self, message: dict[str, Any], websocket: WebSocket) -> None:
        """Handle a WebSocket message."""
        ...


@dataclass
class MessageRouter:
    """Routes WebSocket messages to registered handlers."""

    _handlers: dict[str, MessageHandler]

    def __init__(self) -> None:
        self._handlers = {}

    def register(
        self, msg_type: str
    ) -> Callable[[MessageHandler], MessageHandler]:
        """Decorator to register a handler for a message type."""

        def decorator(fn: MessageHandler) -> MessageHandler:
            self._handlers[msg_type] = fn
            return fn

        return decorator

    def handler(self, msg_type: str) -> Callable[
        [Callable[..., Awaitable[None]]],
        Callable[..., Awaitable[None]],
    ]:
        """Alternative decorator that allows handlers with custom signatures.

        The decorated function will be wrapped to match MessageHandler protocol.
        """

        def decorator(
            fn: Callable[..., Awaitable[None]]
        ) -> Callable[..., Awaitable[None]]:
            async def wrapper(message: dict[str, Any], websocket: WebSocket) -> None:
                await fn(message, websocket)

            self._handlers[msg_type] = wrapper
            return fn

        return decorator

    async def route(self, message: dict[str, Any], websocket: WebSocket) -> bool:
        """Route a message to its handler.

        Returns True if a handler was found and executed, False otherwise.
        """
        msg_type = message.get("type")
        handler = self._handlers.get(msg_type) if msg_type else None

        if handler:
            await handler(message, websocket)
            return True
        else:
            if msg_type:
                logger.warning(f"Unknown message type: {msg_type}")
            return False

    @property
    def registered_types(self) -> list[str]:
        """List all registered message types."""
        return list(self._handlers.keys())
