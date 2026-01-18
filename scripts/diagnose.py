#!/usr/bin/env python3
"""Diagnostic script for querying AWS X-Ray traces.

Usage:
    uv run python scripts/diagnose.py recent [MINUTES]     # Recent traces (default 30 min)
    uv run python scripts/diagnose.py errors [MINUTES]     # Recent error traces
    uv run python scripts/diagnose.py slow [SECONDS] [MIN]  # Slow traces (default >1s, 60 min)
    uv run python scripts/diagnose.py ws [MINUTES]         # WebSocket traces
    uv run python scripts/diagnose.py trace TRACE_ID       # Get trace details
    uv run python scripts/diagnose.py path /endpoint       # Traces for endpoint
    uv run python scripts/diagnose.py status               # Current service status
    uv run python scripts/diagnose.py summary [MINUTES]    # Traffic summary

Options:
    --md, --markdown    Output in markdown format (for Claude to read)
    --json              Output in JSON format
"""

import json
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3

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


def format_trace_summary(trace: dict[str, Any]) -> dict[str, Any]:
    """Format trace summary for display."""
    http = trace.get("Http", {})
    start_time = trace.get("StartTime")

    return {
        "id": trace.get("Id", ""),
        "start_time": start_time.isoformat() if start_time else None,
        "duration": trace.get("Duration", 0),
        "duration_str": f"{trace.get('Duration', 0):.3f}s",
        "response_time": trace.get("ResponseTime", 0),
        "has_error": trace.get("HasError", False),
        "has_fault": trace.get("HasFault", False),
        "http_status": http.get("HttpStatus"),
        "http_method": http.get("HttpMethod"),
        "http_url": http.get("HttpURL"),
        "user_agent": http.get("UserAgent", ""),
    }


def get_trace_summaries(
    minutes: int = 30,
    filter_expression: str | None = None,
    limit: int = 50
) -> list[dict[str, Any]]:
    """Get trace summaries from X-Ray."""
    client = get_xray_client()

    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(minutes=minutes)

    params: dict[str, Any] = {
        "StartTime": start_time,
        "EndTime": end_time,
    }
    if filter_expression:
        params["FilterExpression"] = filter_expression

    all_summaries = []
    next_token = None

    while True:
        if next_token:
            params["NextToken"] = next_token

        response = client.get_trace_summaries(**params)
        all_summaries.extend(response.get("TraceSummaries", []))

        next_token = response.get("NextToken")
        if not next_token or len(all_summaries) >= limit:
            break

    return [format_trace_summary(t) for t in all_summaries[:limit]]


def get_trace_details(trace_id: str) -> dict[str, Any]:
    """Get full trace details by ID."""
    client = get_xray_client()

    response = client.batch_get_traces(TraceIds=[trace_id])
    traces = response.get("Traces", [])

    if not traces:
        return {"error": f"Trace {trace_id} not found"}

    trace = traces[0]
    segments = []

    for segment in trace.get("Segments", []):
        doc = json.loads(segment.get("Document", "{}"))

        # Extract subsegments for more detail
        subsegments = []
        for sub in doc.get("subsegments", []):
            subsegments.append({
                "name": sub.get("name"),
                "duration": (sub.get("end_time", 0) - sub.get("start_time", 0)),
                "error": sub.get("error"),
                "fault": sub.get("fault"),
                "sql": sub.get("sql"),
                "http": sub.get("http"),
                "metadata": sub.get("metadata"),
            })

        segments.append({
            "name": doc.get("name"),
            "start_time": doc.get("start_time"),
            "end_time": doc.get("end_time"),
            "duration": (doc.get("end_time", 0) - doc.get("start_time", 0)),
            "error": doc.get("error"),
            "fault": doc.get("fault"),
            "http": doc.get("http"),
            "exception": doc.get("cause", {}).get("exceptions", []),
            "annotations": doc.get("annotations"),
            "metadata": doc.get("metadata"),
            "subsegments": subsegments,
        })

    return {
        "id": trace.get("Id"),
        "duration": trace.get("Duration"),
        "segments": segments,
    }


# ============== Markdown Output ==============

def md_print(text: str) -> None:
    """Print markdown text."""
    print(text)


def md_traces_table(traces: list[dict[str, Any]], title: str) -> None:
    """Output traces as markdown table."""
    md_print(f"\n## {title}\n")

    if not traces:
        md_print("*No traces found*\n")
        return

    md_print("| Time | Method | URL | Status | Duration | Error |")
    md_print("|------|--------|-----|--------|----------|-------|")

    for t in traces:
        time_str = t.get("start_time", "")[:19] if t.get("start_time") else "-"
        method = t.get("http_method") or "-"
        url = (t.get("http_url") or "-")[:60]
        status = str(t.get("http_status") or "-")
        duration = t.get("duration_str", "-")

        error = ""
        if t.get("has_fault"):
            error = "FAULT"
        elif t.get("has_error"):
            error = "ERROR"

        md_print(f"| {time_str} | {method} | `{url}` | {status} | {duration} | {error} |")

    md_print("")


def md_trace_details(details: dict[str, Any]) -> None:
    """Output trace details as markdown."""
    if "error" in details:
        md_print(f"\n**Error:** {details['error']}\n")
        return

    md_print(f"\n## Trace: `{details['id']}`\n")
    md_print(f"**Total Duration:** {details.get('duration', 0):.3f}s\n")

    for seg in details.get("segments", []):
        name = seg.get("name", "Unknown")
        duration = seg.get("duration", 0)

        status = ""
        if seg.get("fault"):
            status = " [FAULT]"
        elif seg.get("error"):
            status = " [ERROR]"

        md_print(f"### {name}{status} ({duration:.3f}s)\n")

        # HTTP info
        if seg.get("http"):
            http = seg["http"]
            if "request" in http:
                req = http["request"]
                md_print(f"- **Request:** `{req.get('method', '')} {req.get('url', '')}`")
            if "response" in http:
                resp = http["response"]
                md_print(f"- **Response:** {resp.get('status', '')}")

        # Exceptions
        if seg.get("exception"):
            md_print("\n**Exceptions:**\n")
            for exc in seg["exception"]:
                md_print(f"- `{exc.get('type', 'Unknown')}`: {exc.get('message', '')}")
                if exc.get("stack"):
                    md_print("\n```")
                    for frame in exc["stack"][:10]:
                        md_print(f"  {frame.get('path', '')}:{frame.get('line', '')} {frame.get('label', '')}")
                    md_print("```\n")

        # Subsegments
        if seg.get("subsegments"):
            md_print("\n**Subsegments:**\n")
            for sub in seg["subsegments"]:
                sub_name = sub.get("name", "?")
                sub_dur = sub.get("duration", 0)
                md_print(f"- `{sub_name}` ({sub_dur:.3f}s)")

        md_print("")


def md_summary(traces: list[dict[str, Any]], minutes: int) -> None:
    """Output traffic summary as markdown."""
    md_print(f"\n## Traffic Summary (last {minutes} min)\n")

    if not traces:
        md_print("*No traffic*\n")
        return

    # Calculate stats
    total = len(traces)
    errors = sum(1 for t in traces if t.get("has_error") or t.get("has_fault"))
    faults = sum(1 for t in traces if t.get("has_fault"))

    durations = [t.get("duration", 0) for t in traces]
    avg_duration = sum(durations) / len(durations) if durations else 0
    max_duration = max(durations) if durations else 0

    # Group by status
    status_counts: dict[str, int] = {}
    for t in traces:
        status = str(t.get("http_status") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

    # Group by endpoint
    endpoint_counts: dict[str, int] = {}
    for t in traces:
        url = t.get("http_url") or "unknown"
        # Extract path from URL
        if "://" in url:
            url = url.split("://", 1)[1]
        if "/" in url:
            url = "/" + url.split("/", 1)[1].split("?")[0]
        endpoint_counts[url] = endpoint_counts.get(url, 0) + 1

    md_print(f"**Total Requests:** {total}")
    md_print(f"**Errors:** {errors} ({100*errors/total:.1f}%)" if total else "**Errors:** 0")
    md_print(f"**Faults (5xx):** {faults}")
    md_print(f"**Avg Duration:** {avg_duration:.3f}s")
    md_print(f"**Max Duration:** {max_duration:.3f}s")

    md_print("\n### Status Codes\n")
    md_print("| Status | Count |")
    md_print("|--------|-------|")
    for status, count in sorted(status_counts.items()):
        md_print(f"| {status} | {count} |")

    md_print("\n### Top Endpoints\n")
    md_print("| Endpoint | Count |")
    md_print("|----------|-------|")
    for endpoint, count in sorted(endpoint_counts.items(), key=lambda x: -x[1])[:10]:
        md_print(f"| `{endpoint}` | {count} |")

    md_print("")


# ============== Rich Output ==============

def rich_traces_table(traces: list[dict[str, Any]], title: str) -> None:
    """Display traces in a rich table."""
    table = Table(title=title)
    table.add_column("Time", style="dim")
    table.add_column("Method", style="green")
    table.add_column("URL", style="blue")
    table.add_column("Status", style="yellow")
    table.add_column("Duration", style="magenta")
    table.add_column("Error", style="red")

    for t in traces:
        time_str = t.get("start_time", "")[:19] if t.get("start_time") else "-"
        error_marker = ""
        if t.get("has_fault"):
            error_marker = "FAULT"
        elif t.get("has_error"):
            error_marker = "ERROR"

        table.add_row(
            time_str,
            t.get("http_method") or "-",
            (t.get("http_url") or "-")[:50],
            str(t.get("http_status") or "-"),
            t.get("duration_str", "-"),
            error_marker,
        )

    console.print(table)


def rich_trace_details(details: dict[str, Any]) -> None:
    """Display trace details with rich."""
    if "error" in details:
        console.print(f"[red]{details['error']}[/red]")
        return

    console.print(Panel(f"Trace ID: {details['id']}\nDuration: {details.get('duration', 0):.3f}s", title="Trace Details"))

    for segment in details.get("segments", []):
        title = f"[bold]{segment.get('name', 'Unknown')}[/bold] ({segment.get('duration', 0):.3f}s)"
        if segment.get("fault"):
            title += " [red][FAULT][/red]"
        elif segment.get("error"):
            title += " [yellow][ERROR][/yellow]"

        content = []

        if segment.get("http"):
            http = segment["http"]
            if "request" in http:
                req = http["request"]
                content.append(f"Request: {req.get('method', '')} {req.get('url', '')}")
            if "response" in http:
                resp = http["response"]
                content.append(f"Response: {resp.get('status', '')}")

        if segment.get("exception"):
            content.append("\n[red]Exceptions:[/red]")
            for exc in segment["exception"]:
                content.append(f"  - {exc.get('type', 'Unknown')}: {exc.get('message', '')}")
                if exc.get("stack"):
                    for frame in exc["stack"][:5]:
                        content.append(f"      {frame.get('path', '')}:{frame.get('line', '')} {frame.get('label', '')}")

        if segment.get("subsegments"):
            content.append("\n[cyan]Subsegments:[/cyan]")
            for sub in segment["subsegments"][:10]:
                content.append(f"  - {sub.get('name', '?')} ({sub.get('duration', 0):.3f}s)")

        console.print(Panel("\n".join(content) if content else "No details", title=title))


# ============== Commands ==============

def cmd_recent(minutes: int = 30) -> None:
    """Show recent traces."""
    traces = get_trace_summaries(minutes=minutes)
    title = f"Recent Traces (last {minutes} min)"

    if OUTPUT_FORMAT == "markdown":
        md_traces_table(traces, title)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(traces, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching traces from last {minutes} minutes...[/cyan]")
        if not traces:
            console.print("[yellow]No traces found[/yellow]")
            return
        rich_traces_table(traces, title)


def cmd_errors(minutes: int = 60) -> None:
    """Show recent error traces."""
    traces = get_trace_summaries(
        minutes=minutes,
        filter_expression='fault = true OR error = true'
    )
    title = f"Error Traces (last {minutes} min)"

    if OUTPUT_FORMAT == "markdown":
        md_traces_table(traces, title)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(traces, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching error traces from last {minutes} minutes...[/cyan]")
        if not traces:
            console.print("[green]No error traces found[/green]")
            return
        rich_traces_table(traces, title)


def cmd_slow(seconds: float = 1.0, minutes: int = 60) -> None:
    """Show slow traces."""
    traces = get_trace_summaries(
        minutes=minutes,
        filter_expression=f'duration > {seconds}'
    )
    title = f"Slow Traces (>{seconds}s, last {minutes} min)"

    if OUTPUT_FORMAT == "markdown":
        md_traces_table(traces, title)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(traces, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching slow traces (>{seconds}s)...[/cyan]")
        if not traces:
            console.print("[green]No slow traces found[/green]")
            return
        rich_traces_table(traces, title)


def cmd_ws(minutes: int = 60) -> None:
    """Show WebSocket traces."""
    traces = get_trace_summaries(
        minutes=minutes,
        filter_expression='http.url CONTAINS "/ws"'
    )
    title = f"WebSocket Traces (last {minutes} min)"

    if OUTPUT_FORMAT == "markdown":
        md_traces_table(traces, title)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(traces, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching WebSocket traces...[/cyan]")
        if not traces:
            console.print("[yellow]No WebSocket traces found[/yellow]")
            return
        rich_traces_table(traces, title)


def cmd_trace(trace_id: str) -> None:
    """Show trace details."""
    details = get_trace_details(trace_id)

    if OUTPUT_FORMAT == "markdown":
        md_trace_details(details)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(details, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching trace {trace_id}...[/cyan]")
        rich_trace_details(details)


def cmd_path(path: str, minutes: int = 60) -> None:
    """Show traces for a specific path."""
    filter_expr = f'http.url CONTAINS "{path}"'
    traces = get_trace_summaries(minutes=minutes, filter_expression=filter_expr)
    title = f"Traces for {path} (last {minutes} min)"

    if OUTPUT_FORMAT == "markdown":
        md_traces_table(traces, title)
    elif OUTPUT_FORMAT == "json":
        print(json.dumps(traces, indent=2, default=str))
    else:
        console.print(f"[cyan]Fetching traces for {path}...[/cyan]")
        if not traces:
            console.print(f"[yellow]No traces found for {path}[/yellow]")
            return
        rich_traces_table(traces, title)


def cmd_status() -> None:
    """Show current service status."""
    # Get traces from last 5 minutes
    traces = get_trace_summaries(minutes=5)
    errors = [t for t in traces if t.get("has_error") or t.get("has_fault")]
    ws_traces = [t for t in traces if t.get("http_url") and "/ws" in t.get("http_url", "")]

    if OUTPUT_FORMAT == "markdown":
        md_print("\n## Service Status (last 5 min)\n")
        md_print(f"- **Total requests:** {len(traces)}")
        md_print(f"- **Errors:** {len(errors)}")
        md_print(f"- **WebSocket connections:** {len(ws_traces)}")

        if errors:
            md_print("\n### Recent Errors\n")
            for e in errors[:5]:
                md_print(f"- `{e.get('http_method')} {e.get('http_url')}` - {e.get('http_status')}")

        if ws_traces:
            md_print("\n### WebSocket Sessions\n")
            for ws in ws_traces[:5]:
                md_print(f"- Duration: {ws.get('duration_str')} at {ws.get('start_time', '')[:19]}")
        md_print("")
    elif OUTPUT_FORMAT == "json":
        print(json.dumps({
            "total_requests": len(traces),
            "errors": len(errors),
            "websocket_connections": len(ws_traces),
            "recent_errors": errors[:5],
            "websocket_sessions": ws_traces[:5],
        }, indent=2, default=str))
    else:
        console.print(Panel(
            f"Total requests: {len(traces)}\n"
            f"Errors: {len(errors)}\n"
            f"WebSocket connections: {len(ws_traces)}",
            title="Service Status (last 5 min)"
        ))
        if errors:
            console.print("\n[bold]Recent Errors:[/bold]")
            for e in errors[:5]:
                console.print(f"  - {e.get('http_method')} {e.get('http_url')} - {e.get('http_status')}")
        if ws_traces:
            console.print("\n[bold]WebSocket Sessions:[/bold]")
            for ws in ws_traces[:5]:
                console.print(f"  - Duration: {ws.get('duration_str')} at {ws.get('start_time', '')[:19]}")


def cmd_summary(minutes: int = 60) -> None:
    """Show traffic summary."""
    traces = get_trace_summaries(minutes=minutes, limit=500)

    if OUTPUT_FORMAT == "markdown":
        md_summary(traces, minutes)
    elif OUTPUT_FORMAT == "json":
        # Calculate stats
        total = len(traces)
        errors = sum(1 for t in traces if t.get("has_error") or t.get("has_fault"))
        durations = [t.get("duration", 0) for t in traces]
        print(json.dumps({
            "minutes": minutes,
            "total": total,
            "errors": errors,
            "avg_duration": sum(durations) / len(durations) if durations else 0,
            "max_duration": max(durations) if durations else 0,
        }, indent=2))
    else:
        console.print(f"[cyan]Generating traffic summary...[/cyan]")
        # Rich output - create a simple summary
        total = len(traces)
        errors = sum(1 for t in traces if t.get("has_error") or t.get("has_fault"))
        durations = [t.get("duration", 0) for t in traces]
        avg_duration = sum(durations) / len(durations) if durations else 0
        max_duration = max(durations) if durations else 0

        console.print(Panel(
            f"Total Requests: {total}\n"
            f"Errors: {errors} ({100*errors/total:.1f}%)\n" if total else "Errors: 0\n"
            f"Avg Duration: {avg_duration:.3f}s\n"
            f"Max Duration: {max_duration:.3f}s",
            title=f"Traffic Summary (last {minutes} min)"
        ))


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "recent":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 30
            cmd_recent(minutes)
        elif command == "errors":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_errors(minutes)
        elif command == "slow":
            seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
            minutes = int(sys.argv[3]) if len(sys.argv) > 3 else 60
            cmd_slow(seconds, minutes)
        elif command == "ws":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_ws(minutes)
        elif command == "trace":
            if len(sys.argv) < 3:
                print("Usage: diagnose.py trace TRACE_ID")
                sys.exit(1)
            cmd_trace(sys.argv[2])
        elif command == "path":
            if len(sys.argv) < 3:
                print("Usage: diagnose.py path /path/to/endpoint")
                sys.exit(1)
            minutes = int(sys.argv[3]) if len(sys.argv) > 3 else 60
            cmd_path(sys.argv[2], minutes)
        elif command == "status":
            cmd_status()
        elif command == "summary":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_summary(minutes)
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
