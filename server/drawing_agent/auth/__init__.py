"""Authentication module for Drawing Agent."""

from drawing_agent.auth.dependencies import get_current_user, get_optional_user
from drawing_agent.auth.jwt import create_access_token, create_refresh_token, decode_token
from drawing_agent.auth.password import hash_password, verify_password
from drawing_agent.auth.routes import router as auth_router

__all__ = [
    "auth_router",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "get_current_user",
    "get_optional_user",
    "hash_password",
    "verify_password",
]
