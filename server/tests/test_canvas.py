"""Tests for canvas rendering."""

from code_monet.canvas import render_path_to_svg_d, render_strokes_to_png
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


class TestRenderStrokesToPng:
    """Tests for render_strokes_to_png function."""

    def test_renders_empty_strokes(self) -> None:
        """Empty strokes list should produce valid PNG."""
        png_data = render_strokes_to_png([])
        assert isinstance(png_data, bytes)
        assert len(png_data) > 0
        # PNG magic bytes
        assert png_data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_renders_single_line(self) -> None:
        """Single line stroke should produce valid PNG."""
        stroke = Path(
            type=PathType.LINE,
            points=[Point(x=100, y=100), Point(x=700, y=700)],
        )
        png_data = render_strokes_to_png([stroke])
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_renders_multiple_strokes(self) -> None:
        """Multiple strokes should produce valid PNG."""
        strokes = [
            Path(type=PathType.LINE, points=[Point(x=0, y=0), Point(x=100, y=100)]),
            Path(type=PathType.LINE, points=[Point(x=100, y=0), Point(x=0, y=100)]),
            Path(
                type=PathType.POLYLINE,
                points=[Point(x=200, y=200), Point(x=300, y=250), Point(x=400, y=200)],
            ),
        ]
        png_data = render_strokes_to_png(strokes)
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_respects_custom_dimensions(self) -> None:
        """Custom width/height should be respected."""
        import io

        from PIL import Image

        stroke = Path(
            type=PathType.LINE,
            points=[Point(x=0, y=0), Point(x=50, y=50)],
        )
        png_data = render_strokes_to_png([stroke], width=400, height=300)

        # Verify dimensions by loading the image
        img = Image.open(io.BytesIO(png_data))
        assert img.size == (400, 300)

    def test_skips_single_point_paths(self) -> None:
        """Paths with less than 2 points should be skipped (not crash)."""
        stroke = Path(type=PathType.LINE, points=[Point(x=100, y=100)])
        png_data = render_strokes_to_png([stroke])
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_renders_svg_path_type(self) -> None:
        """SVG path type should be interpolated and rendered."""
        stroke = Path(
            type=PathType.SVG,
            d="M 100 100 L 200 200 L 300 100",
            points=[],
        )
        png_data = render_strokes_to_png([stroke])
        assert isinstance(png_data, bytes)
        assert png_data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_default_dimensions(self) -> None:
        """Default dimensions should be 800x800."""
        import io

        from PIL import Image

        png_data = render_strokes_to_png([])
        img = Image.open(io.BytesIO(png_data))
        assert img.size == (800, 800)
