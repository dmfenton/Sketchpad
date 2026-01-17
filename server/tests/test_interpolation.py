"""Tests for path interpolation."""

import pytest

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
