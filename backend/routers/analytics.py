from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from supabase import create_client, Client
from backend.db import DbDep
from backend.auth import UserDep
from backend.config import get_settings
from loguru import logger

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _fresh_client() -> Client:
    """Return a brand-new Supabase client for the analytics request.

    The shared singleton can accumulate stale HTTP connections that trigger
    'Server disconnected' when several consecutive calls are made.  Creating a
    fresh client per analytics call is cheap (just builds an httpx session) and
    completely avoids the problem.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)

class UserStats(BaseModel):
    total_messages: int
    estimated_tokens: int
    active_assistants: int
    top_documents: List[Dict[str, Any]]
    activity_by_assistant: List[Dict[str, Any]]

class AdminStats(BaseModel):
    total_users: int
    total_assistants: int
    total_documents: int
    total_messages: int
    total_tokens_estimated: int
    popular_assistants: List[Dict[str, Any]]
    top_global_documents: List[Dict[str, Any]]
    assistant_ratings: List[Dict[str, Any]]  # feedback per assistant

@router.get("/user", response_model=UserStats)
def get_user_stats(db: DbDep, user: UserDep):  # noqa: ARG001
    """Get usage statistics for the current user."""
    logger.info("analytics/user called for user_id={}", user.id)

    try:
        db = _fresh_client()  # use a fresh connection to avoid stale HTTP sessions
        # 1. Get user's assistants (name lookup)
        assts_result = db.table("assistants") \
            .select("id, name") \
            .eq("user_id", str(user.id)) \
            .execute()
        asst_map = {a["id"]: a["name"] for a in (assts_result.data or [])}
        active_assistants = len(asst_map)

        # 2. Get user's conversations
        convs_result = db.table("conversations") \
            .select("id, assistant_id") \
            .eq("user_id", str(user.id)) \
            .execute()
        convs = convs_result.data or []

        if not convs:
            logger.info("No conversations found for user_id={}", user.id)
            return UserStats(
                total_messages=0,
                estimated_tokens=0,
                active_assistants=active_assistants,
                top_documents=[],
                activity_by_assistant=[]
            )

        conv_ids = [c["id"] for c in convs]
        conv_to_asst = {c["id"]: asst_map.get(c["assistant_id"], "Asistente") for c in convs}

        # 3. Get messages for these conversations (in batches if needed)
        all_msgs_result = db.table("messages") \
            .select("content, conversation_id, sources") \
            .in_("conversation_id", conv_ids) \
            .execute()
        msgs = all_msgs_result.data or []

        # 4. Aggregate
        total_msgs = len(msgs)
        total_chars = sum(len(m.get("content") or "") for m in msgs)
        estimated_tokens = int(total_chars / 4)

        asst_activity: dict[str, int] = {}
        doc_hits: dict[str, int] = {}

        for m in msgs:
            asst_name = conv_to_asst.get(m["conversation_id"], "Asistente")
            asst_activity[asst_name] = asst_activity.get(asst_name, 0) + 1

            for src in (m.get("sources") or []):
                doc_name = src.get("document_filename") or src.get("filename") or "Documento"
                doc_hits[doc_name] = doc_hits.get(doc_name, 0) + 1

        logger.info("analytics/user done: msgs={} tokens={}", total_msgs, estimated_tokens)
        return UserStats(
            total_messages=total_msgs,
            estimated_tokens=estimated_tokens,
            active_assistants=active_assistants,
            top_documents=[{"name": k, "hits": v} for k, v in sorted(doc_hits.items(), key=lambda x: x[1], reverse=True)[:5]],
            activity_by_assistant=[{"name": k, "count": v} for k, v in sorted(asst_activity.items(), key=lambda x: x[1], reverse=True)]
        )

    except Exception as exc:
        logger.exception("analytics/user failed for user_id={}: {}", user.id, exc)
        raise HTTPException(status_code=500, detail=f"Error calculando estadísticas: {exc}")

@router.get("/admin", response_model=AdminStats)
def get_admin_stats(db: DbDep, user: UserDep):  # noqa: ARG001
    """Get global statistics for administrators."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Permisos insuficientes")

    try:
        db = _fresh_client()  # use a fresh connection to avoid stale HTTP sessions
        # Global counts
        users_count = db.table("profiles").select("id", count="exact").execute().count or 0
        asst_count = db.table("assistants").select("id", count="exact").execute().count or 0
        docs_count = db.table("documents").select("id", count="exact").execute().count or 0

        # Build assistant name map (id -> name) without joins
        all_assts = db.table("assistants").select("id, name").execute()
        asst_name_map: dict[str, str] = {a["id"]: a["name"] for a in (all_assts.data or [])}

        # Build document name map (id -> filename) for fallback lookup
        all_docs = db.table("documents").select("id, filename").execute()
        doc_name_map: dict[str, str] = {d["id"]: d["filename"] for d in (all_docs.data or [])}

        # Conversations: map conv_id -> assistant_name
        all_convs = db.table("conversations").select("id, assistant_id").execute()
        conv_map: dict[str, str] = {
            c["id"]: asst_name_map.get(c["assistant_id"], "Asistente eliminado")
            for c in (all_convs.data or [])
        }

        # Fetch a sample of messages for charts
        msgs_result = db.table("messages").select("content, sources, conversation_id").limit(1000).execute()
        total_msgs_result = db.table("messages").select("id", count="exact").execute()
        total_msgs = total_msgs_result.count or 0

        asst_popularity: dict[str, int] = {}
        global_docs: dict[str, int] = {}
        sample_chars = 0

        for m in (msgs_result.data or []):
            asst_name = conv_map.get(m["conversation_id"], "Asistente eliminado")
            asst_popularity[asst_name] = asst_popularity.get(asst_name, 0) + 1
            sample_chars += len(m.get("content") or "")

            for src in (m.get("sources") or []):
                # Try document_filename first, then filename, then look up by document_id
                dname = (
                    src.get("document_filename")
                    or src.get("filename")
                    or doc_name_map.get(src.get("document_id", ""), "")
                    or "Documento sin nombre"
                )
                global_docs[dname] = global_docs.get(dname, 0) + 1

        # Extrapolate total tokens from the sample
        if total_msgs > 1000 and sample_chars > 0:
            avg_chars = sample_chars / len(msgs_result.data)
            estimated_total_tokens = int((avg_chars * total_msgs) / 4)
        else:
            estimated_total_tokens = int(sample_chars / 4)

        # Feedback ratings per assistant
        # message_feedback → messages → conversations → assistants
        feedback_rows = db.table("message_feedback").select("rating, message_id").execute()
        msg_ids_feedback = [f["message_id"] for f in (feedback_rows.data or [])]

        asst_ratings: dict[str, dict] = {name: {"up": 0, "down": 0} for name in asst_name_map.values()}

        if msg_ids_feedback:
            # Get conversation_id for those messages
            msgs_for_feedback = (
                db.table("messages")
                .select("id, conversation_id")
                .in_("id", msg_ids_feedback)
                .execute()
            )
            msg_conv_map: dict[str, str] = {
                m["id"]: m["conversation_id"] for m in (msgs_for_feedback.data or [])
            }
            for f in (feedback_rows.data or []):
                conv_id = msg_conv_map.get(f["message_id"])
                if not conv_id:
                    continue
                asst_name = conv_map.get(conv_id, "Asistente eliminado")
                if asst_name not in asst_ratings:
                    asst_ratings[asst_name] = {"up": 0, "down": 0}
                asst_ratings[asst_name][f["rating"]] += 1

        # Build sorted list (by total votes desc)
        assistant_ratings_list = [
            {
                "name": name,
                "up": counts["up"],
                "down": counts["down"],
                "total": counts["up"] + counts["down"],
                "score": round(
                    (counts["up"] / (counts["up"] + counts["down"]) * 100)
                    if (counts["up"] + counts["down"]) > 0 else 0
                ),
            }
            for name, counts in asst_ratings.items()
            if counts["up"] + counts["down"] > 0  # only show rated ones
        ]
        assistant_ratings_list.sort(key=lambda x: x["total"], reverse=True)

        return AdminStats(
            total_users=users_count,
            total_assistants=asst_count,
            total_documents=docs_count,
            total_messages=total_msgs,
            total_tokens_estimated=estimated_total_tokens,
            popular_assistants=[
                {"name": k, "count": v}
                for k, v in sorted(asst_popularity.items(), key=lambda x: x[1], reverse=True)[:10]
            ],
            top_global_documents=[
                {"name": k, "hits": v}
                for k, v in sorted(global_docs.items(), key=lambda x: x[1], reverse=True)[:10]
            ],
            assistant_ratings=assistant_ratings_list,
        )

    except Exception as exc:
        logger.exception("analytics/admin failed: {}", exc)
        raise HTTPException(status_code=500, detail=f"Error calculando estadísticas: {exc}")
