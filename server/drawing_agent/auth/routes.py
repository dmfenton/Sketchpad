"""Authentication API routes."""

import logging

from fastapi import APIRouter, HTTPException, status

from drawing_agent.auth.dependencies import CurrentUser
from drawing_agent.auth.jwt import (
    TokenError,
    create_access_token,
    create_refresh_token,
    get_user_id_from_token,
)
from drawing_agent.auth.password import hash_password, verify_password
from drawing_agent.auth.schemas import (
    MessageResponse,
    RefreshRequest,
    SigninRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)
from drawing_agent.db import get_session, repository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest) -> TokenResponse:
    """Create a new user account with an invite code.

    Requires a valid, unused invite code.
    Returns JWT tokens on success.
    """
    async with get_session() as session:
        # Check if email already exists
        existing = await repository.get_user_by_email(session, request.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        # Validate invite code exists and is unused
        invite = await repository.get_invite_code(session, request.invite_code)
        if invite is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invite code",
            )
        if invite.used_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite code already used",
            )

        # Create user
        password_hash = hash_password(request.password)
        user = await repository.create_user(session, request.email, password_hash)

        # Mark invite as used
        await repository.use_invite_code(session, request.invite_code, user.id)

        # Create workspace for user
        await repository.create_workspace(session, user.id)

        logger.info(f"User signed up: {user.email} (id={user.id})")

    # Generate tokens
    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/signin", response_model=TokenResponse)
async def signin(request: SigninRequest) -> TokenResponse:
    """Sign in with email and password.

    Returns JWT tokens on success.
    """
    async with get_session() as session:
        user = await repository.get_user_by_email(session, request.email)

    # Always verify password to prevent timing attacks
    # Use a dummy hash if user doesn't exist to equalize timing
    dummy_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.a8HkA6K1qRQDSu"
    password_hash = user.password_hash if user else dummy_hash
    password_valid = verify_password(request.password, password_hash)

    if user is None or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    logger.info(f"User signed in: {user.email} (id={user.id})")

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshRequest) -> TokenResponse:
    """Refresh access token using a refresh token.

    Returns new JWT tokens on success.
    """
    try:
        user_id = get_user_id_from_token(request.refresh_token, expected_type="refresh")
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        ) from e

    async with get_session() as session:
        user = await repository.get_user_by_id(session, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUser) -> UserResponse:
    """Get current user info."""
    return UserResponse(id=user.id, email=user.email, is_active=user.is_active)


@router.post("/logout", response_model=MessageResponse)
async def logout(user: CurrentUser) -> MessageResponse:
    """Log out current user.

    Note: With JWT, logout is handled client-side by discarding tokens.
    This endpoint exists for API consistency and future token blacklisting.
    """
    logger.info(f"User logged out: {user.email} (id={user.id})")
    return MessageResponse(message="Logged out successfully")
