from backend.config import get_settings
s = get_settings()
print("Settings OK:", s.azure_deployment_llm, s.supabase_url[:40])
