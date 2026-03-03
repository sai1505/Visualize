from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.graph_router import router

app = FastAPI(title="AI Knowledge Graph Engine")

app.include_router(router)

@app.get("/")
def health():
    return {"status": "running"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # your React/Vite frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)