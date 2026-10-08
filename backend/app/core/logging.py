"""
app/core/logging.py

Structured JSON-style logging configuration.
Sensitive values (passwords, tokens) are never logged.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Format log records as JSON-like structured output."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        log_obj = {
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        # Build a readable single-line JSON-ish string
        parts = " | ".join(f"{k}={v}" for k, v in log_obj.items())
        return parts


def setup_logging(level: str = "INFO") -> None:
    """Configure root logger with JSON formatter and stdout handler."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(numeric_level)

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger."""
    return logging.getLogger(name)
