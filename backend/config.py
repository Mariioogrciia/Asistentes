"""Application settings loaded from environment variables / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the project (one level up from backend/)
_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Azure OpenAI ────────────────────────────────────────────────────────
    azure_openai_api_key: str
    azure_openai_endpoint: str            # single endpoint for both LLM and embeddings
    azure_openai_api_version: str = "2024-02-15-preview"
    azure_deployment_llm: str = "gpt-4o-mini"
    azure_deployment_embedding: str = "text-embedding-3-small"

    # ── Supabase ─────────────────────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str
    supabase_bucket: str = "documents"

    # ── RAG tuning ───────────────────────────────────────────────────────────
    chunk_size: int = Field(default=800, gt=0)
    chunk_overlap: int = Field(default=100, ge=0)
    retrieval_top_k: int = Field(default=5, gt=0)
    retrieval_min_score: float = Field(default=0.70, ge=0.0, le=1.0)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached application settings (loaded once at startup)."""
    return Settings()
