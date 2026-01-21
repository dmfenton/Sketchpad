#!/usr/bin/env python3
"""Check WebSocket init message for thumbnail_token."""

import asyncio
import json

import httpx
import websockets


async def main():
    # Get dev token
    async with httpx.AsyncClient() as client:
        resp = await client.get("http://localhost:8000/auth/dev-token")
        token = resp.json()["access_token"]

    # Connect to WebSocket and get init message
    uri = f"ws://localhost:8000/ws?token={token}"
    async with websockets.connect(uri) as ws:
        msg = await ws.recv()
        data = json.loads(msg)

        if data.get("type") == "init":
            gallery = data.get("gallery", [])
            print(f"Gallery entries: {len(gallery)}")
            if gallery:
                print("\nMost recent entry:")
                print(json.dumps(gallery[-1], indent=2))

                # Check for thumbnail_token
                has_token = "thumbnail_token" in gallery[-1]
                print(f"\nHas thumbnail_token: {has_token}")
        else:
            print(f"Unexpected message type: {data.get('type')}")


if __name__ == "__main__":
    asyncio.run(main())
