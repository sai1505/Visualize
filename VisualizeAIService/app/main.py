from fastapi import FastAPI
from app.api.graph_router import router

app = FastAPI(title="AI Knowledge Graph Engine")

app.include_router(router)

@app.get("/")
def health():
    return {"status": "running"}