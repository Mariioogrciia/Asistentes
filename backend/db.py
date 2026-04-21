"""Supabase client — singleton, initialized once at startup.

Uses the service_role key so the backend can bypass RLS and manage
Storage objects. Never expose this key to the frontend.
"""

from typing import Annotated

from fastapi import Depends
from loguru import logger
from supabase import Client, create_client

from backend.config import Settings, get_settings

_client: Client | None = None


def init_db(settings: Settings) -> None:
    """Create the Supabase client. Call once during app lifespan startup."""
    global _client
    logger.info("Initializing Supabase client — url={}", settings.supabase_url)
    _client = create_client(settings.supabase_url, settings.supabase_service_key)
    logger.info("Supabase client ready")


def get_db() -> Client:
    """FastAPI dependency — return the shared Supabase client."""
    if _client is None:
        raise RuntimeError("Supabase client not initialized. Call init_db() first.")
    return _client


# Annotated alias for cleaner endpoint signatures
DbDep = Annotated[Client, Depends(get_db)]
