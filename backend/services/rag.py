"""Service: RAG retrieval, prompt building, and SSE streaming."""

import uuid
from collections.abc import Generator

from loguru import logger
from openai import AzureOpenAI
from supabase import Client

from backend.ai import get_embedding
from backend.config import get_settings


# ── Retrieval ──────────────────────────────────────────────────────────────────

def retrieve_context(
    query: str,
    assistant_id: uuid.UUID,
    db: Client,
) -> list[dict]:
    """Call the match_chunks Postgres function and return the top-k results."""
    settings = get_settings()
    query_vector = get_embedding(query)

    logger.debug(
        "Retrieving context assistant_id={} top_k={} min_score={}",
        assistant_id,
        settings.retrieval_top_k,
        settings.retrieval_min_score,
    )

    result = db.rpc(
        "match_chunks",
        {
            "query_embedding": query_vector,
            "assistant_id_filter": str(assistant_id),
            "match_count": settings.retrieval_top_k,
            "min_score": settings.retrieval_min_score,
        },
    ).execute()

    chunks = result.data or []
    logger.debug("Retrieved {} chunks for query", len(chunks))
    return chunks


# ── Prompt building ────────────────────────────────────────────────────────────

def build_messages(
    *,
    system_prompt: str,
    context_chunks: list[dict],
    history: list[dict],
    question: str,
) -> list[dict]:
    """Construct the messages list for the chat completion call.

    Structure:
      [system] → [history messages] → [user message with injected context]
    """
    # Build context block
    if context_chunks:
        context_text = "\n\n---\n\n".join(
            f"[Fragmento {i + 1}]\n{c['content']}"
            for i, c in enumerate(context_chunks)
        )
        user_content = (
            f"Contexto relevante de los documentos:\n\n{context_text}"
            f"\n\n---\n\nPregunta del usuario:\n{question}"
        )
    else:
        user_content = question

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_content})
    return messages


# ── SSE streaming ──────────────────────────────────────────────────────────────

def stream_answer(
    messages: list[dict],
    ai_client: AzureOpenAI,
) -> Generator[str, None, None]:
    """Stream the assistant's answer as Server-Sent Events (SSE).

    Yields:
      - ``data: <token>\\n\\n`` for each streamed token
      - ``data: [DONE]\\n\\n`` when the stream ends
    """
    settings = get_settings()

    stream = ai_client.chat.completions.create(
        model=settings.azure_deployment_llm,
        messages=messages,  # type: ignore[arg-type]
        stream=True,
        temperature=0.3,
        max_tokens=1024,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            # Escape newlines inside the SSE data field
            token = delta.content.replace("\n", "\\n")
            yield f"data: {token}\n\n"

    yield "data: [DONE]\n\n"
