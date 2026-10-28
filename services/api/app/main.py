from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import assert_production_safe, settings
from .db import Base, SessionLocal, engine
from .routers import agents, auth, catalog, export, graph, runs
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_production_safe()
    Base.metadata.create_all(engine)  # swap for Alembic migrations once the schema stabilises
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Agent Studio API", version="0.1.0", lifespan=lifespan,
              docs_url=None if settings.is_prod else "/docs", redoc_url=None, openapi_url=None if settings.is_prod else "/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, agents.router, catalog.router, graph.router, runs.router, export.router):
    app.include_router(r, prefix="/api")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"status": "ready"}
