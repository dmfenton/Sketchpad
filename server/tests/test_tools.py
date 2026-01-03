"""Tests for the drawing tools module."""

import pytest

from drawing_agent.tools import (
    handle_draw_paths,
    handle_mark_piece_done,
    parse_path_data,
    set_draw_callback,
)
from drawing_agent.types import Path, PathType


class TestParsePathData:
    """Tests for parse_path_data function."""

    def test_parse_line(self) -> None:
        data = {
            "type": "line",
            "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
        }
        result = parse_path_data(data)
        assert result is not None
        assert result.type == PathType.LINE
        assert len(result.points) == 2
        assert result.points[0].x == 0
        assert result.points[1].y == 100

    def test_parse_polyline(self) -> None:
        data = {
            "type": "polyline",
            "points": [
                {"x": 0, "y": 0},
                {"x": 50, "y": 50},
                {"x": 100, "y": 0},
            ],
        }
        result = parse_path_data(data)
        assert result is not None
        assert result.type == PathType.POLYLINE
        assert len(result.points) == 3

    def test_parse_quadratic(self) -> None:
        data = {
            "type": "quadratic",
            "points": [
                {"x": 0, "y": 0},
                {"x": 50, "y": 100},
                {"x": 100, "y": 0},
            ],
        }
        result = parse_path_data(data)
        assert result is not None
        assert result.type == PathType.QUADRATIC
        assert len(result.points) == 3

    def test_parse_cubic(self) -> None:
        data = {
            "type": "cubic",
            "points": [
                {"x": 0, "y": 0},
                {"x": 33, "y": 100},
                {"x": 66, "y": 100},
                {"x": 100, "y": 0},
            ],
        }
        result = parse_path_data(data)
        assert result is not None
        assert result.type == PathType.CUBIC
        assert len(result.points) == 4

    def test_parse_invalid_type(self) -> None:
        data = {
            "type": "invalid",
            "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
        }
        result = parse_path_data(data)
        assert result is None

    def test_parse_missing_points(self) -> None:
        data = {"type": "line"}
        result = parse_path_data(data)
        assert result is None

    def test_parse_insufficient_points(self) -> None:
        data = {
            "type": "line",
            "points": [{"x": 0, "y": 0}],  # Line needs 2 points
        }
        result = parse_path_data(data)
        assert result is None

    def test_parse_invalid_point_format(self) -> None:
        data = {
            "type": "line",
            "points": [{"x": 0}, {"x": 100, "y": 100}],  # Missing y
        }
        result = parse_path_data(data)
        assert result is None


class TestHandleDrawPaths:
    """Tests for handle_draw_paths function."""

    @pytest.mark.asyncio
    async def test_draw_paths_success(self) -> None:
        collected_paths: list[Path] = []
        done_flag = False

        async def callback(paths: list[Path], done: bool) -> None:
            nonlocal done_flag
            collected_paths.extend(paths)
            done_flag = done

        set_draw_callback(callback)

        args = {
            "paths": [
                {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]},
                {
                    "type": "quadratic",
                    "points": [
                        {"x": 0, "y": 0},
                        {"x": 50, "y": 100},
                        {"x": 100, "y": 0},
                    ],
                },
            ],
            "done": False,
        }

        result = await handle_draw_paths(args)

        assert result["content"][0]["text"] == "Successfully drew 2 paths."
        assert "is_error" not in result
        assert len(collected_paths) == 2
        assert done_flag is False

    @pytest.mark.asyncio
    async def test_draw_paths_with_done(self) -> None:
        done_flag = False

        async def callback(_paths: list[Path], done: bool) -> None:
            nonlocal done_flag
            done_flag = done

        set_draw_callback(callback)

        args = {
            "paths": [{"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]}],
            "done": True,
        }

        result = await handle_draw_paths(args)

        assert "Piece marked as complete" in result["content"][0]["text"]
        assert done_flag is True

    @pytest.mark.asyncio
    async def test_draw_paths_invalid_input(self) -> None:
        set_draw_callback(None)

        args = {"paths": "not an array"}

        result = await handle_draw_paths(args)

        assert result["is_error"] is True
        assert "must be an array" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_draw_paths_partial_errors(self) -> None:
        collected_paths: list[Path] = []

        async def callback(paths: list[Path], _done: bool) -> None:
            collected_paths.extend(paths)

        set_draw_callback(callback)

        args = {
            "paths": [
                {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]},
                {"type": "invalid", "points": []},  # Invalid
            ],
        }

        result = await handle_draw_paths(args)

        # Should report error but still parse valid paths
        assert "1 errors" in result["content"][0]["text"]
        assert len(collected_paths) == 1


class TestHandleMarkPieceDone:
    """Tests for handle_mark_piece_done function."""

    @pytest.mark.asyncio
    async def test_mark_piece_done(self) -> None:
        done_flag = False

        async def callback(_paths: list[Path], done: bool) -> None:
            nonlocal done_flag
            done_flag = done

        set_draw_callback(callback)

        result = await handle_mark_piece_done()

        assert "Piece marked as complete" in result["content"][0]["text"]
        assert done_flag is True

    @pytest.mark.asyncio
    async def test_mark_piece_done_no_callback(self) -> None:
        set_draw_callback(None)

        result = await handle_mark_piece_done()

        assert "Piece marked as complete" in result["content"][0]["text"]
