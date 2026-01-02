"""Tests for canvas rendering."""

from drawing_agent.canvas import render_path_to_svg_d
from drawing_agent.types import Path, PathType, Point


class TestSvgPathRendering:
    def test_line_to_svg(self) -> None:
        path = Path(
            type=PathType.LINE,
            points=[Point(x=0, y=0), Point(x=100, y=100)],
        )
        d = render_path_to_svg_d(path)
        assert "M 0 0" in d
        assert "L 100 100" in d

    def test_polyline_to_svg(self) -> None:
        path = Path(
            type=PathType.POLYLINE,
            points=[
                Point(x=0, y=0),
                Point(x=50, y=50),
                Point(x=100, y=0),
            ],
        )
        d = render_path_to_svg_d(path)
        assert "M 0 0" in d
        assert "L 50 50" in d
        assert "L 100 0" in d

    def test_quadratic_to_svg(self) -> None:
        path = Path(
            type=PathType.QUADRATIC,
            points=[
                Point(x=0, y=0),
                Point(x=50, y=100),
                Point(x=100, y=0),
            ],
        )
        d = render_path_to_svg_d(path)
        assert "M 0 0" in d
        assert "Q 50 100 100 0" in d

    def test_cubic_to_svg(self) -> None:
        path = Path(
            type=PathType.CUBIC,
            points=[
                Point(x=0, y=0),
                Point(x=33, y=100),
                Point(x=66, y=100),
                Point(x=100, y=0),
            ],
        )
        d = render_path_to_svg_d(path)
        assert "M 0 0" in d
        assert "C 33 100 66 100 100 0" in d

    def test_empty_path(self) -> None:
        path = Path(type=PathType.LINE, points=[])
        d = render_path_to_svg_d(path)
        assert d == ""
