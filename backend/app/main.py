"""
TechSense Backend - FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.db.database import init_db
from app.routers import diagnostic as diagnostic_router
from app.routers import escalation as escalation_router

# ---------------------------------------------------------------------------
# Load environment variables
# ---------------------------------------------------------------------------
load_dotenv()

# Primary allowed origins
# FRONTEND_ORIGIN   – Vite/React dev origin, defaults to localhost:5173
# PRODUCTION_ORIGIN – Set this in the Render dashboard once the frontend is deployed
#                     (e.g. https://techsense.vercel.app)
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
PRODUCTION_ORIGIN = os.getenv("PRODUCTION_ORIGIN", "")

# Optional extra origins (comma-separated) for staging, preview URLs, etc.
_extra = os.getenv("EXTRA_FRONTEND_ORIGINS", "")
EXTRA_ORIGINS: list[str] = [o.strip() for o in _extra.split(",") if o.strip()]

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="TechSense API",
    description="AI-powered tech-support diagnostic and knowledge-graph backend",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS – allow the Vite dev-server and production frontend
# ---------------------------------------------------------------------------
origins = [
    "http://localhost:5173",    # Vite dev server (always allowed)
    "http://localhost:3000",    # CRA / Next.js dev server
    FRONTEND_ORIGIN,            # configured via FRONTEND_ORIGIN env var
]

# Add production frontend URL if provided
if PRODUCTION_ORIGIN:
    origins.append(PRODUCTION_ORIGIN)

# Add any extra origins from EXTRA_FRONTEND_ORIGINS
origins.extend(EXTRA_ORIGINS)

# Deduplicate while preserving order
seen: set = set()
all_origins: list[str] = []
for o in origins:
    if o and o not in seen:
        seen.add(o)
        all_origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup event
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup() -> None:
    """Initialise the SQLite database tables on first run."""
    init_db()


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(
    diagnostic_router.router,
    prefix="/api/symptoms",
    tags=["Diagnostics"],
)
# app.include_router(knowledge_graph.router, prefix="/api/knowledge-graph", tags=["KnowledgeGraph"])
app.include_router(
    escalation_router.router,
    prefix="/api/escalation",
    tags=["Escalation"],
)

# ---------------------------------------------------------------------------
# Core routes
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["Health"])
async def health_check():
    """Liveness probe – returns 200 when the server is up."""
    return {"status": "ok"}


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Welcome to TechSense API",
        "docs": "/api/docs",
        "health": "/api/health",
    }
