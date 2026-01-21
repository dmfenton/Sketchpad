# Diagnose

Query production observability: X-Ray traces and CloudWatch logs.

## Arguments

`$ARGUMENTS` can be:

**Traces (X-Ray):**

- `errors` - Error/fault traces (default)
- `recent` - All recent traces
- `trace <ID>` - Full trace details with stack traces
- `path <URL>` - Traces for specific endpoint
- `status` - Quick service health check

**Logs (CloudWatch):**

- `logs` - Recent application logs
- `logs errors` - Error/warning logs only
- `logs auth` - Authentication logs
- `logs agent` - Agent activity logs
- `logs user <ID>` - Logs for specific user
- `logs search <PATTERN>` - Search logs

## Quick Reference

| Command                        | Description                |
| ------------------------------ | -------------------------- |
| `/diagnose`                    | Error traces (default)     |
| `/diagnose status`             | Service health check       |
| `/diagnose trace <ID>`         | Full trace with stack trace|
| `/diagnose logs`               | Recent application logs    |
| `/diagnose logs errors`        | Error/warning logs         |
| `/diagnose logs auth`          | Authentication events      |
| `/diagnose logs agent`         | Agent tool calls and turns |
| `/diagnose logs user 42`       | All logs for user ID 42    |
| `/diagnose logs search "text"` | Search for pattern         |

## Commands

### Error Traces (Default)

```bash
uv run python scripts/diagnose.py errors --md
```

Shows only traces with errors or faults from the last hour.

### Service Status

```bash
uv run python scripts/diagnose.py status --md
```

Quick health check showing traffic summary from the last 5 minutes.

### Recent Traces

```bash
uv run python scripts/diagnose.py recent --md
```

Shows all traces from the last 30 minutes with:

- Trace ID
- HTTP method and URL
- Response status
- Duration
- Error/fault status

### Full Trace Details

```bash
uv run python scripts/diagnose.py trace <TRACE_ID> --md
```

Shows full trace details including:

- All segments (service boundaries)
- HTTP request/response details
- Exception stack traces
- Annotations and metadata

### Endpoint Traces

```bash
uv run python scripts/diagnose.py path /auth/verify --md
```

Shows traces for a specific API endpoint.

### Application Logs

For **local development** (server running locally):

```bash
curl -s "http://localhost:8000/debug/logs?lines=100"
```

For **production** (CloudWatch Logs):

```bash
uv run python scripts/diagnose.py logs --md
```

### Error Logs

Local:

```bash
curl -s "http://localhost:8000/debug/logs?lines=200" | grep -E "(ERROR|WARNING)"
```

Production:

```bash
uv run python scripts/diagnose.py logs-errors --md
```

### Category-Specific Logs

**Authentication logs:**

```bash
uv run python scripts/diagnose.py logs --category auth --md
```

**Agent logs:**

```bash
uv run python scripts/diagnose.py logs --category agent --md
```

**WebSocket logs:**

```bash
uv run python scripts/diagnose.py logs --category websocket --md
```

### User-Specific Logs

```bash
uv run python scripts/diagnose.py logs-user <USER_ID> --md
```

Shows all activity for a specific user across all categories.

### Search Logs

```bash
uv run python scripts/diagnose.py logs-search "magic link" --md
```

Searches log messages for the given pattern.

## Workflow: Debug a 500 Error

1. Get error traces: `/diagnose`
2. Find the trace ID from the relevant error
3. Get full details: `/diagnose trace <ID>`
4. Check logs around that time: `/diagnose logs errors`

## Correlating Logs with Traces

Logs include `trace_id` for correlation with X-Ray traces:

1. Find error in logs: `/diagnose logs errors`
2. Get the `trace_id` from the log entry
3. View trace details: `/diagnose trace <TRACE_ID>`

## Local Development

For local dev, use debug endpoints directly:

```bash
curl -s "localhost:8000/debug/logs?lines=50"
curl -s localhost:8000/debug/agent
```

## CloudWatch Logs Insights

For complex queries, use CloudWatch Logs Insights in the AWS Console.

**Log groups:**

- `/drawing-agent/app` - All application logs
- `/drawing-agent/errors` - Errors only (longer retention)

**Example queries:**

Error rate by category:

```
filter level = "ERROR"
| stats count(*) as errors by category
| sort errors desc
```

Authentication failures:

```
filter category = "auth" and level in ["WARNING", "ERROR"]
| fields @timestamp, message, extra.email
| sort @timestamp desc
| limit 50
```

## Prerequisites

- AWS credentials configured (local profile or instance role)
- X-Ray read permissions (AWSXRayReadOnlyAccess)
- CloudWatch Logs read permissions
- Tracing enabled on server (OTEL_ENABLED=true)

## Troubleshooting

### No traces found

- Check that OTEL_ENABLED=true in production
- Verify ADOT collector is running: `docker ps | grep otel`
- Check collector logs: `docker logs otel-collector`

### No logs appearing

**Local:**

- Check server is running: `curl localhost:8000/health`
- Check log file exists: `ls server/logs/`
- Server may be writing to stdout only

**Production:**

- Check CloudWatch agent: `systemctl status amazon-cloudwatch-agent`
- Check log file permissions
- Verify log group exists in CloudWatch console

### Permission denied

Ensure IAM user/role has `xray:GetTraceSummaries`, `xray:BatchGetTraces`, and CloudWatch Logs permissions.
