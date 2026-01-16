"""Tests for canvas rendering."""

from code_monet.canvas import render_path_to_svg_d
from code_monet.types import Path, PathType, Point


class TestSvgPathRendering:
    def test_line_to_svg(self) -> None:
        path = Path(
            type=PathType.LINE,
            points=[Point(x=0, y=0), Point(x=100, y=100)],
        )
        d = render_path_to_svg_d(path)
        # Points are floats, so output contains decimal values
        assert d.startswith("M ")
        assert "L " in d

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
        assert d.startswith("M ")
        assert d.count("L ") == 2

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
        assert d.startswith("M ")
        assert "Q " in d

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
        assert d.startswith("M ")
        assert "C " in d

    def test_empty_path(self) -> None:
        path = Path(type=PathType.LINE, points=[])
        d = render_path_to_svg_d(path)
        assert d == ""
