#!/usr/bin/env python3
"""
Aggregate painting experiment results and report worst offending strokes.

Usage:
  python3 scripts/painting-experiment-report.py --input server/scratch/dir1 --input server/scratch/dir2
  python3 scripts/painting-experiment-report.py --input server/scratch/dir --output scratch/report-dir
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

CANVAS_WIDTH = 800.0
CANVAS_HEIGHT = 600.0

DEFAULT_BINS = [
    (0.0, 1.0),
    (1.0, 5.0),
    (5.0, 20.0),
    (20.0, 50.0),
    (50.0, float("inf")),
]


def iter_painting_files(inputs: Iterable[str]) -> list[Path]:
    files: list[Path] = []
    for raw in inputs:
        path = Path(raw)
        if not path.exists():
            continue
        if path.is_file() and path.name.startswith("painting_") and path.suffix == ".json":
            files.append(path)
            continue
        if path.is_dir():
            files.extend(sorted(path.glob("painting_*.json")))
    return files


def out_of_bounds_amount(x: float, y: float) -> float:
    dx = 0.0
    dy = 0.0
    if x < 0:
        dx = -x
    elif x > CANVAS_WIDTH:
        dx = x - CANVAS_WIDTH
    if y < 0:
        dy = -y
    elif y > CANVAS_HEIGHT:
        dy = y - CANVAS_HEIGHT
    return max(dx, dy)


def sample_points(points: list[dict[str, Any]], max_points: int = 6) -> list[dict[str, float]]:
    sample: list[dict[str, float]] = []
    for pt in points[:max_points]:
        if not isinstance(pt, dict):
            continue
        if "x" in pt and "y" in pt:
            try:
                sample.append({"x": float(pt["x"]), "y": float(pt["y"])})
            except (TypeError, ValueError):
                continue
    return sample


def analyze_strokes(strokes: list[dict[str, Any]]) -> dict[str, Any]:
    path_type_counts = Counter()
    brush_counts = Counter()

    oob_point_count = 0
    oob_point_max = 0.0
    oob_bins = Counter()

    strokes_with_path_oob = 0
    strokes_with_pending_oob = 0

    worst_strokes: list[dict[str, Any]] = []

    def bin_oob(amount: float) -> str:
        for lo, hi in DEFAULT_BINS:
            if lo <= amount < hi:
                return f"{lo:g}-{hi:g}"
        return "unknown"

    for idx, stroke in enumerate(strokes):
        path = stroke.get("path", {}) if isinstance(stroke.get("path"), dict) else {}
        path_type = path.get("type")
        if path_type:
            path_type_counts[str(path_type)] += 1
        brush = path.get("brush")
        if brush:
            brush_counts[str(brush)] += 1

        path_points = path.get("points") if isinstance(path.get("points"), list) else []
        pending_points = stroke.get("points") if isinstance(stroke.get("points"), list) else []

        path_oob = False
        pending_oob = False
        worst_point = None
        worst_amount = 0.0
        worst_source = None

        for pt in path_points:
            if not isinstance(pt, dict) or "x" not in pt or "y" not in pt:
                continue
            try:
                x = float(pt["x"])
                y = float(pt["y"])
            except (TypeError, ValueError):
                continue
            amount = out_of_bounds_amount(x, y)
            if amount > 0:
                path_oob = True
                oob_point_count += 1
                oob_point_max = max(oob_point_max, amount)
                oob_bins[bin_oob(amount)] += 1
                if amount > worst_amount:
                    worst_amount = amount
                    worst_point = {"x": x, "y": y}
                    worst_source = "path"

        for pt in pending_points:
            if not isinstance(pt, dict) or "x" not in pt or "y" not in pt:
                continue
            try:
                x = float(pt["x"])
                y = float(pt["y"])
            except (TypeError, ValueError):
                continue
            amount = out_of_bounds_amount(x, y)
            if amount > 0:
                pending_oob = True
                oob_point_count += 1
                oob_point_max = max(oob_point_max, amount)
                oob_bins[bin_oob(amount)] += 1
                if amount > worst_amount:
                    worst_amount = amount
                    worst_point = {"x": x, "y": y}
                    worst_source = "pending"

        if path_oob:
            strokes_with_path_oob += 1
        if pending_oob:
            strokes_with_pending_oob += 1

        if worst_amount > 0:
            worst_strokes.append(
                {
                    "stroke_index": idx,
                    "source_file": stroke.get("_source_file"),
                    "source_stroke_index": stroke.get("_source_stroke_index"),
                    "path_type": path_type,
                    "brush": brush,
                    "stroke_width": path.get("stroke_width"),
                    "color": path.get("color"),
                    "opacity": path.get("opacity"),
                    "max_out_of_bounds": round(worst_amount, 3),
                    "worst_point": worst_point,
                    "worst_source": worst_source,
                    "path_points_sample": sample_points(path_points),
                    "pending_points_sample": sample_points(pending_points),
                }
            )

    worst_strokes.sort(key=lambda s: s["max_out_of_bounds"], reverse=True)

    return {
        "path_type_counts": dict(path_type_counts),
        "brush_counts": dict(brush_counts),
        "out_of_bounds": {
            "points_total": oob_point_count,
            "max_amount": round(oob_point_max, 3),
            "bins": dict(oob_bins),
            "strokes_with_path_oob": strokes_with_path_oob,
            "strokes_with_pending_oob": strokes_with_pending_oob,
        },
        "worst_strokes": worst_strokes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate painting experiment reports")
    parser.add_argument(
        "--input",
        action="append",
        required=True,
        help="Input directory or painting_*.json file (repeatable)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output directory (default: scratch/painting-experiment-report-<timestamp>)",
    )
    parser.add_argument("--top", type=int, default=20, help="Top N worst offenders to keep")
    args = parser.parse_args()

    files = iter_painting_files(args.input)
    if not files:
        raise SystemExit("No painting_*.json files found in inputs.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = Path(args.output) if args.output else Path("scratch") / f"painting-experiment-report-{stamp}"
    output_dir.mkdir(parents=True, exist_ok=True)

    all_results: list[dict[str, Any]] = []
    combined_strokes: list[dict[str, Any]] = []
    severity_counts = Counter()
    issue_kind_counts = Counter()

    for path in files:
        data = json.loads(path.read_text())
        analysis = data.get("analysis", {})
        strokes = data.get("strokes", [])
        if isinstance(strokes, list):
            for stroke_index, stroke in enumerate(strokes):
                if not isinstance(stroke, dict):
                    continue
                enriched = dict(stroke)
                enriched["_source_file"] = str(path)
                enriched["_source_stroke_index"] = stroke_index
                combined_strokes.append(enriched)

        severity_counts.update(analysis.get("issue_counts", {}))
        for issue in analysis.get("issues", []) if isinstance(analysis.get("issues"), list) else []:
            if isinstance(issue, dict):
                issue_kind_counts[str(issue.get("kind", "unknown"))] += 1

        all_results.append(
            {
                "file": str(path),
                "prompt": data.get("prompt"),
                "piece_number": data.get("piece_number"),
                "duration_s": data.get("duration_s"),
                "analysis": analysis,
            }
        )

    detailed = analyze_strokes(combined_strokes)
    worst_strokes = detailed["worst_strokes"][: args.top]

    summary = {
        "inputs": [str(p) for p in args.input],
        "paintings": len(all_results),
        "strokes_total": len(combined_strokes),
        "severity_counts": dict(severity_counts),
        "issue_kind_counts": dict(issue_kind_counts),
        "path_type_counts": detailed["path_type_counts"],
        "brush_counts": detailed["brush_counts"],
        "out_of_bounds": detailed["out_of_bounds"],
    }

    report = {
        "summary": summary,
        "worst_offenders": worst_strokes,
    }

    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    (output_dir / "worst_offenders.json").write_text(json.dumps(worst_strokes, indent=2))
    (output_dir / "report.json").write_text(json.dumps(report, indent=2))

    print(json.dumps(summary, indent=2))
    print(f"\nSaved report to {output_dir}")


if __name__ == "__main__":
    main()
