# SKILL — RAG Multi-Asistente (Full-Stack)

## Qué estamos construyendo

Aplicación full-stack que permite crear **asistentes IA personalizados** con sus propios documentos. Cada asistente tiene aislamiento total: solo responde usando sus propios documentos. Chat persistente con historial y citas de fuentes.

---

## Stack (no cambiar sin preguntar)

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Python 3.11 + FastAPI |
| Base de datos | Supabase (PostgreSQL + pgvector + Storage) |
| LLM | Azure AI Foundry — deployment de `gpt-4o-mini` |
| Embeddings | Azure AI Foundry — deployment de `text-embedding-3-small` |
| PDF | PyMuPDF (fitz) |
| DOCX | python-docx |
| PPTX | python-pptx |

---

## Estructura de carpetas

```
rag-asistentes/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # redirect → /assistants
│   │   └── assistants/
│   │       ├── page.tsx                # lista
│   │       ├── new/page.tsx            # crear
│   │       └── [id]/
│   │           ├── edit/page.tsx
│   │           ├── documents/page.tsx
│   │           └── chat/page.tsx
│   ├── components/
│   │   ├── AssistantCard.tsx
│   │   ├── AssistantForm.tsx
│   │   ├── ChatMessage.tsx             # incluye citas colapsables
│   │   └── DocumentUpload.tsx
│   ├── lib/
│   │   ├── api.ts                      # cliente HTTP al backend
│   │   └── types.ts
│   ├── .env.local
│   └── package.json
│
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── routers/
│   │   ├── assistants.py
│   │   ├── documents.py
│   │   └── chat.py
│   ├── services/
│   │   ├── parsers.py                  # PDF, DOCX, PPTX, TXT
│   │   ├── ingestion.py                # chunking + embeddings
│   │   ├── retrieval.py                # búsqueda vectorial aislada
│   │   └── llm.py                      # llamadas a Azure OpenAI
│   ├── models/schemas.py
│   ├── .env
│   └── requirements.txt
│
└── supabase/schema.sql
```

---

## Variables de entorno

### backend/.env
```
# Azure AI Foundry
AZURE_OPENAI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_OPENAI_ENDPOINT=https://<tu-recurso>.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_DEPLOYMENT_LLM=gpt-4o-mini           # nombre del deployment en Foundry
AZURE_DEPLOYMENT_EMBEDDING=text-embedding-3-small  # nombre del deployment en Foundry

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_BUCKET=documents

# RAG tuning
CHUNK_SIZE=800
CHUNK_OVERLAP=100
RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SCORE=0.70
```

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Supabase — Schema SQL completo

Ejecutar en el SQL Editor de Supabase:

```sql
create extension if not exists vector;

-- Asistentes
create table assistants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  instructions text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Documentos (metadatos)
create table documents (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  filename     text not null,
  file_type    text not null,
  storage_path text not null,
  size_bytes   bigint,
  chunk_count  int default 0,
  status       text default 'processing', -- 'processing' | 'ready' | 'error'
  created_at   timestamptz default now()
);
create index idx_documents_assistant on documents(assistant_id);

-- Chunks vectorizados (núcleo del RAG)
create table chunks (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  content      text not null,
  chunk_index  int not null,
  embedding    vector(1536),   -- text-embedding-3-small = 1536 dims
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);
create index idx_chunks_embedding on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index idx_chunks_assistant on chunks(assistant_id);

-- Conversaciones
create table conversations (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  title        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index idx_conversations_assistant on conversations(assistant_id);

-- Mensajes
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  sources         jsonb default '[]',
  created_at      timestamptz default now()
);
create index idx_messages_conversation on messages(conversation_id);

-- Función de búsqueda vectorial con aislamiento por asistente
create or replace function match_chunks(
  query_embedding vector(1536),
  assistant_id_filter uuid,
  match_count int default 5,
  min_score float default 0.70
)
returns table (id uuid, document_id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select
    c.id, c.document_id, c.content, c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where
    c.assistant_id = assistant_id_filter
    and 1 - (c.embedding <=> query_embedding) >= min_score
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Triggers updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_assistants_upd before update on assistants
  for each row execute function update_updated_at();
create trigger trg_conversations_upd before update on conversations
  for each row execute function update_updated_at();
```

Crear también el bucket `documents` en Supabase Storage (privado, el backend accede con service key).

---

## Backend — requirements.txt

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9
pydantic==2.7.1
pydantic-settings==2.2.1
supabase==2.4.3
openai==1.30.1          # soporta Azure OpenAI nativamente
PyMuPDF==1.24.3
python-docx==1.1.2
python-pptx==0.6.23
langchain-text-splitters==0.2.0
python-dotenv==1.0.1
```

---

## Backend — config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Azure AI Foundry
    azure_openai_api_key: str
    azure_openai_endpoint: str
    azure_openai_api_version: str = "2024-02-15-preview"
    azure_deployment_llm: str = "gpt-4o-mini"
    azure_deployment_embedding: str = "text-embedding-3-small"

    # Supabase
    supabase_url: str
    supabase_service_key: str
    supabase_bucket: str = "documents"

    # RAG
    chunk_size: int = 800
    chunk_overlap: int = 100
    retrieval_top_k: int = 5
    retrieval_min_score: float = 0.70

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Backend — database.py

```python
from supabase import create_client, Client
from config import settings

def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)
```

---

## Backend — main.py

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
app.include_router(chat.router,      prefix="/api/assistants", tags=["chat"])

@app.get("/health")
def health():
    return {"status": "ok"}
```

---

## Backend — models/schemas.py

```python
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

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

class Document(BaseModel):
    id: str
    assistant_id: str
    filename: str
    file_type: str
    size_bytes: Optional[int]
    chunk_count: int
    status: str
    created_at: datetime

class Source(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    content: str
    similarity: float

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    answer: str
    sources: List[Source]
    found_context: bool

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

## Backend — services/parsers.py

```python
import fitz
from docx import Document as DocxDocument
from pptx import Presentation
from io import BytesIO

def extract_text(content: bytes, file_type: str) -> str:
    if file_type == "pdf":
        doc = fitz.open(stream=content, filetype="pdf")
        return "\n".join(page.get_text() for page in doc)
    elif file_type == "docx":
        doc = DocxDocument(BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    elif file_type == "pptx":
        prs = Presentation(BytesIO(content))
        texts = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    texts.append(shape.text)
        return "\n".join(texts)
    elif file_type in ("txt", "md"):
        return content.decode("utf-8", errors="ignore")
    raise ValueError(f"Tipo no soportado: {file_type}")
```

---

## Backend — services/ingestion.py

```python
from openai import AzureOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from database import get_supabase
from config import settings
from services.parsers import extract_text
import logging

# Cliente Azure OpenAI
azure_client = AzureOpenAI(
    api_key=settings.azure_openai_api_key,
    azure_endpoint=settings.azure_openai_endpoint,
    api_version=settings.azure_openai_api_version,
)

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

        # 3. Embeddings con Azure AI Foundry (lotes de 100)
        all_embeddings = []
        for i in range(0, len(chunks), 100):
            batch = chunks[i:i + 100]
            resp = azure_client.embeddings.create(
                input=batch,
                model=settings.azure_deployment_embedding   # nombre del deployment en Foundry
            )
            all_embeddings.extend([e.embedding for e in resp.data])

        # 4. Guardar chunks + embeddings en Supabase pgvector
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
        for i in range(0, len(records), 50):
            sb.table("chunks").insert(records[i:i+50]).execute()

        # 5. Marcar documento como listo
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

## Backend — services/retrieval.py

```python
from openai import AzureOpenAI
from database import get_supabase
from config import settings

azure_client = AzureOpenAI(
    api_key=settings.azure_openai_api_key,
    azure_endpoint=settings.azure_openai_endpoint,
    api_version=settings.azure_openai_api_version,
)

def retrieve_context(query: str, assistant_id: str) -> list[dict]:
    """
    Busca chunks relevantes SOLO del asistente indicado.
    El filtro assistant_id es obligatorio — nunca se omite.
    """
    resp = azure_client.embeddings.create(
        input=query,
        model=settings.azure_deployment_embedding
    )
    query_embedding = resp.data[0].embedding

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

## Backend — services/llm.py

```python
from openai import AzureOpenAI
from config import settings

azure_client = AzureOpenAI(
    api_key=settings.azure_openai_api_key,
    azure_endpoint=settings.azure_openai_endpoint,
    api_version=settings.azure_openai_api_version,
)

NO_CONTEXT_RESPONSE = (
    "No tengo información suficiente en mis documentos para responder esta pregunta. "
    "Por favor, sube documentos relevantes al asistente o reformula tu pregunta."
)

def build_prompt(instructions: str, chunks: list[dict], history: list[dict]) -> list[dict]:
    context_text = "\n\n---\n\n".join(
        f"[Fuente {i+1}]\n{c['content']}" for i, c in enumerate(chunks)
    )
    system = f"""{instructions}

INSTRUCCIONES OBLIGATORIAS:
- Responde ÚNICAMENTE con información del contexto de documentos proporcionado.
- Si el contexto no contiene información suficiente, indica explícitamente que no puedes responder.
- NO inventes datos, fechas, nombres ni cifras que no estén en los documentos.
- Cuando uses información de un fragmento, cítalo como [Fuente 1], [Fuente 2], etc.

CONTEXTO DE DOCUMENTOS:
{context_text}"""

    messages = [{"role": "system", "content": system}]
    messages.extend(history)
    return messages

def generate_response(messages: list[dict]) -> str:
    resp = azure_client.chat.completions.create(
        model=settings.azure_deployment_llm,   # nombre del deployment en Foundry
        messages=messages,
        temperature=0.3,
        max_tokens=1500
    )
    return resp.choices[0].message.content
```

---

## Backend — routers/assistants.py

```python
from fastapi import APIRouter, HTTPException
from models.schemas import Assistant, AssistantCreate, AssistantUpdate
from database import get_supabase
from typing import List

router = APIRouter()

@router.get("/", response_model=List[Assistant])
def list_assistants():
    return get_supabase().table("assistants").select("*").order("created_at", desc=True).execute().data

@router.post("/", response_model=Assistant, status_code=201)
def create_assistant(body: AssistantCreate):
    return get_supabase().table("assistants").insert(body.model_dump()).execute().data[0]

@router.get("/{assistant_id}", response_model=Assistant)
def get_assistant(assistant_id: str):
    res = get_supabase().table("assistants").select("*").eq("id", assistant_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Asistente no encontrado")
    return res.data

@router.patch("/{assistant_id}", response_model=Assistant)
def update_assistant(assistant_id: str, body: AssistantUpdate):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    return get_supabase().table("assistants").update(data).eq("id", assistant_id).execute().data[0]

@router.delete("/{assistant_id}", status_code=204)
def delete_assistant(assistant_id: str):
    get_supabase().table("assistants").delete().eq("id", assistant_id).execute()
```

---

## Backend — routers/documents.py

```python
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from models.schemas import Document
from database import get_supabase
from services.ingestion import ingest_document
from typing import List

router = APIRouter()

@router.get("/{assistant_id}/documents", response_model=List[Document])
def list_documents(assistant_id: str):
    return (get_supabase().table("documents").select("*")
            .eq("assistant_id", assistant_id).order("created_at", desc=True).execute().data)

@router.post("/{assistant_id}/documents", response_model=Document, status_code=201)
async def upload_document(assistant_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    allowed = ["pdf", "docx", "pptx", "txt", "md"]
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Formato no soportado. Permitidos: {allowed}")

    content = await file.read()
    sb = get_supabase()

    storage_path = f"{assistant_id}/{file.filename}"
    sb.storage.from_("documents").upload(storage_path, content)

    doc = sb.table("documents").insert({
        "assistant_id": assistant_id,
        "filename": file.filename,
        "file_type": ext,
        "storage_path": storage_path,
        "size_bytes": len(content),
        "status": "processing"
    }).execute().data[0]

    background_tasks.add_task(ingest_document, doc["id"], assistant_id, content, ext)
    return doc

@router.delete("/{assistant_id}/documents/{document_id}", status_code=204)
def delete_document(assistant_id: str, document_id: str):
    get_supabase().table("documents").delete().eq("id", document_id).eq("assistant_id", assistant_id).execute()
```

---

## Backend — routers/chat.py

```python
from fastapi import APIRouter, HTTPException
from models.schemas import ChatRequest, ChatResponse, Source, Conversation, Message
from database import get_supabase
from services.retrieval import retrieve_context
from services.llm import build_prompt, generate_response, NO_CONTEXT_RESPONSE
from typing import List

router = APIRouter()

@router.get("/{assistant_id}/conversations", response_model=List[Conversation])
def list_conversations(assistant_id: str):
    return (get_supabase().table("conversations").select("*")
            .eq("assistant_id", assistant_id).order("updated_at", desc=True).execute().data)

@router.get("/{assistant_id}/conversations/{conv_id}/messages", response_model=List[Message])
def get_messages(assistant_id: str, conv_id: str):
    return (get_supabase().table("messages").select("*")
            .eq("conversation_id", conv_id).order("created_at").execute().data)

@router.delete("/{assistant_id}/conversations/{conv_id}", status_code=204)
def delete_conversation(assistant_id: str, conv_id: str):
    get_supabase().table("conversations").delete().eq("id", conv_id).eq("assistant_id", assistant_id).execute()

@router.post("/{assistant_id}/chat", response_model=ChatResponse)
def chat(assistant_id: str, body: ChatRequest):
    sb = get_supabase()

    # Obtener asistente
    asst = sb.table("assistants").select("*").eq("id", assistant_id).single().execute().data
    if not asst:
        raise HTTPException(404, "Asistente no encontrado")

    # Crear o continuar conversación
    if body.conversation_id:
        conv_id = body.conversation_id
    else:
        conv_id = sb.table("conversations").insert({
            "assistant_id": assistant_id,
            "title": body.message[:60]
        }).execute().data[0]["id"]

    # Historial (últimos 10 mensajes)
    hist = (sb.table("messages").select("role, content")
            .eq("conversation_id", conv_id).order("created_at", desc=True).limit(10).execute().data)
    history = list(reversed(hist or []))

    # RAG — recuperar chunks SOLO de este asistente
    chunks = retrieve_context(body.message, assistant_id)
    found_context = len(chunks) > 0

    if not found_context:
        answer = NO_CONTEXT_RESPONSE
        sources = []
    else:
        messages = build_prompt(asst["instructions"], chunks, history)
        messages.append({"role": "user", "content": body.message})
        answer = generate_response(messages)

        doc_ids = list({c["document_id"] for c in chunks})
        docs_map = {d["id"]: d["filename"] for d in
                    sb.table("documents").select("id, filename").in_("id", doc_ids).execute().data}
        sources = [
            Source(chunk_id=c["id"], document_id=c["document_id"],
                   filename=docs_map.get(c["document_id"], "—"),
                   content=c["content"], similarity=round(c["similarity"], 3))
            for c in chunks
        ]

    # Guardar mensajes
    sb.table("messages").insert({"conversation_id": conv_id, "role": "user",
                                  "content": body.message, "sources": []}).execute()
    msg = sb.table("messages").insert({"conversation_id": conv_id, "role": "assistant",
                                        "content": answer,
                                        "sources": [s.model_dump() for s in sources]}).execute().data[0]

    return ChatResponse(conversation_id=conv_id, message_id=msg["id"],
                        answer=answer, sources=sources, found_context=found_context)
```

---

## Frontend — lib/types.ts

```typescript
export interface Assistant {
  id: string; name: string; description?: string;
  instructions: string; created_at: string; updated_at: string;
}
export interface Document {
  id: string; assistant_id: string; filename: string; file_type: string;
  size_bytes?: number; chunk_count: number; status: 'processing'|'ready'|'error'; created_at: string;
}
export interface Source {
  chunk_id: string; document_id: string; filename: string; content: string; similarity: number;
}
export interface Message {
  id: string; conversation_id: string; role: 'user'|'assistant';
  content: string; sources: Source[]; created_at: string;
}
export interface Conversation {
  id: string; assistant_id: string; title?: string; created_at: string; updated_at: string;
}
export interface ChatResponse {
  conversation_id: string; message_id: string;
  answer: string; sources: Source[]; found_context: boolean;
}
```

---

## Frontend — lib/api.ts

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  assistants: {
    list: () => req<Assistant[]>('/assistants/'),
    get:  (id: string) => req<Assistant>(`/assistants/${id}`),
    create: (data: Omit<Assistant, 'id'|'created_at'|'updated_at'>) =>
      req<Assistant>('/assistants/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Assistant>) =>
      req<Assistant>(`/assistants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/assistants/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list:   (aId: string) => req<Document[]>(`/assistants/${aId}/documents`),
    upload: (aId: string, file: File) => {
      const form = new FormData(); form.append('file', file)
      return fetch(`${BASE}/api/assistants/${aId}/documents`, { method: 'POST', body: form }).then(r => r.json())
    },
    delete: (aId: string, dId: string) =>
      req<void>(`/assistants/${aId}/documents/${dId}`, { method: 'DELETE' }),
  },
  chat: {
    send: (aId: string, message: string, conversationId?: string) =>
      req<ChatResponse>(`/assistants/${aId}/chat`, {
        method: 'POST', body: JSON.stringify({ message, conversation_id: conversationId }),
      }),
    conversations: (aId: string) => req<Conversation[]>(`/assistants/${aId}/conversations`),
    messages:      (aId: string, cId: string) => req<Message[]>(`/assistants/${aId}/conversations/${cId}/messages`),
    deleteConversation: (aId: string, cId: string) =>
      req<void>(`/assistants/${aId}/conversations/${cId}`, { method: 'DELETE' }),
  },
}
```

---

## Reglas de negocio — NUNCA violar

1. **Aislamiento**: `retrieve_context()` siempre pasa `assistant_id`. La función SQL `match_chunks` filtra por él. Nunca se omite este filtro.
2. **No inventar**: si `chunks` está vacío → devolver `NO_CONTEXT_RESPONSE` directamente, sin llamar al LLM con contexto vacío.
3. **Citas**: toda respuesta del asistente guarda en `messages.sources` los chunks usados. El frontend los muestra colapsados bajo el mensaje.
4. **Persistencia**: mensajes siempre guardados en BD con su `conversation_id`. El historial se recupera en cada llamada al chat.

---

## Comandos de desarrollo

```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # → http://localhost:3000

# Verificar backend
curl http://localhost:8000/health
```

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|-------|---------|
| `AuthenticationError` Azure | API key o endpoint incorrectos | Verificar `.env` con los valores de Azure AI Foundry |
| `DeploymentNotFound` | Nombre del deployment mal escrito | El campo `model=` debe ser el **nombre del deployment**, no el modelo base |
| `vector extension not found` | pgvector no activado | Ejecutar `create extension if not exists vector;` en Supabase |
| `found_context: false` siempre | Score muy alto o docs en `processing` | Bajar `RETRIEVAL_MIN_SCORE` a 0.60 o esperar a que los docs estén en `ready` |
| CORS error | Origin no permitido | Añadir el origin del frontend en `allow_origins` de `main.py` |

---

## Pendiente / fuera de scope inicial

- Autenticación (Supabase Auth)
- Streaming de respuestas (SSE)
- Soporte imágenes con OCR
- Multi-usuario con permisos
- Re-ranking de chunks