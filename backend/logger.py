"""Structured logging setup using loguru.

Two sinks:
  - stderr  → INFO+, human-readable (for development / systemd journald)
  - logs/app.jsonl → DEBUG+, JSONL machine-readable, 10 MB rotation, 7-day retention
"""

import re
import sys
from pathlib import Path

from loguru import logger

# ── Secret redaction patterns (defense-in-depth backstop) ─────────────────────
_REDACT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)(api[_-]?key|service[_-]?key)\s*[=:]\s*\S+"), r"\1=[REDACTED]"),
    (re.compile(r"eyJ[a-zA-Z0-9._-]{20,}"), "[REDACTED_JWT]"),
]

_LOG_DIR = Path(__file__).parent.parent / "logs"


def _redact(record: dict) -> bool:  # type: ignore[type-arg]
    """Loguru filter: redact secrets from the message before writing."""
    for pattern, replacement in _REDACT_PATTERNS:
        record["message"] = pattern.sub(replacement, record["message"])
    return True


def setup_logger() -> None:
    """Configure loguru sinks. Call once at application startup."""
    logger.remove()  # Remove default sink

    # Sink 1 — stderr, human-readable for development
    logger.add(
        sys.stderr,
        level="INFO",
        format=(
            "<green>{time:HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan> — {message}"
        ),
        filter=_redact,
        colorize=True,
    )

    # Sink 2 — JSONL file, machine-readable for post-mortem analysis
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger.add(
        str(_LOG_DIR / "app.jsonl"),
        level="DEBUG",
        serialize=True,          # loguru native JSONL serialization
        filter=_redact,
        rotation="10 MB",
        retention="7 days",
        compression="gz",
        enqueue=False,            # sync writes — simple service, no high throughput
    )

    logger.info("Logger initialized — JSONL sink: {}", _LOG_DIR / "app.jsonl")
