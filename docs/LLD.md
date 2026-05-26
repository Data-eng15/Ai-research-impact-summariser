# Low Level Design (LLD)
## AI Research Impact Summariser
**Version:** 2.0  
**Date:** 2026-05-18

---

## Table of Contents
1. [Module Inventory](#1-module-inventory)
2. [Backend Module Designs](#2-backend-module-designs)
   - 2.1 [models.py](#21-modelspy)
   - 2.2 [main.py](#22-mainpy)
   - 2.3 [services.py — LangGraph Pipeline](#23-servicespy--langgraph-pipeline)
   - 2.4 [rag.py — Vector Memory](#24-ragpy--vector-memory)
   - 2.5 [hf_synthesis.py — SLM Layer](#25-hf_synthesispy--slm-layer)
   - 2.6 [services_support.py](#26-services_supportpy)
3. [Frontend Module Designs](#3-frontend-module-designs)
   - 3.1 [main.tsx — App Router](#31-maintsx--app-router)
   - 3.2 [LandingPage.tsx](#32-landingpagetsx)
   - 3.3 [LoginModal.tsx](#33-loginmodaltsx)
   - 3.4 [Dashboard.tsx](#34-dashboardtsx)
4. [API Contract (Full Schema)](#4-api-contract-full-schema)
5. [Data Models (Detailed)](#5-data-models-detailed)
6. [Algorithm Designs](#6-algorithm-designs)
7. [ChromaDB Schema](#7-chromadb-schema)
8. [Error Handling Matrix](#8-error-handling-matrix)
9. [Environment Variable Reference](#9-environment-variable-reference)
10. [Test Coverage](#10-test-coverage)

---

## 1. Module Inventory

### Backend (`backend/app/`)

| File | Lines | Responsibility |
|---|---|---|
| `models.py` | ~77 | Pydantic schemas for all request/response types |
| `main.py` | ~38 | FastAPI app, CORS config, route definitions |
| `services.py` | ~689 | LangGraph graph, all agent nodes, external API calls, synthesis |
| `rag.py` | ~126 | EmbeddingProvider, ChromaDB upsert+query, hash embedding |
| `llm.py` | ~238 | Gemini API client, `generate_impact_summary()`, `generate_ref_report()`, `evaluate_faithfulness()` |
| `services_support.py` | ~10 | Shared `log()` helper |
| `__init__.py` | 0 | Package marker |

### Frontend (`frontend/src/`)

| File | Lines | Responsibility |
|---|---|---|
| `main.tsx` | ~49 | React app entry, BrowserRouter, route definitions, ProtectedRoute |
| `LandingPage.tsx` | ~64 | Marketing landing page with hero and features grid |
| `LoginModal.tsx` | ~? | Auth modal (sets localStorage `isAuthenticated`) |
| `Dashboard.tsx` | ~534 | Core analysis UI: search, agent pills, summary, evidence, REF report |
| `styles.css` | ~? | CSS for all components (glass-box design language) |

---

## 2. Backend Module Designs

### 2.1 `models.py`

All application data types are defined here as Pydantic `BaseModel` subclasses.

#### Class Diagram

```
BaseModel
├── AnalyzeRequest
│   └── query: str  [min=2, max=500]
│
├── AgentStatus
│   ├── name: str
│   ├── label: str
│   ├── state: AgentState (Enum)
│   └── detail: str
│
├── TraceLog
│   ├── timestamp: str  (HH:MM:SS)
│   ├── agent: str
│   ├── message: str
│   └── data: dict[str, Any]  (default={})
│
├── PaperMetadata
│   ├── title: str  (default="Unknown title")
│   ├── authors: list[str]  (default=[])
│   ├── year: int | None
│   ├── doi: str | None
│   ├── abstract: str | None
│   └── source_url: str | None
│
├── EvidenceItem
│   ├── title: str
│   ├── url: str | None
│   ├── year: int | None
│   ├── authors: list[str]  (default=[])
│   ├── snippet: str | None
│   ├── source: str
│   ├── kind: str  ("citation"|"code"|"full_text"|"funding"|"patent")
│   ├── citation_count: int | None
│   ├── metric_label: str | None
│   └── metric_value: str | None
│
├── ImpactSection
│   ├── title: str
│   └── body: str
│
└── AnalyzeResponse
    ├── metadata: PaperMetadata
    ├── summary: str
    ├── sections: list[ImpactSection]
    ├── evidence: list[EvidenceItem]
    ├── agent_statuses: list[AgentStatus]
    ├── logs: list[TraceLog]
    ├── faithfulness_score: float
    ├── citation_count: int
    ├── topics: list[str]  (default=[])
    ├── model_provider: str  (default="deterministic")
    ├── rag_context_count: int  (default=0)
    ├── guardrail_status: str  (default="not_run")
    ├── limitations: list[str]  (default=[])
    └── ref_report: str  (default="")

Enum: AgentState
  values: pending | running | complete | warning | error
```

---

### 2.2 `main.py`

```python
# Initialization
app = FastAPI(title="Research Impact Summariser API", version="0.1.0")

# CORS — origins from ALLOWED_ORIGINS env var, defaults to localhost:5173-5175
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# Routes
GET  /health          → {"status": "ok"}
POST /api/analyze     → analyze(request: AnalyzeRequest) → AnalyzeResponse
```

**Route: `POST /api/analyze`**
```
Input:  AnalyzeRequest.query  (validated by Pydantic)
Action: result = await analyze_paper(request.query)
Output: AnalyzeResponse(**result)
```

No authentication middleware is present on this endpoint. Rate limiting is not implemented (relies on external API limits as natural throttle).

---

### 2.3 `services.py` — LangGraph Pipeline

#### Helper Functions

```python
def normalize_query(query: str) -> str
  # strip() only — no further normalization

def extract_doi(query: str) -> str | None
  # regex: r"10\.\d{4,9}/[-._();/:A-Z0-9]+"
  # case-insensitive, returns first match or None

def meaningful_title_terms(title: str) -> list[str]
  # finds [a-z0-9]+ tokens, filters: len > 3, not in GENERIC_TITLE_TERMS
  # GENERIC_TITLE_TERMS = {"deep","learning","machine","analysis","survey",
  #                        "review","introduction","method","methods","model","models","data"}

def authors_from_crossref(work: dict) -> list[str]
  # extracts first 8 authors as "Given Family" strings

def year_from_crossref(work: dict) -> int | None
  # prefers published-print, falls back to published-online, then created

def clean_abstract(value: str | None) -> str | None
  # strips HTML tags via r"<[^>]+>"

def inverted_abstract_to_text(index: dict | None) -> str | None
  # reconstructs position-sorted word list from OpenAlex abstract_inverted_index
  # truncates to 900 chars

def dedupe_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]
  # key: (item.url or item.title).lower()
  # preserves first occurrence
```

#### External API Coroutines

**`fetch_crossref(client, query)`**
```
Input:  httpx.AsyncClient, query string
Output: (PaperMetadata | None, list[TraceLog])

Algorithm:
  doi = extract_doi(query)
  if doi:
    GET https://api.crossref.org/works/{doi}  (timeout=12s)
    work = response["message"]
  else:
    GET https://api.crossref.org/works?query.title={query}&rows=1  (timeout=12s)
    work = response["message"]["items"][0]
  
  return PaperMetadata(
    title    = work["title"][0],
    authors  = authors_from_crossref(work),
    year     = year_from_crossref(work),
    doi      = work["DOI"],
    abstract = clean_abstract(work["abstract"]),
    source_url = work["URL"]
  )
```

**`fetch_semantic_scholar(client, metadata, original_query)`**
```
Input:  httpx.AsyncClient, PaperMetadata, original query string
Output: (citation_count: int, evidence: list[EvidenceItem], logs: list[TraceLog])

paper_id = metadata.doi or extract_doi(original_query) or original_query
fields = "title,year,authors,citationCount,url,abstract,citations.title,citations.year,
          citations.authors,citations.url,citations.abstract,citations.citationCount"
GET https://api.semanticscholar.org/graph/v1/paper/{paper_id}?fields={fields}  (timeout=15s)

Returns up to 20 EvidenceItem(kind="citation") from payload["citations"]
```

**`fetch_openalex_fallback(client, query)`**
```
Input:  httpx.AsyncClient, title string
Output: (citation_count: int, evidence: list[EvidenceItem], logs: list[TraceLog])

GET https://api.openalex.org/works?search={title}&per-page=8  (timeout=12s)

For each result:
  EvidenceItem(
    kind="citation",
    snippet = inverted_abstract_to_text(item["abstract_inverted_index"]),
    metric_label="Citations", metric_value=f"{cited_by_count:,}"
  )
citation_count = results[0]["cited_by_count"] or 0
```

**`fetch_openalex_enrichment(client, metadata)`**
```
Input:  httpx.AsyncClient, PaperMetadata
Output: (evidence: list[EvidenceItem], topics: list[str], logs: list[TraceLog])

if metadata.doi: GET /works/doi:{doi}
else:            GET /works?search={title}&per-page=1

Extracts:
  best_oa_location → EvidenceItem(kind="full_text")
  primary_location  → EvidenceItem(kind="full_text") if different
  funders[]         → EvidenceItem(kind="funding") per funder
  topics[]          → display_name strings (max 6, deduped)
  primary_topic     → prepended to topics list
```

**`fetch_github_adoption(client, metadata)`**
```
Input:  httpx.AsyncClient, PaperMetadata
Output: (evidence: list[EvidenceItem], logs: list[TraceLog])

Guard: title empty OR title=="Unknown title" → return []
Guard: len(meaningful_title_terms(title)) < 2 → return []

query = '"{title[:80]}" in:name,description,readme'
GET https://api.github.com/search/repositories?q={query}&sort=stars&order=desc&per_page=6
  (timeout=12s, optional Authorization: Bearer GITHUB_TOKEN)

Returns EvidenceItem(kind="code", metric_label="Stars", metric_value=f"{stars:,}")
```

**`fetch_google_patents(client, metadata)`**
```
Input:  httpx.AsyncClient, PaperMetadata
Output: (evidence: list[EvidenceItem], logs: list[TraceLog])

query_encoded = quote(f'"{title[:80]}"', safe="")
GET https://patents.google.com/xhr/query?url=q%3D{query_encoded}  (timeout=15s)

Navigate: payload["results"]["cluster"][0]["result"][:5]
For each patent:
  EvidenceItem(
    kind="patent",
    title = f"[{pub_num}] {patent_title}",  # HTML-stripped
    url   = f"https://patents.google.com/patent/{pub_num}/en",
    metric_label = "Assignee" if assignee else None
  )
```

#### Synthesis Functions

**`synthesize(metadata, citation_count, evidence, topics, rag_contexts)`**
```
Output: (summary, sections, faithfulness, limitations, logs, model_provider, guardrail_status)

1. Compute evidence breakdowns:
   code_count      = count(kind=="code")
   full_text_count = count(kind=="full_text")
   funding_count   = count(kind=="funding")

2. Build evidence_sentence from first 3 evidence item titles

3. Call generate_impact_summary() → (llm_summary, model_provider, llm_logs)  [Gemini API]
   - if None (no key / API failure): use deterministic_summary template
   - summary = llm_summary or deterministic_summary

4. Build 4 ImpactSections (deterministic, always):
   "Research Influence", "Applications", "Technical Adoption", "Access & Funding"

5. Call evaluate_faithfulness() → (gemini_faith, judge_logs)  [Gemini-as-judge]
   - if gemini_faith >= 0.0: use it
   - else (no key / failure): call score_faithfulness() heuristic

6. guardrail_status = "passed" if faithfulness >= 0.75 else "review"

7. Build limitations list (non-HF mode, empty evidence, etc.)
```

**`score_faithfulness(summary, evidence, rag_contexts, citation_count, topics)`**
```
if not evidence: return 0.38

evidence_text = concat(item.title + " " + item.snippet for all evidence + rag_contexts)
summary_terms = [t for t in re.findall(r"[a-z0-9]+", summary.lower()) if len(t) > 4]
overlap = count(term in evidence_text) / len(summary_terms)

score = 0.45
      + min(0.30, overlap * 0.35)   # term overlap bonus (max 0.30)
      + (0.08 if citation_count)    # citation bonus
      + (0.07 if rag_contexts)      # RAG bonus
      + (0.04 if topics)            # topic bonus
      = max possible: 0.94 → capped at 0.91

return round(min(0.91, score), 2)
```

#### LangGraph Node Functions

**`metadata_node(state)`**
```
reads:  state["query"], state["logs"], state["statuses"]
writes: state["metadata"], state["statuses"], state["logs"]

1. async with httpx.AsyncClient(...) as client:
     metadata, logs = await fetch_crossref(client, state["query"])
2. if None: metadata = PaperMetadata(title=state["query"])
             status[0] = warning
   else:     status[0] = complete
```

**`retrieval_node(state)`**
```
reads:  state["metadata"], state["query"], state["logs"], state["statuses"]
writes: state["citation_count"], state["evidence"], state["topics"],
        state["statuses"], state["logs"]

async with httpx.AsyncClient() as client:
  results = await asyncio.gather(
    fetch_semantic_scholar(client, metadata, query),
    fetch_openalex_fallback(client, metadata.title),
    fetch_openalex_enrichment(client, metadata),
    fetch_github_adoption(client, metadata),
    fetch_google_patents(client, metadata)
  )

citation_count = scholar_count or fallback_count
evidence = dedupe_evidence(scholar + fallback + content + code + patent)
update statuses [1], [2], [3], [5]
```

**`rag_node(state)`**
```
reads:  state["metadata"], state["evidence"], state["topics"]
writes: state["rag_contexts"], state["embedding_provider"], state["statuses"], state["logs"]

# Runs in thread pool (asyncio.to_thread) since ChromaDB is synchronous
rag_contexts, embedding_provider, logs = index_and_retrieve(metadata, evidence, topics)
update status[4]
```

**`synthesis_node(state)`**
```
reads:  state["metadata"], state["citation_count"], state["evidence"],
        state["topics"], state["rag_contexts"]
writes: state["summary"], state["sections"], state["faithfulness"],
        state["limitations"], state["model_provider"], state["guardrail_status"]

# Gemini calls are async; node awaits them directly (no thread pool needed)
llm_summary, provider, llm_logs = await generate_impact_summary(...)
summary = llm_summary or _build_deterministic_summary(...)

llm_faith, faith_logs = await llm_evaluate(summary, evidence, rag_contexts)
faithfulness = llm_faith if llm_faith >= 0 else _score_faithfulness_heuristic(...)

guardrail_status = "passed" if faithfulness >= 0.75 else "review"
update status[6]
```

**`ref_node(state)`**
```
reads:  state["metadata"], state["evidence"], state["summary"], state["topics"],
        state["citation_count"]
writes: state["ref_report"], state["statuses"], state["logs"]

# Gemini call is async
llm_report, ref_logs = await generate_ref_report(metadata, evidence, summary, topics, citation_count)
ref_report = llm_report or _build_deterministic_ref(metadata, evidence, citation_count)
update status[7]
```

#### Graph Construction

```python
def build_graph():
    graph = StateGraph(AnalysisState)
    graph.add_node("metadata",   metadata_node)
    graph.add_node("retrieval",  retrieval_node)
    graph.add_node("rag",        rag_node)
    graph.add_node("synthesis",  synthesis_node)
    graph.add_node("ref_report", ref_node)
    graph.add_edge(START,       "metadata")
    graph.add_edge("metadata",  "retrieval")
    graph.add_edge("retrieval", "rag")
    graph.add_edge("rag",       "synthesis")
    graph.add_edge("synthesis", "ref_report")
    graph.add_edge("ref_report", END)
    return graph.compile()

analysis_graph = build_graph()  # module-level singleton
```

---

### 2.4 `rag.py` — Vector Memory

#### `EmbeddingProvider` Class

```python
class EmbeddingProvider:
    provider: str     # "hash" | "hf:sentence-transformers/all-MiniLM-L6-v2"
    dimension: int    # 384
    _model: SentenceTransformer | None  # lazy loaded
    _load_error: str | None             # set on first load failure

    def embed(texts: list[str]) -> tuple[list[list[float]], list[TraceLog]]:
        # Lazy initialization of SentenceTransformer on first call
        # Falls through to hash_embedding() if import fails
```

#### `hash_embedding(text, dimension)` — Fallback Algorithm

```
tokens = text.lower().split()
vector = [0.0] * dimension

for token in tokens:
    digest = SHA-256(token.encode("utf-8")).digest()
    index  = int.from_bytes(digest[:4], "big") % dimension
    sign   = +1.0 if digest[4] % 2 == 0 else -1.0
    vector[index] += sign

# L2 normalize
norm = sqrt(sum(v*v for v in vector)) or 1.0
return [v / norm for v in vector]
```

#### `evidence_text(item)` — Document Serialization

```
Concatenates with newline:
  item.kind
  item.title
  ", ".join(item.authors)
  item.source
  item.snippet or ""
  f"{item.metric_label or ''} {item.metric_value or ''}"
```

#### `index_and_retrieve(metadata, evidence, topics)`

```
Input:  PaperMetadata, list[EvidenceItem], list[str]
Output: (contexts: list[str], embedding_provider: str, logs: list[TraceLog])

if not evidence: return [], provider, logs

1. ChromaDB collection = get_or_create("research_impact_evidence")
   Path: backend/.data/chroma/

2. texts = [evidence_text(item) for item in evidence]
   vectors, embed_logs = embedding_provider.embed(texts)

3. ids = [stable_id(metadata, item, i) for i, item in enumerate(evidence)]
   metadatas = [{title, kind, source, doi, paper_title} for each item]
   collection.upsert(ids, documents=texts, embeddings=vectors, metadatas=metadatas)

4. query = "\n".join([
     metadata.title,
     metadata.abstract or "",
     " ".join(topics),
     "research impact applications citation adoption methodology influence"
   ])
   query_vectors = embedding_provider.embed([query])

5. result = collection.query(
     query_embeddings=query_vectors,
     n_results=min(6, len(evidence)),
     where={"paper_title": metadata.title}   ← filters to current paper only
   )
   return result["documents"][0], provider, logs
```

#### `stable_id(metadata, item, index)` — Deterministic Document ID

```
raw = "|".join([metadata.doi or metadata.title, item.kind, item.url or item.title, str(index)])
return SHA-1(raw.encode("utf-8")).hexdigest()
```

---

### 2.5 `llm.py` — Gemini API Layer

This module is the sole interface to the Google Gemini API. It provides three async functions consumed by `services.py`. All three share the same underlying `_complete()` helper.

#### Constants and Config

```python
_GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta/models"

def _api_key() -> str:        # os.getenv("GOOGLE_API_KEY", "")
def _model() -> str:          # os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
def _gemini_url(model) -> str # f"{_GEMINI_BASE}/{model}:generateContent"
```

#### `_to_gemini_payload(messages, max_tokens)` — Message Conversion

```
Converts OpenAI-style messages list to Gemini generateContent format:

  "system" role → payload["systemInstruction"]["parts"][{"text": ...}]
  "user"   role → contents[{"role": "user",  "parts": [{"text": ...}]}]
  "assistant" → contents[{"role": "model", "parts": [{"text": ...}]}]

generationConfig: { maxOutputTokens: max_tokens, temperature: 0.3 }
```

#### `_complete(messages, max_tokens=400, timeout=60)` — Core HTTP Call

```
if not _api_key(): return None

POST {_gemini_url(model)}?key={api_key}
  Content-Type: application/json
  body: _to_gemini_payload(messages, max_tokens)

on success:
  candidates[0]["content"]["parts"][0]["text"].strip()

on failure:
  append error to _last_llm_error (ring buffer, max 5)
  return None
```

#### `generate_impact_summary(metadata, citation_count, evidence, topics, rag_contexts)`

```
Output: (summary: str | None, model_provider: str, logs: list[TraceLog])

if not _api_key():
  log "GOOGLE_API_KEY not set — using deterministic synthesis"
  return None, "deterministic", logs

System prompt:
  "You are a rigorous research impact analyst writing for academic audiences.
   Ground every claim in the evidence provided. Do not invent statistics.
   If evidence is limited, acknowledge uncertainty explicitly."

User prompt includes:
  - paper title, authors[:5], year, citation_count (formatted with :,)
  - topics[:6]
  - evidence[:12] as "[KIND] title (source, year) — snippet[:200]"
  - rag_contexts[:5] as "• context[:400]"
  - Instruction: ~200 words, one paragraph, open with core contribution,
    cite citation evidence, mention application domains, highlight code/patent
    signals, honest about uncertainty

_complete([system, user], max_tokens=400)
  → return summary, f"gemini:{_model()}", logs
  → on None: return None, "deterministic", logs
```

#### `generate_ref_report(metadata, evidence, summary, topics, citation_count)`

```
Output: (report: str | None, logs: list[TraceLog])

if not _api_key(): return None, []

System prompt:
  "You are an expert in UK Research Excellence Framework (REF) impact case studies.
   Write formal, evidence-grounded REF narratives following Research England guidelines.
   Use academic prose. Never use AI self-referential phrases."

User prompt includes:
  - paper title, authors, year, DOI, topics
  - total citation count
  - impact summary (as basis)
  - evidence[:15] as "[KIND] title (source)"
  - Instruction: ~400 words with exactly 4 markdown headings:
    ### 1. Summary of Impact
    ### 2. Underpinning Research
    ### 3. Details of Impact
    ### 4. References to the Research

_complete([system, user], max_tokens=800)
```

#### `evaluate_faithfulness(summary, evidence, rag_contexts)`

```
Output: (score: float, logs: list[TraceLog])
  score = -1.0 if API unavailable (caller falls back to heuristic)

if not _api_key(): return -1.0, []

User prompt (no system message):
  "Rate faithfulness of this impact summary against the evidence (0–10, integers only).
   0 = hallucinated, 10 = every claim directly supported. Output ONLY the integer.

   Summary: {summary[:500]}
   Evidence: {evidence[:10] as "- title: snippet[:150]"}
   Rating:"

_complete([user], max_tokens=5)
  parse: re.search(r"\d+", result)
  score = min(10, max(0, int(match))) / 10.0
  log "Gemini faithfulness score: {score}"
```

#### Error Tracking

```python
_last_llm_error: list[str] = []  # ring buffer, max 5 entries

def get_last_llm_error() -> str | None:
    # returns most recent error string, or None
    # used by synthesis_node to include API error in limitations list
```

---

### 2.6 `services_support.py`

```python
from datetime import datetime, timezone
from .models import TraceLog

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")

def log(agent: str, message: str, **data) -> TraceLog:
    return TraceLog(timestamp=now_iso(), agent=agent, message=message, data=data)
```

---

## 3. Frontend Module Designs

### 3.1 `main.tsx` — App Router

```typescript
function App() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <>
            <LandingPage onLoginClick={() => setShowLogin(true)} />
            {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
          </>
        }/>
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        }/>
        <Route path="*" element={<Navigate to="/" replace />}/>
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedRoute({ children }) {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  return isAuthenticated ? children : <Navigate to="/" replace />;
}
```

**Routing Table:**

| Path | Component | Auth Required |
|---|---|---|
| `/` | `LandingPage` + optional `LoginModal` | No |
| `/dashboard` | `Dashboard` (via `ProtectedRoute`) | Yes |
| `/*` | Redirect to `/` | No |

---

### 3.2 `LandingPage.tsx`

**Props:** `{ onLoginClick: () => void }`

**Structure:**
```
<div.landing-container>
  <header.landing-header>
    Brand logo (Activity icon + "Impact Lab")
    <nav> Sign In button | Get Started button → onLoginClick()
  <main.landing-main>
    <div.hero-section>
      Badge: "Version 2.0 Now Live"
      h1: "Research Impact, Transparently Measured."
      p: subtitle
      Try Demo Access button → onLoginClick()
    <div.features-grid>
      FeatureCard: Glass Box Auditing (ShieldCheck icon)
      FeatureCard: Real-time Synthesis (Activity icon)
      FeatureCard: Agentic Pipeline (Zap icon)
  <div.ambient-background>
    Decorative glow orbs
```

No state. Pure presentational component.

---

### 3.3 `LoginModal.tsx`

Sets `localStorage.isAuthenticated = "true"` on successful form submission and navigates to `/dashboard`.

---

### 3.4 `Dashboard.tsx`

**State:**

| State Variable | Type | Initial Value | Purpose |
|---|---|---|---|
| `query` | `string` | `sampleQueries[0]` | Current search input |
| `result` | `AnalyzeResponse \| null` | `null` | Latest API response |
| `loading` | `boolean` | `false` | API request in flight |
| `error` | `string \| null` | `null` | Error message |
| `history` | `string[]` | `localStorage.searchHistory` | Recent queries |
| `evidenceFilter` | `string` | `"all"` | Active evidence kind filter |
| `openSections` | `Record<string, boolean>` | all `true` | Impact section accordion state |

**Derived Values (useMemo):**

| Variable | Computation |
|---|---|
| `statuses` | During loading: run `activeStatuses()` to show first status as running; else use `result.agent_statuses` or `initialStatuses` |
| `filteredEvidence` | Filter `result.evidence` by `evidenceFilter !== "all"` |
| `evidenceKinds` | Map `[kind, count]` from all evidence items |
| `faithfulnessLabel` | `score >= 0.85 → "Strong"`, `>= 0.70 → "Developing"`, else `"Needs evidence"` |
| `citationsCount` | Count of `kind === "citation"` in evidence |
| `patentsCount` | Count of `kind === "patent"` in evidence |
| `codeCount` | Count of `kind === "code"` in evidence |

**`analyze(event?, q?)` Function:**

```typescript
async function analyze(event?, q?) {
  event?.preventDefault();
  const searchQuery = (q || query).trim();
  if (!searchQuery) return;
  setQuery(searchQuery);

  // 1. Cache check
  const cached = localStorage.getItem(`cache_${searchQuery}`);
  if (cached) {
    setResult(JSON.parse(cached));
    updateHistory(searchQuery);
    return;
  }

  // 2. API call
  setLoading(true); setError(null); setResult(null);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const response = await fetch(`${API_URL}/api/analyze`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({query: searchQuery})
  });
  const data = await response.json() as AnalyzeResponse;
  setResult(data);
  localStorage.setItem(`cache_${searchQuery}`, JSON.stringify(data));
  updateHistory(searchQuery);
}
```

**`downloadReport()` Function:**

```typescript
function downloadReport() {
  // Converts ref_report markdown to HTML with Office XML namespaces
  // Handles: ###→<h3>, **bold**→<b>, - item→<ul><li>, blank→<br/>
  // Creates Blob(type="application/msword")
  // Triggers <a download> click programmatically
  // Revokes object URL after click
}
```

**Layout Structure:**

```
<main.app-shell>
  <aside.sidebar>
    Brand logo
    Recent history list
    Trust/traceability note
    Logout button → handleLogout() → localStorage.removeItem("isAuthenticated") → navigate("/")

  <section.workspace>
    <header.topbar>
      Title + subtitle
      Theme toggle button (Moon icon, currently decorative)

    <form.query-panel>
      Label + search input + Analyze button
      Sample query chips

    [error banner if error]

    <section.agent-strip>
      AgentPill × 8 (metadata, scholar, content, code, rag, impact, synthesis, ref)

    <section.content-grid>
      <article.summary-panel>
        [if result]:
          paper header (title, authors, year, DOI)
          faithfulness score badge
          summary text
          metrics row (Citations, Evidence, Code Leads, Patents, RAG Chunks)
          evidence distribution bar (citation/code/patent segments)
          runtime info (model provider, guardrail status)
          topic chips
          collapsible impact sections (×4)
          REF report card with Download button
          limitations warning
        [else]: empty state (BookOpen icon)

      <aside.evidence-panel>
        trace log
        evidence kind filter tabs
        evidence item list (clickable → external link)
```

**Pure Helper Functions:**

```typescript
function activeStatuses(statuses)    // show first status as "running" during loading
function StatusIcon({state})         // renders Check|Loader2|AlertTriangle|dot
function Metric({label, value})      // single metric display
function formatAuthors(authors)      // "A, B, C et al." formatting
function scoreClass(score)           // "strong"|"medium"|"low" CSS class
function kindLabel(kind)             // "citation"→"Citations", etc.
function runtimeLabel(provider)      // "hf:..."→"Hugging Face ..."
```

---

## 4. API Contract (Full Schema)

### `POST /api/analyze`

**Request:**
```json
{
  "query": "10.1038/nature14539"
}
```

**Response (AnalyzeResponse):**
```json
{
  "metadata": {
    "title": "Human-level control through deep reinforcement learning",
    "authors": ["Volodymyr Mnih", "Koray Kavukcuoglu", "..."],
    "year": 2015,
    "doi": "10.1038/nature14539",
    "abstract": "The theory of...",
    "source_url": "http://dx.doi.org/10.1038/nature14539"
  },
  "summary": "This paper... has accumulated X citations...",
  "sections": [
    {"title": "Research Influence", "body": "..."},
    {"title": "Applications", "body": "..."},
    {"title": "Technical Adoption", "body": "..."},
    {"title": "Access & Funding", "body": "..."}
  ],
  "evidence": [
    {
      "title": "Citing paper title",
      "url": "https://...",
      "year": 2022,
      "authors": ["Author A"],
      "snippet": "abstract excerpt...",
      "source": "Semantic Scholar",
      "kind": "citation",
      "citation_count": 142,
      "metric_label": null,
      "metric_value": null
    }
  ],
  "agent_statuses": [
    {"name": "metadata", "label": "Metadata", "state": "complete", "detail": "Paper metadata resolved"},
    {"name": "scholar",  "label": "Scholar",  "state": "complete", "detail": "23 evidence items retrieved"},
    ...
  ],
  "logs": [
    {"timestamp": "14:23:01", "agent": "Supervisor", "message": "LangGraph analysis started", "data": {"query": "10.1038/nature14539"}},
    ...
  ],
  "faithfulness_score": 0.82,
  "citation_count": 14500,
  "topics": ["Reinforcement Learning", "Deep Learning", "Atari Games"],
  "model_provider": "gemini:gemini-2.5-flash",
  "rag_context_count": 6,
  "guardrail_status": "passed",
  "limitations": ["HF SLM generation is optional..."],
  "ref_report": "### 1. Summary of Impact\n..."
}
```

---

## 5. Data Models (Detailed)

### EvidenceItem `kind` Values

| Kind | Source APIs | Description |
|---|---|---|
| `"citation"` | Semantic Scholar, OpenAlex | Paper that cites the queried work |
| `"code"` | GitHub | Repository implementing or referencing the paper |
| `"full_text"` | OpenAlex (best_oa_location, primary_location) | Landing page or PDF URL for the paper itself |
| `"funding"` | OpenAlex (funders) | Funder organization record |
| `"patent"` | Google Patents | Patent referencing the paper's method/title |

### AgentStatus `state` Lifecycle

```
initial → pending
on start → running
on success → complete
on partial success (some evidence) → complete
on empty result (no evidence/match) → warning
on exception → warning (current) or error (reserved)
```

### TraceLog `agent` Names

```
"Supervisor"  — pipeline start/end
"Metadata"    — CrossRef operations
"Scholar"     — Semantic Scholar operations
"Fallback"    — OpenAlex citation fallback
"Content"     — OpenAlex enrichment
"Code"        — GitHub operations
"Patents"     — Google Patents operations
"RAG"         — ChromaDB embedding + retrieval
"SLM"         — HF model loading + generation
"Judge"       — HF faithfulness evaluation
"Synthesis"   — Summary assembly
"Guardrail"   — Faithfulness scoring
"REF"         — REF report generation
```

---

## 6. Algorithm Designs

### 6.1 DOI Extraction

```
Pattern: r"10\.\d{4,9}/[-._();/:A-Z0-9]+"  (IGNORECASE)

Matches:
  "10.1038/nature14539"         → "10.1038/nature14539"
  "doi:10.1145/3292500.3330701" → "10.1145/3292500.3330701"
  "Attention Is All You Need"   → None
```

### 6.2 Meaningful Title Terms Filter

```
Input:  "Deep Learning for Natural Language Processing"
Tokens: re.findall(r"[a-z0-9]+", title.lower())
        = ["deep", "learning", "for", "natural", "language", "processing"]
Filter: len > 3 AND not in GENERIC_TITLE_TERMS
        "deep" → excluded (in set)
        "learning" → excluded (in set)
        "for" → excluded (len ≤ 3)
        "natural" → included
        "language" → included
        "processing" → included
Output: ["natural", "language", "processing"]  (len=3 ≥ 2: GitHub search proceeds)
```

### 6.3 Faithfulness Score Heuristic

```
Inputs: summary (str), evidence (list), rag_contexts (list),
        citation_count (int), topics (list)

evidence_text = concat of all evidence titles + snippets + rag contexts (lowercased)
summary_terms = tokens from summary with len > 4

overlap = matched_terms / total_terms
  where matched = any(term in evidence_text)

base     = 0.45
overlap  = min(0.30, overlap * 0.35)
citation = 0.08  if citation_count > 0
rag      = 0.07  if rag_contexts
topic    = 0.04  if topics

score = min(0.91, base + overlap + citation + rag + topic)

Examples:
  No evidence: 0.38 (hardcoded floor)
  Empty summary: 0.45 (no terms to overlap)
  Good evidence, high overlap, all bonuses: ~0.87–0.91
```

### 6.4 Evidence Bar Visualization (Frontend)

```
totalVisual = max(1, citationsCount + patentsCount + codeCount)
citation_width = (citationsCount / totalVisual) * 100 + "%"
code_width     = (codeCount     / totalVisual) * 100 + "%"
patent_width   = (patentsCount  / totalVisual) * 100 + "%"
```

---

## 7. ChromaDB Schema

**Collection name:** `research_impact_evidence`  
**Persistence path:** `backend/.data/chroma/`

**Document schema:**

| Field | Type | Content |
|---|---|---|
| `id` | str | SHA-1 of `doi|kind|url|index` |
| `document` | str | `evidence_text(item)` (plain text) |
| `embedding` | list[float] | 384-dimensional L2-normalized vector |
| `metadata.title` | str | EvidenceItem.title |
| `metadata.kind` | str | EvidenceItem.kind |
| `metadata.source` | str | EvidenceItem.source |
| `metadata.doi` | str | PaperMetadata.doi or "" |
| `metadata.paper_title` | str | PaperMetadata.title |

**Query parameters:**
```python
collection.query(
    query_embeddings=[384-dim query vector],
    n_results=min(6, len(evidence)),
    where={"paper_title": metadata.title}   # Scoped to current paper
)
```

**Cross-query isolation:** The `where` filter ensures that a query for Paper A only retrieves chunks indexed for Paper A, even though all papers share one ChromaDB collection. This prevents cross-contamination of RAG context.

---

## 8. Error Handling Matrix

| Failure Point | Trigger Condition | Handling | User-Visible Effect |
|---|---|---|---|
| CrossRef timeout/4xx/5xx | Any exception in `fetch_crossref` | Log warning, use `PaperMetadata(title=query)` | `metadata` agent: warning; analysis continues |
| CrossRef no match | Empty `items[]` on title search | Same as above | Same as above |
| Semantic Scholar failure | Any exception | Log, return `(0, [], logs)` | `scholar` agent: warning; OpenAlex used as fallback |
| OpenAlex fallback failure | Any exception | Log, return `(0, [], logs)` | No extra evidence; `citation_count` stays 0 |
| OpenAlex enrichment failure | Any exception | Log, return `([], [], logs)` | No topics or full-text links |
| GitHub failure | Any exception | Log, return `([], logs)` | No code evidence; `code` agent: warning |
| Google Patents failure | Any exception | Log, return `([], logs)` | No patent evidence |
| Gemini API key missing | `GOOGLE_API_KEY` not set | Log "GOOGLE_API_KEY not set", return `None` | Deterministic synthesis used; limitation listed |
| Gemini API failure | Non-2xx response or timeout | Log error, append to `_last_llm_error`, return `None` | Deterministic synthesis used; API error shown in limitations |
| ChromaDB failure | Any exception in ChromaDB ops | Log, return `([], provider, logs)` | Synthesis runs without RAG context; `rag` agent: warning |
| Empty evidence list | All APIs return nothing | `score_faithfulness` returns 0.38; limitation added | Low faithfulness score; limitation shown in UI |
| Frontend API error | Non-OK HTTP status | `setError(error message)` | Error banner with message + backend port hint |
| Frontend parse error | `JSON.parse` of cached value fails | Fall through to backend call | Normal API request made |

---

## 9. Environment Variable Reference

| Variable | Default | Required | Description |
|---|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:5173,5174,5175` + 127.0.0.1 variants | No | CORS origins for FastAPI middleware |
| `SEMANTIC_SCHOLAR_API_KEY` | `""` | No | Semantic Scholar API key for higher rate limits |
| `GITHUB_TOKEN` | `""` | No | GitHub personal access token |
| `GOOGLE_API_KEY` | `""` | **Recommended** | Gemini API key; without it all AI generation falls back to deterministic templates |
| `GEMINI_MODEL` | `"gemini-2.5-flash"` | No | Override Gemini model for generation and judging |
| `HF_EMBEDDING_MODEL` | `"sentence-transformers/all-MiniLM-L6-v2"` | No | Override HF embedding model for ChromaDB RAG |
| `VITE_API_URL` | `"http://localhost:8000"` | No | Backend URL for frontend `fetch()` calls |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `""` | No | Path to Firebase service account JSON (auth branch) |
| `LINKEDIN_JWT_SECRET` | `"change-me-in-production"` | No | Secret for LinkedIn JWT signing (auth branch) |

---

## 10. Test Coverage

### Backend Tests (`backend/tests/test_main.py`)

Uses `pytest` + `httpx.AsyncClient` (or `fastapi.testclient.TestClient`):

| Test | What it verifies |
|---|---|
| `test_health` | `GET /health` returns `{"status": "ok"}` with HTTP 200 |
| _(additional)_ | `POST /api/analyze` with valid DOI returns 200 + AnalyzeResponse shape |
| _(additional)_ | `POST /api/analyze` with query < 2 chars returns 422 |

### Frontend Tests (`frontend/src/__tests__/App.test.tsx`)

Uses Vitest + React Testing Library:

| Test | What it verifies |
|---|---|
| Renders landing | LandingPage mounts without errors |
| _(additional)_ | Login modal opens on button click |
| _(additional)_ | Dashboard renders after setting `localStorage.isAuthenticated` |

### Manual Test Scenarios

| Scenario | Steps | Expected |
|---|---|---|
| Valid DOI | Enter `10.1038/nature14539` → Analyze | Summary, 10k+ citations, evidence list |
| Valid title | Enter `Attention Is All You Need` → Analyze | Summary, metadata resolved, topics |
| Generic title | Enter `Deep Learning` | GitHub search skipped (< 2 meaningful terms) |
| Unknown paper | Enter `zzzzunknownpaper2026xyz` | CrossRef warning, 0 citations, low faithfulness |
| Cache hit | Submit same query twice | Second render instant, no loading state |
| Evidence filter | Click "Code" filter tab | Only code items shown |
| REF download | Click "Download .doc" | `.doc` file downloaded |
