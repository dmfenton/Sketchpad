"""CLI for Drawing Agent - user and workspace management.

Usage:
    python -m code_monet.cli invite create
    python -m code_monet.cli invite list
    python -m code_monet.cli invite revoke CODE
    python -m code_monet.cli user list
    python -m code_monet.cli user workspace USER_ID
    python -m code_monet.cli workspace list
"""

import asyncio
import secrets
from pathlib import Path as FilePath
from typing import Any

import typer
from rich import box
from rich.console import Console
from rich.table import Table

app = typer.Typer(
    name="drawing-agent",
    help="CLI for Drawing Agent",
    add_completion=False,
)
console = Console()

# =============================================================================
# Invite Code Commands
# =============================================================================

invite_app = typer.Typer(help="Manage invite codes for user registration")
app.add_typer(invite_app, name="invite")


def _generate_invite_code() -> str:
    """Generate a random invite code."""
    return secrets.token_urlsafe(16)


async def _create_invites_async(count: int) -> list[str]:
    """Create invite codes in the database."""
    from code_monet.db import get_session, repository

    codes: list[str] = []
    async with get_session() as session:
        for _ in range(count):
            code = _generate_invite_code()
            await repository.create_invite_code(session, code)
            codes.append(code)
    return codes


async def _list_invites_async() -> list[tuple[str, str, str | None, str | None]]:
    """List all invite codes from the database."""
    from code_monet.db import get_session, repository

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
    from code_monet.db import get_session, repository

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


# =============================================================================
# User Commands
# =============================================================================

user_app = typer.Typer(help="Manage users and view workspace state")
app.add_typer(user_app, name="user")


async def _list_users_with_workspace_async() -> list[tuple[str, str, str, bool, int, int, str]]:
    """List users with workspace summary."""
    from code_monet.db import get_session, repository
    from code_monet.workspace_state import WorkspaceState

    results: list[tuple[str, str, str, bool, int, int, str]] = []

    async with get_session() as session:
        users = await repository.list_users(session, active_only=False)

        for user in users:
            created = user.created_at.strftime("%Y-%m-%d %H:%M")

            # Try to load workspace state
            try:
                state = await WorkspaceState.load_for_user(user.id)
                piece_count = state.piece_count
                stroke_count = len(state.canvas.strokes)
                status = state.status.value
            except Exception:
                piece_count = 0
                stroke_count = 0
                status = "no workspace"

            results.append(
                (
                    user.id,
                    user.email,
                    created,
                    user.is_active,
                    piece_count,
                    stroke_count,
                    status,
                )
            )

    return results


async def _get_workspace_state_async(
    user_id: str,
) -> dict[str, Any]:
    """Get detailed workspace state for a user."""
    from code_monet.workspace_state import WorkspaceState

    state = await WorkspaceState.load_for_user(user_id)
    gallery = await state.list_gallery()

    return {
        "user_id": user_id,
        "status": state.status.value,
        "piece_count": state.piece_count,
        "stroke_count": len(state.canvas.strokes),
        "notes": state.notes,
        "monologue_preview": state.monologue[:200] + "..."
        if len(state.monologue) > 200
        else state.monologue,
        "gallery_count": len(gallery),
        "gallery": [
            {
                "id": p.id,
                "piece_number": p.piece_number,
                "stroke_count": p.stroke_count,
                "created_at": p.created_at,
            }
            for p in gallery
        ],
    }


@user_app.command("list")
def user_list(
    all_users: bool = typer.Option(False, "--all", "-a", help="Include inactive users"),
) -> None:
    """List all users with workspace summary.

    Shows user ID, email, creation date, and workspace stats.
    """
    try:
        users = asyncio.run(_list_users_with_workspace_async())
    except Exception as e:
        console.print(f"[red]Failed to list users: {e}[/red]")
        raise typer.Exit(1) from e

    if not users:
        console.print("[yellow]No users found[/yellow]")
        return

    # Filter inactive if not showing all
    if not all_users:
        users = [u for u in users if u[3]]  # u[3] is is_active

    table = Table(title="Users", box=box.ROUNDED)
    table.add_column("ID", style="cyan", justify="right")
    table.add_column("Email", style="white")
    table.add_column("Created", style="green")
    table.add_column("Active", style="yellow")
    table.add_column("Pieces", style="magenta", justify="right")
    table.add_column("Strokes", style="blue", justify="right")
    table.add_column("Status", style="white")

    for user_id, email, created, is_active, pieces, strokes, status in users:
        active_str = "[green]✓[/green]" if is_active else "[red]✗[/red]"
        table.add_row(
            str(user_id),
            email,
            created,
            active_str,
            str(pieces),
            str(strokes),
            status,
        )

    console.print(table)


@user_app.command("workspace")
def user_workspace(
    user_id: str = typer.Argument(..., help="The user ID (UUID) to inspect"),
) -> None:
    """Show detailed workspace state for a user.

    Displays canvas state, notes, and gallery contents.
    """
    try:
        data = asyncio.run(_get_workspace_state_async(user_id))
    except ValueError as e:
        console.print(f"[red]Invalid user ID: {e}[/red]")
        raise typer.Exit(1) from e
    except Exception as e:
        console.print(f"[red]Failed to load workspace: {e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"\n[bold cyan]Workspace for User {data['user_id']}[/bold cyan]\n")

    # Status table
    status_table = Table(box=box.SIMPLE, show_header=False)
    status_table.add_column("Key", style="dim")
    status_table.add_column("Value")

    status_table.add_row("Status", data["status"])
    status_table.add_row("Piece Count", str(data["piece_count"]))
    status_table.add_row("Current Strokes", str(data["stroke_count"]))
    status_table.add_row("Gallery Items", str(data["gallery_count"]))

    console.print(status_table)

    # Notes
    if data["notes"]:
        console.print("\n[bold]Notes:[/bold]")
        console.print(f"  {data['notes']}")

    # Monologue preview
    if data["monologue_preview"]:
        console.print("\n[bold]Monologue Preview:[/bold]")
        console.print(f"  [dim]{data['monologue_preview']}[/dim]")

    # Gallery
    if data["gallery"]:
        console.print("\n[bold]Gallery:[/bold]")
        gallery_table = Table(box=box.ROUNDED)
        gallery_table.add_column("ID", style="cyan")
        gallery_table.add_column("Piece #", justify="right")
        gallery_table.add_column("Strokes", justify="right")
        gallery_table.add_column("Created")

        for piece in data["gallery"]:
            gallery_table.add_row(
                piece["id"],
                str(piece["piece_number"]),
                str(piece["stroke_count"]),
                piece["created_at"][:19] if piece["created_at"] else "",
            )

        console.print(gallery_table)


# =============================================================================
# Workspace Commands
# =============================================================================

workspace_app = typer.Typer(help="Manage workspace filesystem")
app.add_typer(workspace_app, name="workspace")


async def _list_workspaces_async() -> list[dict[str, Any]]:
    """List all workspace directories with stats."""
    import re

    from code_monet.config import settings

    server_dir = FilePath(__file__).parent.parent
    base_dir = (server_dir / settings.workspace_base_dir).resolve()

    workspaces: list[dict[str, Any]] = []

    if not base_dir.exists():
        return workspaces

    # UUID pattern for valid user directories
    uuid_pattern = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
    )

    for user_dir in sorted(base_dir.iterdir()):
        if not user_dir.is_dir():
            continue

        # Validate directory name is a valid UUID
        if not uuid_pattern.match(user_dir.name):
            continue

        user_id = user_dir.name

        workspace_file = user_dir / "workspace.json"
        gallery_dir = user_dir / "gallery"

        # Count gallery items
        gallery_count = 0
        if gallery_dir.exists():
            gallery_count = len([f for f in gallery_dir.iterdir() if f.suffix == ".json"])

        # Check workspace file
        has_workspace = workspace_file.exists()
        workspace_size = workspace_file.stat().st_size if has_workspace else 0

        workspaces.append(
            {
                "user_id": user_id,
                "path": str(user_dir),
                "has_workspace": has_workspace,
                "workspace_size": workspace_size,
                "gallery_count": gallery_count,
            }
        )

    return workspaces


@workspace_app.command("list")
def workspace_list() -> None:
    """List all workspace directories.

    Shows filesystem-level view of user workspaces.
    """
    try:
        workspaces = asyncio.run(_list_workspaces_async())
    except Exception as e:
        console.print(f"[red]Failed to list workspaces: {e}[/red]")
        raise typer.Exit(1) from e

    if not workspaces:
        console.print("[yellow]No workspaces found[/yellow]")
        return

    table = Table(title="Workspaces", box=box.ROUNDED)
    table.add_column("User ID", style="cyan", justify="right")
    table.add_column("Workspace", style="yellow")
    table.add_column("Size", justify="right")
    table.add_column("Gallery", style="magenta", justify="right")
    table.add_column("Path", style="dim")

    for ws in workspaces:
        has_ws = "[green]✓[/green]" if ws["has_workspace"] else "[red]✗[/red]"
        size_str = f"{ws['workspace_size']:,} B" if ws["workspace_size"] else "-"
        table.add_row(
            str(ws["user_id"]),
            has_ws,
            size_str,
            str(ws["gallery_count"]),
            ws["path"],
        )

    console.print(table)


# Entry point
if __name__ == "__main__":
    app()
