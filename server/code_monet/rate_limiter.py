"""Thread-safe rate limiter using sliding window algorithm."""

import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class RateLimiterConfig:
    """Configuration for rate limiter."""

    max_requests: int
    window_seconds: float = 60.0


@dataclass
class RateLimiter:
    """Thread-safe sliding window rate limiter.

    Tracks requests per key (e.g., user_id) and enforces limits
    within a configurable time window.

    Example:
        limiter = RateLimiter(RateLimiterConfig(max_requests=60, window_seconds=60.0))
        if limiter.is_allowed(user_id):
            # Process request
        else:
            # Reject - rate limited
    """

    config: RateLimiterConfig
    _timestamps: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    _lock: Lock = field(default_factory=Lock)

    def is_allowed(self, key: str, now: float | None = None) -> bool:
        """Check if request is allowed and record it if so.

        Args:
            key: Identifier for the rate limit bucket (e.g., user_id)
            now: Current timestamp (defaults to time.time(), injectable for testing)

        Returns:
            True if request is allowed, False if rate limited
        """
        if now is None:
            now = time.time()

        window_start = now - self.config.window_seconds

        with self._lock:
            # Clean old timestamps
            timestamps = self._timestamps[key]
            self._timestamps[key] = [t for t in timestamps if t > window_start]

            # Check limit
            if len(self._timestamps[key]) >= self.config.max_requests:
                return False

            # Record this request
            self._timestamps[key].append(now)
            return True

    def remaining(self, key: str, now: float | None = None) -> int:
        """Get remaining requests allowed in current window.

        Args:
            key: Identifier for the rate limit bucket
            now: Current timestamp (defaults to time.time())

        Returns:
            Number of requests remaining before rate limit
        """
        if now is None:
            now = time.time()

        window_start = now - self.config.window_seconds

        with self._lock:
            timestamps = self._timestamps[key]
            current_count = sum(1 for t in timestamps if t > window_start)
            return max(0, self.config.max_requests - current_count)

    def reset(self, key: str) -> None:
        """Reset rate limit for a specific key.

        Args:
            key: Identifier to reset
        """
        with self._lock:
            self._timestamps.pop(key, None)

    def reset_all(self) -> None:
        """Reset all rate limits."""
        with self._lock:
            self._timestamps.clear()
