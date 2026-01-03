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

## Server Management (for Claude debugging)

```bash
# Start server in background with logging
make server-bg

# Tail server logs
make server-logs
# Or directly: tail -f server/logs/server.log

# Stop server
make server-stop

# Restart server
make server-restart
```

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
