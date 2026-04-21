# CLAUDE.md — Instrucciones para el asistente de desarrollo

Este archivo le da contexto completo al modelo para ayudar a construir este proyecto.
Lee todos los archivos .md del repo antes de responder a cualquier pregunta.

---

## Qué estás construyendo

Una aplicación **full-stack RAG multi-asistente**:
- Los usuarios crean asistentes IA personalizados
- Cada asistente tiene sus propias instrucciones y documentos
- El chat usa RAG: solo responde con información de SUS documentos (aislamiento total)
- El historial de chat persiste en base de datos

## Stack (NO cambies esto sin preguntar)

| Parte | Tecnología |
|-------|-----------|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui |
| Backend | Python 3.11 + FastAPI |
| DB / Vector | Supabase (PostgreSQL + pgvector + Storage) |
| LLM | OpenAI gpt-4o-mini |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |

## Archivos de referencia en este repo

- `PROYECTO.md` — Visión general, arquitectura, estructura de carpetas
- `DATABASE.md` — Schema SQL completo de Supabase, función de búsqueda vectorial
- `BACKEND.md` — Código completo del backend FastAPI
- `FRONTEND.md` — Código completo del frontend Next.js

## Reglas que SIEMPRE debes respetar

### Aislamiento de asistentes
- La función `match_chunks` en Supabase **SIEMPRE** filtra por `assistant_id`
- El backend **NUNCA** busca chunks sin ese filtro
- Nunca mezcles datos de diferentes asistentes

### No inventar
- Si `retrieve_context()` devuelve lista vacía, usar la constante `NO_CONTEXT_RESPONSE`
- El LLM recibe instrucción explícita de no inventar nada fuera del contexto
- `found_context: false` en la respuesta cuando no hay chunks relevantes

### Citas obligatorias
- Cada respuesta del asistente guarda en `messages.sources` los chunks usados
- El frontend muestra las fuentes como citas colapsables bajo cada mensaje
- El campo `sources` en mensajes del usuario siempre es `[]`

### Persistencia del chat
- Cada conversación tiene su propio registro en tabla `conversations`
- Los mensajes se guardan en tabla `messages` con `conversation_id`
- Al chatear, se recuperan los últimos 10 mensajes como historial
- El usuario puede borrar conversaciones individuales

## Cómo responder preguntas sobre el código

1. Siempre referencia los archivos `.md` antes de proponer cambios
2. Si te piden añadir funcionalidad, extiende lo existente sin romper lo que ya funciona
3. Mantén los nombres de tablas, campos y endpoints exactamente como están definidos
4. Si hay conflicto entre lo que te piden y las reglas de negocio de arriba, pregunta antes de implementar

## Comandos útiles de referencia

### Arrancar el backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Arrancar el frontend
```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### Ejecutar el schema de Supabase
Ir al SQL Editor de Supabase y ejecutar el contenido de `supabase/schema.sql`

### Verificar que el backend responde
```bash
curl http://localhost:8000/health
# → {"status": "ok"}
```

### Verificar la función de búsqueda vectorial
```sql
-- En Supabase SQL Editor:
select * from match_chunks(
  '[0.1, 0.2, ...]'::vector,  -- embedding de prueba
  'uuid-del-asistente'::uuid,
  5,
  0.70
);
```

## Errores comunes y soluciones

| Error | Causa probable | Solución |
|-------|----------------|---------|
| `pgvector extension not found` | No se activó la extensión | Ejecutar `create extension if not exists vector;` en Supabase |
| `CORS error` | Backend no permite origin del frontend | Revisar `allow_origins` en `main.py` |
| `401 Unauthorized` en Supabase | Usando anon key en vez de service key | Usar `SUPABASE_SERVICE_KEY` en el backend |
| `embedding dimension mismatch` | Cambio de modelo de embedding | Verificar que el modelo es `text-embedding-3-small` (1536 dims) |
| `status: error` en documentos | Error en la ingesta | Revisar logs del backend, puede ser PDF corrupto o sin texto |
| `found_context: false` | No hay chunks suficientemente similares | Bajar `RETRIEVAL_MIN_SCORE` o asegurarse de que los docs están en estado `ready` |

## Lo que NO está implementado (puedes añadirlo si te lo piden)

- Autenticación de usuarios (Supabase Auth)
- Streaming de respuestas (SSE / websockets)
- Re-ranking de chunks recuperados
- Soporte para imágenes (OCR)
- Multi-usuario / permisos
- Métricas de uso / dashboard de analytics
- Export de conversaciones
- Evaluación de respuestas (thumbs up/down)
