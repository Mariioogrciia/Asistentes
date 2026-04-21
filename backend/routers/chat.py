"""Router: conversations and messages with SSE streaming."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from backend.ai import AiDep
from backend.db import DbDep
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
) -> list[dict]:
    """List all conversations for a given assistant."""
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
) -> dict:
    """Create a new conversation for an assistant."""
    # Verify assistant exists
    asst = db.table("assistants").select("id").eq("id", str(assistant_id)).maybe_single().execute()
    if not asst.data:
        raise HTTPException(status_code=404, detail="Assistant not found")

    result = db.table("conversations").insert(
        {"assistant_id": str(assistant_id), "title": body.title}
    ).execute()
    conv = result.data[0]
    logger.info("Conversation created id={} assistant_id={}", conv["id"], assistant_id)
    return conv


# ── Message endpoints ──────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages/", response_model=list[MessageOut])
def get_messages(
    conversation_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
) -> list[dict]:
    """Return the full message history for a conversation."""
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
) -> StreamingResponse:
    """Send a user message and stream the assistant reply via SSE.

    The response is a text/event-stream. Each event contains a text token.
    The final event is ``data: [DONE]``.
    After streaming completes, both the user message and the full assistant
    reply are persisted to the database.
    """
    # ── Fetch conversation + assistant ─────────────────────────────────────
    conv_result = (
        db.table("conversations")
        .select("*, assistants(id, instructions)")
        .eq("id", str(conversation_id))
        .single()
        .execute()
    )
    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

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
                    sources = [
                        {
                            "chunk_id": str(c.get("id")),
                            "document_id": str(c.get("document_id")),
                            "content": c.get("content", ""),
                            "similarity": c.get("similarity"),
                        }
                        for c in context_chunks
                    ]
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
