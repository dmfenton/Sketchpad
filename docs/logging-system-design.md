# Logging System Design

Design document for an intentional, structured logging system.

## Approach Options

### Option A: CloudWatch Logs (AWS-managed)
- Logs go to CloudWatch via CloudWatch Agent
- Query with Logs Insights
- Pay per GB ingested (~$0.50/GB)
- Best for: AWS-native, minimal ops

### Option B: Postgres + Grafana (Self-hosted)
- Logs stored in existing Postgres instance
- Visualize with Grafana (also works with X-Ray)
- No additional AWS costs
- Best for: Cost-conscious, full control

### Option C: Loki + Grafana (Self-hosted, scalable)
- Loki for log aggregation (efficient, label-based)
- Grafana for visualization
- Best for: High log volume, Prometheus ecosystem

**Recommended: Option B** - Leverages existing Postgres, adds Grafana for unified observability.

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

## Proposed Architecture (Option B: Postgres + Grafana)

Leverages existing Postgres instance running for Umami analytics.

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
│                  │ StructuredLog │  JSON + DB handler            │
│                  │   Handler     │  with log categories          │
│                  └───────┬───────┘                               │
└──────────────────────────┼───────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────▼───────┐    │    ┌───────▼───────┐
      │    stdout     │    │    │  PostgreSQL   │
      │  (container)  │    │    │  (logs table) │
      └───────────────┘    │    └───────┬───────┘
                           │            │
               ┌───────────▼───────┐    │
               │    X-Ray Traces   │    │
               │  (via ADOT/OTEL)  │    │
               └───────────┬───────┘    │
                           │            │
                   ┌───────┴────────────┘
                   │
           ┌───────▼───────┐
           │    Grafana    │  ← Unified dashboard
           │  (logs + traces) │
           └───────────────┘
```

### Benefits of This Approach

1. **No new costs** - Uses existing Postgres instance
2. **Unified UI** - Grafana shows logs, traces, and metrics in one place
3. **Full SQL** - Query logs with familiar SQL syntax
4. **Self-hosted** - Data stays on your infrastructure
5. **Grafana ecosystem** - Alerting, dashboards, sharing

### Services Added

| Service | Image | Purpose | Memory |
|---------|-------|---------|--------|
| Grafana | `grafana/grafana-oss` | Visualization | ~100MB |
| (optional) Loki | `grafana/loki` | Log aggregation | ~200MB |

## Alternative: CloudWatch Architecture

For AWS-managed logging (higher cost, less ops):

```
┌──────────────────────────────────────┐
│           Application                │
│  ┌─────────────────────────────────┐ │
│  │     Structured JSON Logger      │ │
│  └──────────────┬──────────────────┘ │
└─────────────────┼────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐         ┌───────▼───────┐
│  stdout   │         │  Log Files    │
└─────┬─────┘         └───────┬───────┘
      │                       │
      └───────────┬───────────┘
                  │
      ┌───────────▼───────────┐
      │   CloudWatch Agent    │
      └───────────┬───────────┘
                  │
      ┌───────────▼───────────┐
      │   CloudWatch Logs     │
      │  (Logs Insights)      │
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

## Postgres + Grafana Implementation (Option B)

### 1. Database Schema

Create a `logs` database in the existing Postgres instance:

```sql
-- Run in umami-db container or via init script
CREATE DATABASE logs;

\c logs

CREATE TABLE app_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level VARCHAR(10) NOT NULL,
    category VARCHAR(20) NOT NULL,
    logger VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    user_id INTEGER,
    trace_id VARCHAR(50),
    extra JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_logs_timestamp ON app_logs(timestamp DESC);
CREATE INDEX idx_logs_level ON app_logs(level) WHERE level IN ('ERROR', 'WARNING', 'CRITICAL');
CREATE INDEX idx_logs_category ON app_logs(category);
CREATE INDEX idx_logs_user_id ON app_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_logs_trace_id ON app_logs(trace_id) WHERE trace_id IS NOT NULL;

-- Automatic cleanup: delete logs older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_logs() RETURNS void AS $$
BEGIN
    DELETE FROM app_logs WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron or external cron
```

### 2. Python Database Log Handler

```python
# server/code_monet/logging_db.py
import asyncio
import logging
from datetime import datetime, UTC
from typing import Any
import asyncpg

class PostgresLogHandler(logging.Handler):
    """Async handler that writes logs to PostgreSQL."""

    def __init__(self, dsn: str, batch_size: int = 50, flush_interval: float = 1.0):
        super().__init__()
        self.dsn = dsn
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self._buffer: list[dict[str, Any]] = []
        self._pool: asyncpg.Pool | None = None
        self._flush_task: asyncio.Task | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(self.dsn, min_size=1, max_size=5)
        self._flush_task = asyncio.create_task(self._periodic_flush())

    async def close(self) -> None:
        if self._flush_task:
            self._flush_task.cancel()
        await self._flush_buffer()
        if self._pool:
            await self._pool.close()

    def emit(self, record: logging.LogRecord) -> None:
        log_entry = {
            "timestamp": datetime.now(UTC),
            "level": record.levelname,
            "category": getattr(record, "category", "system"),
            "logger": record.name,
            "message": record.getMessage(),
            "user_id": getattr(record, "user_id", None),
            "trace_id": getattr(record, "trace_id", None),
            "extra": getattr(record, "extra", None),
        }
        self._buffer.append(log_entry)

        if len(self._buffer) >= self.batch_size:
            asyncio.create_task(self._flush_buffer())

    async def _periodic_flush(self) -> None:
        while True:
            await asyncio.sleep(self.flush_interval)
            await self._flush_buffer()

    async def _flush_buffer(self) -> None:
        if not self._buffer or not self._pool:
            return

        logs, self._buffer = self._buffer, []

        async with self._pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO app_logs (timestamp, level, category, logger, message, user_id, trace_id, extra)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                [
                    (
                        log["timestamp"],
                        log["level"],
                        log["category"],
                        log["logger"],
                        log["message"],
                        log["user_id"],
                        log["trace_id"],
                        log["extra"],
                    )
                    for log in logs
                ],
            )
```

### 3. Docker Compose Additions

Add Grafana to `deploy/docker-compose.prod.yml`:

```yaml
  # Logging database (shares Postgres with Umami but separate DB)
  # Uses same umami-db container, just create 'logs' database

  grafana:
    image: grafana/grafana-oss:latest
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}
      - GF_SERVER_ROOT_URL=https://monet.dmfenton.net/grafana/
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
      - GF_INSTALL_PLUGINS=grafana-clock-panel
    volumes:
      - ./grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      umami-db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-network
```

### 4. Grafana Data Source Configuration

Create `deploy/grafana/provisioning/datasources/datasources.yml`:

```yaml
apiVersion: 1

datasources:
  # Application logs in Postgres
  - name: Logs
    type: postgres
    url: umami-db:5432
    database: logs
    user: umami
    secureJsonData:
      password: ${UMAMI_DB_PASSWORD}
    jsonData:
      sslmode: disable
      maxOpenConns: 5
      maxIdleConns: 2

  # X-Ray traces (via CloudWatch data source)
  - name: X-Ray
    type: grafana-x-ray-datasource
    jsonData:
      defaultRegion: us-east-1
```

### 5. Grafana Dashboard (Provisioned)

Create `deploy/grafana/provisioning/dashboards/logs.json`:

```json
{
  "title": "Application Logs",
  "panels": [
    {
      "title": "Log Volume",
      "type": "timeseries",
      "targets": [
        {
          "rawSql": "SELECT date_trunc('minute', timestamp) as time, count(*) FROM app_logs WHERE $__timeFilter(timestamp) GROUP BY 1 ORDER BY 1"
        }
      ]
    },
    {
      "title": "Errors by Category",
      "type": "piechart",
      "targets": [
        {
          "rawSql": "SELECT category, count(*) FROM app_logs WHERE level IN ('ERROR', 'CRITICAL') AND $__timeFilter(timestamp) GROUP BY category"
        }
      ]
    },
    {
      "title": "Recent Logs",
      "type": "table",
      "targets": [
        {
          "rawSql": "SELECT timestamp, level, category, user_id, message FROM app_logs WHERE $__timeFilter(timestamp) ORDER BY timestamp DESC LIMIT 100"
        }
      ]
    }
  ]
}
```

### 6. Nginx Route for Grafana

Add to `deploy/nginx.conf`:

```nginx
location /grafana/ {
    proxy_pass http://grafana:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### 7. Environment Variables

Add to production `.env`:

```bash
# Grafana
GRAFANA_ADMIN_PASSWORD=<generate secure password>

# Logs database uses same credentials as Umami
# UMAMI_DB_PASSWORD already configured
```

### Accessing Grafana

- **URL**: `https://monet.dmfenton.net/grafana/`
- **Default login**: admin / (GRAFANA_ADMIN_PASSWORD)
- **Dashboards**: Application Logs, X-Ray Traces

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

### Phase 1: Structured Logging (Common)

1. Create `server/code_monet/logging_config.py` with JSON formatter
2. Update `main.py` to use structured formatter
3. Add `user_id` context to relevant log calls
4. Test locally with JSON output

### Phase 2A: Postgres + Grafana (Recommended)

1. Create `logs` database in existing Postgres container
2. Add `logging_db.py` with PostgresLogHandler
3. Add Grafana to docker-compose
4. Configure Grafana data sources (Postgres + X-Ray)
5. Create initial dashboards
6. Update nginx for `/grafana/` route
7. Deploy and verify logs in Grafana

### Phase 2B: CloudWatch (Alternative)

1. Create Terraform resources for log groups
2. Update CloudWatch agent config in `user_data.sh`
3. Configure log file output in container
4. Deploy and verify logs appear in CloudWatch

### Phase 3: Tooling

1. Add log commands to `diagnose.py` (supports both backends)
2. Update `/logs` skill
3. Document common queries (SQL for Grafana, Insights for CloudWatch)

### Phase 4: Alerting

**Grafana path:**
1. Configure Grafana alerting rules
2. Set up notification channels (email, Slack)
3. Create alert dashboard

**CloudWatch path:**
1. Create metric filters for error rates
2. Add CloudWatch alarms for log-based metrics
3. Document alert response procedures

## Grafana SQL Queries (for Postgres backend)

### Common Queries

**Error rate by category:**
```sql
SELECT category, count(*) as errors
FROM app_logs
WHERE level IN ('ERROR', 'CRITICAL')
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY category
ORDER BY errors DESC;
```

**Authentication failures:**
```sql
SELECT timestamp, message, extra->>'email' as email
FROM app_logs
WHERE category = 'auth'
  AND level IN ('WARNING', 'ERROR')
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;
```

**Agent tool usage:**
```sql
SELECT
  substring(message FROM 'Tool use: (.+)') as tool_name,
  count(*) as calls
FROM app_logs
WHERE category = 'agent'
  AND message LIKE 'Tool use:%'
  AND timestamp > NOW() - INTERVAL '1 day'
GROUP BY tool_name
ORDER BY calls DESC;
```

**User activity timeline:**
```sql
SELECT timestamp, category, level, message
FROM app_logs
WHERE user_id = 42
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp ASC;
```

**Logs with trace correlation:**
```sql
SELECT timestamp, category, message, trace_id
FROM app_logs
WHERE trace_id IS NOT NULL
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 100;
```

**Log volume over time (for time series panel):**
```sql
SELECT
  date_trunc('minute', timestamp) as time,
  level,
  count(*) as count
FROM app_logs
WHERE $__timeFilter(timestamp)
GROUP BY time, level
ORDER BY time;
```

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
