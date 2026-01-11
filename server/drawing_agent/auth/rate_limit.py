"""Simple in-memory rate limiting for auth endpoints."""

import time
from collections import defaultdict
from threading import Lock
from typing import NamedTuple


class RateLimitConfig(NamedTuple):
    """Rate limit configuration."""

    max_requests: int
    window_seconds: int


class RateLimiter:
    """Simple in-memory rate limiter.

    Tracks requests per key (e.g., IP or email) within a sliding window.
    Thread-safe for use with async endpoints.
    """

    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def is_allowed(self, key: str, config: RateLimitConfig) -> bool:
        """Check if a request is allowed for the given key.

        Returns True if allowed, False if rate limited.
        """
        now = time.time()
        window_start = now - config.window_seconds

        with self._lock:
            # Clean old entries
            self._requests[key] = [t for t in self._requests[key] if t > window_start]

            # Check if under limit
            if len(self._requests[key]) >= config.max_requests:
                return False

            # Record this request
            self._requests[key].append(now)
            return True

    def reset(self, key: str) -> None:
        """Reset rate limit for a key."""
        with self._lock:
            self._requests.pop(key, None)

    def cleanup(self) -> None:
        """Remove all expired entries."""
        now = time.time()
        with self._lock:
            empty_keys = [k for k, v in self._requests.items() if not v or max(v) < now - 3600]
            for k in empty_keys:
                del self._requests[k]


# Global rate limiter instance
rate_limiter = RateLimiter()

# Rate limit configs
MAGIC_LINK_BY_EMAIL = RateLimitConfig(max_requests=3, window_seconds=900)  # 3 per 15 min per email
MAGIC_LINK_BY_IP = RateLimitConfig(max_requests=10, window_seconds=60)  # 10 per min per IP
TRACES_BY_IP = RateLimitConfig(max_requests=60, window_seconds=60)  # 60 per min per IP (1/sec avg)
