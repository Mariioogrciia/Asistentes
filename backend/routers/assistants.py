"""Router: CRUD operations for assistants."""

import time
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Path
from loguru import logger
from pydantic import BaseModel, Field

from backend.db import DbDep
from backend.auth import UserDep

router = APIRouter(prefix="/assistants", tags=["assistants"])


def _execute_with_transient_retry(run_query, *, operation: str, max_retries: int = 2):
    """Retry short-lived transport errors from Supabase/PostgREST."""
    for attempt in range(max_retries + 1):
        try:
            return run_query()
        except httpx.HTTPError as exc:
            is_last = attempt >= max_retries
            if is_last:
                logger.error("Supabase request failed op={} error={}", operation, exc)
                raise HTTPException(
                    status_code=503,
                    detail="Servicio de base de datos temporalmente no disponible. Intenta de nuevo.",
                ) from exc

            backoff_seconds = 0.2 * (2**attempt)
            logger.warning(
                "Transient DB error op={} attempt={}/{} backoff_s={} error={}",
                operation,
                attempt + 1,
                max_retries + 1,
                backoff_seconds,
                exc,
            )
            time.sleep(backoff_seconds)


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
    user_id: uuid.UUID
    name: str
    description: str | None
    instructions: str
    created_at: str
    updated_at: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[AssistantOut])
def list_assistants(db: DbDep, user: UserDep, user_id: str | None = None) -> list[dict]:
    """Return assistants ordered by creation date.
    
    Default behavior: Users (including admins) see only their own assistants.
    Admin behavior: Can pass a specific 'user_id' to filter, or 'all' to see everything.
    """
    def run_query():
        query = db.table("assistants").select("*")

        if user.role == "admin":
            if user_id == "all":
                # Admin sees everything
                pass
            elif user_id:
                # Admin sees a specific user's assistants
                query = query.eq("user_id", user_id)
            else:
                # Admin sees their own by default
                query = query.eq("user_id", str(user.id))
        else:
            # Regular users always see only their own
            query = query.eq("user_id", str(user.id))

        return query.order("created_at", desc=True).execute()

    result = _execute_with_transient_retry(run_query, operation="list_assistants")
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
@router.post("/{assistant_id}/delete", status_code=204)
def delete_assistant(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> None:
    """Delete an assistant and its associated data, ensuring ownership or admin rights."""
    from backend.config import get_settings
    settings = get_settings()

    logger.info(">>> DELETE REQUEST RECEIVED for assistant_id={} from user_id={} (role={})", assistant_id, user.id, user.role)
    
    # 1. Verify existence and permissions
    # We use the db client (service_role) to check the real owner
    check = db.table("assistants").select("id, user_id").eq("id", str(assistant_id)).maybe_single().execute()
    
    if not check.data:
        logger.warning("Assistant {} not found in database", assistant_id)
        raise HTTPException(status_code=404, detail="Asistente no encontrado")

    # Access control: Owner OR Admin
    is_owner = check.data.get("user_id") == str(user.id)
    is_admin = user.role == "admin"

    if not is_owner and not is_admin:
        logger.warning("Access denied: User {} is neither owner nor admin for assistant {}", user.id, assistant_id)
        raise HTTPException(status_code=403, detail="No tienes permisos para borrar este asistente")

    try:
        # 2. Cleanup Storage
        docs = db.table("documents").select("storage_path").eq("assistant_id", str(assistant_id)).execute()
        storage_paths = [doc["storage_path"] for doc in docs.data if doc.get("storage_path")]

        if storage_paths:
            try:
                db.storage.from_(settings.supabase_bucket).remove(storage_paths)
                logger.info("Deleted {} files from storage", len(storage_paths))
            except Exception as e:
                logger.warning("Non-blocking storage error: {}", e)

        # 3. Cleanup Database records
        logger.info("Cleaning up database records for assistant_id={}", assistant_id)
        db.table("chunks").delete().eq("assistant_id", str(assistant_id)).execute()
        db.table("documents").delete().eq("assistant_id", str(assistant_id)).execute()
        db.table("conversations").delete().eq("assistant_id", str(assistant_id)).execute()
        
        # 4. Final delete
        db.table("assistants").delete().eq("id", str(assistant_id)).execute()
        logger.info("Assistant {} successfully deleted", assistant_id)
        
    except Exception as exc:
        logger.error("Failed to delete assistant {}: {}", assistant_id, exc)
        raise HTTPException(status_code=500, detail=f"Error interno: {str(exc)}")
