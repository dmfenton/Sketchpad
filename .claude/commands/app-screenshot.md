# App Screenshot

Screenshot the Expo mobile app (web mode) for debugging.

## Prerequisites

1. Expo web server running: `cd app && npx expo start --web`
2. Backend server running (if using --auth): `make server`
3. Playwright installed: `cd server && uv sync --extra dev && uv run playwright install chromium`

## Usage

Run `/app-screenshot` when debugging the mobile app UI in web mode.

## Arguments

`$ARGUMENTS` can include:

- `--auth` - Inject dev token for authenticated screens
- `--wait N` - Wait N seconds before capture (for animations/loading)
- `--selector S` - Wait for CSS selector before capture
- `--path P` - URL path to navigate to (default: /)
- `--viewport WxH` - Custom viewport (default: 390x844 iPhone 14 Pro)

## Instructions

1. Run the app-screenshot script with any provided arguments
2. Read and display the captured screenshot
3. Report the filename and any relevant observations

## Command

```bash
uv run python scripts/app-screenshot.py $ARGUMENTS
```

After running the command, use the Read tool to view the screenshot file.

## Examples

### Basic screenshot (unauthenticated)

```
/app-screenshot
```

Captures the current screen (likely auth/login screen if not authenticated).

### Authenticated canvas view

```
/app-screenshot --auth --wait 2
```

Logs in with dev token and waits 2 seconds for canvas to load.

### Wait for specific element

```
/app-screenshot --auth --selector "[data-testid='canvas-view']"
```

Waits for the canvas element to appear before capturing.

### Custom viewport (iPhone 15 Pro Max)

```
/app-screenshot --auth --viewport 430x932
```

## Common TestIDs

Use these with `--selector` to wait for specific screens:

| Screen | Selector |
|--------|----------|
| Auth | `[data-testid="email-input"]` |
| Canvas | `[data-testid="canvas-view"]` |
| Status | `[data-testid="status-pill"]` |
| Action bar | `[data-testid="action-bar"]` |
| Start panel | `[data-testid="surprise-me-button"]` |

## Troubleshooting

### Playwright not installed

```bash
cd server && uv sync --extra dev
uv run playwright install chromium
```

### Cannot connect to Expo

Make sure Expo web server is running:

```bash
cd app && npx expo start --web
```

The default port is 8081. Use `--expo-port` if different.

### Cannot get auth token

Make sure the backend is running:

```bash
make server
```

Or start it in background mode.

### Blank or loading screen

Try adding `--wait 2` or `--wait 3` to give the app time to render.
