# Sync Production Data to Dev

Sync production database and workspace files to local dev environment for testing.

## Instructions

Run the sync script from the server directory:

```bash
cd server && uv run python ../scripts/sync-prod.py
```

This automatically:
1. Backs up the existing local database
2. Downloads the production database (chunked to handle SSM 24KB limit)
3. Looks up the user ID for dmfenton@gmail.com
4. Downloads and extracts the user's workspace (gallery, workspace.json, etc.)
5. Verifies the sync completed

### Options

```bash
# Full sync (default)
cd server && uv run python ../scripts/sync-prod.py

# Database only
cd server && uv run python ../scripts/sync-prod.py --db-only

# Workspace only (requires DB already synced)
cd server && uv run python ../scripts/sync-prod.py --ws-only
```

## Notes
- Dev database is backed up to `server/data/code_monet.db.bak`
- Only syncs workspace for dmfenton@gmail.com user
- Requires AWS SSM access (configured via AWS credentials)
- Handles the SSM 24KB output limit automatically via chunked base64 transfer
