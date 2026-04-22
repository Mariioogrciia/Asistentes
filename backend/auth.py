from typing import Annotated
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from loguru import logger

from backend.config import get_settings
from backend.db import DbDep

security = HTTPBearer()

class User(BaseModel):
    id: uuid.UUID
    email: str | None = None
    role: str = "user"

async def get_current_user(
    token: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: DbDep
) -> User:
    """Validate the Supabase JWT by asking the Supabase Auth API directly."""
    try:
        # Ask Supabase Auth API to verify the token and return user data
        res = db.auth.get_user(token.credentials)
        if not res.user:
            raise HTTPException(status_code=401, detail="Sesion invalida")
            
        user_id = res.user.id
        email = res.user.email
    except Exception as exc:
        logger.error("Remote auth verification failed: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Error de autenticacion: {str(exc)}",
        )
    
    # Fetch additional profile info (like roles) from the public.profiles table
    try:
        profile = db.table("profiles").select("role").eq("id", user_id).maybe_single().execute()
        role = "user"
        
        # Log the response to debug
        logger.info(f"Checking role for user {user_id}: {profile}")
        
        if hasattr(profile, "data") and profile.data:
            role = profile.data.get("role", "user")
        elif isinstance(profile, dict) and profile:
            role = profile.get("role", "user")
            
        logger.info(f"Assigned role: {role}")
    except Exception as exc:
        logger.error(f"Failed to fetch user profile id={user_id}: {exc}")
        role = "user" 

    return User(id=uuid.UUID(user_id), email=email, role=role)

UserDep = Annotated[User, Depends(get_current_user)]

async def get_admin_user(user: UserDep) -> User:
    """Dependency to enforce admin-only access."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user

AdminDep = Annotated[User, Depends(get_admin_user)]
