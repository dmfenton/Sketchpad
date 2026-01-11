"""File-based logging for agent runs.

Writes agent activity to per-turn log files for later debugging and analysis.
Each user's logs are stored in their workspace directory under logs/.
Each agent turn gets its own timestamped log file.
"""

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path as FilePath

import aiofiles
import aiofiles.os

logger = logging.getLogger(__name__)

# Log directory and file constants
LOGS_DIRNAME = "logs"
DEFAULT_MAX_LOG_FILES = 50  # Keep last N log files per user


class AgentFileLogger:
    """Per-user, per-turn file logger for agent activity.

    Logs are stored in the user's workspace directory under logs/.
    Each agent turn creates a new timestamped log file:
        logs/turn_20240115_143022.log

    Old log files are automatically cleaned up when exceeding max_log_files.
    """

    def __init__(
        self,
        user_dir: FilePath,
        max_log_files: int = DEFAULT_MAX_LOG_FILES,
    ) -> None:
        """Initialize the agent file logger.

        Args:
            user_dir: Path to the user's workspace directory
            max_log_files: Maximum number of log files to keep per user
        """
        self._user_dir = user_dir
        self._logs_dir = user_dir / LOGS_DIRNAME
        self._max_log_files = max_log_files
        self._write_lock = asyncio.Lock()

        # Current turn's log file (set on turn start)
        self._current_log_file: FilePath | None = None
        self._turn_start_time: datetime | None = None

    async def _ensure_logs_dir(self) -> None:
        """Ensure the logs directory exists."""
        await aiofiles.os.makedirs(self._logs_dir, exist_ok=True)

    async def _cleanup_old_logs(self) -> None:
        """Remove old log files if exceeding max_log_files."""
        try:
            if not await aiofiles.os.path.exists(self._logs_dir):
                return

            # List all log files
            entries = await aiofiles.os.listdir(self._logs_dir)
            log_files = sorted([f for f in entries if f.startswith("turn_") and f.endswith(".log")])

            # Remove oldest files if exceeding limit
            files_to_remove = len(log_files) - self._max_log_files
            if files_to_remove > 0:
                for filename in log_files[:files_to_remove]:
                    try:
                        await aiofiles.os.remove(self._logs_dir / filename)
                        logger.debug(f"Removed old agent log: {filename}")
                    except Exception as e:
                        logger.warning(f"Failed to remove old log {filename}: {e}")
        except Exception as e:
            logger.warning(f"Failed to cleanup old agent logs: {e}")

    async def _write(self, entry: str) -> None:
        """Write an entry to the current turn's log file."""
        if self._current_log_file is None:
            return

        async with self._write_lock:
            try:
                async with aiofiles.open(self._current_log_file, "a") as f:
                    await f.write(entry)
            except Exception as e:
                logger.warning(f"Failed to write agent log: {e}")

    def _timestamp(self) -> str:
        """Get current timestamp string."""
        return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

    async def log_turn_start(self, piece_number: int, stroke_count: int) -> None:
        """Log the start of an agent turn. Creates a new log file."""
        await self._ensure_logs_dir()
        await self._cleanup_old_logs()

        # Create new log file for this turn
        self._turn_start_time = datetime.now(UTC)
        filename = f"turn_{self._turn_start_time.strftime('%Y%m%d_%H%M%S')}.log"
        self._current_log_file = self._logs_dir / filename

        entry = (
            f"{'='*60}\n"
            f"AGENT TURN START\n"
            f"{'='*60}\n"
            f"Timestamp: {self._timestamp()}\n"
            f"Piece Number: {piece_number}\n"
            f"Existing Strokes: {stroke_count}\n"
            f"{'='*60}\n\n"
        )
        await self._write(entry)

    async def log_turn_end(self, piece_done: bool, thinking_chars: int) -> None:
        """Log the end of an agent turn."""
        duration = ""
        if self._turn_start_time:
            elapsed = datetime.now(UTC) - self._turn_start_time
            duration = f"\nDuration: {elapsed.total_seconds():.2f}s"

        entry = (
            f"\n{'='*60}\n"
            f"AGENT TURN END\n"
            f"{'='*60}\n"
            f"Timestamp: {self._timestamp()}{duration}\n"
            f"Piece Done: {piece_done}\n"
            f"Thinking Length: {thinking_chars} chars\n"
            f"{'='*60}\n"
        )
        await self._write(entry)

        # Clear current log file after turn ends
        self._current_log_file = None
        self._turn_start_time = None

    async def log_thinking(self, text: str, iteration: int) -> None:
        """Log agent thinking/monologue text."""
        if not text:
            return
        entry = (
            f"\n--- THINKING (iteration {iteration}) ---\n" f"{text}\n" f"--- END THINKING ---\n"
        )
        await self._write(entry)

    async def log_iteration_start(self, current: int, max_iter: int) -> None:
        """Log when a new iteration starts."""
        entry = f"\n[{self._timestamp()}] ITERATION {current}/{max_iter}\n"
        await self._write(entry)

    async def log_code_start(self, iteration: int) -> None:
        """Log when code execution starts."""
        entry = f"[{self._timestamp()}] CODE EXECUTION START (iteration {iteration})\n"
        await self._write(entry)

    async def log_code_result(
        self,
        iteration: int,
        stdout: str | None,
        stderr: str | None,
        return_code: int,
    ) -> None:
        """Log code execution result."""
        entry = f"[{self._timestamp()}] CODE EXECUTION COMPLETE (iteration {iteration})\n"
        entry += f"  Return code: {return_code}\n"
        if stdout:
            entry += f"  Stdout:\n{stdout}\n"
        if stderr:
            entry += f"  Stderr:\n{stderr}\n"
        await self._write(entry)

    async def log_drawing(self, path_count: int) -> None:
        """Log when paths are being drawn."""
        entry = f"[{self._timestamp()}] DRAWING {path_count} paths\n"
        await self._write(entry)

    async def log_error(self, message: str, details: str | None = None) -> None:
        """Log an agent error."""
        entry = f"\n[{self._timestamp()}] ERROR: {message}\n"
        if details:
            entry += f"  Details: {details}\n"
        await self._write(entry)

    async def log_nudge(self, nudges: list[str]) -> None:
        """Log nudges being processed."""
        entry = f"[{self._timestamp()}] NUDGES RECEIVED:\n"
        for nudge in nudges:
            entry += f"  - {nudge}\n"
        await self._write(entry)

    async def log_status_change(self, status: str) -> None:
        """Log status change."""
        entry = f"[{self._timestamp()}] STATUS: {status}\n"
        await self._write(entry)

    async def list_log_files(self) -> list[dict[str, str | int]]:
        """List available log files.

        Returns:
            List of dicts with filename, timestamp, and size
        """
        if not await aiofiles.os.path.exists(self._logs_dir):
            return []

        result: list[dict[str, str | int]] = []
        entries = await aiofiles.os.listdir(self._logs_dir)
        log_files = sorted(
            [f for f in entries if f.startswith("turn_") and f.endswith(".log")],
            reverse=True,  # Most recent first
        )

        for filename in log_files:
            filepath = self._logs_dir / filename
            try:
                stat = await aiofiles.os.stat(filepath)
                modified_iso: str = datetime.fromtimestamp(stat.st_mtime, UTC).isoformat()
                result.append(
                    {
                        "filename": filename,
                        "size": stat.st_size,
                        "modified": modified_iso,
                    }
                )
            except Exception:
                continue

        return result

    async def read_log_file(self, filename: str) -> dict[str, str | bool]:
        """Read a specific log file.

        Args:
            filename: Name of the log file to read

        Returns:
            Dict with content and metadata
        """
        # Security: validate filename to prevent path traversal
        if "/" in filename or "\\" in filename or not filename.startswith("turn_"):
            return {"exists": False, "error": "Invalid filename", "content": ""}

        filepath = self._logs_dir / filename
        if not await aiofiles.os.path.exists(filepath):
            return {"exists": False, "error": "File not found", "content": ""}

        try:
            async with aiofiles.open(filepath) as f:
                content = await f.read()
            return {"exists": True, "content": content}
        except Exception as e:
            return {"exists": True, "error": str(e), "content": ""}

    async def read_latest_logs(self, count: int = 5) -> list[dict[str, str | bool]]:
        """Read the most recent log files.

        Args:
            count: Number of recent log files to read

        Returns:
            List of dicts with filename and content
        """
        files = await self.list_log_files()
        results = []

        for file_info in files[:count]:
            filename = str(file_info["filename"])
            log_data = await self.read_log_file(filename)
            log_data["filename"] = filename
            results.append(log_data)

        return results
