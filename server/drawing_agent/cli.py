"""CLI for Drawing Agent - invite code management.

Usage:
    python -m drawing_agent.cli invite create
    python -m drawing_agent.cli invite list
    python -m drawing_agent.cli invite revoke CODE
"""

import asyncio
import secrets

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

# Invite code sub-command group
invite_app = typer.Typer(help="Manage invite codes for user registration")
app.add_typer(invite_app, name="invite")


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
