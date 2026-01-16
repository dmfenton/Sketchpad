# Server - Python Standards

Backend-specific guidance for the Code Monet server.

## Type Safety

### No `Any` - Use Specific Types

```python
# Bad
def process(data: Any) -> Any:
    ...

# Good
def process(data: PendingStrokeDict) -> list[Path]:
    ...
```

### Use TypedDict for Dictionary Structures

When passing dicts between functions, define the shape:

```python
# In types.py
class PendingStrokeDict(TypedDict):
    batch_id: int
    path: dict[str, Any]  # Serialized Pydantic model is ok
    points: list[PointDict]

# Usage
def queue_strokes(self) -> list[PendingStrokeDict]:
    ...
```

### Forward References

Use `from __future__ import annotations` to avoid string quotes:

```python
from __future__ import annotations

class Foo:
    def method(self) -> Foo:  # No quotes needed
        ...
```

## Async Patterns

### Use asyncio.Lock for Shared State

```python
class WorkspaceState:
    def __init__(self):
        self._lock = asyncio.Lock()

    async def modify(self):
        async with self._lock:
            # Safe to modify
            ...
```

### Event-Driven Wake-up (Not Polling)

Replace `asyncio.sleep()` polling with `asyncio.Event`:

```python
# Bad - wastes resources, adds latency
while True:
    if should_run():
        await do_work()
    await asyncio.sleep(10)  # 10 second delay!

# Good - immediate wake-up
self._wake_event = asyncio.Event()

async def run_loop(self):
    while True:
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._wake_event.wait(), timeout=10)
        self._wake_event.clear()
        if should_run():
            await do_work()

def wake(self):
    self._wake_event.set()
```

### CPU-Bound Work to Thread Pool

```python
# Bad - blocks event loop
image_data = render_image(canvas)

# Good - runs in thread pool
image_data = await asyncio.to_thread(render_image, canvas)
```

## Rate Limiting

Use the `RateLimiter` class for any per-user limits:

```python
from drawing_agent.rate_limiter import RateLimiter, RateLimiterConfig

limiter = RateLimiter(RateLimiterConfig(
    max_requests=60,
    window_seconds=60.0,
))

if not limiter.is_allowed(user_id):
    raise RateLimitError()
```

## Data Models

### Pydantic for External Data

Use Pydantic models for:
- API request/response bodies
- WebSocket messages
- Persisted data (JSON files)

```python
class Path(BaseModel):
    type: PathType
    points: list[Point]
```

### Dataclass for Internal State

Use dataclass for internal orchestration:

```python
@dataclass
class AgentOrchestrator:
    agent: DrawingAgent
    broadcaster: Broadcaster
    _wake_event: asyncio.Event = field(default_factory=asyncio.Event)
```

## Testing

### New Features Need Tests

Every new class/function needs tests. Check existing patterns:
- `test_rate_limiter.py` - Unit tests for utility classes
- `test_orchestrator_wake.py` - Async tests with mocks
- `test_workspace_limits.py` - Integration tests with tmp_path

### Test Structure

```python
class TestFeatureName:
    """Group related tests."""

    @pytest.mark.asyncio
    async def test_specific_behavior(self) -> None:
        """Describe expected behavior."""
        # Arrange
        ...
        # Act
        ...
        # Assert
        ...
```

### Injectable Time for Rate Limiters

```python
# Make time injectable for testing
def is_allowed(self, key: int, now: float | None = None) -> bool:
    if now is None:
        now = time.time()
    ...

# In tests
assert limiter.is_allowed(user_id, now=0.0)
assert limiter.is_allowed(user_id, now=61.0)  # After window
```

## Error Handling

### Provide Context

```python
# Bad
raise ValueError("Invalid")

# Good
raise ValueError(f"Invalid user_id: {user_id}, must be positive integer")
```

### Log Before Raising

```python
logger.warning(f"User {user_id}: rate limited ({remaining} remaining)")
raise RateLimitError(...)
```

## File Organization

| Type | Location |
|------|----------|
| Pydantic models, TypedDicts, Enums | `types.py` |
| Configuration | `config.py` |
| Reusable utilities | New file (e.g., `rate_limiter.py`) |
| WebSocket handlers | `user_handlers.py` |
| Tests | `tests/test_<module>.py` |
