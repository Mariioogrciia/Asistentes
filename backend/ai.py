"""Azure OpenAI clients — single endpoint, two singletons for LLM and Embeddings.

Provides:
  - get_ai_client()        → AzureOpenAI   (FastAPI dependency, LLM client)
  - get_embedding_client() → AzureOpenAI   (embedding-specific client)
  - get_embedding(text)    → list[float]   (1536 dims, text-embedding-3-small)
"""

from typing import Annotated

from fastapi import Depends
from loguru import logger
from openai import AzureOpenAI

from backend.config import Settings, get_settings

_llm_client: AzureOpenAI | None = None
_embedding_client: AzureOpenAI | None = None
_settings: Settings | None = None


def init_ai(settings: Settings) -> None:
    """Create Azure OpenAI clients. Call once during app lifespan startup."""
    global _llm_client, _embedding_client, _settings
    _settings = settings

    logger.info(
        "Initializing Azure OpenAI clients — endpoint={} api_version={}",
        settings.azure_openai_endpoint,
        settings.azure_openai_api_version,
    )

    # Both LLM and Embedding share the same base endpoint
    _llm_client = AzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.azure_openai_endpoint,
        api_version=settings.azure_openai_api_version,
    )
    _embedding_client = AzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.azure_openai_endpoint,
        api_version=settings.azure_openai_api_version,
    )

    logger.info("Azure OpenAI clients ready")


def get_ai_client() -> AzureOpenAI:
    """FastAPI dependency — return the shared LLM (chat) client."""
    if _llm_client is None:
        raise RuntimeError("AI client not initialized. Call init_ai() first.")
    return _llm_client


def get_embedding_client() -> AzureOpenAI:
    """Return the shared Embedding client (accessed at call-time, not import-time)."""
    if _embedding_client is None:
        raise RuntimeError("AI client not initialized. Call init_ai() first.")
    return _embedding_client


def get_embedding(text: str) -> list[float]:
    """Generate an embedding vector for a given text using Azure OpenAI."""
    if _embedding_client is None or _settings is None:
        raise RuntimeError("AI client not initialized. Call init_ai() first.")

    clean = " ".join(text.split())
    response = _embedding_client.embeddings.create(
        model=_settings.azure_deployment_embedding,
        input=clean,
    )
    return response.data[0].embedding


# Annotated alias for cleaner endpoint signatures
AiDep = Annotated[AzureOpenAI, Depends(get_ai_client)]
