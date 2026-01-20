"""Development authentication endpoints."""

from fastapi import APIRouter, HTTPException

from code_monet.config import settings
from code_monet.db import get_session, repository

router = APIRouter()


@router.get("/auth/dev-token")
async def get_dev_token() -> dict[str, str]:
    """Generate a dev token for testing (dev mode only)."""
    if not settings.dev_mode:
        raise HTTPException(status_code=403, detail="Dev tokens only available in dev mode")

    from code_monet.auth.jwt import create_access_token

    # Get or create a dev user
    async with get_session() as session:
        dev_email = "dev@local.test"
        dev_user = await repository.get_user_by_email(session, dev_email)
        if not dev_user:
            from code_monet.auth.password import hash_password

            dev_user = await repository.create_user(
                session, dev_email, hash_password("devpassword")
            )

    token = create_access_token(dev_user.id, dev_user.email)
    return {"access_token": token, "user_id": str(dev_user.id)}
