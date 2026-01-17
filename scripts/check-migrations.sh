#!/bin/bash
# Pre-commit hook to warn when models.py changes without a new migration

# Check if models.py was modified
if git diff --cached --name-only | grep -q "server/drawing_agent/db/models.py"; then
  # Check if a new migration was also added
  if ! git diff --cached --name-only | grep -q "server/alembic/versions/.*\.py"; then
    echo "⚠️  WARNING: models.py was changed but no migration file was added!"
    echo ""
    echo "If you changed the database schema, create a migration:"
    echo "  cd server && uv run alembic revision --autogenerate -m 'description'"
    echo ""
    echo "If this is intentional (no schema change), ignore this warning."
    # Exit 0 to allow commit (warning only, not blocking)
  fi
fi

exit 0
