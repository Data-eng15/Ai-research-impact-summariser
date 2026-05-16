from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .models import TraceLog


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def log(agent: str, message: str, **data: Any) -> TraceLog:
    return TraceLog(timestamp=now_iso(), agent=agent, message=message, data=data)

