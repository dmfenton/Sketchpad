# Screenshot

Take a screenshot of the iOS simulator for debugging.

## Usage

Run `/screenshot` when debugging mobile app issues to capture the current simulator state.

## Instructions

1. Take a screenshot using xcrun simctl
2. Save to `screenshots/` directory (gitignored)
3. Read and display the screenshot
4. Report the filename

## Command

```bash
FILENAME="screenshots/sim-$(date +%Y%m%d-%H%M%S).png"
mkdir -p screenshots
xcrun simctl io booted screenshot "$FILENAME"
echo "Saved: $FILENAME"
```

After running the command, use the Read tool to view the screenshot file.

## Example

```
/screenshot
```

This will:

1. Capture the current iOS simulator screen
2. Save it as `screenshots/sim-20240115-123456.png`
3. Display the image for analysis
