# High Level Design (HLD)
## AI Research Impact Summariser
**Version:** 2.0  
**Date:** 2026-05-18

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Architecture Style](#2-architecture-style)
3. [Component Diagram](#3-component-diagram)
4. [Data Flow](#4-data-flow)
5. [Agentic Pipeline Architecture](#5-agentic-pipeline-architecture)
6. [External Integrations](#6-external-integrations)
7. [Technology Stack](#7-technology-stack)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Security Architecture](#9-security-architecture)
10. [Key Design Decisions](#10-key-design-decisions)

---

## 1. System Overview

The AI Research Impact Summariser is a **two-tier web application** with an agentic AI pipeline embedded in the backend tier. The system converts a paper identifier into a multi-source, evidence-grounded impact analysis in a single HTTP round-trip.

```
╔══════════════════════════════════════════════════════════════════════╗
║                         USER'S BROWSER                               ║
║  ┌──────────────┐   ┌──────────────────────────────────────────────┐ ║
║  │  LandingPage  │   │               Dashboard SPA                  │ ║
║  │  (React SPA)  │   │  • Search Form    • Agent Status Strip       │ ║
║  │               │   │  • Summary Panel  • Evidence + Trace Panel   │ ║
║  │  LoginModal   │   │  • REF Report     • Search History Sidebar   │ ║
║  └──────────────┘   └──────────────────────────────────────────────┘ ║
╚══════════════════════════╤═══════════════════════════════════════════╝
                           │  HTTPS POST /api/analyze
                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║                    FASTAPI BACKEND (Uvicorn)                          ║
║  ┌──────────────────────────────────────────────────────────────┐    ║
║  │                    LangGraph Pipeline                         │    ║
║  │                                                              │    ║
║  │  [metadata_node] → [retrieval_node] → [rag_node]            │    ║
║  │         ↓                 ↓                ↓                 │    ║
║  │  [synthesis_node] ←───────────────────────┘                 │    ║
║  │         ↓                                                    │    ║
║  │   [ref_node] → END                                           │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║              │          │          │          │                       ║
║        ChromaDB    Gemini API  HF Embed    httpx                     ║
║       (local disk) (google)   (optional)  (async)                   ║
╚══════════════════════════╤═══════════════════════════════════════════╝
                           │  Concurrent async HTTP calls
           ┌───────────────┼───────────────────────────────┐
           ▼               ▼               ▼               ▼
      [CrossRef]  [Semantic Scholar]  [OpenAlex]       [GitHub]
                                                    [Google Patents]
```

---

## 2. Architecture Style

### 2.1 Primary: Agentic Microservice
The backend is organized as an **agentic pipeline** — a directed acyclic graph of autonomous agents each responsible for a single concern (metadata, retrieval, embedding, synthesis). The LangGraph framework defines the graph topology and manages state propagation between agents.

This differs from a monolithic pipeline (sequential function calls) in that:
- Each node is independently testable and replaceable
- State is typed via `TypedDict` — no hidden shared mutable state
- The graph can be extended (e.g., adding a `policy_node`) without touching existing nodes

### 2.2 Secondary: Frontend-Backend Separation
The React SPA and FastAPI service are completely decoupled. They communicate exclusively through the documented REST API. This enables:
- Independent deployment and scaling
- Independent technology upgrades
- Easy API testing with tools like `httpx` or Postman

### 2.3 Tertiary: Glass-Box Pattern
All synthesized output is paired with the evidence items that generated it. The frontend presents both the AI narrative and the raw retrieved evidence simultaneously, enabling the user to audit every claim. This is the "Glass-Box" design principle — not a black box AI, but a transparent reasoning engine.

---

## 3. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND TIER                               │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │  main.tsx │  │LandingPage│  │LoginModal │  │    Dashboard.tsx  │  │
│  │ (Router)  │  │           │  │           │  │                   │  │
│  │           │  │ Landing   │  │ Auth gate │  │ • Query form      │  │
│  │ BrowserR  │  │ hero +    │  │ (local    │  │ • Agent status    │  │
│  │ outer     │  │ features  │  │ storage)  │  │ • Summary panel   │  │
│  │           │  │           │  │           │  │ • Evidence panel  │  │
│  │ /          │  │           │  │           │  │ • REF report      │  │
│  │ /dashboard│  │           │  │           │  │ • Trace log       │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────────┘  │
│                                                                     │
│  State: React useState + useMemo + localStorage (cache + history)   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ REST API
┌───────────────────────────────▼─────────────────────────────────────┐
│                         BACKEND TIER                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  main.py  —  FastAPI Application                             │   │
│  │  • CORS middleware (origins from ALLOWED_ORIGINS env)        │   │
│  │  • GET /health                                               │   │
│  │  • POST /api/analyze  →  analyze_paper(query)               │   │
│  └──────────────────────────┬─────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼─────────────────────────────────┐    │
│  │  services.py  —  LangGraph Analysis Graph                   │    │
│  │                                                             │    │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │    │
│  │  │metadata_node│──►│retrieval_node│──►│    rag_node     │  │    │
│  │  │             │   │              │   │                 │  │    │
│  │  │ CrossRef    │   │ • Scholar    │   │ • embed texts   │  │    │
│  │  │ DOI lookup  │   │ • OpenAlex   │   │ • upsert Chroma │  │    │
│  │  │ Title search│   │ • GitHub     │   │ • query Chroma  │  │    │
│  │  │             │   │ • Patents    │   │                 │  │    │
│  │  └─────────────┘   └──────────────┘   └────────┬────────┘  │    │
│  │                                                 │           │    │
│  │  ┌──────────────────────────────────────────────▼────────┐  │    │
│  │  │               synthesis_node                          │  │    │
│  │  │  • generate_impact_summary() → Gemini API             │  │    │
│  │  │  • fallback: deterministic template (no API key)      │  │    │
│  │  │  • evaluate_faithfulness() → Gemini-as-judge          │  │    │
│  │  └──────────────────────────────┬────────────────────────┘  │    │
│  │                                 │                           │    │
│  │  ┌──────────────────────────────▼────────────────────────┐  │    │
│  │  │                   ref_node                            │  │    │
│  │  │  • generate_ref_report() → Gemini API                 │  │    │
│  │  │  • fallback: 4-section deterministic REF template     │  │    │
│  │  └───────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────┐  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │  rag.py    │  │     llm.py      │  │       models.py          │  │
│  │            │  │                 │  │                          │  │
│  │ Embedding  │  │ Gemini API      │  │ Pydantic schemas:        │  │
│  │ Provider   │  │ • generate_     │  │ AnalyzeRequest           │  │
│  │ (HF/hash)  │  │   impact_summ.  │  │ AnalyzeResponse          │  │
│  │            │  │ • generate_ref_ │  │ PaperMetadata            │  │
│  │ ChromaDB   │  │   report()      │  │ EvidenceItem             │  │
│  │ collection │  │ • evaluate_     │  │ ImpactSection            │  │
│  │ index/query│  │   faithfulness()│  │ AgentStatus / TraceLog   │  │
│  └────────────┘  └─────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      PERSISTENCE TIER                               │
│                                                                     │
│  ┌────────────────────────────────────┐  ┌────────────────────────┐ │
│  │  ChromaDB (disk: backend/.data/)   │  │  Browser localStorage  │ │
│  │  Collection: research_impact_      │  │  • cache_<query>       │ │
│  │  evidence                          │  │  • searchHistory       │ │
│  │  • 384-dim vectors                 │  │  • isAuthenticated     │ │
│  │  • Persistent upsert per analysis  │  └────────────────────────┘ │
│  └────────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow

### 4.1 Request Flow (Happy Path)

```
User types DOI → clicks Analyze
       │
       ▼
[Dashboard.tsx] checks localStorage cache
       │ (miss)
       ▼
POST /api/analyze {query: "10.1038/nature14539"}
       │
       ▼
[FastAPI] validate AnalyzeRequest (Pydantic)
       │
       ▼
[analyze_paper()] initialize AnalysisState
       │
       ▼
[metadata_node]
  └─► CrossRef DOI lookup (httpx, 12s timeout)
      ├─ success → PaperMetadata{title, authors, year, doi, abstract}
      └─ fail    → PaperMetadata{title=raw_query}  [status: warning]
       │
       ▼
[retrieval_node] — 5 concurrent tasks via asyncio.gather:
  ├─► Semantic Scholar (paper citations × 20)
  ├─► OpenAlex fallback (title search × 8)
  ├─► OpenAlex enrichment (topics, funders, OA links)
  ├─► GitHub repository search (× 6)
  └─► Google Patents XHR (× 5)
  → dedupe_evidence() → ≤ ~39 raw evidence items
       │
       ▼
[rag_node]
  ├─► evidence_text() → list of strings
  ├─► EmbeddingProvider.embed() → 384-dim vectors
  ├─► ChromaDB collection.upsert()
  └─► collection.query() → 6 context chunks
       │
       ▼
[synthesis_node]
  ├─► generate_impact_summary(metadata, citations, evidence, topics, rag_contexts)
  ├─► Gemini API → summary string (fallback: deterministic template)
  ├─► build 4 ImpactSections (deterministic)
  └─► evaluate_faithfulness() → 0.0–1.0 score
       │
       ▼
[ref_node]
  ├─► build_ref_prompt()
  ├─► generate_ref_report() → Gemini API
  └─► fallback: deterministic 4-section template
       │
       ▼
[analyze_paper()] serialize to dict (cap evidence at 32)
       │
       ▼
[FastAPI] AnalyzeResponse JSON response
       │
       ▼
[Dashboard.tsx] setResult() → re-render all panels
       │
       ▼
localStorage.setItem(cache_key, JSON)
```

### 4.2 Evidence Enrichment Flow

```
5 external APIs → raw API payloads
       │
       ├── Semantic Scholar → EvidenceItem(kind="citation") × 20
       ├── OpenAlex fallback → EvidenceItem(kind="citation") × 8
       ├── OpenAlex enrichment → EvidenceItem(kind="full_text"|"funding") + topics[]
       ├── GitHub → EvidenceItem(kind="code") × 6
       └── Google Patents → EvidenceItem(kind="patent") × 5
       │
       ▼
dedupe_evidence() — key: (url or title).lower()
       │
       ▼
Merged evidence list (up to ~39 unique items)
       │
       ▼ (in rag_node)
evidence_text() per item: kind + title + authors + source + snippet + metric
       │
       ▼
EmbeddingProvider:
  Try: SentenceTransformer("all-MiniLM-L6-v2").encode() → L2-normalized 384-vectors
  Fall: hash_embedding(text, 384) → SHA-256 token-level vectors
       │
       ▼
ChromaDB upsert (stable_id = SHA-1 of doi|kind|url|index)
       │
       ▼
ChromaDB query (query = title + abstract + topics + "research impact...")
  → top-6 most semantically similar chunks
       │
       ▼
rag_contexts[] → passed to synthesis_node
```

---

## 5. Agentic Pipeline Architecture

### 5.1 LangGraph State Machine

The pipeline is defined as a LangGraph `StateGraph` with `AnalysisState` (TypedDict) as the shared state type.

```
START
  │
  ▼
[metadata_node]         ← resolves paper identity
  │
  ▼
[retrieval_node]        ← parallel multi-source evidence gathering
  │
  ▼
[rag_node]              ← semantic embedding + contextual retrieval
  │
  ▼
[synthesis_node]        ← summary generation + guardrail
  │
  ▼
[ref_node]              ← REF case study generation
  │
  ▼
END
```

**Sequential edges only** — the current graph is a linear DAG (no branches or loops). This ensures deterministic execution ordering:
- `metadata` must complete before `retrieval` (needs `metadata.doi` and `metadata.title` for API queries)
- `retrieval` must complete before `rag` (needs `evidence` list)
- `rag` must complete before `synthesis` (needs `rag_contexts`)
- `synthesis` must complete before `ref_report` (needs `summary`, `faithfulness`, `model_provider`)

### 5.2 AnalysisState Fields

| Field | Type | Set By |
|---|---|---|
| `query` | `str` | Caller |
| `metadata` | `PaperMetadata` | `metadata_node` |
| `citation_count` | `int` | `retrieval_node` |
| `topics` | `list[str]` | `retrieval_node` |
| `evidence` | `list[EvidenceItem]` | `retrieval_node` |
| `statuses` | `list[AgentStatus]` | Each node |
| `logs` | `list[TraceLog]` | Each node (appended) |
| `rag_contexts` | `list[str]` | `rag_node` |
| `embedding_provider` | `str` | `rag_node` |
| `summary` | `str` | `synthesis_node` |
| `sections` | `list[ImpactSection]` | `synthesis_node` |
| `faithfulness` | `float` | `synthesis_node` |
| `limitations` | `list[str]` | `synthesis_node` |
| `model_provider` | `str` | `synthesis_node` |
| `guardrail_status` | `str` | `synthesis_node` |
| `ref_report` | `str` | `ref_node` |

### 5.3 Fault Tolerance Strategy

Each node wraps external calls in `try/except`. Failures produce `warning`-state `AgentStatus` entries and continue:

```
metadata_node failure  → PaperMetadata(title=raw_query)      [pipeline continues]
retrieval_node failure → empty evidence list                  [pipeline continues]
rag_node failure       → empty rag_contexts                   [synthesis runs without RAG]
HF generation failure  → deterministic template used          [synthesis continues]
HF faithfulness fail   → heuristic score_faithfulness()       [guardrail continues]
```

---

## 6. External Integrations

### 6.1 CrossRef
- **Purpose:** Authoritative paper metadata (title, authors, year, DOI, abstract)
- **Endpoint:** `GET /works/{doi}` or `GET /works?query.title=...&rows=1`
- **Polite pool:** User-Agent header with `mailto:` address enables better rate limits
- **Fallback:** Raw query string used as title on any failure

### 6.2 Semantic Scholar
- **Purpose:** Primary citation count + citing paper list
- **Endpoint:** `GET /paper/{paper_id}?fields=title,year,authors,citationCount,citations.*`
- **Auth:** Optional `x-api-key` header (higher rate limit)
- **Fallback:** OpenAlex (FR-04)

### 6.3 OpenAlex
- **Dual role:**
  1. Citation fallback: `GET /works?search=<title>&per-page=8`
  2. Enrichment: `GET /works/doi:<doi>` or title search → extracts topics, funders, OA links
- **Inverted abstract reconstruction:** `abstract_inverted_index` (word → position map) is reconstructed to plain text (first 900 chars)

### 6.4 GitHub
- **Purpose:** Detect if the paper's method/system has been implemented as a repository
- **Endpoint:** `GET /search/repositories?q="<title>"&sort=stars&order=desc&per_page=6`
- **Anti-noise filter:** `meaningful_title_terms()` requires 2+ non-generic terms before searching

### 6.5 Google Patents
- **Purpose:** Detect commercial/industrial patent adoption
- **Endpoint:** `GET /xhr/query?url=q%3D"<title>"`
- **Data extraction:** `results.cluster[0].result[]` → patent number, title, snippet, assignee

---

## 7. Technology Stack

### 7.1 Backend

| Component | Technology | Version | Role |
|---|---|---|---|
| Web framework | FastAPI | 0.115.6 | REST API, middleware, request validation |
| ASGI server | Uvicorn[standard] | 0.32.1 | HTTP server with lifespan support |
| HTTP client | httpx | 0.28.1 | Async external API calls |
| Data validation | Pydantic | 2.10.3 | Request/response schemas, type safety |
| Env management | python-dotenv | 1.0.1 | Load `.env` file in development |
| Agent framework | LangGraph | 1.2.0 | State graph orchestration |
| Vector database | ChromaDB | 1.5.9 | Persistent evidence vector store |
| Embedding model | sentence-transformers | 3.4.1 | `all-MiniLM-L6-v2` semantic embeddings |
| LLM API | Google Gemini API | — | `gemini-2.5-flash` for summary, REF report, faithfulness judging |

### 7.2 Frontend

| Component | Technology | Version | Role |
|---|---|---|---|
| UI framework | React | 18.x | Component rendering |
| Language | TypeScript | 5.x | Type-safe component development |
| Build tool | Vite | 5.x | Dev server, HMR, production build |
| Routing | React Router | 6.x | SPA routing (`/`, `/dashboard`) |
| Icons | Lucide React | latest | UI iconography |
| Test framework | Vitest + Testing Library | latest | Component unit tests |

### 7.3 Infrastructure

| Component | Technology | Role |
|---|---|---|
| Containerization | Docker | Isolated runtime per service |
| Orchestration | Docker Compose | Multi-service local development |
| Frontend serving | Nginx | Static file serving in production container |
| CI/CD | GitHub Actions | Lint, test, build on push |

---

## 8. Deployment Architecture

### 8.1 Local Development (Default)

```
Vite dev server  :5173  ──► http://localhost:8000/api/analyze
FastAPI/Uvicorn  :8000

ChromaDB data   → backend/.data/chroma/  (gitignored)
HF model cache  → ~/.cache/huggingface/  (auto-downloaded on first use)
```

### 8.2 Docker Compose

```yaml
Services:
  backend:
    build: backend/Dockerfile
    ports: 8000:8000
    env_file: backend/.env
    volumes: backend/.data:/app/.data
  frontend:
    build: frontend/Dockerfile
    ports: 80:80
    depends_on: backend
```

### 8.3 Cloud Deployment (Target)

```
          [CDN / Nginx]
               │
               ├── / → [Frontend static bundle]  (Firebase Hosting / S3+CloudFront)
               │
               └── /api → [Backend container]    (Cloud Run / Render / Fly.io)
                              │
                         [Persistent volume]
                          ChromaDB .data/
```

**Environment variables required in production:**
- `ALLOWED_ORIGINS` — comma-separated list of frontend origins
- `GITHUB_TOKEN` — optional, increases GitHub API rate limit
- `SEMANTIC_SCHOLAR_API_KEY` — optional, increases Semantic Scholar rate limit
- `GOOGLE_API_KEY` — Gemini API key (required for AI generation; falls back to deterministic without it)
- `GEMINI_MODEL` — override default model (default: `gemini-2.5-flash`)
- `HF_EMBEDDING_MODEL` — override default HF embedding model for RAG

---

## 9. Security Architecture

### 9.1 CORS Policy
```python
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,...").split(",")
CORSMiddleware(allow_origins=allowed_origins, allow_credentials=True)
```
Only explicitly listed origins can make credentialed cross-origin requests. In production, this list must be set to the frontend's deployed origin.

### 9.2 Authentication (Frontend Only)
The current implementation uses a **lightweight localStorage-based auth gate** — `isAuthenticated === "true"`. This is a demo-grade mechanism.

The backend exposes **no authentication middleware** on the `/api/analyze` endpoint — any client that can reach the backend can make requests.

The `dazzling-williamson` worktree branch contains a fuller auth implementation (`auth.py`) supporting:
- Firebase ID tokens (Google/GitHub sign-in via Firebase Auth)
- LinkedIn JWTs (HS256, signed with `LINKEDIN_JWT_SECRET`)

### 9.3 Input Validation
- `AnalyzeRequest.query` is validated: min 2 chars, max 500 chars (Pydantic `Field`)
- DOI regex extraction is non-greedy and safe against ReDoS
- HTML tags are stripped from CrossRef abstracts before use
- `meaningful_title_terms()` prevents overly generic GitHub searches

### 9.4 Secret Management
All secrets are environment variable-only. No secrets are committed to source control (`.env` is gitignored).

---

## 10. Key Design Decisions

### 10.1 LangGraph over Ad-hoc Orchestration
**Decision:** Use LangGraph `StateGraph` instead of sequential function calls.  
**Rationale:** State machine approach gives each agent a clear boundary, enables future branching (e.g., retry on failure, parallel synthesis paths), makes the execution graph inspectable and testable, and avoids shared mutable state bugs.

### 10.2 ChromaDB over External Vector DB
**Decision:** Use embedded ChromaDB with persistent on-disk storage.  
**Rationale:** Zero infrastructure dependency, runs locally and in containers without a separate database service, upsert semantics allow re-indexing the same evidence items across runs without duplication.

### 10.3 Hash Embedding Fallback
**Decision:** When `sentence-transformers` is unavailable, use SHA-256 token-level hash embeddings.  
**Rationale:** Enables the RAG system to function (with lower semantic quality) in minimal environments (e.g., resource-constrained containers) without requiring PyTorch or model downloads.

### 10.4 Deterministic Synthesis Fallback
**Decision:** When `GOOGLE_API_KEY` is absent or Gemini returns an error, use template-based text synthesis.  
**Rationale:** Makes the system functional in environments without API credentials (local dev, CI). The fallback is entirely offline, requires no model downloads, and still produces a useful structured response.

### 10.5 Client-Side Caching
**Decision:** Cache full API responses in `localStorage` keyed by query string.  
**Rationale:** Eliminates repeated API calls for the same paper (external APIs have rate limits). The cache never expires in the current implementation — suitable for a demo; would need TTL in production.

### 10.6 Concurrent Retrieval
**Decision:** Run Semantic Scholar, OpenAlex fallback, OpenAlex enrichment, GitHub, and Google Patents concurrently via `asyncio.gather`.  
**Rationale:** Each external API call takes 5–15 seconds. Sequential execution would exceed 60 seconds total. Concurrent execution caps the retrieval phase at ~15 seconds (slowest single API).

### 10.7 Evidence Deduplication by URL/Title
**Decision:** Deduplicate across all 5 sources by normalized (URL or title).  
**Rationale:** Semantic Scholar and OpenAlex often return the same paper. Without deduplication, the evidence list would contain redundant entries that inflate metrics and dilute the faithfulness signal.
