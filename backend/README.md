# TechSense Backend 🛠️

> AI-powered elevator fault diagnostic API — built with **FastAPI**, **NetworkX** (knowledge graph), **SQLAlchemy + SQLite**, and **Google Gemini** LLM reasoning.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Quick Start (Local)](#quick-start-local)
4. [Environment Variables](#environment-variables)
5. [API Endpoints](#api-endpoints)
6. [Deploying to Render](#deploying-to-render)
7. [Database](#database)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [FastAPI 0.135](https://fastapi.tiangolo.com/) | Async REST API with automatic OpenAPI docs |
| **ASGI Server** | [Uvicorn 0.42](https://www.uvicorn.org/) | High-performance ASGI server |
| **Knowledge Graph** | [NetworkX 3.6](https://networkx.org/) | In-memory fault-cause graph traversal |
| **ORM / DB** | [SQLAlchemy 2.0](https://www.sqlalchemy.org/) + SQLite | Session persistence & audit logs |
| **Data Validation** | [Pydantic v2](https://docs.pydantic.dev/) | Request/response schema enforcement |
| **LLM** | [Google Gemini 1.5 Flash](https://ai.google.dev/) | Optional LLM-powered diagnostics |
| **Config** | [python-dotenv](https://pypi.org/project/python-dotenv/) | `.env` loading |
| **Deployment** | [Render.com](https://render.com/) | Cloud hosting via `render.yaml` |

---

## Project Structure

```
tech_sense_backend/
├── app/
│   ├── main.py                    # FastAPI entry point: CORS, routers, startup
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py             # Pydantic request/response models
│   ├── services/
│   │   ├── __init__.py
│   │   ├── knowledge_graph.py     # NetworkX graph — fault-cause scoring & traversal
│   │   ├── diagnostic_engine.py   # Gemini-powered diagnostic runner (with fallback)
│   │   └── escalation_service.py  # Ticket creation and routing logic
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── diagnostic.py          # /api/symptoms/* endpoints
│   │   └── escalation.py          # /api/escalation/* endpoints
│   ├── db/
│   │   ├── __init__.py
│   │   └── database.py            # SQLAlchemy engine, Base, SessionLocal, ORM models
│   └── data/
│       └── seed_graph.json        # Knowledge-graph bootstrap data
├── .env                           # Local env vars (git-ignored)
├── .gitignore
├── Procfile                       # Heroku-compatible process file
├── render.yaml                    # Render.com service definition
├── requirements.txt               # Pinned Python dependencies
└── README.md
```

---

## Quick Start (Local)

### 1. Clone the repository

```bash
git clone <repo-url>
cd tech_sense_backend
```

### 2. Create & activate a virtual environment

```powershell
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file at the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///./tech_sense.db
FRONTEND_ORIGIN=http://localhost:5173
PRODUCTION_ORIGIN=                       # leave blank for local dev
EXTRA_FRONTEND_ORIGINS=                  # optional comma-separated extras
```

> **Note:** `GEMINI_API_KEY` is required only for the LLM-powered diagnostic flow.
> The knowledge-graph endpoints (`/clarify`, `/diagnose`) work **without** it.

### 5. Run the development server

```bash
uvicorn app.main:app --reload
```

The API will be available at **http://127.0.0.1:8000**

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | — | For LLM features | Google Gemini API key |
| `DATABASE_URL` | `sqlite:///./tech_sense.db` | No | SQLAlchemy connection string |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | No | Primary CORS allowed origin |
| `PRODUCTION_ORIGIN` | `""` | For prod | Production frontend URL (e.g. `https://techsense.vercel.app`) |
| `EXTRA_FRONTEND_ORIGINS` | `""` | No | Comma-separated extra CORS origins |

---

## API Endpoints

Interactive docs: **`/api/docs`** (Swagger UI) · **`/api/redoc`** (ReDoc)

### Health & Info

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Welcome message + links |
| `GET` | `/api/health` | Liveness probe — returns `{"status": "ok"}` |
| `GET` | `/api/docs` | Swagger UI (interactive) |
| `GET` | `/api/redoc` | ReDoc UI |
| `GET` | `/api/openapi.json` | Raw OpenAPI schema |

---

### Diagnostics — `/api/symptoms`

#### `POST /api/symptoms/clarify`

Extracts keywords from a free-text elevator symptom, queries the knowledge graph, and returns targeted clarifying questions when the fault cause is ambiguous.

- **Pure graph logic** — no LLM call, target latency < 100 ms
- Returns questions only when top causes are within 15 confidence points of each other

**Request body:**

```json
{
  "symptom": "The elevator door keeps opening and closing without stopping"
}
```

**Response:**

```json
{
  "questions": [
    {
      "id": "q_door_which_door",
      "question_text": "Which door is affected?",
      "options": ["Landing door only (floor level)", "Car door only (cabin level)", "Both landing and car door", "Not sure"]
    }
  ],
  "matched_causes": ["Door operator belt slipping", "Safety edge sensor fault"],
  "ambiguous": true
}
```

---

#### `POST /api/symptoms/diagnose`

Accepts the original symptom plus the technician's clarifying answers. Applies confidence boosts to graph results and returns the top-3 ranked fault causes with fix steps and required parts. Each session is persisted to `service_history`.

**Request body:**

```json
{
  "symptom": "The elevator door keeps opening and closing",
  "answers": [
    { "question_id": "q_door_which_door", "answer": "Car door only (cabin level)" },
    { "question_id": "q_door_sound", "answer": "Door starts closing then reverses" }
  ]
}
```

**Response:**

```json
{
  "results": [
    {
      "rank": 1,
      "cause_title": "Safety edge / light curtain obstruction",
      "confidence_percent": 87,
      "fix_steps": ["Check for obstructions in the door beam path", "..."],
      "required_parts": ["Light curtain module", "Safety edge strip"]
    }
  ],
  "session_id": "uuid-..."
}
```

---

### Escalation — `/api/escalation`

#### `POST /api/escalation/generate`

Composes a structured, human-readable brief from the session data (symptom, Q&A, top diagnosis) suitable for a remote expert. Uses **pure string templating** — no LLM — so latency is sub-millisecond.

**Request body:**

```json
{
  "symptom": "Elevator door keeps opening and closing",
  "questions_and_answers": [
    { "question": "Which door is affected?", "answer": "Car door only" }
  ],
  "top_diagnosis": {
    "rank": 1,
    "cause_title": "Safety edge obstruction",
    "confidence_percent": 87,
    "fix_steps": ["Inspect door beam path"],
    "required_parts": ["Light curtain module"]
  }
}
```

**Response:**

```json
{
  "symptomSummary": "Elevator door keeps opening and closing.",
  "questionsAsked": [...],
  "topDiagnosis": {...},
  "confidenceScore": 87,
  "suggestedAction": "High confidence — proceed with targeted repair using the fix steps below..."
}
```

---

## Deploying to Render

The repository includes a `render.yaml` (Infrastructure-as-Code) for one-click deployment.

### Steps

1. **Push this repo to GitHub.**

2. **Go to [render.com](https://render.com)** → New → Web Service → Connect your GitHub repo.

3. Render will auto-detect `render.yaml` and pre-fill all settings:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Python version:** 3.11

4. **Set secret environment variables** in the Render dashboard (do **not** commit these):
   - `GEMINI_API_KEY` — your Google AI Studio key
   - `PRODUCTION_ORIGIN` — your deployed frontend URL (e.g. `https://techsense.vercel.app`)

5. Click **Deploy**. Render streams build logs in real-time.

6. Once deployed, your API base URL will be `https://techsense-api.onrender.com` (or similar). Update the frontend's `VITE_API_URL` env var to point to it.

### Procfile (alternative hosts)

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

> **Persistent disk (SQLite):** SQLite data is ephemeral on Render's free tier.
> Uncomment the `disk:` block in `render.yaml` to mount a 1 GB persistent disk,
> or swap `DATABASE_URL` for a Render-managed PostgreSQL connection string.

---

## Database

Three SQLAlchemy ORM tables are auto-created on first startup via `init_db()`:

| Table | Purpose |
|---|---|
| `diagnostic_records` | LLM diagnostic run outputs |
| `escalation_tickets` | Human escalation tickets |
| `service_history` | Audit log of every fault diagnosis session |

The default SQLite file (`tech_sense.db`) is git-ignored. For production, use a persistent disk or Postgres.
