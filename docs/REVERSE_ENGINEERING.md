# Impact Lab — Complete Reverse Engineering Document
### Supervisor Meeting Preparation Guide

> **Purpose:** This document explains every part of the Impact Lab system from first principles — what it is, why each piece exists, how data flows through it, and every technical decision made. Read this before your Friday meeting and you'll be able to answer any question confidently.

---

## 1. WHAT THE SYSTEM DOES (The 30-Second Pitch)

Impact Lab is an **autonomous multi-agent research impact summariser**. You give it a paper (by DOI, title, or arXiv ID) and within ~6 seconds it:

1. Fetches the paper's metadata (authors, abstract, year) from academic APIs
2. Retrieves evidence of real-world impact — citations, GitHub implementations, patents, policy mentions, funding
3. Stores that evidence in a local vector database (ChromaDB)
4. Queries the vector database to find the most relevant evidence chunks
5. Sends everything to Gemini 2.5 Flash to generate a grounded 200-word impact narrative
6. Scores how faithful the summary is to the evidence (0–1 scale)
7. Returns all of this to the browser with a full audit trail

The distinguishing feature is **glass-box auditability**: every claim in the summary is traceable to the source that triggered it. You can inspect the full agent log, the raw evidence items, and the RAG context chunks.

---

## 2. HIGH-LEVEL ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                        │
│  Landing Page → Login Modal → Dashboard (6 tabs)             │
│  LandingPage.tsx | LoginModal.tsx | Dashboard.tsx            │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTP (JSON)
                         │  POST /api/analyze
                         │  POST /api/evaluate
                         │  POST /api/ref/beta
                         ▼
┌──────────────────────────────────────────────────────────────┐
│               BACKEND (FastAPI + Python)                      │
│                                                              │
│  main.py ─── routes/middleware/rate-limiter                  │
│     │                                                        │
│     ├── services.py ─── LangGraph multi-agent pipeline       │
│     │        │                                               │
│     │        ├── 7 Retrieval Agents (HTTP calls)             │
│     │        │    CrossRef / OpenAlex / SemanticScholar      │
│     │        │    GitHub / Patents / Policy / Funding        │
│     │        │                                               │
│     │        ├── rag.py ── ChromaDB vector store             │
│     │        │    sentence-transformers embedding            │
│     │        │                                               │
│     │        └── hf_synthesis.py ── Gemini 2.5 Flash         │
│     │             generate() / evaluate_faithfulness()       │
│     │                                                        │
│     ├── evaluation.py ── Agentic vs Baseline comparison      │
│     ├── ref_beta.py ─── REF 2029 case study writer           │
│     ├── database.py ─── SQLite persistence                   │
│     ├── access_guard.py ── Author identity verification      │
│     ├── auth.py ──── Firebase JWT + LinkedIn OAuth           │
│     └── validation.py ── Input sanitisation                  │
│                                                              │
│  Databases:                                                  │
│    .data/impact_dataset.db  (SQLite)                        │
│    .data/chroma/            (ChromaDB vector store)          │
└──────────────────────────────────────────────────────────────┘
                         │
                         │  REST API calls (httpx)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   EXTERNAL APIS                               │
│                                                              │
│  CrossRef        api.crossref.org       metadata + authors   │
│  OpenAlex        api.openalex.org       citations + topics   │
│  Semantic Scholar api.semanticscholar.org  citation graph    │
│  GitHub          api.github.com         code implementations │
│  Google Patents  patents.google.com     patent cross-ref     │
│  Europe PMC      europepmc.org          biomedical policy    │
│  UKRI Gateway    gtr.ukri.org           UK grant funding     │
│  Gemini 2.5 Flash generativelanguage.googleapis.com  LLM     │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. BACKEND — FILE-BY-FILE BREAKDOWN

### 3.1 `main.py` — The API Gateway

**Role:** Entry point. Registers all HTTP routes, handles CORS, enforces rate limiting, wires auth middleware.

**Key decisions explained:**

**Rate Limiter (pure Python sliding window):**
```python
_rate_buckets: dict[str, list[float]] = defaultdict(list)

def _check_rate(key, limit, window):
    now = time.time()
    _rate_buckets[key] = [t for t in _rate_buckets[key] if now-t < window]
    if len(_rate_buckets[key]) >= limit:
        raise HTTPException(429, "Too many requests")
    _rate_buckets[key].append(now)
```
- Stores timestamps of recent requests per IP in memory
- On each request: removes timestamps older than the window, counts what's left
- If count ≥ limit → 429. Otherwise → record this timestamp and allow
- No Redis, no external dependency. Resets on server restart (intentional for development)

**Rate limits per endpoint:**
| Endpoint | Limit | Window |
|---|---|---|
| `/api/search` | 20 req | 60 sec |
| `/api/analyze` | 10 req | 60 sec |
| `/api/evaluate` | 5 req | 60 sec |
| `/api/ref/beta` | 5 req | 60 sec |

**Routes summary:**
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/search` | Crossref paper search (returns candidates list) |
| POST | `/api/analyze` | Full pipeline: metadata + evidence + summary |
| GET | `/api/stats` | Total analyses, avg faithfulness |
| GET | `/api/dataset` | Export all analyses (JSON or CSV) |
| GET | `/api/history` | User's past queries (requires auth) |
| POST | `/api/evaluate` | Run agentic pipeline + baseline comparison |
| GET | `/api/evaluate/history` | Past evaluation results |
| POST | `/api/ref/beta` | Generate REF 2029 case study |
| POST | `/api/auth/linkedin/exchange` | LinkedIn OAuth token exchange |

---

### 3.2 `models.py` — Data Contracts (Pydantic)

**Role:** Defines every data shape used across the system. Acts as the single source of truth for what goes in and comes out.

**Key models:**

```
AnalyzeRequest     query: str (2–500 chars)

PaperMetadata      title, authors[], year, doi, abstract, source_url

EvidenceItem       title, url, year, authors[], snippet, source, kind,
                   citation_count, metric_label, metric_value
                   kind = "citation" | "code" | "patent" | "policy" | "funding"

AgentStatus        name, label, state (pending/running/complete/warning/error), detail

TraceLog           timestamp, agent, message, data{}

ImpactSection      title, body  (the structured sections: Academic, Industrial, etc.)

AnalyzeResponse    metadata, summary, sections[], evidence[], agent_statuses[],
                   logs[], faithfulness_score, citation_count, topics[],
                   model_provider, rag_context_count, guardrail_status,
                   limitations[], ref_report
```

**Why Pydantic?** Automatic validation, serialisation to/from JSON, and clear documentation of what each field means. If something doesn't match the schema, FastAPI returns a 422 immediately.

---

### 3.3 `services.py` — The Multi-Agent Pipeline (Core)

**Role:** The heart of the system. Orchestrates 7 retrieval agents in a LangGraph state machine, aggregates their results, and hands off to RAG + LLM synthesis.

**Technology: LangGraph**
LangGraph is a graph-based workflow orchestrator built on top of LangChain. You define:
- **Nodes** = functions that do work (each retrieval agent is a node)
- **Edges** = which node runs after which
- **State** = a TypedDict that flows through all nodes

```python
class PipelineState(TypedDict):
    query: str
    doi: str | None
    metadata: PaperMetadata | None
    evidence: list[EvidenceItem]
    logs: list[TraceLog]
    agent_statuses: list[AgentStatus]
    citation_count: int
    topics: list[str]
    summary: str
    ...
```

**Agent execution graph:**
```
START
  │
  ▼
metadata_node          ← resolves DOI/title via CrossRef
  │
  ▼
[parallel agents]
  ├── openalex_node    ← citations, topics, institutional affiliations
  ├── semantic_node    ← citation graph, highly-cited papers
  ├── github_node      ← code repositories implementing the paper
  ├── patent_node      ← Google Patents cross-reference
  ├── policy_node      ← Europe PMC policy mentions
  └── funding_node     ← UKRI Gateway grants
  │
  ▼
synthesise_node        ← RAG index + Gemini summary + faithfulness score
  │
  ▼
END
```

**How metadata resolution works:**
1. Extract DOI with regex `10\.\d{4,9}/[-._();/:A-Z0-9]+`
2. If DOI found → `GET api.crossref.org/works/{doi}` directly
3. If title → `GET api.crossref.org/works?query.title={q}&rows=3` → pick best match
4. Populates `PaperMetadata` with title, authors, year, abstract, DOI

**How each retrieval agent works:**
- Each is an `async def` function
- Makes HTTP requests via `httpx.AsyncClient`
- Returns `EvidenceItem` objects and `TraceLog` entries
- Uses `state["doi"]` or `state["metadata"].title` as search key

**Evidence deduplication:**
After all agents run, evidence items are deduplicated by URL hash to avoid showing the same paper twice from different sources.

**Deterministic fallback synthesis:**
If Gemini is unavailable, `services.py` builds a summary from templates:
```
"{title} (published {year}) has received {count} citations according to OpenAlex 
and has been implemented in {code_count} GitHub repositories..."
```
This ensures the pipeline always returns something, even without an API key.

---

### 3.4 `rag.py` — Vector Memory (ChromaDB + Embeddings)

**Role:** Stores retrieved evidence as vector embeddings in ChromaDB. Then semantic-similarity searches it to find the most relevant chunks for the LLM prompt.

**Why RAG?**
Without RAG, you'd dump all evidence directly into the LLM prompt. With 30–50 evidence items, that's too many tokens. RAG selects only the 6 most relevant chunks, keeping the prompt focused and the LLM on-task.

**Embedding strategy — tiered:**
```
Tier 1: Hugging Face sentence-transformers (if installed)
         Model: sentence-transformers/all-MiniLM-L6-v2
         Dimension: 384
         Quality: semantic similarity

Tier 2: Deterministic hash embedding (always available)
         SHA-256 each token → map to vector position
         Quality: keyword matching only
```

The system tries to load the HF model on first use. If it fails (GPU/RAM issues), it silently falls back to hash embeddings and logs the reason.

**ChromaDB persistence:**
- Data stored at `backend/.data/chroma/`
- Uses `PersistentClient` → survives server restarts
- Collection named `"research_impact_evidence"`
- Each document keyed by `SHA1(doi + kind + url + index)` → deterministic, upsert-safe

**Retrieval query:**
```python
query = "\n".join([
    metadata.title,
    metadata.abstract or "",
    " ".join(topics),
    "research impact applications citation adoption methodology influence"
])
```
This compound query biases retrieval toward impact-relevant chunks.

---

### 3.5 `hf_synthesis.py` — LLM Interface (Gemini 2.5 Flash)

**Role:** All LLM calls live here. Wraps Google's Gemini REST API in a clean interface.

**Why REST not SDK?** Avoids the `google-generativeai` package dependency. Uses `httpx` directly — one fewer dependency, easier to audit.

**The `_call()` function:**
```python
def _call(system, user, max_tokens=500) -> str | None:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}
    }
    resp = httpx.post(url, params={"key": api_key}, json=payload, timeout=90)
    # parse candidates[0].content.parts[0].text
```

**Critical: Why `maxOutputTokens` must be high (2000+)**
Gemini 2.5 Flash is a "thinking model" — it uses tokens for internal chain-of-thought reasoning *before* generating output. Those thinking tokens consume `maxOutputTokens` budget. If you set it to 400, the model exhausts its budget after ~13 words of output. This was a bug we fixed: 400 → 2000 for summaries, 4000 for REF reports.

**Three methods on `HFSynthesizer`:**

| Method | Input | Output | Token budget |
|---|---|---|---|
| `generate()` | metadata + evidence + RAG chunks | 200-word impact narrative | 2000 |
| `generate_ref_report()` | metadata + evidence + summary | 400-word REF case study | 4000 |
| `evaluate_faithfulness()` | summary + evidence | 0–1 score | 50 |

**Faithfulness scoring:**
The model is asked: *"Rate faithfulness 0–10, integer only. 0=hallucinated, 10=every claim supported."*
Response is parsed with regex `\d+`, clamped to 0–10, divided by 10. Result: a float like `0.82`.

**On 429 (rate limit) → return None immediately:**
No retry/sleep. A sleep inside `asyncio.to_thread` would block a uvicorn worker thread, causing the HTTP request to time out. Instead, None triggers the deterministic fallback.

---

### 3.6 `evaluation.py` — Agentic vs Baseline Comparison

**Role:** Provides a scientific evaluation of how much better the multi-agent pipeline is vs a naive baseline.

**What is the baseline?**
The "naive baseline" does what a researcher would do manually:
1. Fetch abstract from CrossRef (one API call)
2. Send abstract to Gemini: *"Write a 200-word impact summary"*
3. No citations, no GitHub, no patents, no RAG, no faithfulness scoring

**What the comparison measures:**
```
agentic_faithfulness   — how grounded the agent's summary is (0–1)
baseline_faithfulness  — how grounded the naive summary is (0–1)
agentic evidence_count — how many sources the agent found
baseline evidence_count — always 1 (CrossRef abstract only)
verdict                — plain-English conclusion
```

**Verdict logic:**
```python
faith_delta = agentic_faith - baseline_faith
if faith_delta >= 0.15 and ag_ev > bl_ev:
    "Agentic pipeline significantly outperforms baseline"
elif faith_delta >= 0.05:
    "Agentic pipeline moderately outperforms baseline"
elif abs(faith_delta) < 0.05:
    "Approaches comparable; agentic provides more evidence breadth"
else:
    "Baseline competitive — consider tuning retrieval"
```

**JATS XML stripping:**
CrossRef returns abstracts with XML tags like `<jats:p>`, `<jats:italic>`. These are stripped before sending to the LLM:
```python
def _strip_jats(text):
    cleaned = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", cleaned).strip()
```

---

### 3.7 `ref_beta.py` — REF 2029 Case Study Writer

**Role:** Generates a formal UK Research Excellence Framework (REF) 2029 impact case study — the structured document universities submit to demonstrate research impact.

**REF structure generated:**
```
### 1. Summary          (100–150 words)
### 2. Underpinning Research  (200–300 words)
### 3. References to the Research  (5–10 references)
### 4. Details of the Impact   (700–800 words) ← main narrative
### 5. Sources to Corroborate  (5–10 numbered sources)

Target total: 1800–2400 words
```

**Two-agent design:**
1. **Writer agent** — LLM call with `_WRITER_SYSTEM` prompt. Generates the full case study. Max tokens: 8000.
2. **Auditor agent** — Second LLM call with `_AUDITOR_SYSTEM`. Reviews the case study and outputs JSON flags for unverified claims.

```python
# Auditor outputs structured JSON:
[
  {"claim": "adopted by 40 NHS trusts", "section": "Details of the Impact",
   "reason": "No evidence in retrieved data", "severity": "critical"},
  {"claim": "influenced NICE guidelines", "section": "Summary",
   "reason": "Policy evidence thin", "severity": "warning"}
]
```

**Word count validation:**
```python
def check_word_counts(case_study):
    # Splits on ### headings, counts words per section
    return {
        "total": total, "summary": summary_wc, "research": research_wc, "impact": impact_wc,
        "total_ok": 1800 <= total <= 2600,
        "summary_ok": 80 <= summary_wc <= 180,
        "research_ok": 150 <= research_wc <= 380,
        "impact_ok": 600 <= impact_wc <= 950
    }
```

**Author guard:** Before running Beta REF, `check_author_access()` verifies the logged-in user is an author. In DEMO_MODE=true (current setting), this check runs but never blocks.

---

### 3.8 `database.py` — SQLite Persistence

**Role:** Persists all analyses and evaluations. Provides stats for the sidebar display.

**Two tables:**

**`analyses`** — every `/api/analyze` call:
```sql
CREATE TABLE analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uid TEXT,          -- Firebase UID or NULL (demo)
    doi TEXT,
    title TEXT NOT NULL,
    authors TEXT,           -- JSON array
    year INTEGER,
    citation_count INTEGER,
    topics TEXT,            -- JSON array
    faithfulness_score REAL,
    guardrail_status TEXT,
    model_provider TEXT,    -- "gemini:gemini-2.5-flash" or "deterministic"
    summary TEXT,
    evidence_count INTEGER,
    evidence_kinds TEXT,    -- JSON array of kinds seen
    ref_report TEXT,
    query TEXT,             -- original user input
    created_at TEXT         -- ISO timestamp
)
```

**`evaluations`** — every `/api/evaluate` call:
```sql
CREATE TABLE evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT,
    agentic_faithfulness REAL,
    agentic_evidence_count INTEGER,
    agentic_sources TEXT,       -- JSON array
    agentic_word_count INTEGER,
    agentic_rag_contexts INTEGER,
    baseline_faithfulness REAL,
    baseline_evidence_count INTEGER,
    baseline_word_count INTEGER,
    baseline_elapsed REAL,
    verdict TEXT,
    created_at TEXT
)
```

**`get_stats()`** powers the sidebar:
```python
{
    "total_analyses": 12,
    "avg_faithfulness": 0.75,
    "avg_citations": 24500
}
```

---

### 3.9 `access_guard.py` — Author Identity Verification

**Role:** Checks whether the logged-in user is an author of the paper they're generating a REF case study for. Prevents people from claiming impact for papers they didn't write.

**Algorithm: fuzzy name matching**
```python
def _name_similarity(a, b):
    return difflib.SequenceMatcher(None, normalise(a), normalise(b)).ratio()

def _match_user_to_authors(user_name, authors):
    scores = [_name_similarity(user_name, a) for a in authors]
    best = max(scores); matched = best >= 0.72
    return matched, best_author, best_score
```

**Why 0.72 threshold?** High enough to reject random matches, low enough to handle:
- "J. Smith" matching "John Smith"
- Hyphenated names
- Missing middle names

**DEMO_MODE=true (current):**
- Verification still runs and reports the score
- But `allowed=True` always → never blocks
- This is intentional for testing/demo purposes

---

### 3.10 `validation.py` — Input Sanitisation

**Role:** Validates and classifies user queries before they touch any API.

**Query classification:**
```python
DOI pattern:    10.XXXX/anything    → kind = "doi"
arXiv pattern:  2312.04567          → kind = "arxiv"
BibTeX pattern: @article{...        → kind = "bibtex"
Everything else:                    → kind = "title"
```

**Security — banned patterns:**
```python
_BANNED = ("<script", "javascript:", "\x00", "../", "..\\",
           "drop table", "delete from", "insert into",
           "union select", "--", "exec(", "system(", "os.system", "__import__")
```
Prevents XSS, path traversal, SQL injection, and Python code injection.

**Max length:** 4,000 characters. Prevents token-bomb attacks against the LLM.

---

### 3.11 `auth.py` — Authentication

**Role:** Verifies Firebase JWTs (Google/GitHub) and LinkedIn JWTs (custom). Returns the user's UID for route handlers.

**Two auth paths:**
1. **Firebase** (Google/GitHub): Token from Firebase SDK. Verified by checking Firebase public keys.
2. **LinkedIn**: Custom OAuth 2.0 flow. Backend exchanges auth code for access token, fetches profile, mints a PyJWT signed with `LINKEDIN_SECRET`.

**`get_current_user` dependency:**
All routes that accept auth use `Depends(get_current_user)`. This is optional auth — the endpoint works without a token but provides richer features with one (e.g., history tracking).

---

## 4. FRONTEND — FILE-BY-FILE BREAKDOWN

### 4.1 `main.tsx` — React App Bootstrap

Sets up React Router with two routes:
```
/          → LandingPage
/dashboard → Dashboard (guarded: redirects to / if not authenticated)
/auth/callback → AuthCallback (LinkedIn OAuth redirect handler)
```

Wraps everything in `<AuthProvider>` so auth state is available everywhere.

### 4.2 `LandingPage.tsx` — Marketing Page

**Sections:**
1. **Header** — `i·l Impact Lab` logo + nav links + "Sign in" button
2. **Hero** — Two-column: left = headline + CTA, right = `SpecimenCard` (live preview of what a result looks like)
3. **Sources strip** — Scrolling list of 7 data sources
4. **Capabilities grid** — 6 capability cards (2×3)
5. **CTA strip** — "Ready to trace a paper?"
6. **Footer**

**`SpecimenCard`** shows a fake but realistic example result with `MiniAgentLog` — three animated steps showing what the agent is doing. This is all static data, just for demonstration.

### 4.3 `LoginModal.tsx` — Authentication Modal

Three sign-in paths:
1. **Google** → `loginWithGoogle()` → Firebase popup
2. **GitHub** → `loginWithGithub()` → Firebase popup
3. **LinkedIn** → redirect to LinkedIn OAuth URL
4. **Demo Access** → sets `localStorage.isAuthenticated = "true"`, skips real auth

All errors are caught and displayed. Firebase config errors show a friendly "use Demo Access" message.

### 4.4 `Dashboard.tsx` — Main Application (1300+ lines)

**State variables:**
```typescript
query         — current input box value
result        — AnalyzeResponse from last /api/analyze
loading       — whether /api/analyze is running
evalResult    — comparison from /api/evaluate
evalLoading   — whether /api/evaluate is running
betaResult    — REF case study from /api/ref/beta
betaLoading   — whether /api/ref/beta is running
activeTab     — "overview" | "evidence" | "ref" | "logs" | "eval" | "betaref"
candidates    — list of papers when search returned multiple matches
openSections  — which accordion sections are expanded
history       — sidebar recent queries list
stats         — { total_analyses, avg_faithfulness }
```

**Six tabs explained:**

| Tab | What it shows |
|---|---|
| **Overview** | Impact summary, faithfulness chip, metrics (citations/evidence/patents/etc.), structured sections, limitations |
| **Evidence** | All retrieved evidence items, filterable by kind (citation/code/patent/policy/funding) |
| **REF Report** | Rendered markdown REF impact case study from the pipeline |
| **Debug Logs** | Full trace log table: timestamp, agent, message, data |
| **Evaluation** | Agentic vs Baseline comparison: summaries side-by-side, faithfulness scores, verdict |
| **Beta REF** | AI-generated REF 2029 case study with word count compliance check and flag list |

**`analyze()` function flow:**
```
1. validate input (non-empty)
2. call GET /api/search to find candidates
3. if multiple candidates → show picker modal
4. if one candidate → call POST /api/analyze
5. on success → update result, set activeTab="overview"
6. auto-scroll to results
```

**`AuthorBadge` component:**
Shown in the overview tab. Three states:
- `verified` (green) — user is confirmed author
- `demo` (blue) — demo mode, not verified
- `blocked` (red) — author check failed (never shown in DEMO_MODE)

### 4.5 `AuthContext.tsx` — Global Auth State

React context that holds the current user. Provides:
- `loginWithGoogle()` / `loginWithGithub()` — Firebase
- `loginWithLinkedin()` — redirects to LinkedIn
- `logout()` — clears Firebase session + sessionStorage
- `setLinkedinUser()` — called by AuthCallback after LinkedIn flow completes

Restores LinkedIn session from `sessionStorage` on mount (survives page refresh within a tab, but not between sessions).

### 4.6 `styles.css` — Design System (~2500 lines)

Built to the **Impact Lab design spec** — a clean white academic "researcher journal" aesthetic.

**Design tokens (CSS custom properties):**
```css
--paper:      #FCFCFA   /* page background — warm white */
--linen:      #F4F2EC   /* sidebar, cards — off-white */
--rule:       #E6E3DA   /* dividers — warm grey */
--ink:        #1F2230   /* main text — near-black */
--fg-1:       #2D3142   /* primary text */
--fg-2:       #5C6078   /* secondary text */
--fg-3:       #9399B2   /* placeholder / caption */

--accent:     #3D4ED8   /* indigo-600 — buttons, links */
--sage:       #4F7A5C   /* green — "complete" state */
--ochre:      #A7791B   /* amber — "running" state */
--rust:       #9F3A2E   /* red — "error" state */

--font-serif: 'Source Serif 4'  /* display headings */
--font-sans:  'Inter'           /* UI text */
--font-mono:  'JetBrains Mono'  /* DOIs, timestamps, code */
```

**The `i·l` logo mark:**
```css
.il-logo-mark { font-family: var(--font-serif); font-style: italic; }
.il-logo-dot  { border-radius: 50%; background: var(--accent); /* indigo dot */ }
```

---

## 5. COMPLETE DATA FLOW — "Attention Is All You Need"

Let's trace exactly what happens when you type `Attention Is All You Need` and click **Analyse**.

```
BROWSER
  │
  ├─ 1. GET /api/search?q=Attention+Is+All+You+Need
  │       CrossRef API → returns 5 candidates
  │       Dashboard shows picker → user clicks "Attention Is All You Need"
  │
  ├─ 2. POST /api/analyze  { "query": "Attention Is All You Need" }
  │
BACKEND main.py
  │
  ├─ validate_query() → no banned patterns, length OK
  ├─ rate_limit() → IP bucket has room
  ├─ analyze_paper("Attention Is All You Need")
  │
BACKEND services.py — LangGraph pipeline starts
  │
  ├─ metadata_node:
  │   classify → "title"
  │   GET api.crossref.org/works?query.title=Attention+Is+All+You+Need&rows=3
  │   finds DOI: 10.48550/arXiv.1706.03762
  │   extracts: title, authors (Vaswani et al.), year=2017, abstract
  │   State: { doi: "10.48550/...", metadata: PaperMetadata{...} }
  │
  ├─ [PARALLEL] 6 retrieval agents:
  │   │
  │   ├─ openalex_node:
  │   │   GET api.openalex.org/works?filter=doi:10.48550/arXiv.1706.03762
  │   │   gets: citation_count=~120,000, topics=["NLP","Transformers","Self-Attention"]
  │   │   GET openalex forward_citations → retrieves 20 top citing papers
  │   │   → adds 20+ EvidenceItems (kind="citation")
  │   │
  │   ├─ semantic_node:
  │   │   GET api.semanticscholar.org/graph/v1/paper/10.48550/arXiv.1706.03762/citations
  │   │   → adds most-cited papers that cite this work
  │   │
  │   ├─ github_node:
  │   │   GET api.github.com/search/repositories?q=attention+is+all+you+need+transformer
  │   │   finds repos implementing Transformers
  │   │   → adds EvidenceItems (kind="code") with stars, description
  │   │
  │   ├─ patent_node:
  │   │   GET patents.google.com/... → searches for transformer patents
  │   │   → adds EvidenceItems (kind="patent")
  │   │
  │   ├─ policy_node:
  │   │   GET europepmc.org/... → searches policy docs citing the paper
  │   │   → adds EvidenceItems (kind="policy")
  │   │
  │   └─ funding_node:
  │       GET gtr.ukri.org/... → finds UK grants related to transformers
  │       → adds EvidenceItems (kind="funding")
  │
  ├─ synthesise_node:
  │   │
  │   ├─ rag.py — index_and_retrieve():
  │   │   embed all evidence items (sentence-transformers or hash)
  │   │   upsert to ChromaDB collection "research_impact_evidence"
  │   │   query ChromaDB with compound query (title + abstract + topics + impact keywords)
  │   │   retrieve top 6 most relevant chunks
  │   │
  │   ├─ hf_synthesis.py — hf_synthesizer.generate():
  │   │   builds prompt:
  │   │     system: "You are a rigorous research impact analyst..."
  │   │     user: "Paper: Attention Is All You Need | Citations: 120,000 | Evidence: [list] | RAG: [chunks]"
  │   │   POST generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
  │   │   maxOutputTokens: 2000 (important: thinking model needs this)
  │   │   → returns ~200-word impact narrative
  │   │
  │   └─ hf_synthesizer.evaluate_faithfulness():
  │       sends summary + evidence to Gemini
  │       "Rate 0-10" → returns e.g. "8" → 0.80
  │
  ├─ builds AnalyzeResponse with all fields
  ├─ save_analysis() → writes to SQLite
  │
  ├─ check_author_access() → user not logged in → demo mode → allowed=True
  │
  └─ returns JSON response ~6 seconds total

BROWSER receives response:
  ├─ result state updated → React re-renders
  ├─ activeTab → "overview"
  ├─ Shows: paper title, 0.80 faithfulness chip (green "Strong")
  ├─ Shows: 120,000 citations, N evidence items, code repos, patents
  ├─ Shows: 200-word Gemini summary
  └─ All 6 tabs now populated
```

---

## 6. TECHNOLOGY STACK — WHY EACH WAS CHOSEN

| Technology | Version | Why |
|---|---|---|
| **FastAPI** | 0.115 | Async Python, auto-generates OpenAPI docs, Pydantic integration |
| **LangGraph** | 1.2 | Graph-based agent orchestration, cleaner than LangChain chains |
| **ChromaDB** | 1.5 | Local vector DB, no cloud setup, persists to disk |
| **sentence-transformers** | 3.4 | Best open-source embedding model (all-MiniLM-L6-v2) |
| **httpx** | 0.28 | Async HTTP client (requests is sync-only) |
| **Pydantic** | 2.10 | Data validation, schema docs, JSON serialisation |
| **SQLite** | built-in | Zero-config persistence, sufficient for research prototype |
| **PyJWT** | 2.10 | LinkedIn token signing/verification |
| **React** | 18.3 | Component-based UI, large ecosystem |
| **Vite** | 6.0 | Fast HMR dev server, ES modules |
| **TypeScript** | 5.7 | Type safety, catches errors before runtime |
| **React Router** | 7.15 | SPA routing (landing ↔ dashboard) |
| **Firebase** | 12.13 | Google/GitHub OAuth without writing auth server |
| **Gemini 2.5 Flash** | — | Free tier (50 RPM), thinking model, strong reasoning |
| **Lucide React** | 0.468 | Clean icon library, tree-shakeable |

---

## 7. SECURITY MEASURES

| Layer | Mechanism |
|---|---|
| **Input sanitisation** | `validation.py` bans SQL injection, XSS, path traversal, Python injection patterns |
| **Rate limiting** | Per-IP sliding window on every endpoint |
| **CORS** | Whitelist: only localhost:5173/5174/5175 (add production domain for deployment) |
| **JWT verification** | Firebase public keys for Google/GitHub; HMAC-signed JWT for LinkedIn |
| **Max query length** | 4,000 characters |
| **Author verification** | Fuzzy name matching before REF case study generation |
| **No secrets in frontend** | API keys live in `backend/.env`, never exposed to browser |
| **DEMO_MODE** | Controlled via environment variable, not user input |

---

## 8. KNOWN LIMITATIONS & DESIGN DECISIONS

| Issue | Decision | Reason |
|---|---|---|
| Gemini free tier: 50 RPM | No retry on 429 — return None → fallback | Retry-with-sleep blocks uvicorn threads, causes timeouts |
| Thinking token consumption | `maxOutputTokens: 2000+` for all calls | Gemini 2.5 Flash uses thinking tokens before output |
| Rate limiter resets on restart | In-memory dict, no Redis | Simplicity for prototype; add Redis for production |
| Auth state not server-side | Browser localStorage + sessionStorage | Stateless API; acceptable for prototype |
| Hash embedding fallback | SHA-256 deterministic embeddings | Ensures RAG always works even without GPU/HF access |
| ChromaDB upsert (not insert) | Stable IDs via SHA-1(doi+kind+url+index) | Re-running same paper doesn't duplicate vectors |
| JATS XML in abstracts | Stripped with `re.sub(r"<[^>]+>", " ", text)` | CrossRef returns raw JATS XML in abstract field |

---

## 9. THINGS YOUR SUPERVISOR MIGHT ASK

**Q: Why LangGraph instead of a simple for-loop?**
A: LangGraph gives us a structured state machine where each agent's output is typed and validated. It also enables future parallelism (running agents concurrently) without refactoring. The graph is also visualisable for audit purposes.

**Q: How do you know the summary is accurate?**
A: Two mechanisms. First, the faithfulness score — Gemini judges its own output against the evidence (0–1). Second, full glass-box auditability: the debug logs tab shows every API call made and every evidence item retrieved. Every claim can be traced to a source.

**Q: Why not use GPT-4 or Claude?**
A: Gemini 2.5 Flash has a free tier with 50 RPM, which is sufficient for a prototype. The architecture is model-agnostic — `hf_synthesis.py` can be swapped for any LLM by changing `_call()`.

**Q: What happens if an API is down?**
A: Each retrieval agent has try/except around every HTTP call and fails gracefully — it adds nothing to the evidence list and logs the failure. The pipeline continues with whatever evidence was collected. The synthesis always runs even with zero evidence (using the deterministic fallback).

**Q: How does the REF case study differ from the standard summary?**
A: The standard 200-word summary is an impact narrative for researchers. The REF case study is a 1800–2400 word structured document following UK REF 2029 submission guidelines, with 5 specific sections including underpinning research, pathways to impact, beneficiaries, and sources to corroborate. It also has an auditor agent that flags unverified claims.

**Q: How is this different from just using ChatGPT?**
A: ChatGPT generates from training data — it may hallucinate citations or invent statistics. Impact Lab retrieves real-time evidence from 7 live APIs before generating. Every claim in the output is anchored to a retrieved source with a URL. The faithfulness score measures this grounding quantitatively.

**Q: Can it scale to production?**
A: With three changes: (1) replace in-memory rate limiter with Redis, (2) add PostgreSQL or upgrade SQLite to Postgres for multi-instance deployment, (3) configure production CORS origins. The containerised Docker setup (`docker-compose.yml`) is already production-ready.

---

## 10. QUICK REFERENCE — FILE MAP

```
backend/
├── app/
│   ├── main.py          API routes, CORS, rate limiting
│   ├── models.py        Pydantic data models (all schemas)
│   ├── services.py      LangGraph pipeline + 7 retrieval agents
│   ├── rag.py           ChromaDB vector store + embedding
│   ├── hf_synthesis.py  Gemini LLM interface (generate + judge)
│   ├── evaluation.py    Agentic vs baseline comparison
│   ├── ref_beta.py      REF 2029 case study writer + auditor
│   ├── database.py      SQLite persistence
│   ├── access_guard.py  Author identity verification
│   ├── auth.py          Firebase JWT + LinkedIn OAuth
│   └── validation.py    Input sanitisation + query classification
├── .env                 API keys (GOOGLE_API_KEY, etc.)
└── requirements.txt     Python dependencies

frontend/
├── src/
│   ├── main.tsx         React entry + routing
│   ├── LandingPage.tsx  Marketing page + specimen card
│   ├── LoginModal.tsx   Auth modal (Google/GitHub/LinkedIn/Demo)
│   ├── Dashboard.tsx    Main app (6 tabs, all analysis UI)
│   ├── AuthContext.tsx  Global auth state (React context)
│   ├── AuthCallback.tsx LinkedIn OAuth redirect handler
│   ├── firebase.ts      Firebase app initialisation
│   └── styles.css       Impact Lab design system (2500 lines)
├── index.html           HTML shell + font imports
└── package.json         npm dependencies

docs/
├── REVERSE_ENGINEERING.md  ← THIS FILE
├── HLD.md               High-level design
├── LLD.md               Low-level design
└── SRS.md               Software requirements spec
```

---

*Generated for supervisor meeting preparation. Every section reflects the actual production code as of May 2026.*
