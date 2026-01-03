#!/usr/bin/env python3
"""Server management script using AWS SSM.

Usage:
    python scripts/server.py migrate           # Run database migrations
    python scripts/server.py logs              # Tail container logs
    python scripts/server.py restart           # Restart the container
    python scripts/server.py exec "command"    # Run arbitrary command
    python scripts/server.py create-user EMAIL # Create admin user
    python scripts/server.py create-invite     # Create invite code
"""

import subprocess
import sys
import time

import boto3

# Configuration
REGION = "us-east-1"
INSTANCE_ID = "i-0c0ecf7940f4ce37c"
CONTAINER = "drawing-agent"


def get_ssm_client():
    return boto3.client("ssm", region_name=REGION)


def run_command(command: str, timeout: int = 30) -> tuple[int, str, str]:
    """Run a command on the EC2 instance via SSM."""
    ssm = get_ssm_client()

    response = ssm.send_command(
        InstanceIds=[INSTANCE_ID],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [command]},
        TimeoutSeconds=timeout,
    )

    command_id = response["Command"]["CommandId"]

    # Wait for completion
    for _ in range(timeout):
        time.sleep(1)
        try:
            result = ssm.get_command_invocation(
                CommandId=command_id,
                InstanceId=INSTANCE_ID,
            )
            if result["Status"] in ("Success", "Failed", "Cancelled", "TimedOut"):
                return (
                    result["ResponseCode"],
                    result["StandardOutputContent"],
                    result["StandardErrorContent"],
                )
        except ssm.exceptions.InvocationDoesNotExist:
            continue

    return -1, "", "Command timed out"


def docker_exec(cmd: str, timeout: int = 30) -> tuple[int, str, str]:
    """Run a command inside the Docker container."""
    return run_command(f"docker exec {CONTAINER} {cmd}", timeout)


def migrate():
    """Run database migrations."""
    print("Running migrations...")
    code, stdout, stderr = docker_exec("uv run python -m alembic upgrade head", timeout=60)
    print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    return code


def logs(lines: int = 100):
    """Get recent container logs."""
    code, stdout, stderr = run_command(f"docker logs --tail {lines} {CONTAINER}")
    print(stdout)
    if stderr:
        print(stderr)
    return code


def restart():
    """Restart the container."""
    print("Restarting container...")
    code, stdout, stderr = run_command(f"docker restart {CONTAINER}", timeout=60)
    print(stdout or "Container restarted")
    if stderr:
        print(stderr, file=sys.stderr)
    return code


def create_user(email: str, password: str = "ChangeMe123!"):
    """Create a user directly in the database."""
    script = f'''
import asyncio
from drawing_agent.db import get_session, repository
from drawing_agent.auth.password import hash_password

async def create():
    async with get_session() as session:
        existing = await repository.get_user_by_email(session, "{email}")
        if existing:
            print(f"User already exists: id={{existing.id}}")
            return
        user = await repository.create_user(session, "{email}", hash_password("{password}"))
        print(f"Created user: {{user.email}} (id={{user.id}})")

asyncio.run(create())
'''
    print(f"Creating user: {email}")
    code, stdout, stderr = docker_exec(f"uv run python -c '{script}'", timeout=30)
    print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    if code == 0:
        print(f"Password: {password}")
    return code


def create_invite():
    """Create an invite code."""
    print("Creating invite code...")
    code, stdout, stderr = docker_exec("uv run python -m drawing_agent.cli invite create")
    print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    return code


def exec_cmd(command: str):
    """Run arbitrary command in container."""
    code, stdout, stderr = docker_exec(command, timeout=60)
    print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    return code


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "migrate":
        sys.exit(migrate())
    elif cmd == "logs":
        lines = int(sys.argv[2]) if len(sys.argv) > 2 else 100
        sys.exit(logs(lines))
    elif cmd == "restart":
        sys.exit(restart())
    elif cmd == "create-user":
        if len(sys.argv) < 3:
            print("Usage: server.py create-user EMAIL [PASSWORD]")
            sys.exit(1)
        email = sys.argv[2]
        password = sys.argv[3] if len(sys.argv) > 3 else "ChangeMe123!"
        sys.exit(create_user(email, password))
    elif cmd == "create-invite":
        sys.exit(create_invite())
    elif cmd == "exec":
        if len(sys.argv) < 3:
            print("Usage: server.py exec 'command'")
            sys.exit(1)
        sys.exit(exec_cmd(" ".join(sys.argv[2:])))
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
