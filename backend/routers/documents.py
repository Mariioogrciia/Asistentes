"""Router: document upload, listing, and deletion."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, UploadFile
from loguru import logger
from pydantic import BaseModel

from backend.ai import AiDep
from backend.db import DbDep
from backend.services.ingestion import SUPPORTED_TYPES, ingest_document

router = APIRouter(prefix="/assistants", tags=["documents"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: uuid.UUID
    assistant_id: uuid.UUID
    filename: str
    file_type: str
    storage_path: str
    size_bytes: int | None
    chunk_count: int
    status: str
    created_at: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/{assistant_id}/documents/", response_model=list[DocumentOut])
def list_documents(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
) -> list[dict]:
    """List all documents for a given assistant."""
    result = (
        db.table("documents")
        .select("*")
        .eq("assistant_id", str(assistant_id))
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/{assistant_id}/documents/", response_model=DocumentOut, status_code=201)
def upload_document(
    assistant_id: Annotated[uuid.UUID, Path()],
    file: UploadFile,
    db: DbDep,
    ai: AiDep,
) -> dict:
    """Upload a document and run the full ingestion pipeline synchronously.

    Supported types: PDF, DOCX, PPTX, TXT, MD.
    The document status starts as 'processing' and changes to 'ready' or 'error'.
    """
    # Validate content type
    content_type = file.content_type or ""
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()

    if content_type not in SUPPORTED_TYPES and ext not in SUPPORTED_TYPES.values():
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{content_type}'. Supported: PDF, DOCX, PPTX, TXT, MD.",
        )

    # Check that the assistant exists and get its name
    assistant = db.table("assistants").select("id, name").eq("id", str(assistant_id)).maybe_single().execute()
    if not assistant.data:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    assistant_name = assistant.data["name"]

    content = file.file.read()
    logger.info(
        "Document upload started assistant_id={} filename={} size={}B",
        assistant_id,
        file.filename,
        len(content),
    )

    try:
        doc = ingest_document(
            content=content,
            filename=file.filename or "document",
            content_type=content_type,
            assistant_id=assistant_id,
            assistant_name=assistant_name,
            db=db,
            ai_client=ai,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Document ingestion failed: {}", exc)
        raise HTTPException(status_code=500, detail="Ingestion failed. Check server logs.") from exc

    return doc


@router.delete("/{assistant_id}/documents/{document_id}", status_code=204)
def delete_document(
    assistant_id: Annotated[uuid.UUID, Path()],
    document_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
) -> None:
    """Delete a document, its chunks (cascade), and its file in Storage."""
    from backend.config import get_settings
    settings = get_settings()

    # Fetch document to get storage_path
    result = (
        db.table("documents")
        .select("storage_path")
        .eq("id", str(document_id))
        .eq("assistant_id", str(assistant_id))
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path: str = result.data["storage_path"]

    # Delete from Storage (best-effort)
    try:
        db.storage.from_(settings.supabase_bucket).remove([storage_path])
        logger.info("Deleted storage file path={}", storage_path)
    except Exception as exc:
        logger.warning("Could not delete storage file path={} error={}", storage_path, exc)

    # 1. Delete chunks first (explicitly, in case CASCADE is not set)
    db.table("chunks").delete().eq("document_id", str(document_id)).execute()

    # 2. Delete DB record
    db.table("documents").delete().eq("id", str(document_id)).eq("assistant_id", str(assistant_id)).execute()
    
    logger.info("Document deleted doc_id={}", document_id)
