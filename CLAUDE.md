# Drawing Agent - Development Instructions

## Project Overview

Drawing Agent is an autonomous AI artist application with:
- **Backend**: Python 3.11+ with FastAPI, Claude Agent SDK, WebSocket support
- **Frontend**: React Native with Expo, TypeScript, react-native-svg

## Environment Setup

- `.env` file lives in **project root** (not server/)
- Config loads from both `../.env` and `.env` so it works from any directory
- Required: `ANTHROPIC_API_KEY`

## Claude Code Sandbox

Sandbox configured in `.claude/settings.json`:
- Auto-allows `make`, `uv`, `pnpm`, `git`, `gh`, `curl`, and common dev commands
- No permission prompts for standard development workflows
- Run `make test`, `make dev`, `make lint`, `git commit`, `git push` freely

### How it works

Claude Code uses [bubblewrap](https://github.com/containers/bubblewrap) for sandboxing:
- Creates isolated mount namespace with read-only bind mounts by default
- `Edit()` permission rules in settings.json control bash write access (not `Write()`)
- **Use absolute paths** - tilde (`~`) expansion is unreliable in sandbox configs

Example: To allow uv cache writes, use `Edit(/home/user/.cache/uv/**)` not `Edit(~/.cache/uv/**)`

### Workaround for external cache directories

There's a path resolution bug where `Edit()` rules for paths outside the working directory get incorrectly concatenated. Until fixed, commands that write to `~/.cache/uv` or `~/.expo` require `dangerouslyDisableSandbox: true`.

Affected commands:
- `make server-bg` / `make server-restart` (uv cache)
- `pnpm start` in app/ (Expo cache)

## Development Servers

### Live Reload (IMPORTANT)

Both servers have **live reload enabled by default** - they auto-restart on file changes:
- **Python server**: Uvicorn with watchfiles (reload=True in dev mode)
- **React Native app**: Expo with Metro bundler hot reload

**DO NOT manually restart servers after code changes.** Just save the file and wait 1-2 seconds.

### Starting Dev Servers

```bash
# Start both (recommended)
make dev

# Or start individually:
make server    # Python server (foreground, live reload)
cd app && pnpm start  # React Native (Expo)
```

### Background Server (for Claude debugging)

```bash
# Start server in background with logging
make server-bg

# Tail server logs
make server-logs
# Or directly: tail -f server/logs/server.log

# Stop server
make server-stop

# Restart server (only if truly needed)
make server-restart
```

### When to Actually Restart

Only restart the server if:
1. You changed dependencies (pyproject.toml)
2. The server crashed (check logs)
3. You're seeing stale behavior after 5+ seconds post-save

**Never** use `pkill`, `kill`, or manual process management.

### Debug API Endpoints

```bash
# Check agent state
curl localhost:8000/debug/agent

# Get recent logs (default 100 lines)
curl "localhost:8000/debug/logs?lines=50"
```

The `/debug/agent` endpoint returns:
- `paused`, `status`, `container_id`
- `piece_count`, `stroke_count`
- `pending_nudges`, `connected_clients`
- `notes` and `monologue_preview` (first 500 chars)

## Code Standards

### Python (Backend)

- Use type hints everywhere
- Format with `ruff format`
- Lint with `ruff check`
- Use `uv` for dependency management
- Follow PEP 8 naming conventions
- Async/await for all I/O operations
- Pydantic for data validation

### TypeScript (Frontend)

- Strict TypeScript - no `any` types
- Format with Prettier
- Lint with ESLint
- Use functional components with hooks
- Prefer named exports over default exports

## Key Architecture Decisions

1. **WebSocket for real-time**: All drawing updates stream via WebSocket at 60fps
2. **Claude Agent SDK sandbox**: Agent code executes in isolated sandbox
3. **Path-based drawing**: Agent writes code that outputs path definitions, not pixel data
4. **Stateless agent turns**: Each agent turn receives full context (canvas image + notes)

## Testing Requirements

- Backend: pytest with async support
- Frontend: Jest + React Native Testing Library
- All new features need tests
- Run `make test` before committing

## Common Tasks

### Adding a new WebSocket message type

1. Add type to `server/drawing_agent/types.py`
2. Add handler function in `server/drawing_agent/handlers.py`
3. Add to `HANDLERS` dict in `handlers.py`
4. Add type to `app/src/types.ts`
5. Add handler in `app/src/utils/messageHandlers.ts`

### Modifying the agent prompt

Edit `server/drawing_agent/agent.py` - the `SYSTEM_PROMPT` constant

### Adding new path types

1. Add type to `PathType` enum in `server/drawing_agent/types.py`
2. Add interpolation in `server/drawing_agent/interpolation.py`
3. Add SVG rendering in `app/src/components/Canvas.tsx`

## File Locations

### Backend (server/drawing_agent/)
- `main.py` - FastAPI app, routes, WebSocket endpoint
- `agent.py` - Claude agent with streaming turn execution
- `handlers.py` - WebSocket message handlers
- `orchestrator.py` - Agent loop management
- `connections.py` - WebSocket ConnectionManager
- `interpolation.py` - Pure path interpolation functions
- `executor.py` - Real-time path execution
- `state.py` - In-memory state with persistence
- `config.py` - All settings (drawing_fps, stroke_delay, etc.)
- `types.py` - Pydantic models and message types

### Frontend (app/src/)
- `App.tsx` - Main app component
- `components/Canvas.tsx` - SVG canvas with touch handling
- `hooks/useCanvas.ts` - Canvas state management
- `hooks/useWebSocket.ts` - WebSocket connection
- `utils/messageHandlers.ts` - Message routing
- `utils/canvas.ts` - Coordinate utilities
- `types.ts` - TypeScript type definitions

## Server Deployment (AWS)

### Cutting a Release

Deploy to production by creating a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers `.github/workflows/release.yml` which:
1. Builds Docker image from `server/`
2. Pushes to AWS ECR with version tag + `latest`
3. Creates GitHub Release with changelog
4. Watchtower on EC2 auto-pulls new image within 30 seconds

### Infrastructure (Terraform)

All infrastructure is managed via Terraform in `infrastructure/`:

```
infrastructure/
├── main.tf            # Provider config
├── variables.tf       # Input variables
├── outputs.tf         # Output values (URLs, IPs, commands)
├── vpc.tf             # VPC, subnet, internet gateway
├── ec2.tf             # EC2 instance, security group, IAM role, EBS data volume
├── ecr.tf             # ECR repository + lifecycle policy
├── route53.tf         # DNS records
├── ses.tf             # SES email sending (domain verification, DKIM, SPF, DMARC)
├── monitoring.tf      # CloudWatch alarms
├── backup.tf          # DLM backup policies (snapshots EBS volumes tagged Backup=true)
├── github_actions.tf  # IAM user for GitHub Actions ECR push
└── user_data.sh       # EC2 bootstrap script (Docker, CloudWatch agent, EBS mount)
```

**Key resources:**
- **EC2** (t3.small, 2GB RAM) running Docker Compose
- **EBS** 10GB data volume at `/home/ec2-user/data` (persists across instance replacement)
- **ECR** repository with 5-image retention
- **Elastic IP** for stable addressing
- **Route 53** DNS (monet.dmfenton.net)
- **SES** email sending with domain verification, DKIM, SPF, DMARC
- **CloudWatch** alerts to email

**Terraform commands:**
```bash
cd infrastructure

# Initialize
terraform init

# Plan changes
terraform plan -var="ssh_key_name=your-key" -var="alert_email=you@example.com"

# Apply
terraform apply -var="ssh_key_name=your-key" -var="alert_email=you@example.com"

# Get outputs (IP, URLs, SSH command)
terraform output
```

### SES Email Sending

SES is configured for sending magic link emails from `noreply@dmfenton.net`.

**What Terraform creates:**
- Domain identity verification (TXT record)
- DKIM signing (3 CNAME records)
- SPF record for domain authentication
- DMARC record for email policy
- Custom MAIL FROM domain (`mail.dmfenton.net`)
- IAM policy for EC2 to send emails

**After applying Terraform:**
1. Wait ~5 minutes for DNS propagation
2. Check verification status in AWS Console
3. If in SES sandbox, request production access

**SES Sandbox Limitations:**
- New SES accounts start in "sandbox" mode
- Can only send to verified email addresses
- Request production access via AWS Console → SES → Account Dashboard → Request Production Access

**Environment variables for the app:**
```bash
# Add to .env
SES_SENDER_EMAIL=noreply@dmfenton.net
AWS_REGION=us-east-1
```

**Testing email sending:**
```bash
# From EC2 instance (uses instance role)
aws ses send-email \
  --from noreply@dmfenton.net \
  --to your@email.com \
  --subject "Test" \
  --text "Hello from SES"
```

### Remote Server Management (SSM)

Use `scripts/remote.py` to manage the server via AWS SSM (no SSH needed):

```bash
# View container logs
uv run python scripts/remote.py logs

# Restart container
uv run python scripts/remote.py restart

# Run migrations
uv run python scripts/remote.py migrate

# Create invite code
uv run python scripts/remote.py create-invite

# Create user directly
uv run python scripts/remote.py create-user EMAIL [PASSWORD]

# Run command in container
uv run python scripts/remote.py exec "command"

# Run command on host
uv run python scripts/remote.py shell "command"
```

**Note:** Commands that start Python inside the container can be slow (~30s) due to `uv run` overhead. For direct database access, use sqlite3 on the host:

```bash
uv run python scripts/remote.py shell "sqlite3 /home/ec2-user/data/drawing_agent.db '.tables'"
```

### SSH Access (if needed)

```bash
ssh -i ~/.ssh/drawing-agent.pem ec2-user@$(terraform -chdir=infrastructure output -raw public_ip)
```

### GitHub Actions IAM User

Managed by Terraform in `infrastructure/github_actions.tf`:

```bash
cd infrastructure

# Create/update IAM user
terraform apply

# Get credentials and set GitHub secrets
gh secret set AWS_ACCESS_KEY_ID --body "$(terraform output -raw github_actions_access_key_id)"
gh secret set AWS_SECRET_ACCESS_KEY --body "$(terraform output -raw github_actions_secret_access_key)"
```

### Required GitHub Secrets (Server)

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key for ECR push |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key for ECR push |

Add at: https://github.com/dmfenton/Sketchpad/settings/secrets/actions

---

## Database & Storage

### Architecture

- **SQLite** (via SQLAlchemy async): Auth only (users, invite codes)
- **Filesystem**: Per-user workspace data

### Database Location

- Dev: `server/data/drawing_agent.db`
- Prod (container): `/app/data/drawing_agent.db`
- Prod (host): `/home/ec2-user/data/drawing_agent.db` (on EBS volume)

### Migrations

```bash
# Create new migration
uv run alembic revision -m "description"

# Run migrations
uv run alembic upgrade head

# Check current version
uv run alembic current
```

### Workspace Storage

Each user has a filesystem directory:
```
agent_workspace/users/{user_id}/
├── workspace.json       # Canvas state, notes, piece_count
└── gallery/
    └── piece_000001.json  # Saved artwork
```

### CLI Commands

```bash
# Create invite code
uv run python -m drawing_agent.cli invite create

# List invite codes
uv run python -m drawing_agent.cli invite list

# Revoke unused invite code
uv run python -m drawing_agent.cli invite revoke CODE
```

### Creating Users Directly

To create a user without an invite code (e.g., admin):

```python
# Run from server/ directory
uv run python -c "
import asyncio
from drawing_agent.db import get_session, repository
from drawing_agent.auth.password import hash_password

async def create_user(email: str, password: str):
    async with get_session() as session:
        existing = await repository.get_user_by_email(session, email)
        if existing:
            print(f'User already exists: id={existing.id}')
            return
        user = await repository.create_user(session, email, hash_password(password))
        print(f'Created user: {email} (id={user.id})')

asyncio.run(create_user('admin@example.com', 'ChangeMe123!'))
"
```

---

## Authentication

### Sign-in Methods

**Magic Link (default):**
1. User enters email in app
2. Server sends email with sign-in link via SES
3. User taps link → iOS Universal Link opens app
4. App exchanges token for JWT → user authenticated

**Password (legacy):**
1. Admin creates invite code via CLI
2. User signs up with invite code + password
3. User signs in with email/password

### JWT Tokens

- Access token (30 min) for API calls
- Refresh token (7 days) to get new access token
- WebSocket auth via `?token=<jwt>` query param

### Magic Link API

```bash
# Request magic link (sends email)
curl -X POST https://monet.dmfenton.net/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Verify magic link token (returns JWT)
curl -X POST https://monet.dmfenton.net/auth/magic-link/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123..."}'
```

### iOS Universal Links

The app uses Universal Links so magic link emails open directly in the app:

- **AASA endpoint:** `https://monet.dmfenton.net/.well-known/apple-app-site-association`
- **Path handled:** `/auth/verify?token=...`
- **Bundle ID:** `net.dmfenton.sketchpad`
- **Team ID:** Set via `APPLE_TEAM_ID` env var on server

The AASA file is served dynamically by the FastAPI server (see `main.py`).

### Environment Variables

```bash
# Required for auth
JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">

# Required for iOS Universal Links
APPLE_TEAM_ID=PG5D259899
```

---

## iOS Deployment (TestFlight)

### Triggering a Build

Create and push a version tag to trigger a TestFlight build:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or manually trigger via GitHub Actions → TestFlight Deploy → Run workflow.

### How It Works

1. GitHub Actions (macos-15) runs on tag push
2. `expo prebuild` generates native iOS project
3. Fastlane builds and signs the IPA
4. Fastlane uploads to TestFlight

### Key Files

- `.github/workflows/testflight.yml` - CI workflow
- `app/fastlane/Fastfile` - Build and upload lanes
- `app/fastlane/Appfile` - App Store Connect config
- `app/app.config.js` - Dynamic versioning from env vars

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect issuer ID |
| `APP_STORE_CONNECT_API_KEY_P8` | .p8 key file contents |
| `IOS_DISTRIBUTION_CERT_P12` | Base64-encoded .p12 certificate |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | Certificate password |
| `IOS_PROVISIONING_PROFILE` | Base64-encoded .mobileprovision |
| `APPLE_TEAM_ID` | 10-char Apple team ID |
| `APPLE_ID` | Apple Developer email |
| `ITC_TEAM_ID` | App Store Connect team ID |
| `KEYCHAIN_PASSWORD` | Random string for CI keychain |

### Versioning

Version is extracted from git tag (e.g., `v1.2.3` → version `1.2.3`).
Build number is auto-generated from timestamp.

### Production WebSocket URL

Update `EXPO_PUBLIC_WS_URL` in `.github/workflows/testflight.yml` to point to your production server.

---

## Troubleshooting

### Docker container shows "unhealthy"

The healthcheck uses `curl` but `python:3.11-slim` doesn't include it. The app is likely fine - verify with:

```bash
uv run python scripts/remote.py shell "docker exec drawing-agent python -c 'import urllib.request; print(urllib.request.urlopen(\"http://localhost:8000/health\").read())'"
```

### SQLite database locking

SQLite doesn't handle concurrent writers. If you get "database is locked" errors:
1. Don't run Python scripts that write to DB while the app is running
2. Use `scripts/remote.py shell` with sqlite3 for direct DB access
3. Or stop the container first: `uv run python scripts/remote.py shell "docker stop drawing-agent"`

### SSM commands timing out

If `scripts/remote.py` commands timeout:
1. Check instance health: `aws ec2 describe-instance-status --instance-ids <id>`
2. Instance may be undersized (t3.micro only has 1GB RAM)
3. Current production uses t3.small (2GB RAM)

### Container commands slow

`uv run` inside the container is slow (~30s) because it syncs the venv. For quick DB operations, use sqlite3 directly:

```bash
uv run python scripts/remote.py shell "sqlite3 /home/ec2-user/data/drawing_agent.db 'SELECT * FROM users;'"
```

### Missing tools in slim image

`python:3.11-slim` doesn't include: `curl`, `pkill`, `sqlite3`, etc. Use Python or install via apt if needed.
