# ✦ RAG Assistants

Plataforma premium de **Retrieval-Augmented Generation (RAG)** que permite crear asistentes personalizados, alimentar su base de conocimientos con documentos propios y chatear con ellos en tiempo real utilizando IA avanzada.

![Aesthetic](https://img.shields.io/badge/UI-Premium-blueviolet?style=for-the-badge)
![Tech](https://img.shields.io/badge/Stack-Next.js%20%7C%20FastAPI%20%7C%20Supabase-blue?style=for-the-badge)

---

## 🚀 Características Principales

- **Gestión Multi-Asistente**: Crea múltiples asistentes independientes, cada uno con sus propias instrucciones (System Prompt) y base de conocimientos.
- **Pipeline de Ingesta Inteligente**: Procesa archivos PDF, DOCX, PPTX, TXT y Markdown.
    - **Chunking**: Segmentación recursiva de texto para mantener el contexto.
    - **Embeddings**: Generación de vectores mediante Azure OpenAI (`text-embedding-3-small`).
    - **Vector Store**: Almacenamiento y búsqueda semántica ultra-rápida con Supabase (`pgvector`).
- **Chat en Tiempo Real**: Experiencia de usuario fluida con respuestas en streaming (Server-Sent Events) e indicadores de escritura.
- **Organización Inteligente**: Almacenamiento de archivos en Supabase Storage organizado automáticamente por el nombre del asistente.
- **Diseño Premium**: Interfaz moderna "Dark Mode" con estética minimalista y animaciones fluidas.

---

## 🛠️ Stack Tecnológico

### Backend (Core & AI)
- **FastAPI**: API robusta y asíncrona con tipado fuerte.
- **Azure OpenAI**: Potencia el motor de lenguaje (GPT-4o-mini) y la generación de embeddings.
- **Supabase**: Backend-as-a-Service para la base de datos Postgres y el almacenamiento de archivos.
- **Loguru**: Logging estructurado para monitorizar cada paso de la ingesta y el chat.

### Frontend (UI/UX)
- **Next.js 14+**: App Router para una navegación instantánea.
- **Vanilla CSS Modules**: Control total sobre el diseño sin dependencias pesadas.
- **Streaming SSE**: Conexión directa con el backend para recibir tokens palabra por palabra.

---

## ⚙️ Configuración del Entorno

El proyecto utiliza un archivo `.env` en la raíz para la configuración global.

```env
# Azure OpenAI (Foundry / AI Studio)
AZURE_OPENAI_API_KEY=tu_api_key
AZURE_OPENAI_ENDPOINT=https://tu-endpoint.services.ai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_DEPLOYMENT_LLM=gpt-4o-mini
AZURE_DEPLOYMENT_EMBEDDING=text-embedding-3-small

# Supabase
SUPABASE_URL=tu_url_de_proyecto
SUPABASE_SERVICE_KEY=tu_service_role_key
SUPABASE_BUCKET=documents

# RAG Tuning (Opcional)
CHUNK_SIZE=800
CHUNK_OVERLAP=100
RETRIEVAL_MIN_SCORE=0.40
```

---

## 📦 Instalación

### 1. Clonar y preparar el Backend
```bash
# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate en Windows

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
uvicorn backend.main:app --reload --port 8000
```

### 2. Preparar el Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📂 Estructura del Proyecto

```text
├── backend/            # Lógica de servidor, RAG e ingesta
│   ├── routers/        # Endpoints de la API
│   ├── services/       # Pipeline de documentos y búsqueda vectorial
│   └── ai.py           # Clientes de Azure OpenAI
├── frontend/           # Aplicación Next.js
│   ├── app/            # Páginas y componentes (App Router)
│   └── lib/            # Cliente de API tipado
├── logs/               # Registros estructurados (JSONL)
└── requirements.txt    # Dependencias de Python
```

---

## 🛡️ Seguridad y Buenas Prácticas

- **Sanitización ASCII**: Los nombres de archivos y carpetas en Storage se limpian automáticamente para cumplir con los estándares de la nube.
- **Inyección de Dependencias**: Gestión eficiente de clientes de base de datos e IA.
- **Aislamiento**: Los documentos y fragmentos están aislados por `assistant_id` para garantizar la privacidad de cada base de conocimientos.

---
Creado por el equipo de **Antigravity**. 🚀
