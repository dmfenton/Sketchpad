# Code Monet - Development Instructions

## Project Overview

Code Monet is an autonomous AI artist application with:

- **Backend**: Python 3.11+ with FastAPI, Claude Agent SDK, WebSocket support
- **Frontend**: React Native with Expo, TypeScript, react-native-svg

## Environment Setup

- `.env` file lives in **project root** (not server/)
- Config loads from both `../.env` and `.env` so it works from any directory
- Required: `ANTHROPIC_API_KEY`

## Package Management

**This project uses npm workspaces.**

### Workspace Structure

```
/                    # Root workspace
├── app/             # React Native app (Expo)
├── web/             # Vite web app
├── shared/          # Shared TypeScript library
└── server/          # Python backend (uses uv, not npm)
```

### Key Rules

1. **Always use npm** - Run `npm install` from project root
2. **Build shared after changes** - Run `cd shared && npm run build` after modifying shared/
3. **Install from root** - Run `npm install` from project root, not subdirectories

### Adding Dependencies

```bash
# Add to specific workspace
npm install <package> -w app
npm install <package> -w web
npm install <package> -w shared

# Add to root (dev tools, etc.)
npm install <package>
```

### Common Issues

**Stale shared library** - Rebuild:

```bash
cd shared && npm run build
```

**Dependency issues** - Clean reinstall:

```bash
rm -rf node_modules app/node_modules web/node_modules shared/node_modules package-lock.json
npm install
```

## Claude Code Sandbox

Sandbox configured in `.claude/settings.json`:

- Auto-allows `make`, `uv`, `npm`, `git`, `gh`, `curl`, and common dev commands
- No permission prompts for standard development workflows
- Run `make test`, `make dev`, `make lint`, `git commit`, `git push` freely

### How it works

Claude Code uses [bubblewrap](https://github.com/containers/bubblewrap) for sandboxing:

- Creates isolated mount namespace with read-only bind mounts by default
- `Edit()` permission rules in settings.json control bash write access (not `Write()`)
- **Use absolute paths** - tilde (`~`) expansion is unreliable in sandbox configs

Example: To allow uv cache writes, use `Edit(/home/user/.cache/uv/**)` not `Edit(~/.cache/uv/**)`

### Network access (Linux only)

On Linux, bubblewrap creates an isolated network namespace. All traffic routes through a proxy that checks the `allowedDomains` whitelist. **Without `allowedDomains`, all outbound network access is blocked.**

The `sandbox.network` config in settings.json includes:

- `allowLocalBinding`: Allow binding to localhost ports (for dev servers)
- `allowAllUnixSockets`: Allow Unix socket access
- `allowedDomains`: **Required for curl, git, npm, etc.** Whitelist of domains the proxy will allow

Domains we need for this project:

- `github.com`, `*.github.com` - git operations, GitHub CLI
- `registry.npmjs.org`, `*.npmjs.org` - npm packages
- `pypi.org`, `files.pythonhosted.org` - Python packages
- `expo.dev`, `*.expo.dev` - Expo development
- `api.anthropic.com` - Claude API calls

### Workaround for external cache directories

There's a path resolution bug where `Edit()` rules for paths outside the working directory get incorrectly concatenated. Until fixed, commands that write to `~/.cache/uv` or `~/.expo` require `dangerouslyDisableSandbox: true`.

Affected commands:

- `make server-bg` / `make server-restart` (uv cache)
- `npm start` in app/ (Expo cache)

## Git Workflow

**Always use Pull Requests** - never push directly to Main, even if you have bypass permissions.

1. Create a feature branch
2. Make commits on the branch
3. Push the branch and create a PR with `gh pr create`
4. Wait for review/approval before merging

This ensures code review happens and keeps the workflow consistent.

## Development Servers

### Live Reload (IMPORTANT)

Both servers have **live reload enabled by default** - they auto-restart on file changes:

- **Python server**: Uvicorn with watchfiles (reload=True in dev mode)
- **React Native app**: Expo with Metro bundler hot reload

**DO NOT manually restart servers after code changes.** Just save the file and wait 1-2 seconds.

### Starting Dev Servers

```bash
make dev       # Server + Expo app (foreground, Ctrl+C to stop)
make dev-web   # Server + Vite web app (foreground, Ctrl+C to stop)
make dev-stop  # Force-kill any stuck servers by port
```

**Ports:**

- Python server: http://localhost:8000
- Expo app: http://localhost:8081
- Vite web: http://localhost:5173

Both have live reload - no restarts needed for code changes.

**Only restart if:**

- Changed dependencies (pyproject.toml, package.json)
- Server crashed
- Stale behavior after 5+ seconds post-save

**Stuck ports?** Run `make dev-stop` to force-kill by port, then start again.

### Simulator Screenshots (Debugging)

Use `/screenshot` to capture the iOS simulator screen when debugging mobile issues.

Screenshots are saved to `screenshots/` (gitignored) and displayed for analysis.

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

## Agent Tools

The drawing agent has 6 tools available, defined in `server/code_monet/tools.py`:

| Tool              | Purpose                              | UI Status        |
| ----------------- | ------------------------------------ | ---------------- |
| `draw_paths`      | Draw predefined paths on canvas      | "drawing paths"  |
| `generate_svg`    | Generate paths via Python code       | "generating SVG" |
| `view_canvas`     | View current canvas state            | "viewing canvas" |
| `mark_piece_done` | Signal piece completion              | "marking done"   |
| `imagine`         | Generate AI reference image (Gemini) | "imagining"      |

### Tool Events

All tools emit `code_execution` WebSocket events:

- `status: "started"` when tool begins
- `status: "completed"` when tool finishes (includes `return_code`)

TypeScript types in `shared/src/types.ts`:

- `ToolName` union type lists all tool names
- `TOOL_DISPLAY_NAMES` maps tool names to UI-friendly strings

### Adding New Tools

1. Add handler + `@tool` decorator in `server/code_monet/tools.py`
2. Register in `create_drawing_server()` tools list
3. Add to `ToolName` type in `shared/src/types.ts`
4. Add to `TOOL_DISPLAY_NAMES` in `shared/src/types.ts`
5. Rebuild shared: `cd shared && npm run build`

See `docs/agent-tools.md` for full tool documentation.

## Testing Requirements

- Backend: pytest with async support
- Frontend: Jest + React Native Testing Library
- All new features need tests
- Run `make test` before committing

## E2E Testing (Maestro)

E2E tests use [Maestro](https://maestro.mobile.dev/) to test iOS simulator flows.

### Running E2E Tests

```bash
make e2e              # Run all E2E tests
make e2e-install      # Install Maestro + Java dependencies
./scripts/e2e.sh auth.yaml  # Run single test
```

### Test Structure

```
app/e2e/
├── flows/           # Test files
│   ├── auth.yaml    # Magic link flow (runs first, needs clean state)
│   ├── action-bar.yaml
│   ├── canvas.yaml
│   └── websocket.yaml
└── helpers/
    └── inject-auth.yaml  # Shared auth injection helper
```

### Key Learnings

**Simulator state:**

- `simctl erase` required before auth test - Keychain persists across app uninstall
- Auth injection uses `simctl launch` then `simctl openurl` (app must be running for deep links)

**Maestro tips:**

- Use `testID` props, not text matching (icons break text selectors)
- Use `optional: true` for dialogs that may or may not appear
- `extendedWaitUntil` with timeout for async operations
- Coordinate taps (`point: "95%,52%"`) are fragile - prefer testIDs

**iOS-specific:**

- "Open in App?" dialog appears on fresh simulator - handle with optional tap
- `back` command doesn't work for modals - use testID on close button
- Swipe gestures can interfere with subsequent button taps

### Adding TestIDs

Add `testID` prop to React Native components for E2E selection:

```tsx
<Pressable testID="my-button" onPress={handlePress}>
```

**Current testIDs:**

- AuthScreen: `email-input`, `code-input`, `auth-submit-button`
- Canvas: `canvas-view`
- StatusPill: `status-pill`
- ActionBar: `action-bar`, `action-draw`, `action-nudge`, `action-new`, `action-gallery`, `action-pause`
- StartPanel: `surprise-me-button`
- NudgeModal: `nudge-close-button`

### Rebuilding After TestID Changes

TestIDs are compiled into the native app. After adding new testIDs:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/CodeMonet-*
cd app && npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/CodeMonet.xcworkspace -scheme CodeMonet \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$(xcrun simctl list devices -j | python3 -c "import sys,json; print([d['udid'] for r,devs in json.load(sys.stdin)['devices'].items() if 'iOS-18' in r for d in devs if 'iPhone 16 Pro' in d['name']][0])")" \
  build
```

## Common Tasks

### Adding a new WebSocket message type

1. Add type to `server/code_monet/types.py`
2. Add handler function in `server/code_monet/handlers.py`
3. Add to `HANDLERS` dict in `handlers.py`
4. Add type to `shared/src/types.ts`
5. Add handler in `shared/src/websocket/handlers.ts`
6. Rebuild shared: `cd shared && npm run build`

### Modifying the agent prompt

Edit `server/code_monet/agent.py` - the `SYSTEM_PROMPT` constant

### Adding new path types

1. Add type to `PathType` enum in `server/code_monet/types.py`
2. Add interpolation in `server/code_monet/interpolation.py`
3. Add SVG rendering in `app/src/components/Canvas.tsx`

## File Locations

### Backend (server/code_monet/)

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
- `utils/canvas.ts` - Coordinate utilities

### Shared Library (shared/)

Platform-agnostic TypeScript code used by both app/ and web/:

```
shared/src/
├── index.ts              # Main exports
├── types.ts              # All type definitions (Path, Point, ServerMessage, etc.)
├── utils.ts              # Utility functions (boundedPush, generateMessageId)
├── canvas/
│   └── reducer.ts        # Canvas state machine (canvasReducer, CanvasHookState)
└── websocket/
    └── handlers.ts       # Message routing (routeMessage)
```

**Development:**

```bash
cd shared && npm run build     # Build TypeScript to dist/
cd shared && npm run dev       # Watch mode
cd shared && npm run lint      # ESLint
cd shared && npm run format    # Prettier
```

**Must build shared/ before app/web changes take effect.**

### Web Dev Server (web/)

React + Vite dev server for accelerated development at http://localhost:5173:

```
web/src/
├── App.tsx               # Main layout
├── components/
│   ├── Canvas.tsx        # SVG canvas with mouse handling
│   ├── MessageStream.tsx # Agent thoughts display
│   ├── DebugPanel.tsx    # Tabbed debug (Agent/Files/Messages)
│   └── ActionBar.tsx     # Pause/Resume/Clear/Nudge
└── hooks/
    ├── useCanvas.ts      # Shared reducer wrapper
    ├── useWebSocket.ts   # WebSocket with auto dev token
    └── useDebug.ts       # Debug data fetching
```

**Start web dev server:**

```bash
make dev-web    # Starts both Python server + Vite dev server
make web        # Starts Vite dev server only
```

**Features:**

- Canvas rendering (SVG-based, same as app/)
- Agent message stream with live streaming indicator
- Debug panel with agent state, workspace files, WebSocket log
- Action bar: pause/resume, clear canvas, send nudge
- Auto dev token authentication (no login needed in dev mode)

**Debug API endpoints used by web:**

- `GET /auth/dev-token` - Get dev JWT token (dev mode only)
- `GET /debug/agent` - Agent state (status, notes, piece count)
- `GET /debug/workspace` - Workspace files list

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
uv run python scripts/remote.py shell "sqlite3 /home/ec2-user/data/code_monet.db '.tables'"
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

| Secret                  | Description                      |
| ----------------------- | -------------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM user access key for ECR push |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key for ECR push |

Add at: https://github.com/dmfenton/CodeMonet/settings/secrets/actions

---

## Database & Storage

### Architecture

- **SQLite** (via SQLAlchemy async): Auth only (users, invite codes)
- **Filesystem**: Per-user workspace data

### Database Location

- Dev: `server/data/code_monet.db`
- Prod (container): `/app/data/code_monet.db`
- Prod (host): `/home/ec2-user/data/code_monet.db` (on EBS volume)

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
# Invite code management
uv run python -m code_monet.cli invite create      # Create invite code
uv run python -m code_monet.cli invite create -c 5 # Create 5 codes
uv run python -m code_monet.cli invite list        # List all invite codes
uv run python -m code_monet.cli invite revoke CODE # Revoke unused code

# User management
uv run python -m code_monet.cli user list          # List users with workspace summary
uv run python -m code_monet.cli user list --all    # Include inactive users
uv run python -m code_monet.cli user workspace 1   # Show workspace details for user ID 1

# Workspace filesystem
uv run python -m code_monet.cli workspace list     # List all workspace directories
```

### Creating Users Directly

To create a user without an invite code (e.g., admin):

```python
# Run from server/ directory
uv run python -c "
import asyncio
from code_monet.db import get_session, repository
from code_monet.auth.password import hash_password

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

- Access token (1 day) for API calls
- Refresh token (1 year) to get new access token
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

| Secret                           | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `APP_STORE_CONNECT_API_KEY_ID`   | App Store Connect API key ID                 |
| `APP_STORE_CONNECT_ISSUER_ID`    | App Store Connect issuer ID                  |
| `APP_STORE_CONNECT_API_KEY_P8`   | .p8 key file contents                        |
| `IOS_DISTRIBUTION_CERT_P12`      | Base64-encoded .p12 certificate              |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | Certificate password                         |
| `IOS_PROVISIONING_PROFILE`       | Base64-encoded .mobileprovision              |
| `APPLE_TEAM_ID`                  | 10-char Apple team ID                        |
| `APPLE_ID`                       | Apple Developer email                        |
| `ITC_TEAM_ID`                    | App Store Connect team ID                    |
| `KEYCHAIN_PASSWORD`              | Random string for CI keychain                |
| `SENTRY_ORG`                     | Sentry organization slug                     |
| `SENTRY_PROJECT`                 | Sentry project slug                          |
| `SENTRY_AUTH_TOKEN`              | Sentry auth token for source maps (optional) |

### Versioning

Version is extracted from git tag (e.g., `v1.2.3` → version `1.2.3`).
Build number is auto-generated from timestamp.

### Production WebSocket URL

Update `EXPO_PUBLIC_WS_URL` in `.github/workflows/testflight.yml` to point to your production server.

---

## Observability (Tracing)

### Overview

Production uses OpenTelemetry with AWS X-Ray for distributed tracing:

- **App**: Instrumented with opentelemetry-python (FastAPI, SQLAlchemy, logging)
- **Collector**: ADOT Collector sidecar receives OTLP, exports to X-Ray
- **Console**: View traces in AWS X-Ray console

### Diagnose CLI

Use the `/diagnose` skill or run `scripts/diagnose.py` directly:

```bash
# Service status (quick health check, last 5 min)
uv run python scripts/diagnose.py status

# Traffic summary with stats
uv run python scripts/diagnose.py summary 60

# Recent error traces
uv run python scripts/diagnose.py errors 60

# All recent traces
uv run python scripts/diagnose.py recent 30

# WebSocket session traces
uv run python scripts/diagnose.py ws 120

# Slow traces (>1s duration, useful for finding WS sessions)
uv run python scripts/diagnose.py slow 1 180

# Traces for specific endpoint
uv run python scripts/diagnose.py path /auth/verify 60

# Full trace details (including stack traces)
uv run python scripts/diagnose.py trace <trace_id>
```

**Output formats:**

- `--md` / `--markdown` - Markdown tables (for Claude to read)
- `--json` - JSON output (for scripts)
- Default: Rich terminal tables

Example with markdown output:

```bash
uv run python scripts/diagnose.py status --md
uv run python scripts/diagnose.py ws 120 --md
```

### Trace IDs in Errors

500 errors include trace_id in the response:

```json
{ "detail": "Internal Server Error", "trace_id": "abc123..." }
```

Use this ID to look up the full trace with stack trace:

```bash
uv run python scripts/diagnose.py trace <trace_id>
```

### Environment Variables

```bash
# Enable tracing (production only, disabled in dev)
OTEL_ENABLED=true

# Collector endpoint (set automatically in docker-compose)
OTEL_EXPORTER_ENDPOINT=http://otel-collector:4318

# AWS region for X-Ray
AWS_REGION=us-east-1
```

### Viewing in AWS Console

1. Go to AWS Console → CloudWatch → X-Ray traces → Traces
2. Filter by service name "drawing-agent"
3. Click a trace to see segment timeline and details
4. Error traces show exception stack traces

---

## Analytics (Umami)

Self-hosted privacy-friendly web analytics at https://monet.dmfenton.net/analytics/

### Architecture

- **Umami**: Analytics dashboard and API (port 3000 internal)
- **PostgreSQL**: Stores analytics data (separate from app SQLite)
- **Tracking**: Lightweight script (~1KB) in web frontend

### First-Time Setup

After deploying for the first time:

1. **Access Umami dashboard**: https://monet.dmfenton.net/analytics/
2. **Login** with default credentials: `admin` / `umami`
3. **Change the admin password** immediately
4. **Add a website**:
   - Go to Settings → Websites → Add website
   - Name: `Code Monet`
   - Domain: `monet.dmfenton.net`
   - Click Save
5. **Copy the Website ID** (UUID shown after creating)
6. **Add to GitHub Secrets**:
   ```bash
   gh secret set UMAMI_WEBSITE_ID --body "your-website-uuid-here"
   ```
7. **Trigger a new release** to rebuild the frontend with analytics enabled

### Environment Variables

**Production (on EC2):**

```bash
# Add to deploy/.env or set in SSM Parameter Store
UMAMI_DB_PASSWORD=<generate with: openssl rand -hex 16>
UMAMI_APP_SECRET=<generate with: openssl rand -hex 32>
```

**GitHub Secrets:**

| Secret             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `UMAMI_WEBSITE_ID` | UUID from Umami dashboard (after creating website) |

### Viewing Analytics

- **Dashboard**: https://monet.dmfenton.net/analytics/
- **Public share**: Create a share URL in Umami for read-only access

### Data Collected

Umami is privacy-focused and GDPR compliant:

- Page views, referrers, browsers, devices, countries
- No cookies, no personal data, no tracking across sites
- All data stays on your server

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
uv run python scripts/remote.py shell "sqlite3 /home/ec2-user/data/code_monet.db 'SELECT * FROM users;'"
```

### Missing tools in slim image

`python:3.11-slim` doesn't include: `curl`, `pkill`, `sqlite3`, etc. Use Python or install via apt if needed.
