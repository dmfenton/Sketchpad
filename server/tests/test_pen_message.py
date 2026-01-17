"""Tests for PenMessage with stroke style properties."""

from code_monet.types import PenMessage


class TestPenMessageStyle:
    """Tests for PenMessage stroke style properties."""

    def test_pen_message_basic(self) -> None:
        """PenMessage can be created with just position and down state."""
        msg = PenMessage(x=100.0, y=200.0, down=True)
        assert msg.x == 100.0
        assert msg.y == 200.0
        assert msg.down is True
        assert msg.color is None
        assert msg.stroke_width is None
        assert msg.opacity is None

    def test_pen_message_with_color(self) -> None:
        """PenMessage can include color for stroke start."""
        msg = PenMessage(x=100.0, y=200.0, down=True, color="#ff0000")
        assert msg.color == "#ff0000"

    def test_pen_message_with_stroke_width(self) -> None:
        """PenMessage can include stroke width for stroke start."""
        msg = PenMessage(x=100.0, y=200.0, down=True, stroke_width=5.0)
        assert msg.stroke_width == 5.0

    def test_pen_message_with_opacity(self) -> None:
        """PenMessage can include opacity for stroke start."""
        msg = PenMessage(x=100.0, y=200.0, down=True, opacity=0.8)
        assert msg.opacity == 0.8

    def test_pen_message_with_all_style_props(self) -> None:
        """PenMessage can include all style properties."""
        msg = PenMessage(
            x=100.0,
            y=200.0,
            down=True,
            color="#e94560",
            stroke_width=8.0,
            opacity=0.85,
        )
        assert msg.color == "#e94560"
        assert msg.stroke_width == 8.0
        assert msg.opacity == 0.85

    def test_pen_message_serialization(self) -> None:
        """PenMessage serializes correctly with style properties."""
        msg = PenMessage(
            x=100.0,
            y=200.0,
            down=True,
            color="#e94560",
            stroke_width=8.0,
            opacity=0.85,
        )
        data = msg.model_dump()
        assert data["type"] == "pen"
        assert data["x"] == 100.0
        assert data["y"] == 200.0
        assert data["down"] is True
        assert data["color"] == "#e94560"
        assert data["stroke_width"] == 8.0
        assert data["opacity"] == 0.85

    def test_pen_message_serialization_excludes_none(self) -> None:
        """PenMessage serialization excludes None values when using exclude_none."""
        msg = PenMessage(x=100.0, y=200.0, down=True)
        data = msg.model_dump(exclude_none=True)
        assert "color" not in data
        assert "stroke_width" not in data
        assert "opacity" not in data

    def test_pen_up_ignores_style(self) -> None:
        """Style props on pen up are valid but typically unused."""
        # This is valid - style is only used when pen goes down
        msg = PenMessage(x=100.0, y=200.0, down=False, color="#ff0000")
        assert msg.down is False
        assert msg.color == "#ff0000"
