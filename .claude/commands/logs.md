# Logs

Query application logs from CloudWatch Logs or the local debug endpoint.

## Arguments

`$ARGUMENTS` can be:

- `recent` - Recent application logs (default: last 30 min)
- `errors` - Recent error/warning logs only
- `auth` - Authentication-related logs
- `agent` - AI agent activity logs
- `ws` - WebSocket connection logs
- `user <USER_ID>` - Logs for a specific user
- `search <PATTERN>` - Search logs for a pattern
- No argument defaults to `recent`

## Quick Reference

| Command | Description |
|---------|-------------|
| `/logs` | Recent logs (30 min) |
| `/logs errors` | Error and warning logs |
| `/logs auth` | Authentication events |
| `/logs agent` | Agent tool calls and turns |
| `/logs user 42` | All logs for user ID 42 |
| `/logs search "magic link"` | Search for pattern |

## Commands

### Recent Logs (Default)

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

## Agent Turn Logs

For detailed per-turn agent logs (code execution, drawings, etc.):

```bash
# List available turn logs for a user
curl -s "http://localhost:8000/debug/agent-logs?user_id=42"

# Get specific turn log content
curl -s "http://localhost:8000/debug/agent-logs?user_id=42&turn=turn_20240115_103045.log"
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

User activity timeline:
```
filter user_id = 42
| fields @timestamp, category, level, message
| sort @timestamp asc
```

## Correlating Logs with Traces

Logs include `trace_id` for correlation with X-Ray traces:

1. Find error in logs: `/logs errors`
2. Get the `trace_id` from the log entry
3. View trace details: `/diagnose trace <TRACE_ID>`

## Local vs Production

| Feature | Local | Production |
|---------|-------|------------|
| Debug endpoints | `localhost:8000/debug/*` | Not exposed |
| CloudWatch Logs | N/A | `/drawing-agent/*` |
| Agent turn logs | `data/agent_workspace/users/*/logs/` | Same path in container |
| Log format | Plain text or JSON | JSON (structured) |

## Troubleshooting

### No logs appearing

**Local:**
- Check server is running: `curl localhost:8000/health`
- Check log file exists: `ls server/logs/`
- Server may be writing to stdout only

**Production:**
- Check CloudWatch agent: `systemctl status amazon-cloudwatch-agent`
- Check log file permissions
- Verify log group exists in CloudWatch console

### Missing user context

Logs show `user_id: null` when:
- Request is unauthenticated
- Log happens outside request context
- User context not propagated (bug)

### Logs not in CloudWatch

- Check OTEL_ENABLED=true in production
- Verify CloudWatch agent config includes log collection
- Check IAM role has CloudWatch Logs permissions
