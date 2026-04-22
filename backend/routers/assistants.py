"""Router: CRUD operations for assistants."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from loguru import logger
from pydantic import BaseModel, Field

from backend.db import DbDep
from backend.auth import UserDep

router = APIRouter(prefix="/assistants", tags=["assistants"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class AssistantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    instructions: str = Field(min_length=1, description="System prompt for the assistant")


class AssistantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    instructions: str | None = Field(default=None, min_length=1)


class AssistantOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    instructions: str
    created_at: str
    updated_at: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[AssistantOut])
def list_assistants(db: DbDep, user: UserDep) -> list[dict]:
    """Return assistants ordered by creation date. Regular users see only their own."""
    query = db.table("assistants").select("*")
    if user.role != "admin":
        query = query.eq("user_id", str(user.id))
    
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post("/", response_model=AssistantOut, status_code=201)
def create_assistant(body: AssistantCreate, db: DbDep, user: UserDep) -> dict:
    """Create a new assistant associated with the current user."""
    logger.info("Creating assistant name={} for user_id={}", body.name, user.id)
    data = body.model_dump()
    data["user_id"] = str(user.id)
    
    result = db.table("assistants").insert(data).execute()
    assistant = result.data[0]
    logger.info("Assistant created id={}", assistant["id"])
    return assistant


@router.get("/{assistant_id}", response_model=AssistantOut)
def get_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> dict:
    """Return a single assistant by ID, ensuring ownership."""
    query = db.table("assistants").select("*").eq("id", str(assistant_id))
    if user.role != "admin":
        query = query.eq("user_id", str(user.id))
        
    result = query.maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")
    return result.data


@router.put("/{assistant_id}", response_model=AssistantOut)
def update_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    body: AssistantUpdate,
    db: DbDep,
    user: UserDep,
) -> dict:
    """Update an existing assistant, ensuring ownership."""
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No fields to update")

    query = db.table("assistants").update(changes).eq("id", str(assistant_id))
    if user.role != "admin":
        query = query.eq("user_id", str(user.id))

    result = query.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")
    logger.info("Assistant updated id={} fields={}", assistant_id, list(changes))
    return result.data[0]


@router.delete("/{assistant_id}", status_code=204)
def delete_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> None:
    """Delete an assistant and its associated data, ensuring ownership."""
    from backend.config import get_settings
    settings = get_settings()

    # Verify ownership before deleting
    query = db.table("assistants").select("id").eq("id", str(assistant_id))
    if user.role != "admin":
        query = query.eq("user_id", str(user.id))
    
    check = query.maybe_single().execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")

    # 1. Fetch all documents to delete their files from Storage
    docs = db.table("documents").select("storage_path").eq("assistant_id", str(assistant_id)).execute()
    storage_paths = [doc["storage_path"] for doc in docs.data if doc.get("storage_path")]

    if storage_paths:
        try:
            db.storage.from_(settings.supabase_bucket).remove(storage_paths)
            logger.info("Deleted {} files from storage for assistant_id={}", len(storage_paths), assistant_id)
        except Exception as exc:
            logger.warning("Could not delete files from storage error={}", exc)

    # 2. Explicitly delete related DB records
    db.table("chunks").delete().eq("assistant_id", str(assistant_id)).execute()
    db.table("documents").delete().eq("assistant_id", str(assistant_id)).execute()
    db.table("conversations").delete().eq("assistant_id", str(assistant_id)).execute()

    # 3. Delete the assistant record itself
    db.table("assistants").delete().eq("id", str(assistant_id)).execute()
    logger.info("Assistant deleted id={}", assistant_id)
