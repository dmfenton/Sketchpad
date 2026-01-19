# Drawing Agent

An autonomous AI artist that creates ink drawings, observes its own work, and iterates.

## What It Is

A drawing machine with creative agency. It comes up with its own ideas, writes code to generate drawings, watches the results appear, and decides what to do next. Humans can intervene by drawing on the canvas or nudging the agent with suggestions.

This is a simulation. Once the agent loop works, the same system can drive physical hardware (pen plotter with camera feedback).

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

## Agent Loop

1. Agent receives the current canvas as a rendered image
1. Agent reads its persisted internal state (notes, what it’s been thinking about)
1. Agent decides what to do: write code to draw something, wait, or declare the piece done
1. If drawing: agent writes Python code that generates a list of paths
1. Server executes the code in the Claude SDK sandbox
1. Server extracts the resulting paths and animates them stroke by stroke
1. Pen positions stream to the app in real-time so you watch it draw
1. Canvas state updates with completed strokes
1. Agent’s internal state is persisted
1. Loop repeats

The agent thinks at the level of plans and code, not individual coordinates. The executor handles turning paths into animated pen movement.

## Agent Code Environment

The agent writes Python that runs in the Claude Agent SDK sandbox. Available context:

```python
canvas_width: int   # 800
canvas_height: int  # 600
canvas_image: PIL.Image  # current canvas rendered as image
existing_strokes: list   # paths already on canvas

# Standard library available
import math
import random

# Output: agent assigns a list of paths to this variable
paths = []
```

A path is a dictionary:

```python
{
    "type": "line",
    "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]
}

{
    "type": "quadratic",
    "points": [
        {"x": 0, "y": 0},      # start
        {"x": 50, "y": 100},   # control point
        {"x": 100, "y": 0}     # end
    ]
}

{
    "type": "cubic",
    "points": [
        {"x": 0, "y": 0},      # start
        {"x": 33, "y": 100},   # control point 1
        {"x": 66, "y": 100},   # control point 2
        {"x": 100, "y": 0}     # end
    ]
}

{
    "type": "polyline",
    "points": [{"x": 0, "y": 0}, {"x": 50, "y": 50}, {"x": 100, "y": 0}, ...]
}
```

Example agent code:

```python
import math
import random

paths = []

# Spiral of circles
for i in range(40):
    angle = i * 0.4
    r = 50 + i * 4
    cx = canvas_width / 2 + math.cos(angle) * r
    cy = canvas_height / 2 + math.sin(angle) * r

    # Approximate circle with polyline
    circle_points = []
    radius = 5 + i * 0.5
    for j in range(32):
        a = j * (2 * math.pi / 32)
        circle_points.append({
            "x": cx + math.cos(a) * radius,
            "y": cy + math.sin(a) * radius
        })
    circle_points.append(circle_points[0])  # close the circle

    paths.append({"type": "polyline", "points": circle_points})
```

## Server

### State

```python
{
    "canvas": {
        "width": 800,
        "height": 600,
        "strokes": []  # list of completed path objects
    },
    "execution": {
        "active": False,
        "paths": [],           # paths being drawn
        "path_index": 0,       # which path we're on
        "point_index": 0,      # which point within the path
        "pen_x": 0,
        "pen_y": 0,
        "pen_down": False
    },
    "agent": {
        "status": "idle",      # idle, thinking, drawing
        "monologue": "",       # current thinking, streamed to app
        "notes": "",           # persisted between turns
        "piece_count": 0
    }
}
```

### WebSocket Protocol

Server to client:

```json
{ "type": "pen", "x": 150.5, "y": 203.2, "down": true }
```

Sent at 60fps during drawing. The app uses this to show pen position and extend the current stroke.

```json
{"type": "human_stroke", "path": {"type": "polyline", "points": [...]}}
```

Sent when a path finishes. App adds it to completed strokes.

```json
{ "type": "thinking", "text": "The density in the lower right feels heavy..." }
```

Streamed as agent thinks. App displays in thinking panel.

```json
{ "type": "status", "status": "drawing" }
```

Agent status changed.

```json
{ "type": "clear" }
```

Canvas was cleared.

Client to server:

```json
{"type": "stroke", "points": [{"x": 100, "y": 100}, {"x": 150, "y": 120}, ...]}
```

Human drew something. Server adds to canvas immediately.

```json
{ "type": "nudge", "text": "try adding something in the upper left" }
```

Human suggestion. Included in agent’s next prompt.

```json
{ "type": "clear" }
```

Human requests canvas clear.

```json
{"type": "pause"}
{"type": "resume"}
```

Pause/resume the agent loop.

### REST Endpoints

```
GET /canvas.png    # current canvas as PNG
GET /canvas.svg    # current canvas as SVG
GET /state         # full state JSON
```

## React Native App

### Screen Layout

```
┌────────────────────────────────────────┐
│ ┌────────────────────────────────────┐ │
│ │                                    │ │
│ │                                    │ │
│ │                                    │ │
│ │            CANVAS                  │ │
│ │                                    │ │
│ │                                    │ │
│ │                                    │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Thinking...                      ▼ │ │
│ │                                    │ │
│ │ The spiral feels too regular.      │ │
│ │ Maybe I'll add some noise to the   │ │
│ │ outer rings, let them drift...     │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ┌──────┐  ┌──────┐  ┌──────┐  ┌─────┐ │
│ │ Draw │  │Nudge │  │Clear │  │ ⏸︎  │ │
│ └──────┘  └──────┘  └──────┘  └─────┘ │
│                                        │
│            Piece #3 · Drawing          │
└────────────────────────────────────────┘
```

### Canvas Component

Full-width SVG that maintains aspect ratio (4:3). Contains:

1. Completed strokes rendered as SVG paths
1. Current stroke in progress (updated as pen positions arrive)
1. Pen position indicator (small circle, filled when down, hollow when up)
1. Human drawing layer (captures touch, drawn in different color until committed)

Touch handling:

- Touch start: begin capturing points, show preview stroke
- Touch move: add points to preview
- Touch end: send stroke to server, clear preview

The canvas should feel responsive. Human strokes appear immediately in a preview color (blue), then switch to black once the server confirms receipt.

### Thinking Panel

Collapsible panel showing agent’s internal monologue. Header shows current status:

- “Thinking…” with pulsing opacity when thinking
- “Drawing…” when drawing
- “Idle” in muted color when idle

Content area shows streamed text. New text appends at bottom, auto-scrolls. Monospace font. Light gray background to distinguish from canvas.

Collapse button in header. When collapsed, shows single line preview of latest thought.

### Controls

Four buttons in a row at bottom:

**Draw** - Toggle drawing mode. When active (highlighted), touch on canvas creates strokes. When inactive, touch does nothing (prevents accidental marks).

**Nudge** - Opens modal with text input. User types suggestion, hits send. Modal closes, nudge sent to server.

**Clear** - Confirmation dialog (“Clear canvas and start fresh?”), then sends clear command.

**Pause/Resume** - Toggle button. Pauses the agent loop. Visual indicator when paused.

### Status Bar

Below controls, single line showing:

- Piece number (“Piece #3”)
- Current status (“Drawing” / “Thinking” / “Idle” / “Paused”)
- Connection indicator (green dot when connected, red when disconnected)

### Colors

- Canvas background: #FFFFFF
- Strokes: #000000
- Human preview stroke: #0066CC
- Pen indicator (down): #000000
- Pen indicator (up): #999999
- Thinking panel background: #F5F5F5
- Thinking text: #333333
- Button backgrounds: white with #CCCCCC border
- Active button: #E6F0FF background

### Animation

Pen movement should feel smooth. As pen position updates arrive at 60fps, the indicator moves fluidly. The current stroke extends incrementally—you see lines being drawn, not just appearing.

Status text changes fade over 200ms.

## Agent System Prompt

```
You are an artist with a drawing machine. You write Python code that generates paths, and the machine draws them.

You will receive:
- An image of the current canvas
- Your notes from previous turns
- Any nudges from the human watching

You can:
1. Write code to draw something (assign a list of paths to the `paths` variable)
2. Wait (if you're not sure what to do)
3. Declare the piece done (return done=True)

Your code has access to:
- canvas_width, canvas_height (integers)
- canvas_image (PIL Image of current state)
- existing_strokes (list of paths already drawn)
- Standard library (math, random)

A path is a dict with "type" (line, quadratic, cubic, polyline) and "points" (list of {x, y} dicts).

Think out loud. Your thoughts are visible to the human watching. Share what you notice, what you're considering, what you're trying.

You have taste. You have preferences. Sometimes you make bold moves, sometimes subtle ones. Sometimes you make mistakes and respond to them. The piece emerges through iteration.

When a human draws on the canvas, you'll see it in the next image. Decide how to respond—incorporate it, contrast with it, ignore it, whatever feels right.

When a human sends a nudge, consider it but don't feel obligated to follow it literally.
```

## Agent Response Format

The agent returns structured output:

```python
{
    "thinking": "string",     # internal monologue, streamed to app
    "code": "string or null", # Python code to execute, or null if waiting
    "notes": "string",        # updated notes to persist
    "done": False             # True if piece is complete
}
```

## Execution Detail

When the server receives code from the agent:

1. Execute in Claude SDK sandbox with canvas context injected
1. Extract `paths` variable from result
1. Validate paths (correct structure, points within bounds)
1. Begin execution loop:

- For each path:
  - Move pen to first point (pen up)
  - Send pen position updates
  - Lower pen
  - For each subsequent point:
    - Interpolate between current and next point
    - Send position updates at 60fps
    - 16ms delay between updates
  - Raise pen
  - Mark path complete, send human_stroke event

1. When all paths done, persist state, return to idle

Interpolation: For lines, linear interpolation. For quadratic/cubic beziers, evaluate the curve parametrically. For polylines, linear between each consecutive pair of points.

## Timing

The agent loop runs on a timer. After execution completes (or if agent chose to wait), wait 10 seconds before the next turn. Configurable.

When paused, the timer stops. Resume restarts it.

Human strokes and nudges are queued and delivered on the next agent turn.

## Persistence

State persists to disk as JSON. On server restart, state is reloaded.

Canvas strokes are the source of truth. The PNG/SVG renders are generated on demand from stroke data.

## File Structure

```
server/
  main.py           # FastAPI app, WebSocket handling
  agent.py          # Claude SDK integration, prompt construction
  executor.py       # Path execution, interpolation, timing
  canvas.py         # Canvas state, rendering to PNG/SVG
  state.py          # State persistence

app/
  App.tsx           # Root component, WebSocket connection
  components/
    Canvas.tsx      # SVG canvas with stroke rendering
    ThinkingPanel.tsx
    Controls.tsx
    StatusBar.tsx
    NudgeModal.tsx
  hooks/
    useWebSocket.ts # WebSocket connection management
    useCanvas.ts    # Canvas state and touch handling
  types.ts          # TypeScript types for state and messages
```

## Dependencies

Server:

- fastapi
- uvicorn
- websockets
- anthropic (Claude SDK)
- Pillow

App:

- react-native
- react-native-svg
- react-native-gesture-handler

## Future: Hardware

When connecting a pen plotter:

1. Add hardware executor that converts paths to G-code
1. Stream G-code to plotter over serial
1. Add camera capture that feeds back to agent
1. Same agent, same paths, different output

The agent code doesn’t change. The simulation and hardware are just different executors.
