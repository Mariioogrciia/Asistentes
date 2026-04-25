"""Router: conversations and messages with SSE streaming."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from backend.ai import AiDep
from backend.db import DbDep
from backend.auth import UserDep
from backend.services.rag import build_messages, retrieve_context, stream_answer

router = APIRouter(tags=["chat"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class ConversationOut(BaseModel):
    id: uuid.UUID
    assistant_id: uuid.UUID
    title: str | None
    created_at: str
    updated_at: str


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    sources: list[dict]
    created_at: str


# ── Conversation endpoints ─────────────────────────────────────────────────────

@router.get("/assistants/{assistant_id}/conversations/", response_model=list[ConversationOut])
def list_conversations(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> list[dict]:
    """List all conversations for a given assistant, ensuring ownership."""
    # Verify assistant ownership
    asst_query = db.table("assistants").select("id").eq("id", str(assistant_id))
    if user.role != "admin":
        asst_query = asst_query.eq("user_id", str(user.id))
    
    asst_check = asst_query.maybe_single().execute()
    if not asst_check.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")

    result = (
        db.table("conversations")
        .select("*")
        .eq("assistant_id", str(assistant_id))
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/assistants/{assistant_id}/conversations/", response_model=ConversationOut, status_code=201)
def create_conversation(
    assistant_id: Annotated[uuid.UUID, Path()],
    body: ConversationCreate,
    db: DbDep,
    user: UserDep,
) -> dict:
    """Create a new conversation, ensuring ownership."""
    # Verify assistant ownership
    asst_query = db.table("assistants").select("id").eq("id", str(assistant_id))
    if user.role != "admin":
        asst_query = asst_query.eq("user_id", str(user.id))
        
    asst = asst_query.maybe_single().execute()
    if not asst.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")

    result = db.table("conversations").insert(
        {
            "assistant_id": str(assistant_id), 
            "title": body.title,
            "user_id": str(user.id)
        }
    ).execute()
    conv = result.data[0]
    logger.info("Conversation created id={} for user_id={}", conv["id"], user.id)
    return conv


# ── Message endpoints ──────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages/", response_model=list[MessageOut])
def get_messages(
    conversation_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> list[dict]:
    """Return the full message history, ensuring ownership."""
    # Verify conversation ownership
    conv_query = db.table("conversations").select("id").eq("id", str(conversation_id))
    if user.role != "admin":
        conv_query = conv_query.eq("user_id", str(user.id))
        
    conv_check = conv_query.maybe_single().execute()
    if not conv_check.data:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")

    result = (
        db.table("messages")
        .select("*")
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("/conversations/{conversation_id}/messages/")
def send_message(
    conversation_id: Annotated[uuid.UUID, Path()],
    body: MessageCreate,
    db: DbDep,
    ai: AiDep,
    user: UserDep,
) -> StreamingResponse:
    """Send a message and stream reply, ensuring ownership."""
    # ── Fetch conversation + assistant ─────────────────────────────────────
    conv_query = (
        db.table("conversations")
        .select("*, assistants(id, instructions, user_id)")
        .eq("id", str(conversation_id))
    )
    if user.role != "admin":
        conv_query = conv_query.eq("user_id", str(user.id))
        
    conv_result = conv_query.maybe_single().execute()
    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")

    conversation = conv_result.data
    assistant_id = uuid.UUID(conversation["assistant_id"])
    system_prompt: str = conversation["assistants"]["instructions"]

    # ── Fetch recent history (last 10 messages) ────────────────────────────
    history_result = (
        db.table("messages")
        .select("role, content")
        .eq("conversation_id", str(conversation_id))
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    # Reverse to chronological order
    history = list(reversed(history_result.data or []))

    # ── Retrieve relevant context ──────────────────────────────────────────
    context_chunks = retrieve_context(
        query=body.content,
        assistant_id=assistant_id,
        db=db,
    )

    # ── Build messages list ────────────────────────────────────────────────
    messages = build_messages(
        system_prompt=system_prompt,
        context_chunks=context_chunks,
        history=history,
        question=body.content,
    )

    logger.info(
        "Chat request conversation_id={} chunks_retrieved={}",
        conversation_id,
        len(context_chunks),
    )

    # ── Streaming generator with DB persistence ────────────────────────────
    def event_stream():
        full_answer: list[str] = []

        # Persist user message first
        db.table("messages").insert({
            "conversation_id": str(conversation_id),
            "role": "user",
            "content": body.content,
            "sources": [],
        }).execute()

        try:
            for chunk in stream_answer(messages, ai):
                if chunk.startswith("data: [DONE]"):
                    # Persist complete assistant answer
                    assistant_content = "".join(full_answer).replace("\\n", "\n")

                    document_ids = list(
                        {
                            str(c.get("document_id"))
                            for c in context_chunks
                            if c.get("document_id")
                        }
                    )
                    document_name_by_id: dict[str, str] = {}
                    if document_ids:
                        docs_result = (
                            db.table("documents")
                            .select("id, filename")
                            .in_("id", document_ids)
                            .execute()
                        )
                        document_name_by_id = {
                            str(d.get("id")): d.get("filename", "Documento")
                            for d in (docs_result.data or [])
                        }

                    sources = []
                    for c in context_chunks:
                        metadata = c.get("metadata") or {}
                        raw_chunk_index = metadata.get("chunk_index", -1)
                        try:
                            chunk_index = int(raw_chunk_index)
                        except (TypeError, ValueError):
                            chunk_index = -1

                        sources.append(
                            {
                                "chunk_id": str(c.get("id")),
                                "document_id": str(c.get("document_id")),
                                "document_filename": document_name_by_id.get(str(c.get("document_id")), "Documento"),
                                "chunk_index": chunk_index,
                                "content": c.get("content", ""),
                                "similarity": c.get("similarity"),
                            }
                        )
                    db.table("messages").insert({
                        "conversation_id": str(conversation_id),
                        "role": "assistant",
                        "content": assistant_content,
                        "sources": sources,
                    }).execute()

                    # Update conversation title if first exchange
                    if not conversation.get("title") and len(history) == 0:
                        title = body.content[:80]
                        db.table("conversations").update({"title": title}).eq(
                            "id", str(conversation_id)
                        ).execute()

                    logger.info(
                        "Chat complete conversation_id={} tokens_approx={}",
                        conversation_id,
                        len(assistant_content.split()),
                    )
                else:
                    # Accumulate token (strip "data: " prefix and trailing newlines)
                    token = chunk[6:].rstrip("\n")
                    full_answer.append(token)

                yield chunk
        except Exception as exc:
            logger.error("Streaming error conversation_id={} error={}", conversation_id, exc)
            yield "data: [ERROR]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    user: UserDep,
) -> None:
    """Delete a conversation, ensuring ownership."""
    # Verify ownership
    query = db.table("conversations").select("id").eq("id", str(conversation_id))
    if user.role != "admin":
        query = query.eq("user_id", str(user.id))
    
    check = query.maybe_single().execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")

    db.table("messages").delete().eq("conversation_id", str(conversation_id)).execute()
    db.table("conversations").delete().eq("id", str(conversation_id)).execute()
    logger.info("Conversation deleted id={} by user_id={}", conversation_id, user.id)

