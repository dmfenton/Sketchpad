# Claude Code Sandbox

Sandbox configured in `.claude/settings.json`:

- Auto-allows `make`, `uv`, `npm`, `git`, `gh`, `curl`, and common dev commands
- No permission prompts for standard development workflows
- Run `make test`, `make dev`, `make lint`, `git commit`, `git push` freely

## How it works

Claude Code uses [bubblewrap](https://github.com/containers/bubblewrap) for sandboxing:

- Creates isolated mount namespace with read-only bind mounts by default
- `Edit()` permission rules in settings.json control bash write access (not `Write()`)
- **Use absolute paths** - tilde (`~`) expansion is unreliable in sandbox configs

Example: To allow uv cache writes, use `Edit(/home/user/.cache/uv/**)` not `Edit(~/.cache/uv/**)`

## Network access (Linux only)

On Linux, bubblewrap creates an isolated network namespace. All traffic routes through a proxy that checks the `allowedDomains` whitelist. **Without `allowedDomains`, all outbound network access is blocked.**

The `sandbox.network` config in settings.json includes:

- `allowLocalBinding`: Allow binding to localhost ports (for dev servers)
- `allowAllUnixSockets`: Allow Unix socket access
- `allowedDomains`: **Required for curl, git, npm, etc.** Whitelist of domains the proxy will allow

Domains we need for this project:

- `github.com`, `*.github.com` - git operations, GitHub CLI
- `registry.npmjs.org`, `*.npmjs.org` - npm packages
- `pypi.org`, `files.pythonhosted.org` - Python packages
- `expo.dev`, `*.expo.dev` - Expo development
- `api.anthropic.com` - Claude API calls

## Workaround for external cache directories

There's a path resolution bug where `Edit()` rules for paths outside the working directory get incorrectly concatenated. Until fixed, commands that write to `~/.cache/uv` or `~/.expo` require `dangerouslyDisableSandbox: true`.

Affected commands:

- `make server-bg` / `make server-restart` (uv cache)
- `npm start` in app/ (Expo cache)
