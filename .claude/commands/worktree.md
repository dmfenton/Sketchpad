---
description: Create git worktree with env symlinks
argument-hint: <description of work>
---

Create a git worktree for: $ARGUMENTS

## Process

1. **Parse the description** to determine:
   - Branch type: `fix/` for bugs, `feat/` for features, `refactor/` for refactoring, `chore/` for maintenance
   - Branch name: kebab-case slug from description

   Example: "fix the streaming timeout bug" → `fix/streaming-timeout`

2. **Find the main repository:**

   ```bash
   MAIN_REPO=$(git worktree list | head -1 | awk '{print $1}')
   ```

3. **Create worktree in Claude's worktree location:**

   ```bash
   WORKTREE_DIR=~/.claude-worktrees/Sketchpad/<branch-suffix>
   git worktree add "$WORKTREE_DIR" -b <branch-name>
   ```

4. **Run setup script to symlink shared resources:**

   ```bash
   cd "$WORKTREE_DIR" && ./scripts/setup-worktree.sh
   ```

   This symlinks:
   - `.env` → main repo's `.env`
   - `server/data/` → main repo's SQLite DB
   - `agent_workspace/` → main repo's workspace

5. **Install dependencies:**

   ```bash
   cd server && uv sync --all-extras
   cd ../app && pnpm install
   ```

6. **Output the `/add-dir` command** so user can add the worktree to Claude Code.

## Examples

| Description                       | Branch                      | Suffix                |
| --------------------------------- | --------------------------- | --------------------- |
| "fix the WebSocket reconnect bug" | `fix/websocket-reconnect`   | `websocket-reconnect` |
| "add dark mode support"           | `feat/dark-mode`            | `dark-mode`           |
| "refactor canvas rendering"       | `refactor/canvas-rendering` | `canvas-rendering`    |
| "update dependencies"             | `chore/update-deps`         | `update-deps`         |

## For Existing Worktrees

If a worktree was created without symlinks (e.g., by Claude Code automatically), just run:

```bash
./scripts/setup-worktree.sh
```
