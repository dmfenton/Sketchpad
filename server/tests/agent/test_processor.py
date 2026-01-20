"""Tests for the agent processor module."""

from typing import Any
from unittest.mock import MagicMock

from code_monet.agent.processor import extract_tool_name


class TestExtractToolName:
    """Tests for extract_tool_name helper function."""

    def test_extract_from_dict(self) -> None:
        """Extract tool_name from a dict (runtime SDK format)."""
        input_data = {"tool_name": "mcp__drawing__draw_paths", "tool_input": {}}
        assert extract_tool_name(input_data) == "mcp__drawing__draw_paths"

    def test_extract_from_dict_missing_key(self) -> None:
        """Return empty string when tool_name key is missing."""
        input_data: dict[str, Any] = {"tool_input": {}}
        assert extract_tool_name(input_data) == ""

    def test_extract_from_dict_none_value(self) -> None:
        """Return empty string when tool_name is None."""
        input_data: dict[str, Any] = {"tool_name": None}
        assert extract_tool_name(input_data) == ""

    def test_extract_from_dict_empty_string(self) -> None:
        """Return empty string when tool_name is empty."""
        input_data = {"tool_name": ""}
        assert extract_tool_name(input_data) == ""

    def test_extract_from_object(self) -> None:
        """Extract tool_name from an object with attributes."""
        mock_input = MagicMock()
        mock_input.tool_name = "mcp__drawing__generate_svg"
        assert extract_tool_name(mock_input) == "mcp__drawing__generate_svg"

    def test_extract_from_object_missing_attr(self) -> None:
        """Return empty string when object lacks tool_name attribute."""
        mock_input = MagicMock(spec=[])  # No attributes
        assert extract_tool_name(mock_input) == ""

    def test_extract_various_tool_names(self) -> None:
        """Extract various tool names correctly."""
        test_cases = [
            "mcp__drawing__draw_paths",
            "mcp__drawing__generate_svg",
            "mcp__drawing__view_canvas",
            "mcp__drawing__mark_piece_done",
            "mcp__drawing__imagine",
            "mcp__drawing__sign_canvas",
            "mcp__drawing__name_piece",
        ]
        for tool_name in test_cases:
            input_data = {"tool_name": tool_name}
            assert extract_tool_name(input_data) == tool_name

    def test_handles_integer_coercion(self) -> None:
        """Handles non-string values via str() coercion."""
        input_data = {"tool_name": 123}
        result = extract_tool_name(input_data)
        assert result == "123"
