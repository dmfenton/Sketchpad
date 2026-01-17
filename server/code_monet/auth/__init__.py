"""Authentication module for Drawing Agent."""

from code_monet.auth.dependencies import get_current_user, get_optional_user
from code_monet.auth.jwt import create_access_token, create_refresh_token, decode_token
from code_monet.auth.password import hash_password, verify_password
from code_monet.auth.routes import router as auth_router

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
