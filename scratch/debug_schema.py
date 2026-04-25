from backend.config import get_settings
from backend.db import init_db
import backend.db as db

init_db(get_settings())

for table in ['assistants', 'conversations', 'messages', 'documents']:
    try:
        res = db._client.table(table).select('*').limit(1).execute()
        print(f"Table '{table}' keys: {res.data[0].keys() if res.data else 'No data'}")
    except Exception as e:
        print(f"Table '{table}' error: {e}")
