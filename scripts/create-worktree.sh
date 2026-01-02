#!/bin/bash
set -e

MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
SUFFIX="$1"
BRANCH="$2"

if [ -z "$SUFFIX" ] || [ -z "$BRANCH" ]; then
    echo "Usage: $0 <suffix> <branch-name>"
    echo "Example: $0 dark-mode feat/dark-mode"
    exit 1
fi

WORKTREE_PATH="${MAIN_REPO}-${SUFFIX}"

echo "Creating worktree at: $WORKTREE_PATH"
echo "Branch: $BRANCH"

# Create the worktree
git worktree add "$WORKTREE_PATH" -b "$BRANCH"

cd "$WORKTREE_PATH"

# Symlink .env from main repo
if [ -f "${MAIN_REPO}/.env" ] && [ ! -e .env ]; then
    ln -s "${MAIN_REPO}/.env" .env
    echo "Symlinked .env from main repo"
fi

# Install dependencies
echo "Installing server dependencies..."
cd server && uv sync --all-extras

echo "Installing app dependencies..."
cd ../app && pnpm install

echo ""
echo "Worktree created successfully!"
echo ""
echo "To add to Claude Code, run:"
echo "  /add-dir $WORKTREE_PATH"
