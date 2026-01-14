# Diagnose

Query AWS X-Ray traces to diagnose server errors and performance issues.

## Arguments

`$ARGUMENTS` can be:

- `recent` - Show recent traces (default: last 30 minutes)
- `errors` - Show recent error/fault traces
- `trace <TRACE_ID>` - Get full trace details
- `path <URL_PATH>` - Show traces for a specific endpoint
- No argument defaults to `errors`

## Commands

### Recent Traces

```bash
uv run python scripts/diagnose.py recent
```

Shows all traces from the last 30 minutes with:

- Trace ID
- HTTP method and URL
- Response status
- Duration
- Error/fault status

### Error Traces (Default)

```bash
uv run python scripts/diagnose.py errors
```

Shows only traces with errors or faults from the last hour.

### Trace Details

```bash
uv run python scripts/diagnose.py trace 1-67890abc-def123456789abcd
```

Shows full trace details including:

- All segments (service boundaries)
- HTTP request/response details
- Exception stack traces
- Annotations and metadata

### Endpoint Traces

```bash
uv run python scripts/diagnose.py path /auth/verify
```

Shows traces for a specific API endpoint.

## Examples

### Diagnose a 500 error

If a user reports a 500 error:

1. Get error traces:

   ```bash
   uv run python scripts/diagnose.py errors
   ```

2. Find the relevant trace by URL/time

3. Get full details:

   ```bash
   uv run python scripts/diagnose.py trace <TRACE_ID>
   ```

4. Review the exception stack trace

### Investigate slow endpoints

```bash
uv run python scripts/diagnose.py path /ws
```

Look at response times and segment durations.

## Prerequisites

- AWS credentials configured (local profile or instance role)
- X-Ray read permissions (AWSXRayReadOnlyAccess)
- Tracing enabled on server (OTEL_ENABLED=true)

## Troubleshooting

### No traces found

- Check that OTEL_ENABLED=true in production
- Verify ADOT collector is running: `docker ps | grep otel`
- Check collector logs: `docker logs otel-collector`

### Permission denied

Ensure IAM user/role has `xray:GetTraceSummaries` and `xray:BatchGetTraces` permissions.
