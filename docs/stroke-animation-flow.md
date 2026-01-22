# Stroke Animation Flow - Performance Model

## Overview

Code Monet uses a **performance model** for progressive reveal of agent content. Text and strokes are queued, staged, and animated to create a natural "watching the artist work" experience.

## Performance Model Architecture

```
Server Message → Handler → ENQUEUE_* → Buffer → ADVANCE_STAGE → OnStage → Animation → STAGE_COMPLETE → History
```

### State Structure (`PerformanceState`)

```typescript
interface PerformanceState {
  // Queue management
  buffer: PerformanceItem[];      // Items waiting to be performed
  onStage: PerformanceItem | null; // Currently performing item
  history: PerformanceItem[];     // Completed items

  // Progress tracking
  wordIndex: number;              // For words: current word position
  strokeIndex: number;            // For strokes: current stroke position
  strokeProgress: number;         // For strokes: 0-1 within current stroke

  // Live display (what the UI renders)
  revealedText: string;           // Progressive text reveal
  penPosition: Point | null;      // Cursor position
  penDown: boolean;               // Is pen touching canvas
  agentStroke: Point[];           // In-progress stroke points
  agentStrokeStyle: StrokeStyle | null;
}
```

### Performance Item Types

```typescript
type PerformanceItem =
  | { type: 'words'; text: string; id: string }      // Text to reveal word-by-word
  | { type: 'event'; message: AgentMessage; id: string }  // Tool execution event
  | { type: 'strokes'; strokes: PendingStroke[]; id: string }; // Strokes to animate
```

## Data Flow

### 1. Text Streaming (Thinking)

```
Server                              Client
  │                                   │
  │ thinking_delta {text: "Planning"} │
  ├──────────────────────────────────►│ handleThinkingDelta()
  │                                   │   dispatch(ENQUEUE_WORDS)
  │                                   │   buffer.push({type: 'words', text})
  │                                   │
  │                                   │ usePerformer hook
  │                                   │   ADVANCE_STAGE (buffer → onStage)
  │                                   │   Animation loop:
  │                                   │     - REVEAL_WORD (increment wordIndex)
  │                                   │     - Update revealedText
  │                                   │   STAGE_COMPLETE (onStage → history)
```

### 2. Stroke Animation

```
Server                              Client
  │                                   │
  │ code_execution {                  │
  │   status: "started",              │
  │   tool_name: "draw_paths"         │
  │ }                                 │
  ├──────────────────────────────────►│ ENQUEUE_EVENT
  │                                   │   buffer.push({type: 'event', message})
  │                                   │
  │ agent_strokes_ready {             │
  │   count: 5,                       │
  │   piece_number: 1                 │
  │ }                                 │
  ├──────────────────────────────────►│ STROKES_READY
  │                                   │   pendingStrokes = {count, batchId, pieceNumber}
  │                                   │
  │        GET /strokes/pending       │
  │◄──────────────────────────────────┤ usePerformer fetches strokes
  │                                   │
  │ {strokes: [...]}                  │
  ├──────────────────────────────────►│ ENQUEUE_STROKES
  │                                   │   buffer.push({type: 'strokes', strokes})
  │                                   │
  │                                   │ Animation loop:
  │                                   │   ADVANCE_STAGE
  │                                   │   For each stroke:
  │                                   │     For each point:
  │                                   │       STROKE_PROGRESS (penPosition, agentStroke)
  │                                   │     STROKE_COMPLETE (agentStroke → strokes)
  │                                   │   STAGE_COMPLETE
```

## usePerformer Hook

The `usePerformer` hook (`shared/src/hooks/usePerformer.ts`) drives the animation:

```typescript
export function usePerformer(
  performance: PerformanceState,
  dispatch: Dispatch<CanvasAction>,
  styleConfig: DrawingStyleConfig
) {
  // 1. Advance stage when buffer has items and stage is empty
  useEffect(() => {
    if (!performance.onStage && performance.buffer.length > 0) {
      dispatch({ type: 'ADVANCE_STAGE' });
    }
  }, [performance.onStage, performance.buffer.length]);

  // 2. Animate words (reveal one word at a time)
  useEffect(() => {
    if (performance.onStage?.type === 'words') {
      const words = performance.onStage.text.split(/\s+/);
      if (performance.wordIndex < words.length) {
        const timer = setTimeout(() => {
          dispatch({ type: 'REVEAL_WORD' });
        }, WORD_REVEAL_INTERVAL);
        return () => clearTimeout(timer);
      } else {
        dispatch({ type: 'STAGE_COMPLETE' });
      }
    }
  }, [performance.onStage, performance.wordIndex]);

  // 3. Animate strokes (progressive point reveal)
  // Similar pattern with requestAnimationFrame for smooth 60fps
}
```

## Status Derivation

Agent status is derived from performance state:

```typescript
function deriveAgentStatus(state: CanvasHookState): AgentStatus {
  if (state.paused) return 'paused';

  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.type === 'error') return 'error';

  const perf = state.performance;

  // Words being revealed = thinking
  const hasWordsOnStage = perf.onStage?.type === 'words';
  const hasWordsInBuffer = perf.buffer.some((item) => item.type === 'words');
  if (hasWordsOnStage || hasWordsInBuffer || state.thinking) return 'thinking';

  // Event on stage = executing
  if (perf.onStage?.type === 'event') return 'executing';

  // Code execution in progress = executing
  if (hasInProgressEvents(state.messages)) return 'executing';

  // Strokes in queue = drawing
  const hasStrokesOnStage = perf.onStage?.type === 'strokes';
  const hasStrokesInBuffer = perf.buffer.some((item) => item.type === 'strokes');
  if (hasStrokesOnStage || hasStrokesInBuffer) return 'drawing';
  if (state.pendingStrokes !== null) return 'drawing';

  return 'idle';
}
```

**Status Priority (highest to lowest):**
1. `paused` - explicitly paused
2. `error` - last message is error
3. `thinking` - words in buffer/onStage OR thinking text
4. `executing` - code_execution started but not completed
5. `drawing` - strokes in buffer/onStage or pendingStrokes
6. `idle` - default

## Canvas Rendering

The Canvas component reads from performance state:

```tsx
function Canvas({ strokes, agentStroke, penPosition, penDown, ... }) {
  return (
    <Svg>
      {/* Completed strokes */}
      {strokes.map((path, i) => (
        <Path key={i} d={pathToSvgD(path)} ... />
      ))}

      {/* In-progress agent stroke */}
      {agentStroke.length > 1 && (
        <Path d={pointsToSvgD(agentStroke)} ... />
      )}

      {/* Pen cursor indicator */}
      {penPosition && (
        <Circle cx={penPosition.x} cy={penPosition.y} r={penDown ? 4 : 6} />
      )}
    </Svg>
  );
}
```

## Key Design Decisions

### Why a Performance Model?

1. **Decoupled timing** - Server sends data immediately; client animates at its own pace
2. **Interruptible** - New content can be queued while animation runs
3. **Testable** - Pure reducer actions, easy to unit test
4. **Consistent** - Same animation behavior on web and mobile

### Why Queue + Stage + History?

1. **Buffer** - Accumulates incoming content without blocking
2. **OnStage** - Single item being animated (predictable state)
3. **History** - Enables replay and debug inspection

### Why Not Stream Strokes Directly?

1. **Piece number validation** - Ensures strokes go to correct canvas
2. **Batch efficiency** - One HTTP request for many strokes
3. **Animation timing** - Client controls reveal speed

## Debugging

### Key Console Logs

```
[usePerformer] Advancing stage, next: {type: 'words', text: '...'}
[usePerformer] Revealing word 3/10: "planning"
[usePerformer] Stage complete, moving to history
[usePerformer] Fetching strokes for batch 42
[usePerformer] Animating stroke 2/5, point 15/100
```

### Common Issues

| Symptom | Likely Cause |
|---------|--------------|
| Text appears all at once | `ADVANCE_STAGE` not triggering |
| Strokes don't animate | `pendingStrokes` pieceNumber mismatch |
| Animation stuck | `STAGE_COMPLETE` not dispatched |
| Pen cursor frozen | `penPosition` not updating |

### Debug Endpoints

```bash
# Check agent state
curl localhost:8000/debug/agent

# Get pending strokes
curl localhost:8000/strokes/pending
```
