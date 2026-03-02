import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Settings:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    GROQ_MODEL = "openai/gpt-oss-120b"  # fast + strong
    MAX_DEPTH = 4
    STORAGE_PATH = "storage/graphs"

settings = Settings()