#!/bin/bash
# E2E test runner for iOS simulator using Maestro
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$PROJECT_ROOT/app"

# Add Maestro to PATH if installed
export PATH="$PATH:$HOME/.maestro/bin"

# Add Homebrew's openjdk to PATH (it's keg-only)
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[e2e]${NC} $1"; }
warn() { echo -e "${YELLOW}[e2e]${NC} $1"; }
error() { echo -e "${RED}[e2e]${NC} $1"; }

# Check for Maestro
if ! command -v maestro &> /dev/null; then
    error "Maestro not installed. Run: make e2e-install"
    exit 1
fi

# Check for Java (required by Maestro)
if ! command -v java &> /dev/null; then
    error "Java not installed. Maestro requires Java."
    error "Install via: brew install openjdk"
    exit 1
fi

# Check for iOS Simulator (macOS only)
if [[ "$OSTYPE" != "darwin"* ]]; then
    error "iOS E2E tests require macOS"
    exit 1
fi

# Ensure server is running
log "Checking server..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    warn "Server not running. Starting server..."
    cd "$PROJECT_ROOT/server"
    DEV_MODE=true uv run uvicorn drawing_agent.main:app --host 0.0.0.0 --port 8000 &
    SERVER_PID=$!
    cd "$PROJECT_ROOT"

    # Wait for server
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            log "Server started"
            break
        fi
        sleep 1
    done

    if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
        error "Server failed to start"
        exit 1
    fi
fi

# Get dev token for auth injection
log "Fetching dev token..."
RESPONSE=$(curl -s http://localhost:8000/auth/dev-token)
export DEV_ACCESS_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
# Use access token as refresh token for E2E tests (server only returns access_token)
export DEV_REFRESH_TOKEN="$DEV_ACCESS_TOKEN"

if [ -z "$DEV_ACCESS_TOKEN" ]; then
    error "Failed to get dev token. Is DEV_MODE=true?"
    exit 1
fi

log "Dev token acquired"

# Reset workspace state for deterministic testing
log "Resetting workspace state..."
curl -s -X POST -H "Authorization: Bearer $DEV_ACCESS_TOKEN" http://localhost:8000/debug/reset > /dev/null

# Check if app is already built
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "CodeMonet.app" -path "*Debug-iphonesimulator*" 2>/dev/null | head -1)

# Find available iPhone simulator - get the UUID to avoid name conflicts
# Prefer iPhone 17 Pro on iOS 26.x, then iPhone 16 Pro on iOS 18.x
SIMULATOR_INFO=$(xcrun simctl list devices available -j | python3 -c "
import sys, json
data = json.load(sys.stdin)
# First try iOS 26 with iPhone 17 Pro
for runtime, devices in data.get('devices', {}).items():
    if 'iOS-26' in runtime or 'iOS 26' in runtime:
        for d in devices:
            if 'iPhone 17 Pro' in d['name'] and d['isAvailable']:
                print(f\"{d['udid']}|{d['name']}\")
                sys.exit(0)
# Then try iOS 18 with iPhone 16 Pro
for runtime, devices in data.get('devices', {}).items():
    if 'iOS-18' in runtime or 'iOS 18' in runtime:
        for d in devices:
            if 'iPhone 16 Pro' in d['name'] and d['isAvailable']:
                print(f\"{d['udid']}|{d['name']}\")
                sys.exit(0)
# Fallback to any available iPhone
for runtime, devices in data.get('devices', {}).items():
    if 'iOS' in runtime and 'iPhone' not in runtime:
        for d in devices:
            if 'iPhone' in d['name'] and d['isAvailable']:
                print(f\"{d['udid']}|{d['name']}\")
                sys.exit(0)
" 2>/dev/null || echo "")

SIMULATOR_UDID=$(echo "$SIMULATOR_INFO" | cut -d'|' -f1)
SIMULATOR_NAME=$(echo "$SIMULATOR_INFO" | cut -d'|' -f2)

if [ -z "$SIMULATOR_UDID" ]; then
    error "No suitable iPhone simulator found"
    exit 1
fi

log "Using simulator: $SIMULATOR_NAME ($SIMULATOR_UDID)"

if [ -z "$APP_PATH" ]; then
    log "Building iOS app (this may take a few minutes)..."
    cd "$APP_DIR"

    # Prebuild if needed
    if [ ! -d "ios" ]; then
        npx expo prebuild --platform ios --clean
    fi

    # Build for simulator - use device ID to avoid name conflicts
    xcodebuild -workspace ios/CodeMonet.xcworkspace \
        -scheme CodeMonet \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
        build \
        | grep -E "^(Build|Compile|Link|Sign|error:|warning:)" || true

    APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "CodeMonet.app" -path "*Debug-iphonesimulator*" | head -1)
    cd "$PROJECT_ROOT"
fi

if [ -z "$APP_PATH" ]; then
    error "Failed to find built app"
    exit 1
fi

log "Using app: $APP_PATH"

# Erase simulator to clear all data including Keychain (required for auth test)
log "Erasing iOS Simulator ($SIMULATOR_NAME)..."
xcrun simctl shutdown "$SIMULATOR_UDID" 2>/dev/null || true
sleep 1
xcrun simctl erase "$SIMULATOR_UDID"
xcrun simctl boot "$SIMULATOR_UDID"
xcrun simctl bootstatus "$SIMULATOR_UDID" -b > /dev/null 2>&1

# Install app on the specific simulator
log "Installing app on simulator..."
xcrun simctl install "$SIMULATOR_UDID" "$APP_PATH"

# Note: Auth injection is now handled automatically by the app in dev mode
# When no valid token exists and __DEV__ is true, the app auto-fetches from /auth/dev-token

# Run Maestro tests
log "Running Maestro tests..."
cd "$APP_DIR"

if [ -n "$1" ]; then
    # Run specific test (auth handled automatically by app in dev mode)
    maestro --device "$SIMULATOR_UDID" test -e DEV_ACCESS_TOKEN="$DEV_ACCESS_TOKEN" -e DEV_REFRESH_TOKEN="$DEV_REFRESH_TOKEN" "e2e/flows/$1"
else
    # Run all tests
    log "Running all E2E tests..."
    for flow in e2e/flows/*.yaml; do
        log "Running $(basename "$flow")..."
        maestro --device "$SIMULATOR_UDID" test -e DEV_ACCESS_TOKEN="$DEV_ACCESS_TOKEN" -e DEV_REFRESH_TOKEN="$DEV_REFRESH_TOKEN" "$flow"
        if [ $? -ne 0 ]; then
            TEST_EXIT_CODE=1
        fi
    done
fi

TEST_EXIT_CODE=$?

# Cleanup server if we started it
if [ -n "$SERVER_PID" ]; then
    log "Stopping server..."
    kill $SERVER_PID 2>/dev/null || true
fi

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log "All E2E tests passed!"
else
    error "E2E tests failed"
fi

exit $TEST_EXIT_CODE
