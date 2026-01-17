# Cost

Analyze Claude API token usage and costs from AWS X-Ray traces.

## Arguments

`$ARGUMENTS` can be:

- `summary` - Token usage summary (default: last 60 minutes)
- `recent` - Recent token usage per agent turn
- `daily` - Daily token usage breakdown (default: 7 days)
- `estimate` - Cost projections based on usage
- No argument defaults to `summary`

## Commands

### Token Usage Summary (Default)

```bash
cd server && uv run python ../scripts/cost.py summary
```

Shows aggregated token usage:

- Total agent turns
- Total tokens (input, output, cache)
- Estimated cost
- Cache hit rate

### Recent Token Usage

```bash
cd server && uv run python ../scripts/cost.py recent
```

Shows token usage per agent turn with:

- Timestamp
- Input/output tokens
- Cache read tokens
- Estimated cost per turn

### Daily Breakdown

```bash
cd server && uv run python ../scripts/cost.py daily 7
```

Shows daily token usage for the past N days:

- Turns per day
- Tokens per day
- Cost per day

### Cost Estimate

```bash
cd server && uv run python ../scripts/cost.py estimate
```

Projects costs based on recent usage:

- Tokens/hour rate
- Cost per hour/day/week/month

## Examples

### Check current usage

```bash
cd server && uv run python ../scripts/cost.py summary 30
```

Shows usage from the last 30 minutes.

### Monitor costs over time

```bash
cd server && uv run python ../scripts/cost.py daily 14
```

Shows daily usage for the past 2 weeks.

### Project monthly costs

```bash
cd server && uv run python ../scripts/cost.py estimate 120
```

Estimates costs based on 2 hours of usage data.

## Token Types

| Type | Description | Pricing |
|------|-------------|---------|
| Input | Tokens sent to Claude | $3.00/1M |
| Output | Tokens received from Claude | $15.00/1M |
| Cache Read | Tokens read from prompt cache | $0.30/1M (90% discount) |
| Cache Create | Tokens used to create cache | $3.75/1M (25% premium) |

## Prerequisites

- AWS credentials configured (local profile or instance role)
- X-Ray read permissions (AWSXRayReadOnlyAccess)
- Tracing enabled on server (OTEL_ENABLED=true)
- Token tracking spans being recorded (agent_turn_tokens)

## Troubleshooting

### No data found

1. Verify tracing is enabled: `OTEL_ENABLED=true`
2. Check that agent turns are running
3. Token spans may take a few minutes to appear in X-Ray

### Inaccurate costs

- Costs are estimates based on Claude Sonnet pricing
- Actual costs may vary based on model used
- Check Anthropic Console for official billing
