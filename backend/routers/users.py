from fastapi import APIRouter, HTTPException, Depends
from backend.auth import UserDep, AdminDep
from backend.db import DbDep
from pydantic import BaseModel

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
def list_users(db: DbDep, admin: AdminDep):
    """Admin only: list all registered user profiles."""
    result = db.table("profiles").select("*").execute()
    return result.data

class ProfileUpdate(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None

@router.get("/me")
def get_me(user: UserDep, db: DbDep):
    """Return the current user's identity and profile data."""
    try:
        profile = db.table("profiles").select("*").eq("id", str(user.id)).maybe_single().execute()
        profile_data = profile.data if hasattr(profile, "data") else profile
    except Exception:
        profile_data = None
        
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "profile": profile_data
    }

@router.put("/me")
def update_profile(body: ProfileUpdate, user: UserDep, db: DbDep):
    """Update the user's profile information (name, avatar, etc.)."""
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=422, detail="No changes provided")
    
    result = db.table("profiles").update(data).eq("id", str(user.id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    return result.data[0]
