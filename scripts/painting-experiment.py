#!/usr/bin/env python3
"""
Run a multi-painting experiment and analyze stroke correctness.

Usage:
    uv run python scripts/painting-experiment.py
    uv run python scripts/painting-experiment.py --count 10 --timeout 180
    uv run python scripts/painting-experiment.py --prompt-file prompts.txt
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import websockets

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws"

CANVAS_WIDTH = 800
CANVAS_HEIGHT = 600
BOUNDS_PAD = 1.0

VALID_TYPES = {"line", "polyline", "quadratic", "cubic", "svg"}
MIN_POINTS = {"line": 2, "polyline": 2, "quadratic": 3, "cubic": 4}

BRUSH_NAMES = {
    "oil_round",
    "oil_flat",
    "oil_filbert",
    "watercolor",
    "dry_brush",
    "palette_knife",
    "ink",
    "pencil",
    "charcoal",
    "marker",
    "airbrush",
    "splatter",
}

DEFAULT_PROMPTS = [
    "Paint a sunlit lily pond with soft reflections and a calm horizon.",
    "Paint a stormy sea with dramatic, wind-blown waves and a heavy sky.",
    "Paint a quiet forest path at dusk with layered foliage and warm light.",
    "Paint a mountain range at dawn with misty valleys and cool shadows.",
    "Paint a still life of citrus fruit and a ceramic pitcher on a table.",
    "Paint an abstract color study built from bold, overlapping brush strokes.",
    "Paint a rainy city street with glowing reflections and soft neon light.",
    "Paint rolling desert dunes with subtle wind texture and long shadows.",
    "Paint a snowy village scene with warm windows and a pale sky.",
    "Paint a field of wildflowers with lively, varied brush marks.",
]

HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
SVG_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")

try:
    from svgpathtools import parse_path as _parse_svg_path
except Exception:
    _parse_svg_path = None


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


async def get_token(base_url: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{base_url}/auth/dev-token")
        if resp.status_code == 403:
            print("Error: dev token endpoint requires DEV_MODE=true")
            sys.exit(1)
        if resp.status_code != 200:
            print(f"Error: failed to get token: {resp.status_code}")
            sys.exit(1)
        return resp.json()["access_token"]


async def fetch_pending_strokes(base_url: str, token: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base_url}/strokes/pending",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to fetch strokes: {resp.status_code}")
        data = resp.json()
        strokes = data.get("strokes", [])
        if not isinstance(strokes, list):
            return []
        return strokes


def load_prompts(prompt_file: str | None, count: int) -> list[str]:
    prompts: list[str] = []
    if prompt_file:
        for line in Path(prompt_file).read_text().splitlines():
            line = line.strip()
            if line:
                prompts.append(line)
    if not prompts:
        prompts = DEFAULT_PROMPTS.copy()
    while len(prompts) < count:
        prompts.append(f"Paint an abstract composition study #{len(prompts) + 1}.")
    return prompts[:count]


def sample_svg_points(d: str, samples: int = 24) -> list[tuple[float, float]]:
    if _parse_svg_path is not None:
        try:
            path = _parse_svg_path(d)
            points: list[tuple[float, float]] = []
            for i in range(samples + 1):
                t = i / samples
                pt = path.point(t)
                points.append((float(pt.real), float(pt.imag)))
            return points
        except Exception:
            pass

    numbers = SVG_NUMBER_RE.findall(d)
    coords: list[tuple[float, float]] = []
    for i in range(0, len(numbers) - 1, 2):
        coords.append((float(numbers[i]), float(numbers[i + 1])))
    return coords


def point_out_of_bounds(x: float, y: float, pad: float) -> bool:
    return (
        x < -pad
        or x > CANVAS_WIDTH + pad
        or y < -pad
        or y > CANVAS_HEIGHT + pad
    )


def analyze_strokes(strokes: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    issue_counts = Counter()
    path_type_counts = Counter()
    brush_counts = Counter()
    svg_count = 0
    svg_invalid_count = 0
    pending_point_counts: list[int] = []

    def record_issue(kind: str, severity: str, stroke_index: int, details: str) -> None:
        issues.append(
            {
                "kind": kind,
                "severity": severity,
                "stroke_index": stroke_index,
                "details": details,
            }
        )
        issue_counts[severity] += 1

    for idx, stroke in enumerate(strokes):
        path = stroke.get("path")
        if not isinstance(path, dict):
            record_issue("missing_path", "error", idx, "stroke.path missing or not an object")
            continue

        path_type = path.get("type")
        if path_type not in VALID_TYPES:
            record_issue("invalid_path_type", "error", idx, f"type={path_type}")
            continue
        path_type_counts[path_type] += 1

        brush = path.get("brush")
        if brush is not None:
            brush_counts[str(brush)] += 1
            if brush not in BRUSH_NAMES:
                record_issue("invalid_brush", "error", idx, f"brush={brush}")

        color = path.get("color")
        if color is not None and not HEX_COLOR_RE.match(str(color)):
            record_issue("invalid_color", "warn", idx, f"color={color}")

        stroke_width = path.get("stroke_width")
        if stroke_width is not None:
            try:
                width_val = float(stroke_width)
                if width_val <= 0:
                    record_issue("invalid_stroke_width", "error", idx, f"stroke_width={width_val}")
                elif width_val < 0.5 or width_val > 30:
                    record_issue(
                        "stroke_width_out_of_range",
                        "warn",
                        idx,
                        f"stroke_width={width_val}",
                    )
            except (TypeError, ValueError):
                record_issue("invalid_stroke_width", "error", idx, f"stroke_width={stroke_width}")

        opacity = path.get("opacity")
        if opacity is not None:
            try:
                opacity_val = float(opacity)
                if opacity_val < 0 or opacity_val > 1:
                    record_issue("invalid_opacity", "error", idx, f"opacity={opacity_val}")
                elif opacity_val == 0:
                    record_issue("zero_opacity", "warn", idx, "opacity=0 (invisible stroke)")
            except (TypeError, ValueError):
                record_issue("invalid_opacity", "error", idx, f"opacity={opacity}")

        if path_type == "svg":
            svg_count += 1
            d = path.get("d")
            if not isinstance(d, str) or not d.strip():
                svg_invalid_count += 1
                record_issue("svg_missing_d", "error", idx, "svg path missing d string")
            if path.get("points"):
                record_issue("svg_has_points", "warn", idx, "svg path should not include points")
            if brush is not None:
                record_issue("brush_on_svg", "warn", idx, f"brush={brush}")

            if isinstance(d, str) and d.strip():
                svg_points = sample_svg_points(d)
                if not svg_points:
                    svg_invalid_count += 1
                    record_issue("svg_parse_failed", "error", idx, "failed to sample svg points")
                else:
                    for x, y in svg_points:
                        if point_out_of_bounds(x, y, BOUNDS_PAD):
                            record_issue(
                                "svg_point_out_of_bounds",
                                "error",
                                idx,
                                f"svg point ({x:.1f}, {y:.1f}) out of bounds",
                            )
                            break
        else:
            points = path.get("points")
            if not isinstance(points, list):
                record_issue("points_missing", "error", idx, "path.points missing or not a list")
                points = []

            min_points = MIN_POINTS.get(path_type, 2)
            if len(points) < min_points:
                record_issue(
                    "points_too_short",
                    "error",
                    idx,
                    f"{path_type} requires {min_points}+ points, got {len(points)}",
                )
            elif path_type in {"line", "quadratic", "cubic"} and len(points) != min_points:
                record_issue(
                    "unexpected_point_count",
                    "warn",
                    idx,
                    f"{path_type} expects {min_points} points, got {len(points)}",
                )

            for pt in points:
                if not isinstance(pt, dict) or "x" not in pt or "y" not in pt:
                    record_issue("point_not_numeric", "error", idx, f"point={pt}")
                    continue
                try:
                    x = float(pt["x"])
                    y = float(pt["y"])
                except (TypeError, ValueError):
                    record_issue("point_not_numeric", "error", idx, f"point={pt}")
                    continue
                if point_out_of_bounds(x, y, BOUNDS_PAD):
                    record_issue(
                        "point_out_of_bounds",
                        "error",
                        idx,
                        f"point ({x:.1f}, {y:.1f}) out of bounds",
                    )
                    break

        pending_points = stroke.get("points", [])
        if not isinstance(pending_points, list):
            record_issue("pending_points_invalid", "error", idx, "pending points not a list")
            pending_points = []
        pending_point_counts.append(len(pending_points))
        if len(pending_points) < 2:
            record_issue(
                "pending_points_too_short",
                "error",
                idx,
                f"pending points length {len(pending_points)}",
            )
        for pt in pending_points[:50]:
            if not isinstance(pt, dict) or "x" not in pt or "y" not in pt:
                record_issue("pending_point_invalid", "error", idx, f"pending point={pt}")
                break
            try:
                x = float(pt["x"])
                y = float(pt["y"])
            except (TypeError, ValueError):
                record_issue("pending_point_invalid", "error", idx, f"pending point={pt}")
                break
            if point_out_of_bounds(x, y, BOUNDS_PAD):
                record_issue(
                    "pending_point_out_of_bounds",
                    "error",
                    idx,
                    f"pending point ({x:.1f}, {y:.1f}) out of bounds",
                )
                break

    total_strokes = len(strokes)
    pending_min = min(pending_point_counts) if pending_point_counts else 0
    pending_max = max(pending_point_counts) if pending_point_counts else 0
    pending_avg = (
        sum(pending_point_counts) / len(pending_point_counts)
        if pending_point_counts
        else 0
    )

    return {
        "strokes_total": total_strokes,
        "path_type_counts": dict(path_type_counts),
        "brush_counts": dict(brush_counts),
        "svg_count": svg_count,
        "svg_invalid_count": svg_invalid_count,
        "pending_point_stats": {
            "min": pending_min,
            "max": pending_max,
            "avg": pending_avg,
        },
        "issue_counts": dict(issue_counts),
        "issues": issues,
        "passes": issue_counts.get("error", 0) == 0,
    }


async def wait_for_init(ws: websockets.WebSocketClientProtocol, timeout: float = 5.0) -> None:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
        except asyncio.TimeoutError:
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if msg.get("type") == "init":
            return


async def run_painting(
    ws: websockets.WebSocketClientProtocol,
    token: str,
    base_url: str,
    prompt: str,
    timeout: int,
    quiet_seconds: float,
) -> dict[str, Any]:
    start_time = time.monotonic()
    events = Counter()
    strokes: list[dict[str, Any]] = []
    batch_ids_seen: set[int] = set()
    piece_done = False
    piece_number: int | None = None
    last_stroke_time = time.monotonic()

    new_canvas_msg = {
        "type": "new_canvas",
        "direction": f"{prompt} Use paint mode. When finished, call mark_piece_done.",
        "drawing_style": "paint",
    }
    await ws.send(json.dumps(new_canvas_msg))
    await ws.send(json.dumps({"type": "resume"}))

    while time.monotonic() - start_time < timeout:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
        except asyncio.TimeoutError:
            if piece_done and time.monotonic() - last_stroke_time >= quiet_seconds:
                break
            continue

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        msg_type = msg.get("type")
        if msg_type:
            events[msg_type] += 1

        if msg_type == "agent_strokes_ready":
            if "piece_number" in msg:
                piece_number = msg.get("piece_number")
            pending = await fetch_pending_strokes(base_url, token)
            if pending:
                strokes.extend(pending)
                last_stroke_time = time.monotonic()
            new_batch_ids = {
                s.get("batch_id") for s in pending if isinstance(s.get("batch_id"), int)
            }
            for batch_id in sorted(new_batch_ids):
                if batch_id in batch_ids_seen:
                    continue
                await ws.send(json.dumps({"type": "animation_done", "batch_id": batch_id}))
                batch_ids_seen.add(batch_id)

        elif msg_type == "piece_state":
            if "number" in msg:
                piece_number = msg.get("number")
            if msg.get("completed") is True:
                piece_done = True

        elif msg_type == "error":
            detail = msg.get("message") or msg.get("error") or "unknown error"
            print(f"[{ts()}] agent error: {detail}")

    return {
        "prompt": prompt,
        "piece_number": piece_number,
        "piece_done": piece_done,
        "events": dict(events),
        "strokes": strokes,
        "batch_ids": sorted(batch_ids_seen),
        "duration_s": round(time.monotonic() - start_time, 2),
    }


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    total_strokes = sum(r["analysis"]["strokes_total"] for r in results)
    total_errors = sum(r["analysis"]["issue_counts"].get("error", 0) for r in results)
    total_warnings = sum(r["analysis"]["issue_counts"].get("warn", 0) for r in results)
    passes = sum(1 for r in results if r["analysis"]["passes"])
    return {
        "paintings": len(results),
        "strokes_total": total_strokes,
        "errors_total": total_errors,
        "warnings_total": total_warnings,
        "passes": passes,
    }


async def main_async() -> None:
    parser = argparse.ArgumentParser(description="Painting experiment runner")
    parser.add_argument("--count", type=int, default=10, help="Number of paintings to run")
    parser.add_argument("--timeout", type=int, default=180, help="Timeout per painting in seconds")
    parser.add_argument(
        "--quiet-seconds",
        type=float,
        default=5.0,
        help="Quiet period after completion before stopping",
    )
    parser.add_argument("--prompt-file", type=str, default=None, help="File of prompts")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output directory (default: scratch/painting-experiment-<timestamp>)",
    )
    parser.add_argument("--base-url", type=str, default=BASE_URL, help="API base URL")
    parser.add_argument("--ws-url", type=str, default=WS_URL, help="WebSocket URL")
    args = parser.parse_args()

    output_dir = Path(args.output) if args.output else None
    if output_dir is None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_dir = Path("scratch") / f"painting-experiment-{stamp}"
    output_dir.mkdir(parents=True, exist_ok=True)

    prompts = load_prompts(args.prompt_file, args.count)
    token = await get_token(args.base_url)

    results: list[dict[str, Any]] = []

    async with websockets.connect(f"{args.ws_url}?token={token}") as ws:
        await wait_for_init(ws)

        for i, prompt in enumerate(prompts, start=1):
            print(f"[{ts()}] Painting {i}/{args.count}: {prompt}")
            run_data = await run_painting(
                ws,
                token,
                args.base_url,
                prompt,
                timeout=args.timeout,
                quiet_seconds=args.quiet_seconds,
            )
            analysis = analyze_strokes(run_data["strokes"])
            run_data["analysis"] = analysis

            out_path = output_dir / f"painting_{i:02d}.json"
            out_path.write_text(json.dumps(run_data, indent=2))
            results.append(run_data)

            errors = analysis["issue_counts"].get("error", 0)
            warnings = analysis["issue_counts"].get("warn", 0)
            status = "PASS" if analysis["passes"] else "FAIL"
            print(
                f"[{ts()}] Painting {i:02d} {status} (errors={errors}, warnings={warnings})"
            )

    summary = summarize_results(results)
    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))

    print("\nExperiment summary:")
    print(json.dumps(summary, indent=2))
    print(f"\nSaved reports to {output_dir}")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
