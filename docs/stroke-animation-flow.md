# Stroke Animation Flow - Debug Documentation

## Complete Flow Diagram

```
SERVER                                  CLIENT
======                                  ======

1. Agent calls draw_paths tool
   |
   v
2. ToolUseBlock detected
   |
   +---> on_code_start callback
         |
         v
3. Broadcast: code_execution        --> Receives code_execution started
   (status="started",                   |
    tool_name="draw_paths")             v
                                    4. ADD_MESSAGE action
                                       - message.type = 'code_execution'
                                       - message.metadata.return_code = undefined
                                       |
                                       v
                                    5. deriveAgentStatus():
                                       - hasInProgressEvents() = true
                                       - return 'executing'
                                       |
                                       v
                                    6. canRender = (status === 'drawing') = false

7. Tool executes:
   - _add_strokes_callback adds
     strokes to canvas state
   - _draw_callback collects paths
   |
   v
8. PostToolUse hook runs
   |
   v
9. orchestrator._draw_paths():
   - state.queue_strokes(paths)
     * Interpolates paths to points
     * Stores in _pending_strokes
   - Broadcast: strokes_ready       --> Receives strokes_ready
     (count, batch_id, piece_number)        |
   - Sleep (animation wait)             v
                                    10. STROKES_READY action
                                        - IF pieceNumber !== state.pieceNumber:
                                          SILENTLY IGNORED! (return state)
                                        - ELSE: pendingStrokes = {count, batchId, pieceNumber}
                                        |
                                        v
                                    11. deriveAgentStatus():
                                        - hasInProgressEvents() = true (still!)
                                        - return 'executing' (NOT 'drawing')
                                        |
                                        v
                                    12. useStrokeAnimation effect:
                                        - pendingStrokes set, canRender=false
                                        - Store batchId in waitingToRenderRef

13. ToolResultBlock detected
    |
    +---> on_code_result callback
          |
          v
14. Broadcast: code_execution       --> Receives code_execution completed
    (status="completed",                |
     return_code=0)                     v
                                    15. ADD_MESSAGE action
                                        - message.metadata.return_code = 0
                                        |
                                        v
                                    16. deriveAgentStatus():
                                        - hasInProgressEvents() = false
                                        - pendingStrokes !== null
                                        - return 'drawing'
                                        |
                                        v
                                    17. canRender = true
                                        |
                                        v
                                    18. useStrokeAnimation effect (canRender changed):
                                        - waitingToRenderRef !== null
                                        - Call startRenderWithDelay(batchId)
                                        |
                                        v (800ms delay)
                                    19. StrokeRenderer.handleStrokesReady(batchId):
                                        - Dispatch CLEAR_PENDING_STROKES
                                        - fetchStrokes() --> GET /strokes/pending
                                        |                        |
                                        |<-----------------------+
                                        v                   Returns: {strokes, count, piece_number}
                                    20. animateStrokes():
                                        - For each stroke:
                                          - SET_PEN (down=false) - move to start
                                          - For each point:
                                            - SET_PEN (down=true) - draw point
                                            - agentStroke accumulates
                                          - SET_PEN (down=false) - lift pen
                                          - ADD_STROKE - finalize stroke
                                        |
                                        v
                                    21. Canvas renders:
                                        - agentStroke -> live preview
                                        - strokes -> completed strokes
```

## Potential Failure Points

### 1. pieceNumber Mismatch (SILENT FAILURE)

**Location:** `reducer.ts:373`

```typescript
case 'STROKES_READY':
  if (action.pieceNumber !== state.pieceNumber) {
    return state;  // SILENTLY IGNORED!
  }
```

**Symptom:** `strokes_ready` arrives but `pendingStrokes` is never set.
**Debug:** Add logging before the check.

### 2. canRender Never Becomes True

**Location:** `App.tsx:96`

```typescript
canRender: agentStatus === 'drawing';
```

**Cause:** If agent immediately starts thinking after draw_paths completes:

- Live message appears -> status = 'thinking'
- hasInProgressEvents() still returns false
- But status is 'thinking', not 'drawing'
- canRender stays false

**Status priority in deriveAgentStatus():**

1. paused -> 'paused'
2. last message is error -> 'error'
3. hasLiveMessage -> 'thinking' <-- Takes precedence!
4. hasInProgressEvents() -> 'executing'
5. pendingStrokes !== null -> 'drawing'
6. else -> 'idle'

### 3. fetchStrokes Returns Empty

**Location:** `StrokeRenderer.ts:93`

```typescript
const strokes = await this.fetchStrokes();
```

**Cause:** Strokes were already popped (double fetch) or never queued.
**Debug:** Check server logs for "Queueing X paths" message.

### 4. Animation Stopped Early

**Location:** `StrokeRenderer.ts:130`

```typescript
for (const stroke of strokes) {
  if (this.stopped) break;  // Could exit early
```

**Cause:** Component unmounted during animation.

### 5. agentStroke Not Rendered

**Location:** `Canvas.tsx:229`

```typescript
{agentStroke.length > 1 && ...}
```

**Cause:** If agentStroke only has 0 or 1 point, nothing renders.

## Key Console Logs to Check

```
[useStrokeAnimation] Effect triggered: pendingStrokes=..., canRender=...
[useStrokeAnimation] canRender is false, storing batchId: X
[useStrokeAnimation] canRender is true, starting render for batchId: X
[useStrokeAnimation] canRender changed: true/false, waitingBatch: X
[StrokeRenderer] handleStrokesReady called, batchId: X
[StrokeRenderer] Fetched N strokes for batch X
[StrokeRenderer] Starting animation of N strokes
```

## Most Likely Bug: hasInProgressEvents Key Matching

The `hasInProgressEvents()` function matches started/completed messages by:

```typescript
const key = `${tool_name}_${iteration}`;
```

**Problem:** If multiple calls to the same tool happen in one turn (iteration stays at 1):

1. draw_paths started (key: draw_paths_1)
2. draw_paths completed (key: draw_paths_1)
3. draw_paths started (key: draw_paths_1) <- SAME KEY!
4. The second started message is incorrectly considered "completed"
   because completedTools already has draw_paths_1

This could cause premature status transition to 'drawing' or incorrect
in-progress tracking.
