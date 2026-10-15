"""Local-only embedding service. No generated catalog entries or third-party API calls."""
from contextlib import asynccontextmanager
import os
import secrets
from threading import Lock
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
MODEL=os.environ.get("EMBEDDING_MODEL","sentence-transformers/all-MiniLM-L6-v2")
model=None
lock=Lock()
@asynccontextmanager
async def lifespan(app):
    global model
    model=SentenceTransformer(MODEL, device="cpu", trust_remote_code=False)
    if model.get_sentence_embedding_dimension()!=384:raise RuntimeError("VYBE requires a 384-dimensional embedding model.")
    yield
app=FastAPI(title="VYBE Embeddings",lifespan=lifespan,docs_url=None,redoc_url=None)
class Batch(BaseModel):
    texts:list[str]=Field(min_length=1,max_length=32)
@app.get("/health")
def health():return {"ready":model is not None,"model":MODEL}
@app.post("/embed")
def embed(body:Batch,x_internal_key:str=Header(default="")):
    expected=os.environ.get("AI_INTERNAL_KEY","")
    if expected and not secrets.compare_digest(expected,x_internal_key):raise HTTPException(401,"Invalid service credential")
    if any(not t.strip() or len(t)>6000 for t in body.texts):raise HTTPException(422,"Texts must contain 1–6000 characters")
    with lock:
        values=model.encode(body.texts,normalize_embeddings=True,show_progress_bar=False).tolist()
    return {"model":MODEL,"vectors":values}
