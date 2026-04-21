# DATABASE — Supabase Schema y Configuración

## Setup inicial en Supabase

1. Crear proyecto en https://supabase.com
2. Activar extensión pgvector: en el SQL Editor ejecutar:

```sql
create extension if not exists vector;
```

3. Ejecutar el schema completo de abajo.

---

## Schema SQL completo

```sql
-- ============================================================
-- EXTENSIONES
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- TABLA: assistants
-- ============================================================
create table assistants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  instructions text not null,  -- system prompt del asistente
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- TABLA: documents
-- Metadatos de cada archivo subido a un asistente
-- ============================================================
create table documents (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  filename     text not null,
  file_type    text not null,   -- 'pdf' | 'docx' | 'pptx' | 'txt' | 'md'
  storage_path text not null,   -- path en Supabase Storage
  size_bytes   bigint,
  chunk_count  int default 0,
  status       text default 'processing', -- 'processing' | 'ready' | 'error'
  created_at   timestamptz default now()
);

create index idx_documents_assistant on documents(assistant_id);

-- ============================================================
-- TABLA: chunks
-- Fragmentos de texto vectorizados — NÚCLEO del RAG
-- ============================================================
create table chunks (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  content      text not null,
  chunk_index  int not null,        -- posición del chunk en el doc
  embedding    vector(1536),        -- text-embedding-3-small
  metadata     jsonb default '{}',  -- página, sección, etc.
  created_at   timestamptz default now()
);

-- Índice para búsqueda vectorial eficiente (cosine similarity)
create index idx_chunks_embedding on chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Índice para filtrar por asistente rápidamente (aislamiento)
create index idx_chunks_assistant on chunks(assistant_id);

-- ============================================================
-- TABLA: conversations
-- Una conversación pertenece a un asistente
-- ============================================================
create table conversations (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  title        text,              -- se puede auto-generar del primer mensaje
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index idx_conversations_assistant on conversations(assistant_id);

-- ============================================================
-- TABLA: messages
-- Mensajes dentro de una conversación
-- ============================================================
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  sources         jsonb default '[]',  -- chunks usados como contexto
  created_at      timestamptz default now()
);

create index idx_messages_conversation on messages(conversation_id);

-- ============================================================
-- FUNCIÓN: búsqueda vectorial con aislamiento por asistente
-- ============================================================
create or replace function match_chunks(
  query_embedding vector(1536),
  assistant_id_filter uuid,
  match_count int default 5,
  min_score float default 0.70
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where
    c.assistant_id = assistant_id_filter
    and 1 - (c.embedding <=> query_embedding) >= min_score
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_assistants_updated_at
  before update on assistants
  for each row execute function update_updated_at();

create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();
```

---

## Storage bucket

Crear un bucket llamado `documents` en Supabase Storage (puede ser privado, el backend accede con la service key).

```
Bucket: documents
Carpeta por asistente: documents/{assistant_id}/{document_id}/{filename}
```

---

## Cómo funciona el aislamiento

La función `match_chunks` siempre recibe `assistant_id_filter` y filtra con:

```sql
where c.assistant_id = assistant_id_filter
```

El backend NUNCA llama a esta función sin ese filtro. Es la única forma de acceder a chunks. Esto garantiza que un asistente **jamás** ve documentos de otro.

---

## Cómo se usan las fuentes (campo `sources`)

En la tabla `messages`, el campo `sources` es un array JSON con los chunks recuperados:

```json
[
  {
    "chunk_id": "uuid",
    "document_id": "uuid",
    "filename": "manual_producto.pdf",
    "content": "fragmento de texto usado como contexto...",
    "similarity": 0.87,
    "page": 3
  }
]
```

El frontend las muestra como citas colapsables bajo cada respuesta del asistente.

---

## Row Level Security (opcional pero recomendado)

Si añades autenticación con Supabase Auth en el futuro:

```sql
-- Ejemplo: usuarios solo ven sus propios asistentes
alter table assistants enable row level security;

create policy "Own assistants" on assistants
  for all using (auth.uid() = user_id);
```

Por ahora (sin auth), el backend usa la `service_role` key y gestiona el acceso por API.
