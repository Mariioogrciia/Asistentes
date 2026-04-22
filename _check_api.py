import urllib.request
import json

try:
    req = urllib.request.Request("http://127.0.0.1:8000/assistants/")
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print(f"Assistants from API: {len(data)}")
        for a in data:
            print(f"- {a['name']}")
except Exception as e:
    print(f"Error fetching: {e}")