"""Structured logging configuration for CloudWatch compatibility.

Provides JSON-formatted logs with:
- Category detection (auth, agent, websocket, workspace, system, http)
- trace_id injection from OpenTelemetry
- user_id context when available
- Structured JSON output for CloudWatch Logs Insights
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import TextIO


class StructuredFormatter(logging.Formatter):
    """JSON formatter for CloudWatch compatibility."""

    # Map logger names to categories
    CATEGORY_MAP = {
        "code_monet.auth": "auth",
        "code_monet.agent": "agent",
        "code_monet.connections": "websocket",
        "code_monet.user_handlers": "websocket",
        "code_monet.orchestrator": "agent",
        "code_monet.tools": "agent",
        "code_monet.workspace_state": "workspace",
        "code_monet.workspace": "workspace",
        "code_monet.registry": "workspace",
        "code_monet.main": "http",
        "code_monet.routes": "http",
        "code_monet.shutdown": "system",
        "code_monet.config": "system",
        "code_monet.tracing": "system",
        "code_monet.share": "http",
        "uvicorn": "http",
        "fastapi": "http",
    }

    # Standard LogRecord fields to exclude from 'extra'
    STANDARD_FIELDS = {
        "name",
        "msg",
        "args",
        "created",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "exc_info",
        "exc_text",
        "thread",
        "threadName",
        "taskName",
        "message",
        # Also exclude our custom fields we handle explicitly
        "user_id",
        "trace_id",
    }

    def _get_category(self, logger_name: str) -> str:
        """Determine category from logger name."""
        for prefix, cat in self.CATEGORY_MAP.items():
            if logger_name.startswith(prefix):
                return cat
        return "system"

    def _get_trace_id(self) -> str | None:
        """Get trace ID from OpenTelemetry if available."""
        try:
            from opentelemetry import trace

            span = trace.get_current_span()
            if span.is_recording():
                ctx = span.get_span_context()
                # Format as X-Ray trace ID format
                return f"1-{format(ctx.trace_id, '032x')}"
        except Exception:
            pass
        return None

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        # Determine category from logger name
        category = self._get_category(record.name)

        # Build base log record
        log_record: dict = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "category": category,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add user_id if present
        if hasattr(record, "user_id") and record.user_id is not None:
            log_record["user_id"] = record.user_id

        # Add trace_id if available (from record or OpenTelemetry)
        trace_id = getattr(record, "trace_id", None) or self._get_trace_id()
        if trace_id:
            log_record["trace_id"] = trace_id

        # Collect extra fields
        extra = {}
        for key, value in record.__dict__.items():
            if key not in self.STANDARD_FIELDS and not key.startswith("_"):
                # Try to serialize, skip if not serializable
                try:
                    json.dumps(value)
                    extra[key] = value
                except (TypeError, ValueError):
                    extra[key] = str(value)
        if extra:
            log_record["extra"] = extra

        # Add exception info if present
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)


class ErrorFilter(logging.Filter):
    """Filter that only allows ERROR and CRITICAL level logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.ERROR


def configure_logging(
    *,
    json_format: bool = True,
    log_level: int = logging.INFO,
    log_file: str | None = None,
    error_log_file: str | None = None,
    stream: TextIO | None = None,
) -> None:
    """Configure application logging.

    Args:
        json_format: Use JSON formatting (True for production, False for dev)
        log_level: Minimum log level
        log_file: Path to main log file (None for stdout only)
        error_log_file: Path to error-only log file (None to skip)
        stream: Stream to write to (default: sys.stderr)
    """
    import sys

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create formatter
    formatter: logging.Formatter
    if json_format:
        formatter = StructuredFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)5s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        )

    # Stream handler (stdout/stderr)
    stream_handler = logging.StreamHandler(stream or sys.stderr)
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)

    # File handler for all logs
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=100 * 1024 * 1024,  # 100MB
            backupCount=7,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Separate error log file
    if error_log_file:
        error_path = Path(error_log_file)
        error_path.parent.mkdir(parents=True, exist_ok=True)
        error_handler = RotatingFileHandler(
            error_log_file,
            maxBytes=100 * 1024 * 1024,  # 100MB
            backupCount=14,  # Keep longer for errors
            encoding="utf-8",
        )
        error_handler.setFormatter(formatter)
        error_handler.addFilter(ErrorFilter())
        root_logger.addHandler(error_handler)

    # Silence noisy loggers
    noisy_loggers = [
        "watchfiles",
        "httpcore",
        "httpx",
        "anthropic",
        "PIL",
        "urllib3",
        "botocore",
        "boto3",
    ]
    for name in noisy_loggers:
        logging.getLogger(name).setLevel(logging.WARNING)


def setup_production_logging() -> None:
    """Configure logging for production (inside Docker container)."""
    configure_logging(
        json_format=True,
        log_level=logging.INFO,
        log_file="/app/data/logs/app.log",
        error_log_file="/app/data/logs/error.log",
    )


def setup_dev_logging() -> None:
    """Configure logging for development (human-readable format)."""
    # In dev, use JSON format only if LOG_JSON=true
    use_json = os.getenv("LOG_JSON", "false").lower() == "true"
    configure_logging(
        json_format=use_json,
        log_level=logging.INFO,
        log_file=None,  # stdout only in dev
        error_log_file=None,
    )
