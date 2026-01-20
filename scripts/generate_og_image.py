#!/usr/bin/env python3
"""
Generate Open Graph image for Code Monet social sharing.
Creates a 1200x630 PNG with logo and branding.

Note: Uses macOS system fonts. Falls back to default bitmap font on other platforms.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def generate_og_image(output_path: Path) -> None:
    """Generate the OG image with branding."""
    # OG image dimensions (optimal for social platforms)
    width, height = 1200, 630

    # Atelier color palette
    bg_color = "#f5f0e6"  # atelier-cream
    text_color = "#2c2416"  # text-primary
    accent_color = "#6b4423"  # atelier-umber

    # Create image with cream background
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Load the spiral logo
    logo_path = Path(__file__).parent.parent / "app" / "assets" / "icon.png"
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")

        # Make white pixels transparent (the logo has white background)
        data = logo.getdata()
        new_data = []
        for item in data:
            # If pixel is white-ish, make it transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)
        logo.putdata(new_data)  # type: ignore[arg-type]

        # Scale logo to fit nicely
        logo_size = 280
        logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Center logo horizontally, position in upper area
        logo_x = (width - logo_size) // 2
        logo_y = 100

        # Paste logo with transparency mask
        img.paste(logo, (logo_x, logo_y), logo)

    # Try to load nice fonts, fall back to default
    title_font: ImageFont.FreeTypeFont | ImageFont.ImageFont
    tagline_font: ImageFont.FreeTypeFont | ImageFont.ImageFont
    try:
        # Try system fonts (macOS)
        title_font = ImageFont.truetype("/System/Library/Fonts/NewYork.ttf", 72)
        tagline_font = ImageFont.truetype("/System/Library/Fonts/NewYork.ttf", 28)
    except OSError:
        try:
            title_font = ImageFont.truetype("/System/Library/Fonts/Georgia.ttf", 72)
            tagline_font = ImageFont.truetype("/System/Library/Fonts/Georgia.ttf", 28)
        except OSError:
            # Fall back to default font
            title_font = ImageFont.load_default()
            tagline_font = ImageFont.load_default()

    # Draw title "Code Monet"
    title = "Code Monet"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (width - title_width) // 2
    title_y = 410

    draw.text((title_x, title_y), title, fill=text_color, font=title_font)

    # Draw tagline
    tagline = "AI-Powered Generative Art"
    tagline_bbox = draw.textbbox((0, 0), tagline, font=tagline_font)
    tagline_width = tagline_bbox[2] - tagline_bbox[0]
    tagline_x = (width - tagline_width) // 2
    tagline_y = 510

    draw.text((tagline_x, tagline_y), tagline, fill=accent_color, font=tagline_font)

    # Add subtle decorative line
    line_y = 490
    line_width = 200
    line_x_start = (width - line_width) // 2
    draw.line(
        [(line_x_start, line_y), (line_x_start + line_width, line_y)],
        fill=accent_color,
        width=1,
    )

    # Save image
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "PNG", optimize=True)
    print(f"Generated OG image: {output_path}")


if __name__ == "__main__":
    output = Path(__file__).parent.parent / "web" / "public" / "og-image.png"
    generate_og_image(output)
