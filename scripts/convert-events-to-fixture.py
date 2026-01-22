#!/usr/bin/env python3
"""Convert visual-flow-test events.json to replay test fixture format.

Usage:
    python scripts/convert-events-to-fixture.py screenshots/flow-*/events.json output.json
"""

import json
import sys
from datetime import datetime
from pathlib import Path


def convert_events_to_fixture(events_path: Path, description: str = "") -> dict:
    """Convert events.json to fixture format."""
    with open(events_path) as f:
        events = json.load(f)

    # Filter to WebSocket messages only (ws:* types)
    ws_events = [e for e in events if e.get("type", "").startswith("ws:")]

    messages = []
    for event in ws_events:
        msg_type = event["type"].replace("ws:", "")
        data = event.get("data", {})
        timestamp = event.get("timestamp", 0)

        messages.append({
            "type": msg_type,
            "data": data,
            "timestamp_ms": int(timestamp * 1000),
        })

    # Create fixture
    fixture = {
        "metadata": {
            "model": "visual-flow-test",
            "style": "paint",
            "recorded_at": datetime.now().isoformat(),
            "description": description or f"Recorded from {events_path.name}",
            "message_count": len(messages),
        },
        "messages": messages,
    }

    return fixture


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert-events-to-fixture.py <events.json> [output.json]")
        sys.exit(1)

    events_path = Path(sys.argv[1])
    if not events_path.exists():
        print(f"Error: {events_path} not found")
        sys.exit(1)

    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("fixture.json")
    description = sys.argv[3] if len(sys.argv) > 3 else ""

    fixture = convert_events_to_fixture(events_path, description)

    with open(output_path, "w") as f:
        json.dump(fixture, f, indent=2)

    print(f"Created {output_path} with {fixture['metadata']['message_count']} messages")


if __name__ == "__main__":
    main()
