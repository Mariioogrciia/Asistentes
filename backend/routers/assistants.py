"""Router: CRUD operations for assistants."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from loguru import logger
from pydantic import BaseModel, Field

from backend.db import DbDep

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
def list_assistants(db: DbDep) -> list[dict]:
    """Return all assistants ordered by creation date (newest first)."""
    result = db.table("assistants").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("/", response_model=AssistantOut, status_code=201)
def create_assistant(body: AssistantCreate, db: DbDep) -> dict:
    """Create a new assistant."""
    logger.info("Creating assistant name={}", body.name)
    result = db.table("assistants").insert(body.model_dump()).execute()
    assistant = result.data[0]
    logger.info("Assistant created id={}", assistant["id"])
    return assistant


@router.get("/{assistant_id}", response_model=AssistantOut)
def get_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
) -> dict:
    """Return a single assistant by ID."""
    result = (
        db.table("assistants")
        .select("*")
        .eq("id", str(assistant_id))
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return result.data


@router.put("/{assistant_id}", response_model=AssistantOut)
def update_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    body: AssistantUpdate,
    db: DbDep,
) -> dict:
    """Update name, description or instructions of an existing assistant."""
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No fields to update")

    result = (
        db.table("assistants")
        .update(changes)
        .eq("id", str(assistant_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Assistant not found")
    logger.info("Assistant updated id={} fields={}", assistant_id, list(changes))
    return result.data[0]


@router.delete("/{assistant_id}", status_code=204)
def delete_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
) -> None:
    """Delete an assistant and all its documents, chunks, and conversations (cascade)."""
    result = db.table("assistants").delete().eq("id", str(assistant_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assistant not found")
    logger.info("Assistant deleted id={}", assistant_id)
