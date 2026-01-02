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
- Auto-allows `make`, `uv`, `pnpm`, `git`, and common dev commands
- No permission prompts for standard development workflows
- Run `make test`, `make dev`, `make lint` freely

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

1. Add type to `server/drawing_agent/messages.py`
2. Add handler in `server/drawing_agent/main.py`
3. Add type to `app/src/types.ts`
4. Add handler in `app/src/hooks/useWebSocket.ts`

### Modifying the agent prompt

Edit `server/drawing_agent/agent.py` - the `SYSTEM_PROMPT` constant

### Adding new path types

1. Add type definition in `server/drawing_agent/executor.py`
2. Add interpolation logic in `interpolate_path()`
3. Add SVG rendering in `app/src/components/Canvas.tsx`

## File Locations

- Server entry: `server/drawing_agent/main.py`
- Agent logic: `server/drawing_agent/agent.py`
- App entry: `app/src/App.tsx`
- Canvas component: `app/src/components/Canvas.tsx`
- WebSocket types: `app/src/types.ts`
