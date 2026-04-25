"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.ai import init_ai
from backend.config import get_settings
from backend.db import init_db
from backend.logger import setup_logger
from backend.routers import assistants, chat, documents, users, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all shared resources at startup; clean up on shutdown."""
    setup_logger()
    settings = get_settings()
    init_db(settings)
    init_ai(settings)
    yield
    # Nothing to clean up (Supabase / OpenAI clients are stateless HTTP)


app = FastAPI(
    title="RAG Assistants API",
    description=(
        "Multi-assistant RAG system powered by Azure OpenAI (embeddings + chat) "
        "and Supabase (pgvector + Storage)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://asistentes-xcoc.vercel.app",
    ],
    allow_origin_regex=r"https://asistentes-.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(assistants.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(users.router)
app.include_router(analytics.router)


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["monitoring"])
def health() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok"}
