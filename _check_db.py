from backend.config import get_settings
from backend.db import init_db
import backend.db as db

init_db(get_settings())
res = db._client.table('assistants').select('*').execute()
print(f'Assistants in DB: {len(res.data)}')
