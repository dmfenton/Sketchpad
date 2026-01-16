"""Tests for path execution and interpolation."""

import pytest

from code_monet.executor import apply_easing, ease_in_out, interpolate_travel
from code_monet.interpolation import (
    cubic_bezier,
    estimate_path_length,
    interpolate_path,
    lerp,
    lerp_point,
    quadratic_bezier,
)
from code_monet.types import Path, PathType, Point


class TestLerp:
    def test_lerp_start(self) -> None:
        assert lerp(0, 100, 0) == 0

    def test_lerp_end(self) -> None:
        assert lerp(0, 100, 1) == 100

    def test_lerp_middle(self) -> None:
        assert lerp(0, 100, 0.5) == 50

    def test_lerp_point(self) -> None:
        p1 = Point(x=0, y=0)
        p2 = Point(x=100, y=100)
        result = lerp_point(p1, p2, 0.5)
        assert result.x == 50
        assert result.y == 50


class TestBezier:
    def test_quadratic_bezier_start(self) -> None:
        p0 = Point(x=0, y=0)
        p1 = Point(x=50, y=100)
        p2 = Point(x=100, y=0)
        result = quadratic_bezier(p0, p1, p2, 0)
        assert result.x == pytest.approx(0)
        assert result.y == pytest.approx(0)

    def test_quadratic_bezier_end(self) -> None:
        p0 = Point(x=0, y=0)
        p1 = Point(x=50, y=100)
        p2 = Point(x=100, y=0)
        result = quadratic_bezier(p0, p1, p2, 1)
        assert result.x == pytest.approx(100)
        assert result.y == pytest.approx(0)

    def test_cubic_bezier_start(self) -> None:
        p0 = Point(x=0, y=0)
        p1 = Point(x=33, y=100)
        p2 = Point(x=66, y=100)
        p3 = Point(x=100, y=0)
        result = cubic_bezier(p0, p1, p2, p3, 0)
        assert result.x == pytest.approx(0)
        assert result.y == pytest.approx(0)

    def test_cubic_bezier_end(self) -> None:
        p0 = Point(x=0, y=0)
        p1 = Point(x=33, y=100)
        p2 = Point(x=66, y=100)
        p3 = Point(x=100, y=0)
        result = cubic_bezier(p0, p1, p2, p3, 1)
        assert result.x == pytest.approx(100)
        assert result.y == pytest.approx(0)


class TestPathLength:
    def test_line_length(self) -> None:
        path = Path(
            type=PathType.LINE,
            points=[Point(x=0, y=0), Point(x=100, y=0)],
        )
        assert estimate_path_length(path) == pytest.approx(100)

    def test_polyline_length(self) -> None:
        path = Path(
            type=PathType.POLYLINE,
            points=[
                Point(x=0, y=0),
                Point(x=100, y=0),
                Point(x=100, y=100),
            ],
        )
        assert estimate_path_length(path) == pytest.approx(200)

    def test_empty_path(self) -> None:
        path = Path(type=PathType.LINE, points=[])
        assert estimate_path_length(path) == 0


class TestInterpolatePath:
    def test_interpolate_line(self) -> None:
        path = Path(
            type=PathType.LINE,
            points=[Point(x=0, y=0), Point(x=100, y=0)],
        )
        result = interpolate_path(path, steps_per_unit=0.1)
        assert len(result) >= 2
        assert result[0].x == pytest.approx(0)
        assert result[-1].x == pytest.approx(100)

    def test_interpolate_preserves_endpoints(self) -> None:
        path = Path(
            type=PathType.QUADRATIC,
            points=[
                Point(x=0, y=0),
                Point(x=50, y=100),
                Point(x=100, y=0),
            ],
        )
        result = interpolate_path(path)
        assert result[0].x == pytest.approx(0)
        assert result[0].y == pytest.approx(0)
        assert result[-1].x == pytest.approx(100)
        assert result[-1].y == pytest.approx(0)


class TestEasing:
    """Tests for pen plotter motion easing."""

    def test_ease_in_out_endpoints(self) -> None:
        """Easing function preserves 0 and 1."""
        assert ease_in_out(0.0) == pytest.approx(0.0)
        assert ease_in_out(1.0) == pytest.approx(1.0)

    def test_ease_in_out_midpoint(self) -> None:
        """Midpoint is unchanged by smoothstep."""
        assert ease_in_out(0.5) == pytest.approx(0.5)

    def test_ease_in_out_slow_start(self) -> None:
        """Early values are compressed (slower start)."""
        assert ease_in_out(0.25) < 0.25

    def test_ease_in_out_slow_end(self) -> None:
        """Late values are compressed (slower end)."""
        assert ease_in_out(0.75) > 0.75

    def test_apply_easing_preserves_endpoints(self) -> None:
        """First and last points are unchanged."""
        points = [Point(x=0, y=0), Point(x=50, y=50), Point(x=100, y=100)]
        result = apply_easing(points)
        assert result[0].x == pytest.approx(0)
        assert result[0].y == pytest.approx(0)
        assert result[-1].x == pytest.approx(100)
        assert result[-1].y == pytest.approx(100)

    def test_apply_easing_same_length(self) -> None:
        """Output has same number of points as input."""
        points = [Point(x=i * 10, y=0) for i in range(10)]
        result = apply_easing(points)
        assert len(result) == len(points)

    def test_apply_easing_short_path(self) -> None:
        """Very short paths returned unchanged."""
        points = [Point(x=0, y=0), Point(x=100, y=0)]
        result = apply_easing(points)
        assert len(result) == 2


class TestInterpolateTravel:
    """Tests for pen plotter travel path interpolation."""

    def test_travel_creates_points(self) -> None:
        """Travel between distant points creates interpolated path."""
        start = Point(x=0, y=0)
        end = Point(x=100, y=100)
        result = interpolate_travel(start, end, steps_per_unit=0.5)
        assert len(result) > 2
        assert result[-1].x == pytest.approx(100)
        assert result[-1].y == pytest.approx(100)

    def test_travel_short_distance_minimal(self) -> None:
        """Very short travel returns just the endpoint."""
        start = Point(x=0, y=0)
        end = Point(x=0.5, y=0.5)
        result = interpolate_travel(start, end, steps_per_unit=0.5)
        assert len(result) == 1
        assert result[0].x == pytest.approx(0.5)
        assert result[0].y == pytest.approx(0.5)

    def test_travel_points_monotonic(self) -> None:
        """Travel points move steadily toward destination."""
        start = Point(x=0, y=0)
        end = Point(x=100, y=0)
        result = interpolate_travel(start, end, steps_per_unit=0.5)
        for i in range(1, len(result)):
            assert result[i].x >= result[i - 1].x
