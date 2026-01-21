"""Tests for the agent renderer module."""

import base64
from dataclasses import replace
from unittest.mock import MagicMock

from PIL import Image

from code_monet.agent.renderer import image_to_base64
from code_monet.rendering import options_for_agent_view, render_strokes
from code_monet.types import DrawingStyleType, Path, PathType, Point


def _create_mock_canvas(
    strokes: list[Path] | None = None,
    width: int = 800,
    height: int = 600,
    drawing_style: DrawingStyleType = DrawingStyleType.PLOTTER,
) -> MagicMock:
    """Create a mock canvas state."""
    canvas = MagicMock()
    canvas.strokes = strokes or []
    canvas.width = width
    canvas.height = height
    canvas.drawing_style = drawing_style
    return canvas


class TestRenderCanvasToImage:
    """Tests for render_strokes with options_for_agent_view."""

    def test_empty_canvas_renders_white_background(self) -> None:
        """Empty canvas renders as white image."""
        canvas = _create_mock_canvas()
        options = options_for_agent_view(canvas)

        img = render_strokes(canvas.strokes, options)

        assert isinstance(img, Image.Image)
        assert img.mode == "RGB"
        assert img.size == (800, 600)
        # Check that center pixel is white
        pixel = img.getpixel((400, 300))
        assert pixel == (255, 255, 255)

    def test_strokes_render_with_correct_colors(self) -> None:
        """Strokes render with style-appropriate colors."""
        # Create a simple line stroke
        stroke = Path(
            type=PathType.LINE,
            points=[Point(x=100, y=100), Point(x=200, y=100)],
            author="agent",
        )
        canvas = _create_mock_canvas(strokes=[stroke])
        options = options_for_agent_view(canvas)

        img = render_strokes(canvas.strokes, options)

        assert isinstance(img, Image.Image)
        # The stroke should be drawn (not white)
        # Check a pixel along the line
        pixel = img.getpixel((150, 100))
        assert pixel != (255, 255, 255)

    def test_human_strokes_highlighted(self) -> None:
        """Human strokes render in highlight color when highlight_human=True."""
        stroke = Path(
            type=PathType.LINE,
            points=[Point(x=100, y=100), Point(x=200, y=100)],
            author="human",
        )
        canvas = _create_mock_canvas(strokes=[stroke])
        options = options_for_agent_view(canvas)  # highlight_human=True by default

        img = render_strokes(canvas.strokes, options)

        assert isinstance(img, Image.Image)
        # The stroke should be drawn (not white)
        pixel = img.getpixel((150, 100))
        assert pixel != (255, 255, 255)

    def test_human_strokes_not_highlighted(self) -> None:
        """Human strokes render normally when highlight_human=False."""
        stroke = Path(
            type=PathType.LINE,
            points=[Point(x=100, y=100), Point(x=200, y=100)],
            author="human",
        )
        canvas = _create_mock_canvas(strokes=[stroke])
        options = replace(options_for_agent_view(canvas), highlight_human=False)

        img = render_strokes(canvas.strokes, options)

        assert isinstance(img, Image.Image)
        # The stroke should still be drawn
        pixel = img.getpixel((150, 100))
        assert pixel != (255, 255, 255)

    def test_returns_pil_image(self) -> None:
        """Function returns a PIL Image object."""
        canvas = _create_mock_canvas()
        options = options_for_agent_view(canvas)

        result = render_strokes(canvas.strokes, options)

        assert isinstance(result, Image.Image)

    def test_custom_canvas_size(self) -> None:
        """Respects custom canvas dimensions."""
        canvas = _create_mock_canvas(width=400, height=300)
        options = options_for_agent_view(canvas)

        img = render_strokes(canvas.strokes, options)

        assert isinstance(img, Image.Image)
        assert img.size == (400, 300)


class TestImageToBase64:
    """Tests for image_to_base64 function."""

    def test_returns_base64_string(self) -> None:
        """Returns a base64-encoded string."""
        img = Image.new("RGB", (100, 100), color="white")

        result = image_to_base64(img)

        assert isinstance(result, str)
        assert len(result) > 0

    def test_base64_is_decodable(self) -> None:
        """Base64 string can be decoded back."""
        img = Image.new("RGB", (100, 100), color="white")

        result = image_to_base64(img)
        decoded = base64.standard_b64decode(result)

        assert len(decoded) > 0

    def test_output_is_valid_png(self) -> None:
        """Decoded output is valid PNG data."""
        img = Image.new("RGB", (50, 50), color="red")

        result = image_to_base64(img)
        decoded = base64.standard_b64decode(result)

        # PNG magic bytes
        assert decoded[:4] == b"\x89PNG"

    def test_handles_different_image_sizes(self) -> None:
        """Handles various image sizes."""
        for size in [(10, 10), (100, 200), (1920, 1080)]:
            img = Image.new("RGB", size, color="blue")
            result = image_to_base64(img)
            assert isinstance(result, str)
            assert len(result) > 0
