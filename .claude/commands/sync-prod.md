# Sync Production Data to Dev

Sync production database and workspace files to local dev environment for testing.

## Instructions

Execute these steps to sync production data:

### 1. Backup existing dev database
```bash
cp server/data/code_monet.db server/data/code_monet.db.bak 2>/dev/null || echo "No existing DB to backup"
```

### 2. Download production database
```bash
uv run python scripts/remote.py shell "base64 /home/ec2-user/data/code_monet.db" | base64 -d > server/data/code_monet.db
```

### 3. Get dmfenton@gmail.com user ID
```bash
USER_ID=$(sqlite3 server/data/code_monet.db "SELECT id FROM users WHERE email='dmfenton@gmail.com';")
echo "User ID: $USER_ID"
```

### 4. Create local workspace directory if needed
```bash
mkdir -p server/data/agent_workspace/users
```

### 5. Download user's workspace (gallery, workspace.json, etc.)
```bash
uv run python scripts/remote.py shell "tar -czf - -C /home/ec2-user/data/agent_workspace/users $USER_ID | base64" | base64 -d | tar -xzf - -C server/data/agent_workspace/users/
```

### 6. Verify sync completed
```bash
echo "Database users:"
sqlite3 server/data/code_monet.db "SELECT id, email FROM users;"
echo ""
echo "Workspace files:"
ls -la server/data/agent_workspace/users/$USER_ID/
echo ""
echo "Gallery pieces:"
ls server/data/agent_workspace/users/$USER_ID/gallery/ 2>/dev/null | wc -l | xargs echo "Total pieces:"
```

## Notes
- Dev database is backed up to `server/data/code_monet.db.bak`
- Only syncs workspace for dmfenton@gmail.com user
- Requires AWS SSM access (configured via AWS credentials)
