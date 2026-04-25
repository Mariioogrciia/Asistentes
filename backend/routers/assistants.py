"""Router: CRUD operations for assistants."""

import json
import time
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Path
from loguru import logger
from pydantic import BaseModel, Field

from backend.ai import AiDep
from backend.config import get_settings
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


class GenerateInstructionsIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class GenerateInstructionsOut(BaseModel):
    instructions: str


class SuggestedQuestionsOut(BaseModel):
    questions: list[str]
    based_on_documents: bool


def _normalize_questions(raw_questions: list[str]) -> list[str]:
    """Return 3 deduplicated, non-empty suggested questions."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for question in raw_questions:
        text = " ".join((question or "").split()).strip()
        if not text:
            continue
        # Skip if it looks like JSON or markdown markers
        if text.startswith(("{", "[", "```", "}", "]")):
            continue
        if "\"questions\":" in text:
            continue
            
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) == 3:
            break

    fallback = [
        "Que temas principales cubren los documentos cargados?",
        "Cual es el resumen mas util para empezar?",
        "Que preguntas clave deberia hacer sobre esta documentacion?",
    ]
    for question in fallback:
        if len(cleaned) == 3:
            break
        if question.lower() not in seen:
            cleaned.append(question)
            seen.add(question.lower())

    return cleaned[:3]


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


@router.post("/generate-instructions", response_model=GenerateInstructionsOut)
def generate_instructions_with_ai(
    body: GenerateInstructionsIn,
    ai: AiDep,
    user: UserDep,
) -> dict:
    """Generate a system prompt from assistant name/description with strict RAG constraints."""
    settings = get_settings()

    system_text = (
        "Eres un experto en disenar prompts de asistentes RAG. "
        "Devuelve solo el prompt final en espanol, sin explicaciones ni comillas."
    )
    user_text = (
        "Crea un system prompt inmersivo y detallado para este asistente.\n\n"
        f"Nombre del asistente: {body.name}\n"
        f"Misión/Descripción: {body.description or 'Sin descripción'}\n\n"
        "Instrucciones para generar el prompt:\n"
        f"1. Analiza el Nombre '{body.name}'. Si el nombre sugiere una profesión, rol o especialidad (ej: Fontanero, Abogado, Tutor de Matemáticas, Sommelier, etc.), el asistente debe ADOPTAR esa personalidad, usar su lenguaje técnico y actuar como un experto en esa materia.\n"
        "2. El prompt generado debe empezar definiendo quién es (ej: 'Eres un experto Fontanero con amplia experiencia en...').\n"
        "3. REGLA DE ORO INNEGOCIABLE: El asistente SOLO puede usar la información de los documentos subidos. Debe ser explícito en que su conocimiento se limita a esa base de datos.\n"
        "4. Si la respuesta no está en los documentos, debe decir: 'Lo siento, no encuentro esa información en los documentos proporcionados', incluso si como IA general supieras la respuesta.\n"
        "5. Tono: Adaptado al rol (profesional, técnico, amable, etc.) y siempre en español.\n"
        "6. Devuelve solo el texto del prompt, sin comentarios adicionales."
    )

    try:
        completion = ai.chat.completions.create(
            model=settings.azure_deployment_llm,
            messages=[
                {"role": "system", "content": system_text},
                {"role": "user", "content": user_text},
            ],
            temperature=0.4,
            max_tokens=500,
        )
        content = (completion.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error("Prompt generation failed user_id={} error={}", user.id, exc)
        raise HTTPException(status_code=500, detail="No se pudo generar el prompt con IA") from exc

    if not content:
        content = (
            f"Eres {body.name}, un asistente especializado. "
            "Responde siempre en espanol y SOLO con informacion de los documentos subidos. "
            "Si no encuentras la respuesta en los documentos, indicalo claramente y no inventes datos."
        )

    return {"instructions": content}


@router.get("/{assistant_id}/suggested-questions", response_model=SuggestedQuestionsOut)
def generate_suggested_questions(
    assistant_id: Annotated[uuid.UUID, Path()],
    db: DbDep,
    ai: AiDep,
    user: UserDep,
) -> dict:
    """Generate 3 quick-start questions from indexed document content."""
    settings = get_settings()

    asst_query = db.table("assistants").select("id, name, instructions, user_id").eq("id", str(assistant_id))
    if user.role != "admin":
        asst_query = asst_query.eq("user_id", str(user.id))

    asst = asst_query.maybe_single().execute()
    if not asst.data:
        raise HTTPException(status_code=404, detail="Assistant not found or access denied")

    chunks_result = (
        db.table("chunks")
        .select("content")
        .eq("assistant_id", str(assistant_id))
        .order("chunk_index")
        .limit(8)
        .execute()
    )
    chunk_texts = [row.get("content", "") for row in (chunks_result.data or []) if row.get("content")]
    based_on_documents = len(chunk_texts) > 0

    if based_on_documents:
        context = "\n\n---\n\n".join(text[:1200] for text in chunk_texts)
        user_text = (
            "Genera exactamente 3 preguntas sugeridas breves y directas para este asistente.\n"
            "REQUISITO CRÍTICO: Las preguntas deben ser sobre DATOS o HECHOS Específicos que aparezcan en el contenido proporcionado abajo.\n"
            "No hagas preguntas generales de 'experiencia' o 'opinión'. Haz preguntas que tengan una respuesta clara en el texto.\n"
            "Ejemplo malo: ¿Qué te gusta de la fontanería? (Si no está en el texto)\n"
            "Ejemplo bueno: ¿Cuál es la presión máxima recomendada según el manual?\n\n"
            "Devuelve JSON estricto: {\"questions\": [\"...\", \"...\", \"...\"]}.\n\n"
            f"Asistente: {asst.data['name']}\n\n"
            f"Contenido para extraer preguntas:\n{context}"
        )
    else:
        user_text = (
            "Genera exactamente 3 preguntas iniciales para este asistente, pensadas para cuando aun no hay documentos.\n"
            "Deben invitar al usuario a subir contenido y explorar informacion documental.\n"
            "Devuelve JSON estricto con este formato: {\"questions\": [\"...\", \"...\", \"...\"]}.\n\n"
            f"Asistente: {asst.data['name']}\n"
            f"Instrucciones: {asst.data.get('instructions', '')[:500]}"
        )

    system_text = (
        "Eres un generador de preguntas sugeridas para productos RAG. "
        "Siempre respondes solo JSON valido y en espanol."
    )

    try:
        completion = ai.chat.completions.create(
            model=settings.azure_deployment_llm,
            messages=[
                {"role": "system", "content": system_text},
                {"role": "user", "content": user_text},
            ],
            temperature=0.4,
            max_tokens=280,
        )
        content = (completion.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error("Suggested questions generation failed assistant_id={} error={}", assistant_id, exc)
        raise HTTPException(status_code=500, detail="No se pudieron generar preguntas sugeridas") from exc

    questions: list[str] = []
    try:
        # Clean up possible markdown code blocks if the model wraps JSON
        clean_content = content
        if "```json" in clean_content:
            clean_content = clean_content.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_content:
            clean_content = clean_content.split("```")[1].split("```")[0].strip()

        parsed = json.loads(clean_content)
        raw_questions = parsed.get("questions", []) if isinstance(parsed, dict) else []
        if isinstance(raw_questions, list):
            questions = [str(q) for q in raw_questions if q]
    except Exception:
        # Fallback: parse line-based outputs if model returns text.
        lines = [line.strip("-• \t") for line in content.splitlines() if line.strip()]
        questions = lines

    return {
        "questions": _normalize_questions(questions),
        "based_on_documents": based_on_documents,
    }


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
