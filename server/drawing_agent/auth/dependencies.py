"""FastAPI dependencies for authentication."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from drawing_agent.auth.jwt import TokenError, get_user_id_from_token
from drawing_agent.db import User, get_session, repository

# HTTP Bearer token security scheme
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> User:
    """Get the current authenticated user from Bearer token.

    Raises:
        HTTPException: 401 if token is invalid or user not found
    """
    try:
        user_id = get_user_id_from_token(credentials.credentials, expected_type="access")
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_security)],
) -> User | None:
    """Get the current user if authenticated, otherwise None.

    Useful for endpoints that work with or without authentication.
    """
    if credentials is None:
        return None

    try:
        user_id = get_user_id_from_token(credentials.credentials, expected_type="access")
    except TokenError:
        return None

    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)

    if user is None or not user.is_active:
        return None

    return user


# Type aliases for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
