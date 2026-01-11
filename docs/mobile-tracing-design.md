# Mobile App Tracing Design

## Goal

Complete the distributed tracing flow by collecting traces from the React Native mobile app and correlating them with server-side X-Ray traces.

## Current State

- **Server**: OpenTelemetry → ADOT Collector → AWS X-Ray
- **Mobile**: No tracing

## Approach

Use a lightweight client-side tracing library that sends spans to a server endpoint, which forwards them to X-Ray via the existing OTEL collector.

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Mobile App │────▶│   Server    │────▶│ OTEL Collector│────▶│  X-Ray  │
│  (traces)   │     │ POST /traces│     │   (ADOT)     │     │         │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────┘
```

## Trace Context Propagation

To correlate mobile and server traces:

1. **Mobile generates trace ID** when starting a session
2. **Trace ID passed in WebSocket connection** as header or query param
3. **Server continues the trace** using the mobile-provided trace ID
4. **All server spans inherit** the mobile trace ID

```typescript
// Mobile: Generate trace context
const traceId = generateTraceId(); // 32 hex chars
const spanId = generateSpanId();   // 16 hex chars

// Pass to WebSocket
ws.connect(`wss://server/ws?trace_id=${traceId}`);

// Server: Extract and use trace ID
const traceId = request.query.trace_id;
tracer.startSpan("websocket_session", { traceId });
```

## What to Trace on Mobile

### Session Lifecycle
- `app.launch` - App cold start
- `app.foreground` - App brought to foreground
- `app.background` - App sent to background
- `session.start` - User starts a drawing session
- `session.end` - User ends session

### WebSocket Events
- `ws.connect` - WebSocket connection initiated
- `ws.connected` - WebSocket successfully connected
- `ws.disconnect` - WebSocket disconnected
- `ws.error` - WebSocket error
- `ws.message.send` - Message sent (type, size)
- `ws.message.receive` - Message received (type, size)

### User Interactions
- `canvas.touch` - Canvas touch event (start/move/end)
- `action.pause` - User paused agent
- `action.resume` - User resumed agent
- `action.clear` - User cleared canvas
- `action.nudge` - User sent nudge

### Errors
- `error.js` - JavaScript errors
- `error.network` - Network failures
- `error.render` - Render failures

## Implementation

### 1. Tracing Utility (`app/src/utils/tracing.ts`)

```typescript
import { Platform } from 'react-native';

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}

class Tracer {
  private traceId: string;
  private spans: Span[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.traceId = this.generateTraceId();
    this.apiUrl = apiUrl;
  }

  private generateTraceId(): string {
    // 32 hex characters
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateSpanId(): string {
    // 16 hex characters
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  getTraceId(): string {
    return this.traceId;
  }

  startSpan(name: string, attributes: Record<string, any> = {}): Span {
    const span: Span = {
      traceId: this.traceId,
      spanId: this.generateSpanId(),
      name,
      startTime: Date.now(),
      attributes: {
        ...attributes,
        'device.platform': Platform.OS,
        'device.version': Platform.Version,
      },
      status: 'ok',
    };
    return span;
  }

  endSpan(span: Span, error?: Error): void {
    span.endTime = Date.now();
    if (error) {
      span.status = 'error';
      span.error = error.message;
    }
    this.spans.push(span);
  }

  // Quick span for instant events
  recordEvent(name: string, attributes: Record<string, any> = {}): void {
    const span = this.startSpan(name, attributes);
    this.endSpan(span);
  }

  // Start periodic flushing
  startAutoFlush(intervalMs: number = 10000): void {
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }

  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  async flush(): Promise<void> {
    if (this.spans.length === 0) return;

    const spansToSend = [...this.spans];
    this.spans = [];

    try {
      await fetch(`${this.apiUrl}/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spans: spansToSend }),
      });
    } catch (e) {
      // Re-add spans on failure
      this.spans = [...spansToSend, ...this.spans];
    }
  }

  // New session (e.g., after clear canvas)
  newSession(): void {
    this.flush();
    this.traceId = this.generateTraceId();
  }
}

export const tracer = new Tracer(process.env.EXPO_PUBLIC_API_URL || '');
```

### 2. Server Endpoint (`server/drawing_agent/main.py`)

```python
from pydantic import BaseModel
from opentelemetry import trace
from opentelemetry.trace import SpanKind

class ClientSpan(BaseModel):
    traceId: str
    spanId: str
    parentSpanId: str | None = None
    name: str
    startTime: int  # Unix ms
    endTime: int | None = None
    attributes: dict[str, str | int | bool] = {}
    status: str = "ok"
    error: str | None = None

class TracesRequest(BaseModel):
    spans: list[ClientSpan]

@app.post("/traces")
async def receive_traces(request: TracesRequest):
    """Receive traces from mobile client and forward to OTEL."""
    tracer = trace.get_tracer("mobile-client")

    for span_data in request.spans:
        # Convert to OTEL span
        with tracer.start_span(
            span_data.name,
            kind=SpanKind.CLIENT,
            attributes=span_data.attributes,
        ) as span:
            if span_data.error:
                span.set_status(trace.Status(trace.StatusCode.ERROR, span_data.error))

    return {"received": len(request.spans)}
```

### 3. WebSocket Trace Propagation

```typescript
// In useWebSocket.ts
import { tracer } from '../utils/tracing';

export function useWebSocket() {
  const connect = useCallback(() => {
    const traceId = tracer.getTraceId();
    const url = `${WS_URL}?token=${token}&trace_id=${traceId}`;

    tracer.recordEvent('ws.connect', { url: WS_URL });

    const ws = new WebSocket(url);

    ws.onopen = () => {
      tracer.recordEvent('ws.connected');
    };

    ws.onclose = (event) => {
      tracer.recordEvent('ws.disconnect', {
        code: event.code,
        reason: event.reason
      });
    };

    ws.onerror = (error) => {
      tracer.recordEvent('ws.error', { error: String(error) });
    };
  }, [token]);
}
```

### 4. Server-side: Extract Mobile Trace ID

```python
# In websocket handler
async def websocket_endpoint(websocket: WebSocket, token: str, trace_id: str | None = None):
    # If mobile provided trace_id, use it for this session
    if trace_id:
        # Set trace context from mobile
        context = trace.set_span_in_context(
            trace.NonRecordingSpan(
                trace.SpanContext(
                    trace_id=int(trace_id, 16),
                    span_id=generate_span_id(),
                    is_remote=True,
                )
            )
        )
        token = context.attach(context)

    try:
        # All spans created here will use mobile's trace_id
        with tracer.start_span("websocket_session"):
            await handle_websocket(websocket)
    finally:
        if trace_id:
            context.detach(token)
```

## Data Model

Spans sent to server:

```json
{
  "spans": [
    {
      "traceId": "abc123...",
      "spanId": "def456...",
      "name": "ws.connect",
      "startTime": 1704931200000,
      "endTime": 1704931200050,
      "attributes": {
        "device.platform": "ios",
        "device.version": "17.2"
      },
      "status": "ok"
    }
  ]
}
```

## Privacy Considerations

- No PII in traces (no user IDs, emails, etc.)
- Only record event types, not content
- Canvas touches recorded as counts, not coordinates
- Message types recorded, not message content

## Rollout Plan

1. **Phase 1**: Add tracing utility and flush mechanism
2. **Phase 2**: Add server `/traces` endpoint
3. **Phase 3**: Instrument WebSocket lifecycle
4. **Phase 4**: Instrument user actions
5. **Phase 5**: Add trace context propagation for correlation

## Alternatives Considered

1. **Sentry** - Good RN support but separate system from X-Ray
2. **AWS Amplify Analytics** - Heavy dependency, different data model
3. **OpenTelemetry JS SDK** - Not well-suited for React Native yet
4. **Direct X-Ray API** - Requires AWS credentials on client (security risk)

The custom lightweight approach was chosen because:
- Minimal dependencies
- Uses existing OTEL collector infrastructure
- Full control over what's traced
- Easy to extend
