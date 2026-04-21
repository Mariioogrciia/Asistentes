# RAG Multi-Asistente — Visión General del Proyecto

## Qué estamos construyendo

Una aplicación full-stack que permite crear **asistentes IA personalizados** con sus propios documentos de referencia. Cada asistente tiene aislamiento total: solo responde usando sus propios documentos. Incluye chat persistente con historial y citas de fuentes.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend | Python 3.11 + FastAPI |
| Base de datos | Supabase (PostgreSQL + pgvector + Storage) |
| LLM | OpenAI gpt-4o-mini |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |
| PDF | PyMuPDF (fitz) |
| DOCX | python-docx |
| PPTX | python-pptx |

## Estructura de carpetas

```
rag-asistentes/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Redirect → /assistants
│   │   ├── assistants/
│   │   │   ├── page.tsx       # Lista de asistentes
│   │   │   ├── new/page.tsx   # Crear asistente
│   │   │   └── [id]/
│   │   │       ├── page.tsx   # Detalle asistente
│   │   │       ├── edit/page.tsx
│   │   │       ├── documents/page.tsx
│   │   │       └── chat/page.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── AssistantCard.tsx
│   │   ├── AssistantForm.tsx
│   │   ├── DocumentList.tsx
│   │   ├── DocumentUpload.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── ChatMessage.tsx
│   │   └── SourceCitation.tsx
│   ├── lib/
│   │   ├── api.ts             # Cliente HTTP hacia el backend
│   │   └── types.ts           # TypeScript interfaces
│   ├── .env.local
│   └── package.json
│
├── backend/                   # FastAPI app
│   ├── main.py
│   ├── config.py              # Settings (pydantic-settings)
│   ├── database.py            # Supabase client
│   ├── routers/
│   │   ├── assistants.py      # CRUD asistentes
│   │   ├── documents.py       # Upload + ingesta
│   │   └── chat.py            # RAG pipeline + historial
│   ├── services/
│   │   ├── ingestion.py       # Chunking + embeddings
│   │   ├── retrieval.py       # Búsqueda vectorial
│   │   ├── llm.py             # Llamadas a OpenAI
│   │   └── parsers.py         # PDF, DOCX, PPTX, TXT
│   ├── models/
│   │   └── schemas.py         # Pydantic models
│   ├── .env
│   └── requirements.txt
│
├── supabase/
│   └── schema.sql             # Schema completo
│
└── README.md
```

## Flujo general de la app

```
Usuario
  │
  ├── Gestiona asistentes (CRUD)
  │     └── Nombre + Instrucciones + Descripción
  │
  ├── Sube documentos a un asistente
  │     └── Backend: extrae texto → chunking → embeddings → guarda en pgvector
  │
  └── Chatea con un asistente
        └── Backend:
              1. Embed query del usuario
              2. Buscar chunks similares WHERE assistant_id = X (aislamiento)
              3. Construir prompt: instrucciones + historial + contexto recuperado
              4. Llamar a gpt-4o-mini
              5. Devolver respuesta + fuentes citadas
              6. Guardar mensaje en BD
```

## Reglas de negocio críticas

1. **Aislamiento total**: cada búsqueda vectorial filtra estrictamente por `assistant_id`. Nunca se mezclan documentos de distintos asistentes.
2. **No inventar**: si no hay chunks relevantes (score < threshold), el asistente responde que no tiene información suficiente.
3. **Citas obligatorias**: toda respuesta incluye los fragmentos/documentos usados como fuente.
4. **Historial persistente**: los mensajes se guardan en BD y se envían en cada request para memoria conversacional.

## Variables de entorno necesarias

### Backend (.env)
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_BUCKET=documents
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini
CHUNK_SIZE=800
CHUNK_OVERLAP=100
RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SCORE=0.70
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
