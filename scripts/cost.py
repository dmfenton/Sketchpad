#!/usr/bin/env python3
"""Cost analysis script for querying token usage from AWS X-Ray traces.

Usage:
    uv run python scripts/cost.py summary [MINUTES]    # Token usage summary (default 60 min)
    uv run python scripts/cost.py recent [MINUTES]     # Recent token usage per turn
    uv run python scripts/cost.py daily [DAYS]         # Daily token usage (default 7 days)
    uv run python scripts/cost.py estimate [MINUTES]   # Cost estimate based on usage

Options:
    --md, --markdown    Output in markdown format (for Claude to read)
    --json              Output in JSON format
"""

import json
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3

# Claude model pricing (as of 2024, per 1M tokens)
PRICING = {
    "claude-sonnet-4-20250514": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,  # 90% discount
        "cache_create": 3.75,  # 25% premium
    },
    "claude-3-5-sonnet-20241022": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_create": 3.75,
    },
    # Default fallback
    "default": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_create": 3.75,
    },
}

# Check for output format flags
OUTPUT_FORMAT = "rich"  # rich, markdown, json
if "--md" in sys.argv or "--markdown" in sys.argv:
    OUTPUT_FORMAT = "markdown"
    sys.argv = [a for a in sys.argv if a not in ("--md", "--markdown")]
elif "--json" in sys.argv:
    OUTPUT_FORMAT = "json"
    sys.argv = [a for a in sys.argv if a != "--json"]

if OUTPUT_FORMAT == "rich":
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table

    console = Console()


def get_xray_client() -> Any:
    """Get X-Ray client."""
    import os

    region = os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("xray", region_name=region)


def get_token_traces(minutes: int = 60, limit: int = 500) -> list[dict[str, Any]]:
    """Get traces containing agent_turn_tokens spans."""
    client = get_xray_client()

    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(minutes=minutes)

    # Filter for our token spans
    filter_expression = 'annotation.tokens_input > 0 OR service(id(name: "drawing-agent"))'

    params: dict[str, Any] = {
        "StartTime": start_time,
        "EndTime": end_time,
        "FilterExpression": filter_expression,
    }

    all_trace_ids = []
    next_token = None

    while True:
        if next_token:
            params["NextToken"] = next_token

        response = client.get_trace_summaries(**params)
        summaries = response.get("TraceSummaries", [])
        all_trace_ids.extend([s["Id"] for s in summaries])

        next_token = response.get("NextToken")
        if not next_token or len(all_trace_ids) >= limit:
            break

    return all_trace_ids[:limit]


def extract_token_usage_from_traces(trace_ids: list[str]) -> list[dict[str, Any]]:
    """Extract token usage from trace details."""
    if not trace_ids:
        return []

    client = get_xray_client()
    token_records = []

    # Batch get traces (max 5 per request)
    for i in range(0, len(trace_ids), 5):
        batch = trace_ids[i : i + 5]
        response = client.batch_get_traces(TraceIds=batch)

        for trace in response.get("Traces", []):
            for segment in trace.get("Segments", []):
                doc = json.loads(segment.get("Document", "{}"))

                # Check main segment and subsegments for token data
                for subseg in doc.get("subsegments", []):
                    if subseg.get("name") == "agent_turn_tokens":
                        # Extract token attributes
                        metadata = subseg.get("metadata", {})
                        # Try annotations first, then metadata
                        annotations = subseg.get("annotations", {})

                        # Look for token data in various places
                        input_tokens = (
                            annotations.get("tokens.input")
                            or annotations.get("tokens_input")
                            or metadata.get("default", {}).get("tokens.input")
                            or 0
                        )
                        output_tokens = (
                            annotations.get("tokens.output")
                            or annotations.get("tokens_output")
                            or metadata.get("default", {}).get("tokens.output")
                            or 0
                        )
                        cache_read = (
                            annotations.get("tokens.cache_read")
                            or annotations.get("tokens_cache_read")
                            or metadata.get("default", {}).get("tokens.cache_read")
                            or 0
                        )
                        cache_create = (
                            annotations.get("tokens.cache_create")
                            or annotations.get("tokens_cache_create")
                            or metadata.get("default", {}).get("tokens.cache_create")
                            or 0
                        )

                        if input_tokens or output_tokens:
                            token_records.append(
                                {
                                    "trace_id": trace.get("Id"),
                                    "timestamp": subseg.get("start_time"),
                                    "input_tokens": int(input_tokens),
                                    "output_tokens": int(output_tokens),
                                    "cache_read_tokens": int(cache_read),
                                    "cache_create_tokens": int(cache_create),
                                    "total_tokens": int(input_tokens) + int(output_tokens),
                                }
                            )

                # Also check span attributes set directly
                if "annotations" in doc:
                    ann = doc["annotations"]
                    if "tokens.input" in ann or "tokens_input" in ann:
                        input_tokens = ann.get("tokens.input") or ann.get("tokens_input") or 0
                        output_tokens = ann.get("tokens.output") or ann.get("tokens_output") or 0
                        cache_read = ann.get("tokens.cache_read") or ann.get("tokens_cache_read") or 0
                        cache_create = (
                            ann.get("tokens.cache_create") or ann.get("tokens_cache_create") or 0
                        )

                        if input_tokens or output_tokens:
                            token_records.append(
                                {
                                    "trace_id": trace.get("Id"),
                                    "timestamp": doc.get("start_time"),
                                    "input_tokens": int(input_tokens),
                                    "output_tokens": int(output_tokens),
                                    "cache_read_tokens": int(cache_read),
                                    "cache_create_tokens": int(cache_create),
                                    "total_tokens": int(input_tokens) + int(output_tokens),
                                }
                            )

    return token_records


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_create_tokens: int = 0,
    model: str = "default",
) -> float:
    """Calculate estimated cost in USD."""
    pricing = PRICING.get(model, PRICING["default"])

    # Calculate cost per token type (pricing is per 1M tokens)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    cache_read_cost = (cache_read_tokens / 1_000_000) * pricing["cache_read"]
    cache_create_cost = (cache_create_tokens / 1_000_000) * pricing["cache_create"]

    return input_cost + output_cost + cache_read_cost + cache_create_cost


def aggregate_usage(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate token usage statistics."""
    if not records:
        return {
            "total_turns": 0,
            "total_input": 0,
            "total_output": 0,
            "total_cache_read": 0,
            "total_cache_create": 0,
            "total_tokens": 0,
            "avg_input": 0,
            "avg_output": 0,
            "avg_total": 0,
            "estimated_cost": 0.0,
        }

    total_input = sum(r["input_tokens"] for r in records)
    total_output = sum(r["output_tokens"] for r in records)
    total_cache_read = sum(r["cache_read_tokens"] for r in records)
    total_cache_create = sum(r["cache_create_tokens"] for r in records)
    total_tokens = total_input + total_output

    return {
        "total_turns": len(records),
        "total_input": total_input,
        "total_output": total_output,
        "total_cache_read": total_cache_read,
        "total_cache_create": total_cache_create,
        "total_tokens": total_tokens,
        "avg_input": total_input // len(records) if records else 0,
        "avg_output": total_output // len(records) if records else 0,
        "avg_total": total_tokens // len(records) if records else 0,
        "estimated_cost": calculate_cost(
            total_input, total_output, total_cache_read, total_cache_create
        ),
    }


# ============== Markdown Output ==============


def md_print(text: str) -> None:
    """Print markdown text."""
    print(text)


def md_summary(stats: dict[str, Any], minutes: int) -> None:
    """Output token usage summary as markdown."""
    md_print(f"\n## Token Usage Summary (last {minutes} min)\n")

    if stats["total_turns"] == 0:
        md_print("*No token usage data found*\n")
        return

    md_print(f"**Agent Turns:** {stats['total_turns']}")
    md_print(f"**Total Tokens:** {stats['total_tokens']:,}")
    md_print(f"**Estimated Cost:** ${stats['estimated_cost']:.4f}\n")

    md_print("### Token Breakdown\n")
    md_print("| Type | Total | Average/Turn |")
    md_print("|------|-------|--------------|")
    md_print(f"| Input | {stats['total_input']:,} | {stats['avg_input']:,} |")
    md_print(f"| Output | {stats['total_output']:,} | {stats['avg_output']:,} |")
    md_print(f"| Cache Read | {stats['total_cache_read']:,} | - |")
    md_print(f"| Cache Create | {stats['total_cache_create']:,} | - |")
    md_print("")

    # Calculate cache efficiency
    if stats["total_input"] > 0:
        cache_rate = (stats["total_cache_read"] / stats["total_input"]) * 100
        md_print(f"**Cache Hit Rate:** {cache_rate:.1f}%\n")


def md_recent(records: list[dict[str, Any]], minutes: int) -> None:
    """Output recent token usage as markdown table."""
    md_print(f"\n## Recent Token Usage (last {minutes} min)\n")

    if not records:
        md_print("*No token usage data found*\n")
        return

    md_print("| Time | Input | Output | Cache Read | Total | Est. Cost |")
    md_print("|------|-------|--------|------------|-------|-----------|")

    for r in records[:20]:  # Limit to 20 most recent
        timestamp = r.get("timestamp")
        if isinstance(timestamp, float):
            time_str = datetime.fromtimestamp(timestamp, UTC).strftime("%H:%M:%S")
        else:
            time_str = str(timestamp)[:19] if timestamp else "-"

        cost = calculate_cost(
            r["input_tokens"],
            r["output_tokens"],
            r["cache_read_tokens"],
            r["cache_create_tokens"],
        )

        md_print(
            f"| {time_str} | {r['input_tokens']:,} | {r['output_tokens']:,} | "
            f"{r['cache_read_tokens']:,} | {r['total_tokens']:,} | ${cost:.4f} |"
        )

    md_print("")


def md_estimate(stats: dict[str, Any], minutes: int) -> None:
    """Output cost estimate as markdown."""
    md_print(f"\n## Cost Estimate (based on last {minutes} min)\n")

    if stats["total_turns"] == 0:
        md_print("*No usage data to estimate*\n")
        return

    # Calculate rates
    hours = minutes / 60
    cost_per_hour = stats["estimated_cost"] / hours if hours > 0 else 0
    tokens_per_hour = stats["total_tokens"] / hours if hours > 0 else 0
    turns_per_hour = stats["total_turns"] / hours if hours > 0 else 0

    md_print("### Current Usage Rate\n")
    md_print(f"- **Turns/hour:** {turns_per_hour:.1f}")
    md_print(f"- **Tokens/hour:** {tokens_per_hour:,.0f}")
    md_print(f"- **Cost/hour:** ${cost_per_hour:.4f}\n")

    md_print("### Projected Costs\n")
    md_print("| Period | Estimated Cost |")
    md_print("|--------|----------------|")
    md_print(f"| Per hour | ${cost_per_hour:.4f} |")
    md_print(f"| Per day | ${cost_per_hour * 24:.2f} |")
    md_print(f"| Per week | ${cost_per_hour * 24 * 7:.2f} |")
    md_print(f"| Per month | ${cost_per_hour * 24 * 30:.2f} |")
    md_print("")

    md_print("*Note: Estimates assume consistent usage patterns. Actual costs depend on user activity.*\n")


# ============== Rich Output ==============


def rich_summary(stats: dict[str, Any], minutes: int) -> None:
    """Display token usage summary with rich."""
    if stats["total_turns"] == 0:
        console.print("[yellow]No token usage data found[/yellow]")
        return

    content = (
        f"Agent Turns: {stats['total_turns']}\n"
        f"Total Tokens: {stats['total_tokens']:,}\n"
        f"Estimated Cost: ${stats['estimated_cost']:.4f}\n\n"
        f"[cyan]Breakdown:[/cyan]\n"
        f"  Input: {stats['total_input']:,} (avg {stats['avg_input']:,}/turn)\n"
        f"  Output: {stats['total_output']:,} (avg {stats['avg_output']:,}/turn)\n"
        f"  Cache Read: {stats['total_cache_read']:,}\n"
        f"  Cache Create: {stats['total_cache_create']:,}"
    )

    console.print(Panel(content, title=f"Token Usage Summary (last {minutes} min)"))

    # Cache efficiency
    if stats["total_input"] > 0:
        cache_rate = (stats["total_cache_read"] / stats["total_input"]) * 100
        console.print(f"\n[green]Cache Hit Rate:[/green] {cache_rate:.1f}%")


def rich_recent(records: list[dict[str, Any]], minutes: int) -> None:
    """Display recent token usage with rich."""
    if not records:
        console.print("[yellow]No token usage data found[/yellow]")
        return

    table = Table(title=f"Recent Token Usage (last {minutes} min)")
    table.add_column("Time", style="dim")
    table.add_column("Input", style="cyan", justify="right")
    table.add_column("Output", style="green", justify="right")
    table.add_column("Cache", style="yellow", justify="right")
    table.add_column("Total", style="magenta", justify="right")
    table.add_column("Cost", style="bold", justify="right")

    for r in records[:20]:
        timestamp = r.get("timestamp")
        if isinstance(timestamp, float):
            time_str = datetime.fromtimestamp(timestamp, UTC).strftime("%H:%M:%S")
        else:
            time_str = str(timestamp)[:19] if timestamp else "-"

        cost = calculate_cost(
            r["input_tokens"],
            r["output_tokens"],
            r["cache_read_tokens"],
            r["cache_create_tokens"],
        )

        table.add_row(
            time_str,
            f"{r['input_tokens']:,}",
            f"{r['output_tokens']:,}",
            f"{r['cache_read_tokens']:,}",
            f"{r['total_tokens']:,}",
            f"${cost:.4f}",
        )

    console.print(table)


def rich_estimate(stats: dict[str, Any], minutes: int) -> None:
    """Display cost estimate with rich."""
    if stats["total_turns"] == 0:
        console.print("[yellow]No usage data to estimate[/yellow]")
        return

    hours = minutes / 60
    cost_per_hour = stats["estimated_cost"] / hours if hours > 0 else 0

    content = (
        f"[cyan]Current Rate:[/cyan]\n"
        f"  Tokens/hour: {stats['total_tokens'] / hours:,.0f}\n"
        f"  Cost/hour: ${cost_per_hour:.4f}\n\n"
        f"[cyan]Projected Costs:[/cyan]\n"
        f"  Per day: ${cost_per_hour * 24:.2f}\n"
        f"  Per week: ${cost_per_hour * 24 * 7:.2f}\n"
        f"  Per month: ${cost_per_hour * 24 * 30:.2f}"
    )

    console.print(Panel(content, title=f"Cost Estimate (based on last {minutes} min)"))


# ============== Commands ==============


def cmd_summary(minutes: int = 60) -> None:
    """Show token usage summary."""
    if OUTPUT_FORMAT != "rich":
        pass  # No progress message for markdown/json
    else:
        console.print(f"[cyan]Fetching token usage from last {minutes} minutes...[/cyan]")

    trace_ids = get_token_traces(minutes=minutes)
    records = extract_token_usage_from_traces(trace_ids)
    stats = aggregate_usage(records)

    if OUTPUT_FORMAT == "markdown":
        md_summary(stats, minutes)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(stats, indent=2))
    else:
        rich_summary(stats, minutes)


def cmd_recent(minutes: int = 60) -> None:
    """Show recent token usage per turn."""
    if OUTPUT_FORMAT == "rich":
        console.print("[cyan]Fetching recent token usage...[/cyan]")

    trace_ids = get_token_traces(minutes=minutes)
    records = extract_token_usage_from_traces(trace_ids)

    # Sort by timestamp descending
    records.sort(key=lambda r: r.get("timestamp") or 0, reverse=True)

    if OUTPUT_FORMAT == "markdown":
        md_recent(records, minutes)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(records, indent=2, default=str))
    else:
        rich_recent(records, minutes)


def cmd_estimate(minutes: int = 60) -> None:
    """Show cost estimate based on recent usage."""
    if OUTPUT_FORMAT == "rich":
        console.print("[cyan]Calculating cost estimate...[/cyan]")

    trace_ids = get_token_traces(minutes=minutes)
    records = extract_token_usage_from_traces(trace_ids)
    stats = aggregate_usage(records)

    if OUTPUT_FORMAT == "markdown":
        md_estimate(stats, minutes)
    elif OUTPUT_FORMAT == "json":
        hours = minutes / 60
        cost_per_hour = stats["estimated_cost"] / hours if hours > 0 else 0
        print(
            json.dumps(
                {
                    "period_minutes": minutes,
                    "total_cost": stats["estimated_cost"],
                    "cost_per_hour": cost_per_hour,
                    "cost_per_day": cost_per_hour * 24,
                    "cost_per_week": cost_per_hour * 24 * 7,
                    "cost_per_month": cost_per_hour * 24 * 30,
                },
                indent=2,
            )
        )
    else:
        rich_estimate(stats, minutes)


def cmd_daily(days: int = 7) -> None:
    """Show daily token usage breakdown."""
    if OUTPUT_FORMAT == "rich":
        console.print(f"[cyan]Fetching daily token usage for {days} days...[/cyan]")

    # X-Ray only keeps traces for 30 days, limit accordingly
    days = min(days, 30)
    minutes = days * 24 * 60

    trace_ids = get_token_traces(minutes=minutes, limit=1000)
    records = extract_token_usage_from_traces(trace_ids)

    # Group by date
    daily_stats: dict[str, list[dict[str, Any]]] = {}
    for r in records:
        timestamp = r.get("timestamp")
        if isinstance(timestamp, float):
            date_str = datetime.fromtimestamp(timestamp, UTC).strftime("%Y-%m-%d")
        else:
            date_str = "unknown"

        if date_str not in daily_stats:
            daily_stats[date_str] = []
        daily_stats[date_str].append(r)

    if OUTPUT_FORMAT == "markdown":
        md_print(f"\n## Daily Token Usage (last {days} days)\n")

        if not daily_stats:
            md_print("*No token usage data found*\n")
            return

        md_print("| Date | Turns | Input | Output | Total | Est. Cost |")
        md_print("|------|-------|-------|--------|-------|-----------|")

        for date in sorted(daily_stats.keys(), reverse=True):
            day_records = daily_stats[date]
            stats = aggregate_usage(day_records)
            md_print(
                f"| {date} | {stats['total_turns']} | {stats['total_input']:,} | "
                f"{stats['total_output']:,} | {stats['total_tokens']:,} | "
                f"${stats['estimated_cost']:.4f} |"
            )

        md_print("")

    elif OUTPUT_FORMAT == "json":
        result = {}
        for date, day_records in daily_stats.items():
            result[date] = aggregate_usage(day_records)
        print(json.dumps(result, indent=2))

    else:
        table = Table(title=f"Daily Token Usage (last {days} days)")
        table.add_column("Date", style="dim")
        table.add_column("Turns", justify="right")
        table.add_column("Input", style="cyan", justify="right")
        table.add_column("Output", style="green", justify="right")
        table.add_column("Total", style="magenta", justify="right")
        table.add_column("Cost", style="bold", justify="right")

        for date in sorted(daily_stats.keys(), reverse=True):
            stats = aggregate_usage(daily_stats[date])
            table.add_row(
                date,
                str(stats["total_turns"]),
                f"{stats['total_input']:,}",
                f"{stats['total_output']:,}",
                f"{stats['total_tokens']:,}",
                f"${stats['estimated_cost']:.4f}",
            )

        console.print(table)


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "summary":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_summary(minutes)
        elif command == "recent":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_recent(minutes)
        elif command == "estimate":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_estimate(minutes)
        elif command == "daily":
            days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
            cmd_daily(days)
        else:
            print(f"Unknown command: {command}")
            print(__doc__)
            sys.exit(1)
    except Exception as e:
        if OUTPUT_FORMAT == "markdown":
            print(f"\n**Error:** {e}\n")
        elif OUTPUT_FORMAT == "json":
            print(json.dumps({"error": str(e)}))
        else:
            console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    main()
