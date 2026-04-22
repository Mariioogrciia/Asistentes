import os
import base64
from jose import jwt
from dotenv import load_dotenv

load_dotenv(".env")
secret = os.environ.get("SUPABASE_JWT_SECRET")

print("Secret length:", len(secret) if secret else 0)
try:
    decoded = base64.b64decode(secret)
    print("Base64 decode success! Length:", len(decoded))
except Exception as e:
    print("Base64 decode failed:", e)
