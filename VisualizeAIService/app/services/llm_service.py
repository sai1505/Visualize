import requests
import json
from app.core.config import settings

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Pormpt design
def generate_children(topic: str, parent_title: str, depth: int, limit: int):

    prompt = f"""
You are generating a structured hierarchical knowledge graph.

Main Topic: {topic}
Parent Topic: {parent_title}
Depth Level: {depth}
Number of Subtopics: {limit}

Rules:
- Generate EXACTLY {limit} subtopics
- Each title must be max 5 words
- Description must be 2-3 clear learning sentences
- Return STRICT JSON list format
- Do not add explanations outside JSON

Format:
[
  {{
    "title": "...",
    "description": "..."
  }}
]
"""

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5
    }

    response = requests.post(GROQ_URL, headers=headers, json=payload)

    if response.status_code != 200:
        raise Exception("LLM API Error")

    content = response.json()["choices"][0]["message"]["content"]

    try:
        return json.loads(content)
    except:
        return []