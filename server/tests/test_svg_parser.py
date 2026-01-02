"""Tests for SVG parsing module."""

import json

from drawing_agent.svg_parser import (
    extract_paths_from_output,
    parse_json_paths,
    parse_svg_path_d,
    parse_svg_string,
)
from drawing_agent.types import PathType


class TestParseSvgPathD:
    """Tests for parse_svg_path_d function."""

    def test_parse_line(self) -> None:
        d = "M 0 0 L 100 100"
        paths = parse_svg_path_d(d)
        assert len(paths) == 1
        assert paths[0].type == PathType.LINE
        assert len(paths[0].points) == 2
        assert paths[0].points[0].x == 0
        assert paths[0].points[0].y == 0
        assert paths[0].points[1].x == 100
        assert paths[0].points[1].y == 100

    def test_parse_quadratic_bezier(self) -> None:
        d = "M 0 0 Q 50 100 100 0"
        paths = parse_svg_path_d(d)
        assert len(paths) == 1
        assert paths[0].type == PathType.QUADRATIC
        assert len(paths[0].points) == 3

    def test_parse_cubic_bezier(self) -> None:
        d = "M 0 0 C 33 100 66 100 100 0"
        paths = parse_svg_path_d(d)
        assert len(paths) == 1
        assert paths[0].type == PathType.CUBIC
        assert len(paths[0].points) == 4

    def test_parse_multiple_segments(self) -> None:
        d = "M 0 0 L 50 50 L 100 0"
        paths = parse_svg_path_d(d)
        # Two line segments
        assert len(paths) == 2
        assert all(p.type == PathType.LINE for p in paths)

    def test_parse_empty_string(self) -> None:
        paths = parse_svg_path_d("")
        assert paths == []

    def test_parse_whitespace_only(self) -> None:
        paths = parse_svg_path_d("   ")
        assert paths == []

    def test_parse_invalid_path(self) -> None:
        paths = parse_svg_path_d("not a valid path")
        assert paths == []


class TestParseSvgString:
    """Tests for parse_svg_string function."""

    def test_parse_simple_svg(self) -> None:
        svg = """<svg width="100" height="100">
            <path d="M 0 0 L 100 100"/>
        </svg>"""
        paths = parse_svg_string(svg)
        assert len(paths) == 1
        assert paths[0].type == PathType.LINE

    def test_parse_svg_with_namespace(self) -> None:
        svg = """<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <path d="M 0 0 L 100 100"/>
        </svg>"""
        paths = parse_svg_string(svg)
        assert len(paths) == 1

    def test_parse_svg_multiple_paths(self) -> None:
        svg = """<svg width="100" height="100">
            <path d="M 0 0 L 50 50"/>
            <path d="M 50 50 L 100 100"/>
        </svg>"""
        paths = parse_svg_string(svg)
        assert len(paths) == 2

    def test_parse_empty_svg(self) -> None:
        svg = """<svg width="100" height="100"></svg>"""
        paths = parse_svg_string(svg)
        assert paths == []

    def test_parse_empty_string(self) -> None:
        paths = parse_svg_string("")
        assert paths == []

    def test_parse_invalid_xml(self) -> None:
        paths = parse_svg_string("<svg><not closed")
        assert paths == []


class TestParseJsonPaths:
    """Tests for parse_json_paths function."""

    def test_parse_line(self) -> None:
        json_str = json.dumps([
            {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]}
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 1
        assert paths[0].type == PathType.LINE
        assert len(paths[0].points) == 2

    def test_parse_polyline(self) -> None:
        json_str = json.dumps([
            {"type": "polyline", "points": [
                {"x": 0, "y": 0},
                {"x": 50, "y": 50},
                {"x": 100, "y": 0}
            ]}
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 1
        assert paths[0].type == PathType.POLYLINE
        assert len(paths[0].points) == 3

    def test_parse_quadratic(self) -> None:
        json_str = json.dumps([
            {"type": "quadratic", "points": [
                {"x": 0, "y": 0},
                {"x": 50, "y": 100},
                {"x": 100, "y": 0}
            ]}
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 1
        assert paths[0].type == PathType.QUADRATIC

    def test_parse_cubic(self) -> None:
        json_str = json.dumps([
            {"type": "cubic", "points": [
                {"x": 0, "y": 0},
                {"x": 33, "y": 100},
                {"x": 66, "y": 100},
                {"x": 100, "y": 0}
            ]}
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 1
        assert paths[0].type == PathType.CUBIC

    def test_parse_multiple_paths(self) -> None:
        json_str = json.dumps([
            {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 50, "y": 50}]},
            {"type": "line", "points": [{"x": 50, "y": 50}, {"x": 100, "y": 100}]},
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 2

    def test_parse_empty_array(self) -> None:
        paths = parse_json_paths("[]")
        assert paths == []

    def test_parse_empty_string(self) -> None:
        paths = parse_json_paths("")
        assert paths == []

    def test_parse_invalid_json(self) -> None:
        paths = parse_json_paths("not json")
        assert paths == []

    def test_parse_invalid_type(self) -> None:
        json_str = json.dumps([
            {"type": "invalid_type", "points": [{"x": 0, "y": 0}]}
        ])
        paths = parse_json_paths(json_str)
        assert paths == []

    def test_skip_malformed_points(self) -> None:
        # Points missing x or y should be skipped
        json_str = json.dumps([
            {"type": "polyline", "points": [
                {"x": 0, "y": 0},
                {"x": 50},  # Missing y
                {"y": 100},  # Missing x
                {"x": 100, "y": 100}
            ]}
        ])
        paths = parse_json_paths(json_str)
        assert len(paths) == 1
        # Only 2 valid points
        assert len(paths[0].points) == 2

    def test_skip_empty_points(self) -> None:
        json_str = json.dumps([
            {"type": "line", "points": []}
        ])
        paths = parse_json_paths(json_str)
        assert paths == []


class TestExtractPathsFromOutput:
    """Tests for extract_paths_from_output function."""

    def test_extract_clean_json(self) -> None:
        output = json.dumps([
            {"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]}
        ])
        paths = extract_paths_from_output(output)
        assert len(paths) == 1

    def test_extract_json_with_whitespace(self) -> None:
        # Agent output often has leading/trailing whitespace
        output = """
        [{"type": "line", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}]}]
        """
        paths = extract_paths_from_output(output)
        assert len(paths) == 1

    def test_extract_empty_output(self) -> None:
        paths = extract_paths_from_output("")
        assert paths == []

    def test_extract_no_json(self) -> None:
        output = "Just some plain text output"
        paths = extract_paths_from_output(output)
        assert paths == []

    def test_extract_with_newlines(self) -> None:
        output = """[
            {
                "type": "line",
                "points": [
                    {"x": 0, "y": 0},
                    {"x": 100, "y": 100}
                ]
            }
        ]"""
        paths = extract_paths_from_output(output)
        assert len(paths) == 1
