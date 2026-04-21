# BACKEND — FastAPI + Python

## Setup inicial

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## requirements.txt

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9
pydantic==2.7.1
pydantic-settings==2.2.1
supabase==2.4.3
openai==1.30.1
PyMuPDF==1.24.3
python-docx==1.1.2
python-pptx==0.6.23
langchain-text-splitters==0.2.0
httpx==0.27.0
python-dotenv==1.0.1
```

---

## config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    supabase_url: str
    supabase_service_key: str
    supabase_bucket: str = "documents"
    embedding_model: str = "text-embedding-3-small"
    llm_model: str = "gpt-4o-mini"
    chunk_size: int = 800
    chunk_overlap: int = 100
    retrieval_top_k: int = 5
    retrieval_min_score: float = 0.70

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## database.py

```python
from supabase import create_client, Client
from config import settings

def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)
```

---

## main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import assistants, documents, chat

app = FastAPI(title="RAG Asistentes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assistants.router, prefix="/api/assistants", tags=["assistants"])
app.include_router(documents.router, prefix="/api/assistants", tags=["documents"])
app.include_router(chat.router, prefix="/api/assistants", tags=["chat"])

@app.get("/health")
def health():
    return {"status": "ok"}
```

---

## models/schemas.py

```python
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
import uuid

# --- Assistants ---
class AssistantCreate(BaseModel):
    name: str
    instructions: str
    description: Optional[str] = None

class AssistantUpdate(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    description: Optional[str] = None

class Assistant(BaseModel):
    id: str
    name: str
    instructions: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

# --- Documents ---
class Document(BaseModel):
    id: str
    assistant_id: str
    filename: str
    file_type: str
    size_bytes: Optional[int]
    chunk_count: int
    status: str
    created_at: datetime

# --- Chat ---
class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None  # None = nueva conversación

class Source(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    content: str
    similarity: float

class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    answer: str
    sources: List[Source]
    found_context: bool  # False si no hay chunks relevantes

class Message(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: List[Any]
    created_at: datetime

class Conversation(BaseModel):
    id: str
    assistant_id: str
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
```

---

## routers/assistants.py

```python
from fastapi import APIRouter, HTTPException
from models.schemas import Assistant, AssistantCreate, AssistantUpdate
from database import get_supabase
from typing import List

router = APIRouter()

@router.get("/", response_model=List[Assistant])
def list_assistants():
    sb = get_supabase()
    res = sb.table("assistants").select("*").order("created_at", desc=True).execute()
    return res.data

@router.post("/", response_model=Assistant, status_code=201)
def create_assistant(body: AssistantCreate):
    sb = get_supabase()
    res = sb.table("assistants").insert(body.model_dump()).execute()
    return res.data[0]

@router.get("/{assistant_id}", response_model=Assistant)
def get_assistant(assistant_id: str):
    sb = get_supabase()
    res = sb.table("assistants").select("*").eq("id", assistant_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Asistente no encontrado")
    return res.data

@router.patch("/{assistant_id}", response_model=Assistant)
def update_assistant(assistant_id: str, body: AssistantUpdate):
    sb = get_supabase()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    res = sb.table("assistants").update(data).eq("id", assistant_id).execute()
    return res.data[0]

@router.delete("/{assistant_id}", status_code=204)
def delete_assistant(assistant_id: str):
    sb = get_supabase()
    # Cascada en BD eliminará documents y chunks automáticamente
    sb.table("assistants").delete().eq("id", assistant_id).execute()
```

---

## routers/documents.py

```python
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from models.schemas import Document
from database import get_supabase
from services.ingestion import ingest_document
from typing import List

router = APIRouter()

@router.get("/{assistant_id}/documents", response_model=List[Document])
def list_documents(assistant_id: str):
    sb = get_supabase()
    res = (sb.table("documents")
           .select("*")
           .eq("assistant_id", assistant_id)
           .order("created_at", desc=True)
           .execute())
    return res.data

@router.post("/{assistant_id}/documents", response_model=Document, status_code=201)
async def upload_document(
    assistant_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    allowed = ["pdf", "docx", "pptx", "txt", "md"]
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Formato no soportado. Usa: {allowed}")

    content = await file.read()
    sb = get_supabase()

    # Guardar en Supabase Storage
    storage_path = f"{assistant_id}/{file.filename}"
    sb.storage.from_("documents").upload(storage_path, content)

    # Crear registro en BD
    doc_res = sb.table("documents").insert({
        "assistant_id": assistant_id,
        "filename": file.filename,
        "file_type": ext,
        "storage_path": storage_path,
        "size_bytes": len(content),
        "status": "processing"
    }).execute()
    doc = doc_res.data[0]

    # Procesar en background (chunking + embeddings)
    background_tasks.add_task(ingest_document, doc["id"], assistant_id, content, ext)

    return doc

@router.delete("/{assistant_id}/documents/{document_id}", status_code=204)
def delete_document(assistant_id: str, document_id: str):
    sb = get_supabase()
    # Chunks se eliminan por cascade
    sb.table("documents").delete().eq("id", document_id).eq("assistant_id", assistant_id).execute()
```

---

## services/parsers.py

```python
import fitz  # PyMuPDF
from docx import Document as DocxDocument
from pptx import Presentation
from io import BytesIO

def extract_text(content: bytes, file_type: str) -> str:
    if file_type == "pdf":
        return _parse_pdf(content)
    elif file_type == "docx":
        return _parse_docx(content)
    elif file_type == "pptx":
        return _parse_pptx(content)
    elif file_type in ("txt", "md"):
        return content.decode("utf-8", errors="ignore")
    raise ValueError(f"Tipo no soportado: {file_type}")

def _parse_pdf(content: bytes) -> str:
    doc = fitz.open(stream=content, filetype="pdf")
    return "\n".join(page.get_text() for page in doc)

def _parse_docx(content: bytes) -> str:
    doc = DocxDocument(BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

def _parse_pptx(content: bytes) -> str:
    prs = Presentation(BytesIO(content))
    texts = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text)
    return "\n".join(texts)
```

---

## services/ingestion.py

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from database import get_supabase
from config import settings
from services.parsers import extract_text
import logging

client = OpenAI(api_key=settings.openai_api_key)

def ingest_document(doc_id: str, assistant_id: str, content: bytes, file_type: str):
    sb = get_supabase()
    try:
        # 1. Extraer texto
        text = extract_text(content, file_type)
        if not text.strip():
            raise ValueError("Documento vacío o sin texto extraíble")

        # 2. Chunking
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        chunks = splitter.split_text(text)

        # 3. Embeddings por lotes (máx 100 por llamada)
        all_embeddings = []
        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            resp = client.embeddings.create(
                input=batch,
                model=settings.embedding_model
            )
            all_embeddings.extend([e.embedding for e in resp.data])

        # 4. Guardar chunks + embeddings en Supabase
        records = [
            {
                "assistant_id": assistant_id,
                "document_id": doc_id,
                "content": chunk,
                "chunk_index": idx,
                "embedding": embedding,
                "metadata": {"chunk_index": idx}
            }
            for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings))
        ]
        # Insertar en lotes de 50
        for i in range(0, len(records), 50):
            sb.table("chunks").insert(records[i:i+50]).execute()

        # 5. Actualizar estado del documento
        sb.table("documents").update({
            "status": "ready",
            "chunk_count": len(chunks)
        }).eq("id", doc_id).execute()

        logging.info(f"Documento {doc_id} procesado: {len(chunks)} chunks")

    except Exception as e:
        sb.table("documents").update({"status": "error"}).eq("id", doc_id).execute()
        logging.error(f"Error procesando documento {doc_id}: {e}")
        raise
```

---

## services/retrieval.py

```python
from openai import OpenAI
from database import get_supabase
from config import settings

client = OpenAI(api_key=settings.openai_api_key)

def retrieve_context(query: str, assistant_id: str) -> list[dict]:
    """
    Busca los chunks más relevantes para la query,
    SIEMPRE filtrados por assistant_id (aislamiento total).
    """
    # 1. Embed la query
    resp = client.embeddings.create(input=query, model=settings.embedding_model)
    query_embedding = resp.data[0].embedding

    # 2. Llamar a la función RPC de Supabase (busca solo en este asistente)
    sb = get_supabase()
    result = sb.rpc("match_chunks", {
        "query_embedding": query_embedding,
        "assistant_id_filter": assistant_id,
        "match_count": settings.retrieval_top_k,
        "min_score": settings.retrieval_min_score
    }).execute()

    return result.data or []
```

---

## services/llm.py

```python
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)

NO_CONTEXT_RESPONSE = (
    "No tengo información suficiente en mis documentos para responder esta pregunta. "
    "Por favor, consulta otras fuentes o sube documentos relevantes al asistente."
)

def build_prompt(assistant_instructions: str, context_chunks: list[dict], history: list[dict]) -> list[dict]:
    # Construir el contexto recuperado
    if context_chunks:
        context_text = "\n\n---\n\n".join(
            f"[Fuente: fragmento {i+1}]\n{chunk['content']}"
            for i, chunk in enumerate(context_chunks)
        )
        context_block = f"\n\nCONTEXTO DE DOCUMENTOS:\n{context_text}"
    else:
        context_block = ""

    system_message = f"""{assistant_instructions}

INSTRUCCIONES ADICIONALES:
- Responde ÚNICAMENTE basándote en el contexto de documentos proporcionado.
- Si el contexto no contiene información suficiente para responder, di explícitamente que no puedes contestar.
- NO inventes información que no esté en los documentos.
- Cuando uses información de los documentos, indícalo con referencias como [Fuente 1], [Fuente 2], etc.
{context_block}"""

    messages = [{"role": "system", "content": system_message}]
    messages.extend(history)
    return messages

def generate_response(messages: list[dict]) -> str:
    resp = client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=0.3,
        max_tokens=1500
    )
    return resp.choices[0].message.content
```

---

## routers/chat.py

```python
from fastapi import APIRouter, HTTPException
from models.schemas import ChatRequest, ChatResponse, Conversation, Message, Source
from database import get_supabase
from services.retrieval import retrieve_context
from services.llm import build_prompt, generate_response, NO_CONTEXT_RESPONSE
from typing import List

router = APIRouter()

@router.get("/{assistant_id}/conversations", response_model=List[Conversation])
def list_conversations(assistant_id: str):
    sb = get_supabase()
    res = (sb.table("conversations")
           .select("*")
           .eq("assistant_id", assistant_id)
           .order("updated_at", desc=True)
           .execute())
    return res.data

@router.get("/{assistant_id}/conversations/{conv_id}/messages", response_model=List[Message])
def get_messages(assistant_id: str, conv_id: str):
    sb = get_supabase()
    res = (sb.table("messages")
           .select("*")
           .eq("conversation_id", conv_id)
           .order("created_at")
           .execute())
    return res.data

@router.delete("/{assistant_id}/conversations/{conv_id}", status_code=204)
def delete_conversation(assistant_id: str, conv_id: str):
    sb = get_supabase()
    sb.table("conversations").delete().eq("id", conv_id).eq("assistant_id", assistant_id).execute()

@router.post("/{assistant_id}/chat", response_model=ChatResponse)
def chat(assistant_id: str, body: ChatRequest):
    sb = get_supabase()

    # 1. Obtener asistente
    asst_res = sb.table("assistants").select("*").eq("id", assistant_id).single().execute()
    if not asst_res.data:
        raise HTTPException(404, "Asistente no encontrado")
    assistant = asst_res.data

    # 2. Crear o recuperar conversación
    if body.conversation_id:
        conv_id = body.conversation_id
        sb.table("conversations").update({"updated_at": "now()"}).eq("id", conv_id).execute()
    else:
        conv_res = sb.table("conversations").insert({
            "assistant_id": assistant_id,
            "title": body.message[:60]  # primeros 60 chars como título
        }).execute()
        conv_id = conv_res.data[0]["id"]

    # 3. Recuperar historial (últimos 10 mensajes para no sobrepasar contexto)
    hist_res = (sb.table("messages")
                .select("role, content")
                .eq("conversation_id", conv_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute())
    history = list(reversed(hist_res.data or []))

    # 4. RAG: recuperar chunks relevantes (SOLO de este asistente)
    chunks = retrieve_context(body.message, assistant_id)
    found_context = len(chunks) > 0

    # 5. Si no hay contexto, responder directamente sin llamar al LLM con docs
    if not found_context:
        answer = NO_CONTEXT_RESPONSE
        sources = []
    else:
        # 6. Construir prompt y generar respuesta
        messages = build_prompt(assistant["instructions"], chunks, history)
        messages.append({"role": "user", "content": body.message})
        answer = generate_response(messages)

        # Obtener filenames para las fuentes
        doc_ids = list({c["document_id"] for c in chunks})
        docs_res = sb.table("documents").select("id, filename").in_("id", doc_ids).execute()
        docs_map = {d["id"]: d["filename"] for d in docs_res.data}

        sources = [
            Source(
                chunk_id=c["id"],
                document_id=c["document_id"],
                filename=docs_map.get(c["document_id"], "desconocido"),
                content=c["content"],
                similarity=round(c["similarity"], 3)
            )
            for c in chunks
        ]

    # 7. Guardar mensaje del usuario
    sb.table("messages").insert({
        "conversation_id": conv_id,
        "role": "user",
        "content": body.message,
        "sources": []
    }).execute()

    # 8. Guardar respuesta del asistente
    msg_res = sb.table("messages").insert({
        "conversation_id": conv_id,
        "role": "assistant",
        "content": answer,
        "sources": [s.model_dump() for s in sources]
    }).execute()

    return ChatResponse(
        conversation_id=conv_id,
        message_id=msg_res.data[0]["id"],
        answer=answer,
        sources=sources,
        found_context=found_context
    )
```
