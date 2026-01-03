"""WebSocket connection manager."""

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: Any) -> None:
        """Broadcast message to all connected clients."""
        if not self.active_connections:
            return  # No clients to broadcast to - skip silently

        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)

        # Log pen messages periodically for debugging
        msg_type = message.type if hasattr(message, "type") else "unknown"
        if msg_type == "stroke_complete":
            logger.debug(f"Broadcasting stroke_complete to {len(self.active_connections)} clients")
        elif msg_type == "pen" and hasattr(message, "down") and message.down:
            logger.debug(f"Broadcasting pen (down=True) to {len(self.active_connections)} clients")

        failed: list[WebSocket] = []
        for conn in self.active_connections:
            try:
                await conn.send_text(data)
            except Exception as e:
                logger.error(f"Broadcast error: {type(e).__name__}: {e}")
                failed.append(conn)

        for conn in failed:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
                logger.info(f"Removed failed connection. Remaining: {len(self.active_connections)}")

    async def send_to(self, websocket: WebSocket, message: Any) -> None:
        """Send message to specific client."""
        if hasattr(message, "model_dump_json"):
            data = message.model_dump_json()
        else:
            data = json.dumps(message)
        await websocket.send_text(data)


# Singleton
manager = ConnectionManager()
