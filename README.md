# Drawing Agent

An autonomous AI artist that creates ink drawings, observes its own work, and iterates.

## What It Is

A drawing machine with creative agency. It comes up with its own ideas, writes code to generate drawings, watches the results appear, and decides what to do next. Humans can intervene by drawing on the canvas or nudging the agent with suggestions.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm
- Anthropic API key

### Setup

```bash
# Clone and enter directory
cd Sketchpad

# Copy environment template
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Install all dependencies
make install

# Start development (runs both server and app)
make dev
```

### Individual Commands

```bash
# Backend only
make server

# Frontend only
make app

# Run tests
make test

# Lint and format
make lint
make format

# Type checking
make typecheck
```

## Architecture

```
┌─────────────────────┐       WebSocket        ┌─────────────────────┐
│   React Native App  │◄──────────────────────►│    Python Server    │
│                     │                        │                     │
│  - SVG canvas       │   stroke events        │  - FastAPI          │
│  - Real-time render │   state updates        │  - Claude Agent SDK │
│  - Touch input      │   thinking stream      │  - Canvas state     │
│  - Agent thinking   │                        │  - Code sandbox     │
└─────────────────────┘                        └─────────────────────┘
```

## Project Structure

```
├── server/                 # Python backend
│   ├── drawing_agent/      # Main package
│   │   ├── main.py         # FastAPI app, WebSocket handling
│   │   ├── agent.py        # Claude SDK integration
│   │   ├── executor.py     # Path execution, interpolation
│   │   ├── canvas.py       # Canvas state, PNG/SVG rendering
│   │   └── state.py        # State persistence
│   ├── tests/              # Backend tests
│   ├── pyproject.toml      # Python dependencies
│   └── pytest.ini          # Test configuration
│
├── app/                    # React Native frontend
│   ├── src/
│   │   ├── App.tsx         # Root component
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom hooks
│   │   └── types.ts        # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── .claude/                # Claude Code instructions
│   └── instructions.md
│
├── Makefile                # Development commands
└── docker-compose.yml      # Container setup
```

## Development

### Server

The backend uses FastAPI with WebSocket support. Key files:

- `main.py` - HTTP endpoints and WebSocket handler
- `agent.py` - Claude SDK integration and prompt construction
- `executor.py` - Path interpolation and timing
- `canvas.py` - Stroke storage and rendering

```bash
cd server
uv run python -m drawing_agent.main
```

### App

React Native app with Expo. Run on iOS simulator, Android emulator, or web.

```bash
cd app
pnpm start
```

### Testing

```bash
# All tests
make test

# Backend only
make test-server

# Frontend only
make test-app

# With coverage
make coverage
```

## API Reference

### WebSocket Protocol

Connect to `ws://localhost:8000/ws`

**Server → Client:**

| Type | Payload | Description |
|------|---------|-------------|
| `pen` | `{x, y, down}` | Pen position at 60fps |
| `stroke_complete` | `{path}` | Path finished drawing |
| `thinking` | `{text}` | Agent thinking stream |
| `status` | `{status}` | Agent status change |
| `clear` | `{}` | Canvas cleared |

**Client → Server:**

| Type | Payload | Description |
|------|---------|-------------|
| `stroke` | `{points}` | Human drew a stroke |
| `nudge` | `{text}` | Human suggestion |
| `clear` | `{}` | Clear canvas request |
| `pause` | `{}` | Pause agent loop |
| `resume` | `{}` | Resume agent loop |

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/canvas.png` | Current canvas as PNG |
| `GET` | `/canvas.svg` | Current canvas as SVG |
| `GET` | `/state` | Full state JSON |
| `GET` | `/health` | Health check |

## Configuration

Environment variables (`.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `HOST` | No | Server host (default: 0.0.0.0) |
| `PORT` | No | Server port (default: 8000) |
| `AGENT_INTERVAL` | No | Seconds between agent turns (default: 10) |
| `STATE_FILE` | No | Path to state file (default: state.json) |

## License

MIT
