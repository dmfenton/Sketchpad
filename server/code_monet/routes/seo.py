"""SEO endpoints: sitemap and robots.txt."""

import json
from datetime import datetime
from pathlib import Path as FilePath
from typing import Any

import aiofiles
import aiofiles.os
from fastapi import APIRouter
from fastapi.responses import Response

from code_monet.config import settings
from code_monet.db import get_session, repository

router = APIRouter()


@router.get("/sitemap.xml")
async def get_sitemap() -> Response:
    """Generate sitemap.xml for SEO.

    Returns URLs for:
    - Homepage
    - Gallery index
    - All public gallery pieces
    """
    base_url = "https://monet.dmfenton.net"

    # Static pages
    urls: list[dict[str, Any]] = [
        {"loc": f"{base_url}/", "priority": "1.0", "changefreq": "daily"},
        {"loc": f"{base_url}/gallery", "priority": "0.8", "changefreq": "daily"},
    ]

    # Get public gallery pieces
    workspace_base = FilePath(settings.workspace_base_dir).resolve()
    if workspace_base.exists():
        async with get_session() as session:
            public_users = await repository.list_users_with_public_gallery(session)

        for user in public_users:
            gallery_dir = workspace_base / str(user.id) / "gallery"
            if not gallery_dir.exists():
                continue

            # Scan piece files directly (async I/O to avoid blocking)
            for entry_name in await aiofiles.os.listdir(gallery_dir):
                if not entry_name.startswith("piece_") or not entry_name.endswith(".json"):
                    continue
                try:
                    async with aiofiles.open(gallery_dir / entry_name) as f:
                        data = json.loads(await f.read())
                    piece_number = data.get("piece_number", 0)
                    piece_id = f"piece_{piece_number:06d}"
                    created_at = data.get("created_at", "")

                    url_entry: dict[str, Any] = {
                        "loc": f"{base_url}/gallery/{user.id}/{piece_id}",
                        "priority": "0.6",
                        "changefreq": "monthly",
                    }
                    # Add lastmod if we have created_at
                    if created_at:
                        try:
                            # Parse and format date
                            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                            url_entry["lastmod"] = dt.strftime("%Y-%m-%d")
                        except ValueError:
                            pass
                    urls.append(url_entry)
                except (json.JSONDecodeError, OSError):
                    pass

    # Build XML
    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml_parts.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for url in urls:
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{url['loc']}</loc>")
        if "lastmod" in url:
            xml_parts.append(f"    <lastmod>{url['lastmod']}</lastmod>")
        xml_parts.append(f"    <changefreq>{url['changefreq']}</changefreq>")
        xml_parts.append(f"    <priority>{url['priority']}</priority>")
        xml_parts.append("  </url>")

    xml_parts.append("</urlset>")
    xml_content = "\n".join(xml_parts)

    return Response(content=xml_content, media_type="application/xml")


@router.get("/robots.txt")
async def get_robots_txt() -> Response:
    """Serve robots.txt for search engine crawlers."""
    content = """# Code Monet - AI Artist
User-agent: *
Allow: /
Allow: /gallery/
Allow: /public/

# Sitemap location
Sitemap: https://monet.dmfenton.net/sitemap.xml

# Private routes
Disallow: /studio
Disallow: /auth/
Disallow: /api/
Disallow: /ws
Disallow: /debug/
"""
    return Response(content=content, media_type="text/plain")
