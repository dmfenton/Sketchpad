"""CLI testing wrapper for the Drawing Agent.

Usage:
    python -m drawing_agent.cli run-turn
    python -m drawing_agent.cli nudge "Draw a circle"
    python -m drawing_agent.cli status
    python -m drawing_agent.cli state
    python -m drawing_agent.cli workspace
    python -m drawing_agent.cli clear
    python -m drawing_agent.cli pause
    python -m drawing_agent.cli resume
    python -m drawing_agent.cli invite create
    python -m drawing_agent.cli invite list
    python -m drawing_agent.cli invite revoke CODE
"""

import asyncio
import json
import secrets
from datetime import datetime
from typing import Any

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from drawing_agent.agent import AgentCallbacks, CodeExecutionResult, DrawingAgent, ToolCallInfo
from drawing_agent.interpolation import estimate_path_length, interpolate_path
from drawing_agent.state import state_manager
from drawing_agent.types import AgentPathsEvent, AgentStatus, AgentTurnComplete, Path
from drawing_agent.workspace import workspace

app = typer.Typer(
    name="drawing-agent",
    help="CLI testing wrapper for the Drawing Agent",
    add_completion=False,
)
console = Console()

# Invite code sub-command group
invite_app = typer.Typer(help="Manage invite codes for user registration")
app.add_typer(invite_app, name="invite")


def _ts() -> str:
    """Get current timestamp string."""
    return datetime.now().isoformat()


def _format_size(size: int | float) -> str:
    """Format file size for display."""
    s = float(size)
    for unit in ["B", "KB", "MB"]:
        if s < 1024:
            return f"{s:.1f} {unit}"
        s /= 1024
    return f"{s:.1f} GB"


def _print_code_result(result: CodeExecutionResult) -> None:
    """Print code execution result."""
    status = (
        "[green]OK[/green]" if result.return_code == 0 else f"[red]Exit {result.return_code}[/red]"
    )
    console.print(f"\n[yellow]Code execution complete:[/yellow] {status}")

    if result.stdout:
        stdout_preview = result.stdout[:500] + ("..." if len(result.stdout) > 500 else "")
        console.print(Panel(stdout_preview, title="stdout", border_style="dim"))
    if result.stderr:
        stderr_preview = result.stderr[:200] + ("..." if len(result.stderr) > 200 else "")
        console.print(Panel(stderr_preview, title="stderr", border_style="red"))


def _log_paths_event(
    events_log: list[dict[str, Any]],
    event: AgentPathsEvent,
    json_output: bool,
    verbose: bool,
) -> None:
    """Log paths event."""
    paths_data = [{"type": p.type.value, "points": len(p.points)} for p in event.paths]
    log_event = {"type": "paths", "count": len(event.paths), "paths": paths_data, "ts": _ts()}
    events_log.append(log_event)

    if json_output:
        console.print(json.dumps(log_event))
    else:
        console.print(f"\n[green]Paths produced: {len(event.paths)}[/green]")
        if verbose:
            for i, path in enumerate(event.paths):
                length = estimate_path_length(path)
                interp = interpolate_path(path)
                console.print(
                    f"  [{i + 1}] {path.type.value}: {len(path.points)} pts, "
                    f"~{length:.0f}px, {len(interp)} interpolated"
                )


def _log_turn_complete(
    events_log: list[dict[str, Any]],
    event: AgentTurnComplete,
    json_output: bool,
) -> None:
    """Log turn complete event."""
    log_event = {
        "type": "turn_complete",
        "done": event.done,
        "thinking_len": len(event.thinking),
        "ts": _ts(),
    }
    events_log.append(log_event)

    if json_output:
        console.print(json.dumps(log_event))
    else:
        status = (
            "[bold green]PIECE COMPLETE[/bold green]"
            if event.done
            else "[blue]Turn complete[/blue]"
        )
        console.print(f"\n{status}")


def _print_summary(events_log: list[dict[str, Any]], elapsed: float) -> None:
    """Print summary of the turn."""
    console.print(Panel.fit("[bold]Turn Summary[/bold]", border_style="green"))

    table = Table(box=box.SIMPLE)
    table.add_column("Event Type", style="cyan")
    table.add_column("Count", style="green")

    counts: dict[str, int] = {}
    for e in events_log:
        t = e.get("type", "unknown")
        counts[t] = counts.get(t, 0) + 1

    for event_type, count in sorted(counts.items()):
        table.add_row(event_type, str(count))

    table.add_row("[bold]Total[/bold]", f"[bold]{len(events_log)}[/bold]")
    table.add_row("[bold]Elapsed[/bold]", f"[bold]{elapsed:.2f}s[/bold]")

    console.print(table)


def _print_strokes_table(strokes: list[Path]) -> None:
    """Print strokes as a table."""
    table = Table(title="Strokes", box=box.SIMPLE)
    table.add_column("#", style="dim")
    table.add_column("Type", style="cyan")
    table.add_column("Points", style="green")
    table.add_column("Length", style="yellow")

    for i, stroke in enumerate(strokes[:20]):  # Limit to 20
        length = estimate_path_length(stroke)
        table.add_row(str(i + 1), stroke.type.value, str(len(stroke.points)), f"{length:.0f}px")

    if len(strokes) > 20:
        table.add_row("...", f"+{len(strokes) - 20} more", "", "")

    console.print(table)


async def _run_turn_async(
    json_output: bool,
    verbose: bool,
    nudge_text: str | None = None,
    new_canvas: bool = False,
) -> None:
    """Async implementation of run-turn."""
    state_manager.load()

    # Clear canvas if requested
    if new_canvas:
        state_manager.clear_canvas()
        state_manager.notes = ""  # Clear notes too for fresh start
        state_manager.save()
        if not json_output:
            console.print("[yellow]Starting with fresh canvas[/yellow]")

    agent = DrawingAgent()
    if nudge_text:
        agent.add_nudge(nudge_text)
    await agent.resume()  # Ensure agent is not paused for this turn

    events_log: list[dict[str, Any]] = []
    start_time = datetime.now()

    # Callbacks for streaming output
    async def on_thinking(text: str, iteration: int) -> None:
        event = {"type": "thinking", "iteration": iteration, "text": text, "ts": _ts()}
        events_log.append(event)
        if json_output:
            console.print(json.dumps(event))
        else:
            console.print(f"[cyan]{text}[/cyan]", end="")

    async def on_iteration_start(current: int, max_iter: int) -> None:
        event = {"type": "iteration", "current": current, "max": max_iter, "ts": _ts()}
        events_log.append(event)
        if json_output:
            console.print(json.dumps(event))
        else:
            console.print(f"\n[bold blue]--- Iteration {current}/{max_iter} ---[/bold blue]")

    async def on_code_start(tool_info: ToolCallInfo) -> None:
        event = {
            "type": "code_start",
            "iteration": tool_info.iteration,
            "tool": tool_info.name,
            "ts": _ts(),
        }
        events_log.append(event)
        if json_output:
            console.print(json.dumps(event))
        else:
            console.print(f"\n[yellow]Executing {tool_info.name}...[/yellow]")

    async def on_code_result(result: CodeExecutionResult) -> None:
        event = {
            "type": "code_result",
            "iteration": result.iteration,
            "return_code": result.return_code,
            "stdout": result.stdout[:1000] if result.stdout else None,
            "stderr": result.stderr[:500] if result.stderr else None,
            "ts": _ts(),
        }
        events_log.append(event)
        if json_output:
            console.print(json.dumps(event))
        else:
            _print_code_result(result)

    async def on_error(message: str, details: str | None) -> None:
        event = {"type": "error", "message": message, "details": details, "ts": _ts()}
        events_log.append(event)
        if json_output:
            console.print(json.dumps(event))
        else:
            console.print(f"[red bold]ERROR: {message}[/red bold]")
            if details:
                console.print(f"[red]{details}[/red]")

    callbacks = AgentCallbacks(
        on_thinking=on_thinking,
        on_iteration_start=on_iteration_start,
        on_code_start=on_code_start,
        on_code_result=on_code_result,
        on_error=on_error,
    )

    console.print(Panel.fit("[bold]Starting Agent Turn[/bold]", border_style="green"))

    try:
        async for event in agent.run_turn(callbacks=callbacks):
            if isinstance(event, AgentPathsEvent):
                _log_paths_event(events_log, event, json_output, verbose)
            elif isinstance(event, AgentTurnComplete):
                _log_turn_complete(events_log, event, json_output)
    except Exception as e:
        console.print(f"[red bold]Turn failed: {e}[/red bold]")
        raise typer.Exit(1) from None

    # Print summary
    elapsed = (datetime.now() - start_time).total_seconds()
    _print_summary(events_log, elapsed)


@app.command("run-turn")
def run_turn(
    message: str = typer.Argument(None, help="Message/prompt for the agent"),
    new: bool = typer.Option(False, "--new", "-n", help="Start with a fresh canvas"),
    json_output: bool = typer.Option(False, "--json", "-j", help="Output raw JSON events"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed path info"),
) -> None:
    """Execute one agent turn, streaming events to stdout.

    Examples:
        python -m drawing_agent.cli run-turn
        python -m drawing_agent.cli run-turn "Draw a simple tree"
        python -m drawing_agent.cli run-turn --new "Draw 3 simple shapes"
    """
    asyncio.run(_run_turn_async(json_output, verbose, nudge_text=message, new_canvas=new))


@app.command()
def nudge(
    text: str = typer.Argument(..., help="Nudge message for the agent"),
    new: bool = typer.Option(False, "--new", "-n", help="Start with a fresh canvas"),
    run: bool = typer.Option(True, "--run/--no-run", help="Run a turn after nudging"),
    json_output: bool = typer.Option(False, "--json", "-j", help="Output raw JSON"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed path info"),
) -> None:
    """Add a nudge message and run a turn (nudge is passed directly to agent)."""
    console.print(f"[green]Nudge:[/green] {text}")

    if run:
        asyncio.run(_run_turn_async(json_output, verbose, nudge_text=text, new_canvas=new))
    else:
        console.print(
            "[yellow]Note: Nudges are not persisted. Use without --no-run to send nudge.[/yellow]"
        )


@app.command()
def status() -> None:
    """Show current agent state summary."""
    state_manager.load()
    agent = DrawingAgent()

    table = Table(title="Agent Status", box=box.ROUNDED)
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Paused", str(agent.paused))
    table.add_row("Status", state_manager.status.value)
    table.add_row("Container ID", agent.container_id or "(none)")
    table.add_row("Piece Count", str(state_manager.piece_count))
    table.add_row("Stroke Count", str(len(state_manager.canvas.strokes)))
    table.add_row("Pending Nudges", str(len(agent.pending_nudges)))

    console.print(table)


@app.command()
def state(
    strokes: bool = typer.Option(False, "--strokes", "-s", help="Show stroke details"),
    monologue: bool = typer.Option(False, "--monologue", "-m", help="Show full monologue"),
    notes: bool = typer.Option(False, "--notes", "-n", help="Show notes"),
) -> None:
    """Show full agent state (canvas, notes, monologue)."""
    state_manager.load()

    # Canvas info
    console.print(Panel.fit("[bold]Canvas State[/bold]", border_style="blue"))
    console.print(f"  Size: {state_manager.canvas.width}x{state_manager.canvas.height}")
    console.print(f"  Strokes: {len(state_manager.canvas.strokes)}")

    if strokes and state_manager.canvas.strokes:
        _print_strokes_table(state_manager.canvas.strokes)

    # Notes
    notes_text = state_manager.notes
    if notes_text:
        console.print(Panel.fit("[bold]Notes[/bold]", border_style="yellow"))
        if notes:
            console.print(notes_text)
        else:
            console.print(f"  {len(notes_text)} chars (use --notes to show)")

    # Monologue
    mono_text = state_manager.monologue
    if mono_text:
        console.print(Panel.fit("[bold]Monologue[/bold]", border_style="cyan"))
        if monologue:
            console.print(mono_text)
        else:
            preview = mono_text[:200] + "..." if len(mono_text) > 200 else mono_text
            console.print(f"  {preview}")
            console.print(f"  ({len(mono_text)} chars total, use --monologue to show full)")


@app.command("workspace")
def show_workspace(
    show_history: bool = typer.Option(False, "--history", "-h", help="Show recent history"),
    history_lines: int = typer.Option(10, "--lines", "-l", help="Number of history entries"),
) -> None:
    """List and inspect workspace files."""
    console.print(Panel.fit(f"[bold]Workspace: {workspace.root}[/bold]", border_style="magenta"))

    # List files
    table = Table(title="Workspace Files", box=box.SIMPLE)
    table.add_column("File", style="cyan")
    table.add_column("Size", style="green")
    table.add_column("Modified", style="yellow")

    for filepath in workspace.root.iterdir():
        if filepath.is_file():
            stat = filepath.stat()
            table.add_row(
                filepath.name,
                _format_size(stat.st_size),
                datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            )

    console.print(table)

    # Gallery
    gallery = workspace.list_gallery()
    console.print(f"\n[bold]Gallery:[/bold] {len(gallery)} pieces")

    if show_history:
        history = workspace.read_history(history_lines)
        if history:
            console.print(Panel.fit("[bold]Recent History[/bold]", border_style="blue"))
            for entry in history:
                console.print(f"  [{entry.get('timestamp', '?')}] {json.dumps(entry)[:100]}")


@app.command("clear")
def clear_canvas() -> None:
    """Clear the canvas."""
    state_manager.load()
    state_manager.clear_canvas()
    console.print("[green]Canvas cleared[/green]")


@app.command()
def pause() -> None:
    """Pause the agent."""
    state_manager.load()
    state_manager.status = AgentStatus.PAUSED
    state_manager.save()
    console.print("[yellow]Agent paused[/yellow]")


@app.command()
def resume() -> None:
    """Resume the agent."""
    state_manager.load()
    state_manager.status = AgentStatus.IDLE
    state_manager.save()
    console.print("[green]Agent resumed[/green]")


# =============================================================================
# Invite Code Commands
# =============================================================================


def _generate_invite_code() -> str:
    """Generate a random invite code."""
    return secrets.token_urlsafe(16)


async def _create_invites_async(count: int) -> list[str]:
    """Create invite codes in the database."""
    from drawing_agent.db import get_session, repository

    codes: list[str] = []
    async with get_session() as session:
        for _ in range(count):
            code = _generate_invite_code()
            await repository.create_invite_code(session, code)
            codes.append(code)
    return codes


async def _list_invites_async() -> list[tuple[str, str, str | None, int | None]]:
    """List all invite codes from the database."""
    from drawing_agent.db import get_session, repository

    async with get_session() as session:
        invites = await repository.list_invite_codes(session)
        return [
            (
                inv.code,
                inv.created_at.strftime("%Y-%m-%d %H:%M"),
                inv.used_at.strftime("%Y-%m-%d %H:%M") if inv.used_at else None,
                inv.used_by_user_id,
            )
            for inv in invites
        ]


async def _revoke_invite_async(code: str) -> bool:
    """Revoke an invite code."""
    from drawing_agent.db import get_session, repository

    async with get_session() as session:
        return await repository.revoke_invite_code(session, code)


@invite_app.command("create")
def invite_create(
    count: int = typer.Option(1, "--count", "-c", help="Number of invite codes to create"),
) -> None:
    """Create invite code(s) for user registration.

    Examples:
        drawing-agent invite create
        drawing-agent invite create -c 5
    """
    if count < 1:
        console.print("[red]Count must be at least 1[/red]")
        raise typer.Exit(1)

    try:
        codes = asyncio.run(_create_invites_async(count))
    except Exception as e:
        console.print(f"[red]Failed to create invite codes: {e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]Created {len(codes)} invite code(s):[/green]")
    for code in codes:
        console.print(f"  {code}")


@invite_app.command("list")
def invite_list() -> None:
    """List all invite codes.

    Shows code, creation date, and usage status.
    """
    try:
        invites = asyncio.run(_list_invites_async())
    except Exception as e:
        console.print(f"[red]Failed to list invite codes: {e}[/red]")
        raise typer.Exit(1) from e

    if not invites:
        console.print("[yellow]No invite codes found[/yellow]")
        return

    table = Table(title="Invite Codes", box=box.ROUNDED)
    table.add_column("Code", style="cyan")
    table.add_column("Created", style="green")
    table.add_column("Status", style="yellow")

    for code, created, used_at, used_by in invites:
        if used_at:
            status = f"[red]Used {used_at} (user {used_by})[/red]"
        else:
            status = "[green]Available[/green]"
        table.add_row(code, created, status)

    console.print(table)


@invite_app.command("revoke")
def invite_revoke(
    code: str = typer.Argument(..., help="The invite code to revoke"),
) -> None:
    """Revoke an unused invite code.

    Only unused codes can be revoked.
    """
    try:
        success = asyncio.run(_revoke_invite_async(code))
    except Exception as e:
        console.print(f"[red]Failed to revoke invite code: {e}[/red]")
        raise typer.Exit(1) from e

    if success:
        console.print(f"[green]Invite code revoked: {code}[/green]")
    else:
        console.print(f"[red]Code not found or already used: {code}[/red]")
        raise typer.Exit(1)


# Entry point
if __name__ == "__main__":
    app()
