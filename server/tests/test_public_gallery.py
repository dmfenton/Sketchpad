"""Tests for the public gallery API endpoints."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class TestPublicGalleryStrokes:
    """Tests for GET /public/gallery/{user_id}/{piece_id}/strokes endpoint."""

    @pytest.fixture
    def temp_workspace(self):
        """Create a temporary workspace directory with test data."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create user gallery structure
            user_dir = Path(tmpdir) / "1" / "gallery"
            user_dir.mkdir(parents=True)

            # Create a test piece
            piece_data = {
                "strokes": [{"type": "line", "points": [[0, 0], [100, 100]]}],
                "piece_number": 1,
                "created_at": "2026-01-01T00:00:00Z",
            }
            (user_dir / "piece_0001.json").write_text(json.dumps(piece_data))

            yield tmpdir

    @pytest.fixture
    def client(self, temp_workspace):
        """Create test client with mocked workspace."""
        with patch("drawing_agent.main.settings") as mock_settings:
            mock_settings.workspace_base_dir = temp_workspace
            from drawing_agent.main import app

            yield TestClient(app)

    def test_valid_request_returns_strokes(self, client):
        """Test valid user_id and piece_id returns stroke data."""
        response = client.get("/public/gallery/1/piece_0001/strokes")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "piece_0001"
        assert len(data["strokes"]) == 1
        assert data["piece_number"] == 1

    def test_invalid_user_id_non_numeric(self, client):
        """Test non-numeric user_id is rejected."""
        response = client.get("/public/gallery/abc/piece_0001/strokes")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid user_id"

    def test_invalid_user_id_path_traversal_dots(self, client):
        """Test path traversal with .. in user_id is rejected."""
        response = client.get("/public/gallery/../etc/piece_0001/strokes")

        # Either 400 (validation) or 404 (route not found) blocks the attack
        assert response.status_code in (400, 404)

    def test_invalid_user_id_path_traversal_encoded(self, client):
        """Test path traversal with encoded dots is rejected."""
        # %2e%2e is URL-encoded ..
        response = client.get("/public/gallery/%2e%2e/piece_0001/strokes")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid user_id"

    def test_invalid_piece_id_path_traversal(self, client):
        """Test path traversal in piece_id is rejected."""
        response = client.get("/public/gallery/1/../../../etc/passwd/strokes")

        # Either 400 (validation) or 404 (route not found) blocks the attack
        assert response.status_code in (400, 404)

    def test_invalid_piece_id_special_chars(self, client):
        """Test piece_id with special characters is rejected."""
        response = client.get("/public/gallery/1/piece..0001/strokes")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid piece_id"

    def test_invalid_piece_id_slash(self, client):
        """Test piece_id with slash is rejected."""
        response = client.get("/public/gallery/1/piece/0001/strokes")

        # FastAPI will treat this as a different route, resulting in 404
        assert response.status_code == 404

    def test_valid_piece_id_with_underscore(self, client):
        """Test piece_id with underscore is allowed."""
        response = client.get("/public/gallery/1/piece_0001/strokes")

        assert response.status_code == 200

    def test_valid_piece_id_with_hyphen(self, client, temp_workspace):
        """Test piece_id with hyphen is allowed."""
        # Create a piece with hyphen in name
        user_dir = Path(temp_workspace) / "1" / "gallery"
        piece_data = {"strokes": [], "piece_number": 2}
        (user_dir / "piece-0002.json").write_text(json.dumps(piece_data))

        response = client.get("/public/gallery/1/piece-0002/strokes")

        assert response.status_code == 200

    def test_nonexistent_user_returns_404(self, client):
        """Test request for nonexistent user returns 404."""
        response = client.get("/public/gallery/999/piece_0001/strokes")

        assert response.status_code == 404
        assert response.json()["detail"] == "Gallery not found"

    def test_nonexistent_piece_returns_404(self, client):
        """Test request for nonexistent piece returns 404."""
        response = client.get("/public/gallery/1/nonexistent/strokes")

        assert response.status_code == 404
        assert response.json()["detail"] == "Piece not found"

    def test_user_id_with_leading_zeros(self, client):
        """Test user_id with leading zeros is valid (numeric)."""
        response = client.get("/public/gallery/001/piece_0001/strokes")

        # Valid numeric user_id, but user doesn't exist
        assert response.status_code == 404
        assert response.json()["detail"] == "Gallery not found"

    def test_empty_user_id_rejected(self, client):
        """Test empty user_id is handled by FastAPI routing."""
        response = client.get("/public/gallery//piece_0001/strokes")

        # FastAPI treats this as a different route
        assert response.status_code in (404, 307)  # Not found or redirect

    def test_negative_user_id_rejected(self, client):
        """Test negative user_id (with dash) is rejected."""
        response = client.get("/public/gallery/-1/piece_0001/strokes")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid user_id"
