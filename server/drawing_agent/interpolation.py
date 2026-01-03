"""Pure functions for path interpolation.

This module contains stateless, pure mathematical functions for
interpolating paths into discrete points. No side effects or I/O.
"""

import math
from collections.abc import Callable
from functools import reduce

from drawing_agent.types import Path, PathType, Point


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation between two values."""
    return a + (b - a) * t


def lerp_point(p1: Point, p2: Point, t: float) -> Point:
    """Linearly interpolate between two points."""
    return Point(x=lerp(p1.x, p2.x, t), y=lerp(p1.y, p2.y, t))


def distance(p1: Point, p2: Point) -> float:
    """Calculate Euclidean distance between two points."""
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    return math.sqrt(dx * dx + dy * dy)


def quadratic_bezier(p0: Point, p1: Point, p2: Point, t: float) -> Point:
    """Evaluate quadratic bezier at t."""
    one_minus_t = 1 - t
    return Point(
        x=one_minus_t**2 * p0.x + 2 * one_minus_t * t * p1.x + t**2 * p2.x,
        y=one_minus_t**2 * p0.y + 2 * one_minus_t * t * p1.y + t**2 * p2.y,
    )


def cubic_bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: float) -> Point:
    """Evaluate cubic bezier at t."""
    one_minus_t = 1 - t
    return Point(
        x=(
            one_minus_t**3 * p0.x
            + 3 * one_minus_t**2 * t * p1.x
            + 3 * one_minus_t * t**2 * p2.x
            + t**3 * p3.x
        ),
        y=(
            one_minus_t**3 * p0.y
            + 3 * one_minus_t**2 * t * p1.y
            + 3 * one_minus_t * t**2 * p2.y
            + t**3 * p3.y
        ),
    )


def estimate_path_length(path: Path) -> float:
    """Estimate the length of a path for timing calculations."""
    if len(path.points) < 2:
        return 0.0

    points = path.points

    match path.type:
        case PathType.LINE:
            return distance(points[0], points[1])

        case PathType.POLYLINE:
            return sum(
                distance(points[i], points[i + 1]) for i in range(len(points) - 1)
            )

        case PathType.QUADRATIC | PathType.CUBIC:
            # Approximate with linear segments
            steps = 20
            total = 0.0
            prev = points[0]
            for i in range(1, steps + 1):
                t = i / steps
                if path.type == PathType.QUADRATIC and len(points) >= 3:
                    curr = quadratic_bezier(points[0], points[1], points[2], t)
                elif path.type == PathType.CUBIC and len(points) >= 4:
                    curr = cubic_bezier(points[0], points[1], points[2], points[3], t)
                else:
                    break
                total += distance(prev, curr)
                prev = curr
            return total

        case _:
            return 0.0


# Type alias for interpolation strategy
Interpolator = Callable[[list[Point], int], list[Point]]


def interpolate_line(points: list[Point], num_steps: int) -> list[Point]:
    """Interpolate a line into discrete points."""
    if len(points) < 2:
        return list(points)
    return [lerp_point(points[0], points[1], i / num_steps) for i in range(num_steps + 1)]


def interpolate_polyline(points: list[Point], steps_per_unit: float) -> list[Point]:
    """Interpolate a polyline into discrete points using functional reduce."""
    if len(points) < 2:
        return list(points)

    def interpolate_segment(
        acc: list[Point], segment: tuple[int, tuple[Point, Point]]
    ) -> list[Point]:
        seg_idx, (p1, p2) = segment
        seg_length = distance(p1, p2)
        seg_steps = max(1, int(seg_length * steps_per_unit))

        new_points = [
            lerp_point(p1, p2, i / seg_steps)
            for i in range(0 if seg_idx == 0 else 1, seg_steps + 1)
        ]
        return acc + new_points

    segments = list(enumerate(zip(points[:-1], points[1:], strict=True)))
    return reduce(interpolate_segment, segments, [])


def interpolate_quadratic(points: list[Point], num_steps: int) -> list[Point]:
    """Interpolate a quadratic bezier into discrete points."""
    if len(points) < 3:
        return list(points)
    return [
        quadratic_bezier(points[0], points[1], points[2], i / num_steps)
        for i in range(num_steps + 1)
    ]


def interpolate_cubic(points: list[Point], num_steps: int) -> list[Point]:
    """Interpolate a cubic bezier into discrete points."""
    if len(points) < 4:
        return list(points)
    return [
        cubic_bezier(points[0], points[1], points[2], points[3], i / num_steps)
        for i in range(num_steps + 1)
    ]


def interpolate_path(path: Path, steps_per_unit: float = 0.5) -> list[Point]:
    """Interpolate a path into discrete points for drawing.

    This is a pure function - no side effects or external dependencies.
    """
    if len(path.points) < 2:
        return list(path.points)

    points = path.points
    length = estimate_path_length(path)
    num_steps = max(2, int(length * steps_per_unit))

    match path.type:
        case PathType.LINE:
            return interpolate_line(points, num_steps)

        case PathType.POLYLINE:
            return interpolate_polyline(points, steps_per_unit)

        case PathType.QUADRATIC:
            return interpolate_quadratic(points, num_steps)

        case PathType.CUBIC:
            return interpolate_cubic(points, num_steps)

        case _:
            return list(points)
