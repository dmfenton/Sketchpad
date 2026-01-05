#!/usr/bin/env python3
"""Generate app icon with artistic brush stroke design."""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def generate_spiral_points(size: int) -> list[tuple[float, float, float]]:
    """Generate points for a spiral brush stroke with width info."""
    cx, cy = size // 2, size // 2
    points = []

    for i in range(300):
        t = i / 300.0
        angle = t * 2.5 * math.pi + math.pi * 0.3

        # Spiral radius progression
        base_radius = size * 0.08
        max_radius = size * 0.34

        if t < 0.75:
            radius = base_radius + (max_radius - base_radius) * (t / 0.75) ** 0.85
        else:
            # Slight contraction at end
            radius = max_radius - (max_radius * 0.12) * ((t - 0.75) / 0.25) ** 1.2

        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)

        # Width: thick at start, tapers to thin
        width = size * 0.075 * (1 - t * 0.75) ** 0.6
        width = max(width, size * 0.012)

        points.append((x, y, width))

    return points


def draw_smooth_stroke(draw: ImageDraw.Draw, points: list[tuple[float, float, float]], color: str) -> None:
    """Draw a smooth brush stroke using filled ellipses along the path."""
    for i, (x, y, w) in enumerate(points):
        # Draw filled circle at each point
        r = w / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def draw_stroke_polygon(draw: ImageDraw.Draw, points: list[tuple[float, float, float]], color: str) -> None:
    """Draw brush stroke as a filled polygon for smooth edges."""
    if len(points) < 2:
        return

    # Build polygon outline by going forward on one side, backward on other
    left_edge = []
    right_edge = []

    for i, (x, y, w) in enumerate(points):
        # Calculate perpendicular direction
        if i == 0:
            dx = points[1][0] - x
            dy = points[1][1] - y
        elif i == len(points) - 1:
            dx = x - points[i - 1][0]
            dy = y - points[i - 1][1]
        else:
            dx = points[i + 1][0] - points[i - 1][0]
            dy = points[i + 1][1] - points[i - 1][1]

        # Normalize and get perpendicular
        length = math.sqrt(dx * dx + dy * dy)
        if length > 0:
            px, py = -dy / length, dx / length
        else:
            px, py = 0, 1

        r = w / 2
        left_edge.append((x + px * r, y + py * r))
        right_edge.append((x - px * r, y - py * r))

    # Create polygon: left edge forward, right edge backward
    polygon = left_edge + right_edge[::-1]
    draw.polygon(polygon, fill=color)

    # Add rounded caps
    if points:
        # Start cap
        x, y, w = points[0]
        r = w / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
        # End cap
        x, y, w = points[-1]
        r = w / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def create_icon(size: int, output_path: Path) -> None:
    """Create icon at specified size."""
    # Create at 2x for antialiasing, then downscale
    render_size = size * 2

    img = Image.new("RGBA", (render_size, render_size), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    # Generate and draw the brush stroke
    points = generate_spiral_points(render_size)
    draw_stroke_polygon(draw, points, "#1a1a1a")

    # Add flourish dot at center/start
    if points:
        x, y, w = points[0]
        dot_r = render_size * 0.035
        draw.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], fill="#1a1a1a")

    # Downscale with high-quality resampling for antialiasing
    img = img.resize((size, size), Image.Resampling.LANCZOS)

    img.save(output_path, "PNG")
    print(f"Created {output_path} ({size}x{size})")


def main() -> None:
    assets_dir = Path(__file__).parent.parent / "app" / "assets"

    # Create main icon (1024x1024 for iOS)
    create_icon(1024, assets_dir / "icon.png")

    # Create adaptive icon for Android
    create_icon(1024, assets_dir / "adaptive-icon.png")

    # Create splash icon
    create_icon(512, assets_dir / "splash-icon.png")

    # Create favicon
    create_icon(48, assets_dir / "favicon.png")

    print("\nAll icons generated!")


if __name__ == "__main__":
    main()
