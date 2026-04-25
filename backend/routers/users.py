import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, EmailStr, Field

from backend.auth import UserDep, AdminDep
from backend.db import DbDep

router = APIRouter(prefix="/users", tags=["users"])


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: Literal["user", "admin"] = "user"
    full_name: str | None = None
    avatar_url: str | None = None
    updated_at: str | None = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)
    role: Literal["user", "admin"] = "user"

@router.get("/")
def list_users(db: DbDep, admin: AdminDep) -> list[dict]:
    """Admin only: list all registered user profiles."""
    result = db.table("profiles").select("*").order("updated_at", desc=True).execute()
    return result.data or []


@router.post("/", response_model=ProfileOut, status_code=201)
def create_user(body: AdminUserCreate, db: DbDep, admin: AdminDep) -> dict:
    """Admin only: create an Auth user and matching profile row."""
    try:
        auth_result = db.auth.admin.create_user(
            {
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo crear el usuario: {exc}") from exc

    if not auth_result or not auth_result.user:
        raise HTTPException(status_code=500, detail="No se pudo crear el usuario en auth")

    user_id = str(auth_result.user.id)
    profile_payload = {
        "id": user_id,
        "email": str(body.email),
        "full_name": body.full_name,
        "role": body.role,
    }
    try:
        db.table("profiles").upsert(profile_payload).execute()
        created_profile = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    except Exception as exc:
        # Roll back auth user if profile creation fails.
        try:
            db.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Usuario auth creado pero perfil fallo: {exc}") from exc

    if not created_profile.data:
        raise HTTPException(status_code=500, detail="No se pudo recuperar el perfil creado")
    return created_profile.data


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: uuid.UUID,
    db: DbDep,
    admin: AdminDep,
) -> None:
    """Admin only: delete a user and related records."""
    if str(admin.id) == str(user_id):
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario admin")

    # Remove user-owned assistants and related records.
    assts = db.table("assistants").select("id").eq("user_id", str(user_id)).execute()
    assistant_ids = [row["id"] for row in (assts.data or []) if row.get("id")]

    if assistant_ids:
        docs = db.table("documents").select("id").in_("assistant_id", assistant_ids).execute()
        document_ids = [row["id"] for row in (docs.data or []) if row.get("id")]

        if document_ids:
            db.table("chunks").delete().in_("document_id", document_ids).execute()
            db.table("documents").delete().in_("id", document_ids).execute()

        db.table("conversations").delete().in_("assistant_id", assistant_ids).execute()
        db.table("assistants").delete().in_("id", assistant_ids).execute()

    # Best-effort cleanup for user rows.
    db.table("profiles").delete().eq("id", str(user_id)).execute()

    try:
        db.auth.admin.delete_user(str(user_id))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo borrar usuario auth: {exc}") from exc

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
