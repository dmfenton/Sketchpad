#!/usr/bin/env python3
"""Diagnostic script for querying AWS X-Ray traces.

Usage:
    uv run python scripts/diagnose.py recent          # Recent traces
    uv run python scripts/diagnose.py errors          # Recent error traces
    uv run python scripts/diagnose.py trace TRACE_ID  # Get trace details
    uv run python scripts/diagnose.py path /auth/verify  # Traces for endpoint
"""

import json
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
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
    return {
        "id": trace.get("Id", ""),
        "duration": f"{trace.get('Duration', 0):.2f}s",
        "response_time": f"{trace.get('ResponseTime', 0):.3f}s",
        "has_error": trace.get("HasError", False),
        "has_fault": trace.get("HasFault", False),
        "http_status": trace.get("Http", {}).get("HttpStatus"),
        "http_method": trace.get("Http", {}).get("HttpMethod"),
        "http_url": trace.get("Http", {}).get("HttpURL"),
    }


def get_recent_traces(
    minutes: int = 30,
    filter_expression: str | None = None,
    limit: int = 20
) -> list[dict[str, Any]]:
    """Get recent traces from X-Ray."""
    client = get_xray_client()

    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(minutes=minutes)

    params: dict[str, Any] = {
        "StartTime": start_time,
        "EndTime": end_time,
    }
    if filter_expression:
        params["FilterExpression"] = filter_expression

    response = client.get_trace_summaries(**params)
    summaries = response.get("TraceSummaries", [])[:limit]

    return [format_trace_summary(t) for t in summaries]


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
        segments.append({
            "name": doc.get("name"),
            "start_time": doc.get("start_time"),
            "end_time": doc.get("end_time"),
            "error": doc.get("error"),
            "fault": doc.get("fault"),
            "http": doc.get("http"),
            "exception": doc.get("cause", {}).get("exceptions", []),
            "annotations": doc.get("annotations"),
            "metadata": doc.get("metadata"),
        })

    return {
        "id": trace.get("Id"),
        "duration": trace.get("Duration"),
        "segments": segments,
    }


def display_traces_table(traces: list[dict[str, Any]], title: str = "Traces") -> None:
    """Display traces in a table."""
    table = Table(title=title)
    table.add_column("Trace ID", style="cyan", no_wrap=True)
    table.add_column("Method", style="green")
    table.add_column("URL", style="blue")
    table.add_column("Status", style="yellow")
    table.add_column("Duration", style="magenta")
    table.add_column("Error", style="red")

    for trace in traces:
        error_marker = ""
        if trace.get("has_fault"):
            error_marker = "FAULT"
        elif trace.get("has_error"):
            error_marker = "ERROR"

        table.add_row(
            trace.get("id", "")[:24] + "...",
            trace.get("http_method", "-"),
            (trace.get("http_url", "-") or "-")[:40],
            str(trace.get("http_status", "-")),
            trace.get("response_time", "-"),
            error_marker,
        )

    console.print(table)


def display_trace_details(details: dict[str, Any]) -> None:
    """Display trace details."""
    if "error" in details:
        console.print(f"[red]{details['error']}[/red]")
        return

    console.print(Panel(f"Trace ID: {details['id']}", title="Trace Details"))

    for segment in details.get("segments", []):
        title = f"[bold]{segment.get('name', 'Unknown')}[/bold]"
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

        if segment.get("annotations"):
            content.append("\nAnnotations:")
            content.append(json.dumps(segment["annotations"], indent=2))

        console.print(Panel("\n".join(content) if content else "No details", title=title))


def cmd_recent(minutes: int = 30) -> None:
    """Show recent traces."""
    console.print(f"[cyan]Fetching traces from last {minutes} minutes...[/cyan]")
    traces = get_recent_traces(minutes=minutes)

    if not traces:
        console.print("[yellow]No traces found[/yellow]")
        return

    display_traces_table(traces, f"Recent Traces (last {minutes} min)")


def cmd_errors(minutes: int = 60) -> None:
    """Show recent error traces."""
    console.print(f"[cyan]Fetching error traces from last {minutes} minutes...[/cyan]")
    traces = get_recent_traces(
        minutes=minutes,
        filter_expression='fault = true OR error = true'
    )

    if not traces:
        console.print("[green]No error traces found[/green]")
        return

    display_traces_table(traces, f"Error Traces (last {minutes} min)")


def cmd_trace(trace_id: str) -> None:
    """Show trace details."""
    console.print(f"[cyan]Fetching trace {trace_id}...[/cyan]")
    details = get_trace_details(trace_id)
    display_trace_details(details)


def cmd_path(path: str, minutes: int = 60) -> None:
    """Show traces for a specific path."""
    console.print(f"[cyan]Fetching traces for {path} from last {minutes} minutes...[/cyan]")
    # X-Ray filter expression for HTTP URL
    filter_expr = f'http.url CONTAINS "{path}"'
    traces = get_recent_traces(minutes=minutes, filter_expression=filter_expr)

    if not traces:
        console.print(f"[yellow]No traces found for {path}[/yellow]")
        return

    display_traces_table(traces, f"Traces for {path}")


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        console.print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "recent":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 30
            cmd_recent(minutes)
        elif command == "errors":
            minutes = int(sys.argv[2]) if len(sys.argv) > 2 else 60
            cmd_errors(minutes)
        elif command == "trace":
            if len(sys.argv) < 3:
                console.print("[red]Usage: diagnose.py trace TRACE_ID[/red]")
                sys.exit(1)
            cmd_trace(sys.argv[2])
        elif command == "path":
            if len(sys.argv) < 3:
                console.print("[red]Usage: diagnose.py path /path/to/endpoint[/red]")
                sys.exit(1)
            minutes = int(sys.argv[3]) if len(sys.argv) > 3 else 60
            cmd_path(sys.argv[2], minutes)
        else:
            console.print(f"[red]Unknown command: {command}[/red]")
            console.print(__doc__)
            sys.exit(1)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    main()
