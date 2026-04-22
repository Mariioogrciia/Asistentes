import os
import asyncio
from supabase import create_client

from dotenv import load_dotenv
load_dotenv(".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

try:
    res = db.auth.get_user("fake_token")
    print(res)
except Exception as e:
    print("ERROR:", type(e), str(e))
