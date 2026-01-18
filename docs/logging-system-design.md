# Logging System Design

Design document for an intentional, structured logging system with CloudWatch integration.

## Current State

### What We Have

| Component | Status | Notes |
|-----------|--------|-------|
| Python logging | Basic | `basicConfig` with simple format, INFO level |
| CloudWatch Agent | Partial | Only collects disk/memory metrics, not logs |
| X-Ray Tracing | Working | OTEL → ADOT Collector → X-Ray |
| Agent file logs | Working | Per-user turn logs in `data/agent_workspace/users/{id}/logs/` |
| Debug endpoints | Working | `/debug/logs`, `/debug/agent-logs` |
| Diagnose script | Working | Only queries X-Ray traces |

### Problems

1. **No structured logging** - Plain text logs are hard to query in CloudWatch
2. **No CloudWatch Logs** - Logs stay in container, lost on restart
3. **No log categories** - All logs mixed together, hard to filter
4. **No centralized log reading** - Must SSH or use debug endpoints
5. **Diagnose script is trace-only** - Can't query application logs

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    Auth     │  │    Agent    │  │  WebSocket  │              │
│  │   Logger    │  │   Logger    │  │   Logger    │  ...         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┴────────────────┘                      │
│                          │                                       │
│                  ┌───────▼───────┐                               │
│                  │ StructuredLog │  JSON formatter               │
│                  │   Handler     │  with log categories          │
│                  └───────┬───────┘                               │
└──────────────────────────┼───────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
      ┌───────▼───────┐       ┌────────▼────────┐
      │    stdout     │       │   Log Files     │
      │  (container)  │       │ /app/data/logs/ │
      └───────┬───────┘       └────────┬────────┘
              │                        │
              └────────────┬───────────┘
                           │
               ┌───────────▼───────────┐
               │   CloudWatch Agent    │
               │  (log group per env)  │
               └───────────┬───────────┘
                           │
               ┌───────────▼───────────┐
               │    CloudWatch Logs    │
               │  /drawing-agent/app   │
               └───────────────────────┘
```

## Log Categories

Define explicit categories for filtering and alerting:

| Category | Logger Name | Purpose | Typical Level |
|----------|-------------|---------|---------------|
| `auth` | `code_monet.auth` | Authentication, sessions, tokens | INFO |
| `agent` | `code_monet.agent` | AI agent turns, tool calls | INFO |
| `websocket` | `code_monet.websocket` | WS connections, messages | INFO |
| `drawing` | `code_monet.drawing` | Canvas operations, paths | DEBUG |
| `workspace` | `code_monet.workspace` | User workspace lifecycle | INFO |
| `system` | `code_monet.system` | Startup, shutdown, config | INFO |
| `http` | `code_monet.http` | HTTP requests (non-WS) | INFO |

## Structured Log Format

### JSON Schema

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "category": "auth",
  "logger": "code_monet.auth.routes",
  "message": "User signed in",
  "user_id": 42,
  "trace_id": "1-abc123...",
  "extra": {
    "email": "user@example.com",
    "method": "magic_link"
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `timestamp` | Yes | ISO 8601 with milliseconds |
| `level` | Yes | DEBUG, INFO, WARNING, ERROR, CRITICAL |
| `category` | Yes | Log category (auth, agent, etc.) |
| `logger` | Yes | Full logger name |
| `message` | Yes | Human-readable message |
| `user_id` | No | User context if available |
| `trace_id` | No | X-Ray trace ID for correlation |
| `extra` | No | Category-specific structured data |

### Implementation

```python
# server/code_monet/logging_config.py
import json
import logging
from datetime import datetime, UTC
from opentelemetry import trace

class StructuredFormatter(logging.Formatter):
    """JSON formatter for CloudWatch compatibility."""

    CATEGORY_MAP = {
        "code_monet.auth": "auth",
        "code_monet.agent": "agent",
        "code_monet.connections": "websocket",
        "code_monet.user_handlers": "websocket",
        "code_monet.orchestrator": "agent",
        "code_monet.tools": "agent",
        "code_monet.workspace_state": "workspace",
        "code_monet.registry": "workspace",
        "code_monet.main": "http",
        "code_monet.shutdown": "system",
        "code_monet.config": "system",
    }

    def format(self, record: logging.LogRecord) -> str:
        # Determine category from logger name
        category = "system"
        for prefix, cat in self.CATEGORY_MAP.items():
            if record.name.startswith(prefix):
                category = cat
                break

        # Get trace ID if available
        span = trace.get_current_span()
        trace_id = None
        if span.is_recording():
            ctx = span.get_span_context()
            trace_id = f"1-{format(ctx.trace_id, '032x')}"

        log_record = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "category": category,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add user_id if present
        if hasattr(record, "user_id"):
            log_record["user_id"] = record.user_id

        # Add trace_id if available
        if trace_id:
            log_record["trace_id"] = trace_id

        # Add extra fields
        extra = {}
        for key, value in record.__dict__.items():
            if key not in logging.LogRecord.__dict__ and not key.startswith("_"):
                extra[key] = value
        if extra:
            log_record["extra"] = extra

        return json.dumps(log_record)
```

## CloudWatch Agent Configuration

Update `infrastructure/user_data.sh` to include log collection:

```json
{
  "metrics": {
    "namespace": "CWAgent",
    "metrics_collected": {
      "disk": {
        "measurement": ["used_percent"],
        "resources": ["/"],
        "metrics_collection_interval": 300
      },
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 300
      }
    },
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}"
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/data/logs/app.log",
            "log_group_name": "/drawing-agent/app",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "multi_line_start_pattern": "^\\{"
          },
          {
            "file_path": "/home/ec2-user/data/logs/error.log",
            "log_group_name": "/drawing-agent/errors",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "multi_line_start_pattern": "^\\{"
          }
        ]
      }
    },
    "log_stream_name": "default"
  }
}
```

## CloudWatch Log Groups

| Log Group | Purpose | Retention |
|-----------|---------|-----------|
| `/drawing-agent/app` | All application logs | 30 days |
| `/drawing-agent/errors` | ERROR and CRITICAL only | 90 days |
| `/drawing-agent/agent` | Agent-specific (filtered) | 14 days |

### Terraform Resources

```hcl
# infrastructure/cloudwatch_logs.tf
resource "aws_cloudwatch_log_group" "app" {
  name              = "/drawing-agent/app"
  retention_in_days = 30

  tags = {
    Name = "drawing-agent-app-logs"
  }
}

resource "aws_cloudwatch_log_group" "errors" {
  name              = "/drawing-agent/errors"
  retention_in_days = 90

  tags = {
    Name = "drawing-agent-error-logs"
  }
}

# Metric filter for error rate alerting
resource "aws_cloudwatch_log_metric_filter" "errors" {
  name           = "error-count"
  pattern        = "{ $.level = \"ERROR\" }"
  log_group_name = aws_cloudwatch_log_group.app.name

  metric_transformation {
    name      = "ErrorCount"
    namespace = "DrawingAgent"
    value     = "1"
  }
}
```

## Scripts and Commands

### Enhanced diagnose.py

Add log querying capabilities to the existing script:

```bash
# Existing trace commands
uv run python scripts/diagnose.py recent [MINUTES]
uv run python scripts/diagnose.py errors [MINUTES]
uv run python scripts/diagnose.py trace TRACE_ID

# New log commands
uv run python scripts/diagnose.py logs [MINUTES] [--category CAT]
uv run python scripts/diagnose.py logs-errors [MINUTES]
uv run python scripts/diagnose.py logs-user USER_ID [MINUTES]
uv run python scripts/diagnose.py logs-search PATTERN [MINUTES]
```

### New /logs Skill

Create `.claude/commands/logs.md`:

```markdown
# Logs

Query application logs from CloudWatch or local files.

## Arguments

`$ARGUMENTS` can be:
- `recent` - Recent application logs (default: last 30 min)
- `errors` - Recent error logs
- `auth` - Authentication-related logs
- `agent` - AI agent logs
- `user <USER_ID>` - Logs for a specific user
- `search <PATTERN>` - Search logs for a pattern

## Commands

### Recent Logs
```bash
uv run python scripts/diagnose.py logs --md
```

### Error Logs
```bash
uv run python scripts/diagnose.py logs-errors --md
```

### User Logs
```bash
uv run python scripts/diagnose.py logs-user 42 --md
```
```

## Log Levels by Environment

| Environment | Default Level | Categories at DEBUG |
|-------------|---------------|---------------------|
| Development | DEBUG | All |
| Staging | INFO | agent, drawing |
| Production | INFO | None (use dynamic) |

### Dynamic Log Level Adjustment

Support changing log levels at runtime via API:

```
POST /debug/log-level
{
  "logger": "code_monet.agent",
  "level": "DEBUG"
}
```

## Migration Plan

### Phase 1: Structured Logging (Week 1)

1. Create `server/code_monet/logging_config.py`
2. Update `main.py` to use structured formatter
3. Add `user_id` context to relevant log calls
4. Test locally with JSON output

### Phase 2: CloudWatch Integration (Week 2)

1. Create Terraform resources for log groups
2. Update CloudWatch agent config in `user_data.sh`
3. Configure log file output in container
4. Deploy and verify logs appear in CloudWatch

### Phase 3: Tooling (Week 3)

1. Add log commands to `diagnose.py`
2. Create `/logs` skill
3. Add CloudWatch Logs Insights queries
4. Document common queries

### Phase 4: Alerting (Week 4)

1. Create metric filters for error rates
2. Add CloudWatch alarms for log-based metrics
3. Document alert response procedures

## CloudWatch Logs Insights Queries

### Common Queries

**Error rate by category:**
```
filter level = "ERROR"
| stats count(*) as errors by category
| sort errors desc
```

**Authentication failures:**
```
filter category = "auth" and level in ["WARNING", "ERROR"]
| fields @timestamp, message, extra.email
| sort @timestamp desc
| limit 50
```

**Agent tool usage:**
```
filter category = "agent" and message like /Tool use/
| parse message "Tool use: *" as tool_name
| stats count(*) as calls by tool_name
| sort calls desc
```

**Slow operations (with trace correlation):**
```
filter trace_id != ""
| fields @timestamp, category, message, trace_id
| sort @timestamp desc
| limit 100
```

**User activity timeline:**
```
filter user_id = 42
| fields @timestamp, category, level, message
| sort @timestamp asc
```

## Security Considerations

1. **PII in logs** - Never log passwords, tokens, or full email addresses
2. **Log retention** - 30 days default, 90 for errors (regulatory compliance)
3. **Access control** - CloudWatch Logs access via IAM only
4. **Encryption** - Logs encrypted at rest (CloudWatch default)

## Cost Estimation

| Component | Monthly Cost (est.) |
|-----------|---------------------|
| CloudWatch Logs ingestion | ~$0.50/GB |
| CloudWatch Logs storage | ~$0.03/GB/month |
| Log Insights queries | ~$0.005/GB scanned |
| **Estimated total** | **$5-15/month** |

Based on ~1GB/day log volume (typical for this application size).
