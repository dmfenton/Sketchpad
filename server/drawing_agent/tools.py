"""MCP tools for the drawing agent."""

from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

from drawing_agent.types import Path, PathType, Point


def parse_path_data(path_data: dict[str, Any]) -> Path | None:
    """Parse a path dictionary into a Path object."""
    try:
        path_type_str = path_data.get("type", "")
        points_data = path_data.get("points", [])

        # Validate path type
        try:
            path_type = PathType(path_type_str)
        except ValueError:
            return None

        # Parse points
        points = []
        for pt in points_data:
            if isinstance(pt, dict) and "x" in pt and "y" in pt:
                points.append(Point(x=float(pt["x"]), y=float(pt["y"])))
            else:
                return None

        # Validate point count for path type
        min_points = {
            PathType.LINE: 2,
            PathType.QUADRATIC: 3,
            PathType.CUBIC: 4,
            PathType.POLYLINE: 2,
        }
        if len(points) < min_points.get(path_type, 2):
            return None

        return Path(type=path_type, points=points)
    except (TypeError, ValueError):
        return None


# Global callback - will be set by the agent
_draw_callback: Any = None


def set_draw_callback(callback: Any) -> None:
    """Set the callback function for drawing paths."""
    global _draw_callback
    _draw_callback = callback


async def handle_draw_paths(args: dict[str, Any]) -> dict[str, Any]:
    """Handle draw_paths tool call (testable without decorator).

    Args:
        args: Dictionary with 'paths' (array of path objects) and optional 'done' (bool)

    Returns:
        Tool result with success/error status
    """
    paths_data = args.get("paths", [])
    done = args.get("done", False)

    if not isinstance(paths_data, list):
        return {
            "content": [{"type": "text", "text": "Error: paths must be an array"}],
            "is_error": True,
        }

    # Parse paths
    parsed_paths: list[Path] = []
    errors: list[str] = []

    for i, path_data in enumerate(paths_data):
        if not isinstance(path_data, dict):
            errors.append(f"Path {i}: must be an object")
            continue

        path = parse_path_data(path_data)
        if path is None:
            errors.append(f"Path {i}: invalid format (need type and points)")
        else:
            parsed_paths.append(path)

    # Call the draw callback with valid paths (even if there were some errors)
    if parsed_paths and _draw_callback is not None:
        await _draw_callback(parsed_paths, done)

    # Report errors if any
    if errors:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Parsed {len(parsed_paths)} paths with {len(errors)} errors:\n"
                    + "\n".join(errors),
                }
            ],
            "is_error": len(parsed_paths) == 0,
        }

    return {
        "content": [
            {
                "type": "text",
                "text": f"Successfully drew {len(parsed_paths)} paths."
                + (" Piece marked as complete." if done else ""),
            }
        ],
    }


async def handle_mark_piece_done() -> dict[str, Any]:
    """Handle mark_piece_done tool call (testable without decorator).

    Returns:
        Tool result confirming the piece is done
    """
    if _draw_callback is not None:
        await _draw_callback([], True)

    return {
        "content": [{"type": "text", "text": "Piece marked as complete."}],
    }


@tool(
    "draw_paths",
    "Draw paths on the canvas. Each path has a type (line, polyline, quadratic, cubic) and an array of point objects with x and y coordinates.",
    {
        "type": "object",
        "properties": {
            "paths": {
                "type": "array",
                "description": "Array of path objects to draw",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["line", "polyline", "quadratic", "cubic"],
                            "description": "Path type: line (2 pts), polyline (N pts), quadratic (3 pts), cubic (4 pts)",
                        },
                        "points": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                                "required": ["x", "y"],
                            },
                        },
                    },
                    "required": ["type", "points"],
                },
            },
            "done": {
                "type": "boolean",
                "description": "Set to true when the piece is complete",
                "default": False,
            },
        },
        "required": ["paths"],
    },
)
async def draw_paths(args: dict[str, Any]) -> dict[str, Any]:
    """Draw paths on the canvas."""
    return await handle_draw_paths(args)


@tool(
    "mark_piece_done",
    "Signal that the current piece is complete. Call this when you're satisfied with the drawing.",
    {"type": "object", "properties": {}, "required": []},
)
async def mark_piece_done(_args: dict[str, Any]) -> dict[str, Any]:
    """Mark the current piece as complete."""
    return await handle_mark_piece_done()


def create_drawing_server() -> Any:
    """Create the MCP server with drawing tools."""
    return create_sdk_mcp_server(
        name="drawing",
        version="1.0.0",
        tools=[draw_paths, mark_piece_done],
    )
