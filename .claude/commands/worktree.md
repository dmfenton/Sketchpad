---
description: Create git worktree with env symlinks
argument-hint: <description of work>
---

Create a git worktree for: $ARGUMENTS

## Process

1. **Parse the description** to determine:
   - Branch type: `fix/` for bugs, `feat/` for features, `refactor/` for refactoring, `chore/` for maintenance
   - Branch name: kebab-case slug from description
   - Suffix: short identifier for worktree directory

   Example: "fix the streaming timeout bug" → `fix/streaming-timeout`

2. **Run the worktree creation script:**
   ```bash
   scripts/create-worktree.sh <suffix> <branch-name>
   ```

3. **Output the `/add-dir` command** so user can add the worktree to Claude Code.

## Examples

| Description | Branch | Suffix |
|-------------|--------|--------|
| "fix the WebSocket reconnect bug" | `fix/websocket-reconnect` | `websocket-reconnect` |
| "add dark mode support" | `feat/dark-mode` | `dark-mode` |
| "refactor canvas rendering" | `refactor/canvas-rendering` | `canvas-rendering` |
| "update dependencies" | `chore/update-deps` | `update-deps` |
