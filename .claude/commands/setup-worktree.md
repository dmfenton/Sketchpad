---
description: Setup symlinks for current worktree (env, db, workspace)
---

Run the setup script to symlink shared resources from the main repo:

```bash
./scripts/setup-worktree.sh
```

This creates symlinks for:
- `.env` → main repo's environment config
- `server/data/` → main repo's SQLite database
- `agent_workspace/` → main repo's workspace directory

After setup, install dependencies if needed:
```bash
cd server && uv sync --all-extras
cd app && pnpm install
```
