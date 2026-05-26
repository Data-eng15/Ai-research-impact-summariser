# Complete From-Scratch Understanding
## AI Research Impact Summariser — Everything You Need to Know

> This document is written as if you have never seen this project before.  
> Every concept is explained before it is used. Every decision has a reason.  
> Read top to bottom. By the end you will own this completely.

---

## Table of Contents

1. [The Problem We Are Solving](#1-the-problem-we-are-solving)
2. [The Big Idea — What This System Does](#2-the-big-idea)
3. [Concepts You Must Understand First](#3-concepts-you-must-understand-first)
   - 3.1 What is RAG?
   - 3.2 What is an Agentic AI System?
   - 3.3 What is LangGraph?
   - 3.4 What is ChromaDB and Vector Search?
   - 3.5 What is an Embedding?
   - 3.6 What is FastAPI?
   - 3.7 What is Pydantic?
   - 3.8 What is Async/Await in Python?
   - 3.9 What is React and TypeScript?
4. [The External World — APIs We Talk To](#4-the-external-world)
5. [The System Architecture — Big Picture](#5-the-system-architecture)
6. [The Backend — File by File, Line by Line](#6-the-backend)
   - 6.1 models.py — The Blueprint for All Data
   - 6.2 main.py — The Front Door
   - 6.3 services.py — The Brain (LangGraph Pipeline)
   - 6.4 rag.py — The Memory System
   - 6.5 llm.py — Talking to Gemini
   - 6.6 services_support.py — The Little Helper
7. [The Frontend — File by File](#7-the-frontend)
   - 7.1 main.tsx — The App Router
   - 7.2 LandingPage.tsx — The Welcome Mat
   - 7.3 LoginModal.tsx — The Gate
   - 7.4 Dashboard.tsx — The Real UI
8. [The Complete Journey — What Happens When You Click Analyze](#8-the-complete-journey)
9. [Every Design Decision Explained](#9-every-design-decision-explained)
10. [What Makes This Production-Grade](#10-what-makes-this-production-grade)
11. [The Data — What Goes In, What Comes Out](#11-the-data)
12. [Common Questions and Misconceptions](#12-common-questions-and-misconceptions)

---

## 1. The Problem We Are Solving

### The Real-World Pain

Imagine you are a university researcher. You published a paper 5 years ago. Your university needs to submit an "Impact Case Study" to the UK government explaining how your research has influenced the world — did it get cited? Was it implemented in software? Did companies patent it? Did funders back it?

Right now, you would need to:
1. Go to Google Scholar → search your paper → note down citations
2. Go to GitHub → manually search → find if anyone built software using your method
3. Go to Google Patents → search again → find if corporations patented your idea
4. Go to OpenAlex → find your funders
5. Manually write a 400-word formal report combining all of this

That takes hours. And most of it is copy-paste work a computer should do.

### What We Built

A system where you type one thing — a DOI like `10.1038/nature14539` — and within 20 seconds you get:
- The paper's metadata (title, authors, year)
- A list of who cited it with their abstracts
- GitHub repos that implemented it (with star counts)
- Patents that referenced it
- Funding sources
- A 200-word AI-written impact narrative grounded in all that evidence
- A full formal REF Impact Case Study ready for submission
- A faithfulness score telling you how much to trust the AI summary

And every single claim the AI makes is traceable to a specific retrieved evidence item. This is the "glass-box" principle — the opposite of a black-box AI that just makes things up.

---

## 2. The Big Idea

The system can be summarised in one sentence:

> **Retrieve evidence from 5 scholarly APIs simultaneously → store it in a vector database → feed it to Gemini → generate a grounded impact summary → score how faithful it is.**

The key word is **grounded**. We do not ask Gemini "tell me about this paper". We gather real evidence first, then ask Gemini "here is what we found, now write a summary".

This eliminates hallucination because Gemini can only write about things we give it. If we found 20 citations, Gemini knows about 20 citations. If we found 3 GitHub repos, Gemini mentions 3 repos. Nothing is invented.

---

## 3. Concepts You Must Understand First

### 3.1 What is RAG?

**RAG = Retrieval-Augmented Generation**

The problem with asking an AI (like Gemini or ChatGPT) a question directly is that it only knows what it was trained on. If your paper was published after the training cutoff, the AI literally has no knowledge of it.

RAG solves this by adding a step before asking the AI:

```
WITHOUT RAG:
  Question → AI → Answer (may be wrong / outdated)

WITH RAG:
  Question → Retrieve relevant documents → AI + documents → Grounded answer
```

Think of RAG like this: before answering, the AI gets to read a set of reference documents. Now its answer is based on real, retrieved information, not just memory.

In our system:
1. We retrieve evidence (citations, GitHub repos, patents) from real APIs
2. We convert that evidence into vectors and store in ChromaDB
3. When Gemini generates the summary, it gets the most relevant evidence chunks as context
4. Gemini's output is grounded in real data

This is why the system cannot "make up" a citation — if Semantic Scholar didn't return it, it doesn't exist in our context.

---

### 3.2 What is an Agentic AI System?

**Agent = an autonomous unit that takes actions, observes results, and decides next steps**

A standard program does this:
```
Step 1 → Step 2 → Step 3 → Result
```
If Step 2 fails, the whole program crashes.

An agentic system does this:
```
Agent 1: "Resolve the paper identity"
  → Success: pass metadata to next agent
  → Failure: use fallback, warn user, continue anyway

Agent 2: "Retrieve citations"
  → Success: pass evidence to next agent
  → Failure: try alternative source, continue anyway

...
```

Each agent is responsible for one job. It handles its own failures. It passes its work to the next agent. The pipeline always produces *something*, even if some agents fail.

In our system, we have 5 agents:
1. **Metadata Agent** — resolves paper identity via CrossRef
2. **Retrieval Agent** — gathers evidence from 5 sources simultaneously  
3. **RAG Agent** — embeds evidence into ChromaDB, retrieves relevant chunks
4. **Synthesis Agent** — asks Gemini to write the summary + scores faithfulness
5. **REF Agent** — asks Gemini to write the formal REF case study

---

### 3.3 What is LangGraph?

LangGraph is a Python library that lets you define an AI pipeline as a **graph** — a set of nodes (agents) connected by edges (arrows).

**Why not just write normal function calls?**

You could write:
```python
metadata = get_metadata(query)
evidence = get_evidence(metadata)
contexts = get_rag_contexts(evidence)
summary = synthesize(evidence, contexts)
report = generate_ref(summary, evidence)
```

This works. But:
- If `get_evidence` crashes, nothing after it runs
- You cannot inspect state between steps easily
- You cannot add conditional logic ("if no metadata, retry with different query")
- You cannot checkpoint and resume

LangGraph turns this into a **state machine**:

```python
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

pipeline = graph.compile()
```

Now:
- State is explicitly typed (`AnalysisState` TypedDict) — no hidden variables
- Each node receives the full state, does its work, returns updated state
- Failures in one node don't propagate — node returns safe defaults
- The graph is inspectable and testable as a unit
- Future: add conditional edges ("if no metadata → branch to title_search_node")

**How does state work?**

```python
class AnalysisState(TypedDict, total=False):
    query: str
    metadata: PaperMetadata
    citation_count: int
    evidence: list[EvidenceItem]
    rag_contexts: list[str]
    summary: str
    # ... 11 more fields
```

Each node receives the full state dictionary and returns a new dictionary merging its changes:
```python
async def metadata_node(state: AnalysisState) -> AnalysisState:
    # Do the work
    metadata = await fetch_crossref(state["query"])
    # Return updated state — everything else is preserved
    return {**state, "metadata": metadata}
```

The `{**state, "metadata": metadata}` pattern means "copy everything from state, then override the metadata field". This is immutable — we never modify the original state object.

---

### 3.4 What is ChromaDB and Vector Search?

**ChromaDB is a database that stores vectors (lists of numbers) and lets you search by meaning rather than by exact text.**

Normal databases store text and let you search by exact match:
```sql
SELECT * FROM papers WHERE title LIKE '%deep learning%'
```
This only finds exact keyword matches.

ChromaDB stores embeddings (vectors) and finds documents that are *semantically similar*:
```
Query: "research impact applications citation"
Returns: documents about "scholarly influence", "citation analysis", "academic adoption"
         even if these exact words weren't in the query
```

**Why do we use it?**

After we retrieve 30 evidence items, we don't want to dump all 30 into Gemini's context window. Instead we:
1. Convert all 30 evidence items to vectors and store them in ChromaDB
2. Create a query vector for our paper ("research impact applications citation adoption")
3. ChromaDB returns the 6 most semantically relevant evidence chunks
4. We give only those 6 to Gemini

This ensures Gemini gets the *most relevant* evidence, not just the first 6 items in a list.

**ChromaDB in our system:**
- Collection name: `research_impact_evidence`
- Storage: `backend/.data/chroma/` (persists across server restarts)
- Document IDs: SHA-1 hashes (stable — re-running the same paper doesn't create duplicates)
- Metadata filter: `where={"paper_title": metadata.title}` — ensures Paper A's evidence is never shown when analysing Paper B

---

### 3.5 What is an Embedding?

An embedding is a **list of numbers that captures the meaning of text**.

```
"deep learning for image classification" 
→ [0.23, -0.45, 0.12, 0.67, ..., 0.09]   (384 numbers)

"neural network vision tasks"
→ [0.25, -0.43, 0.11, 0.65, ..., 0.08]   (very similar numbers!)

"cooking recipes for pasta"
→ [-0.87, 0.23, -0.56, -0.12, ..., 0.44]  (very different numbers)
```

Similar meaning = similar numbers. ChromaDB uses this to find "similar" documents.

**How do we create embeddings?**

We use the `sentence-transformers` library with the model `all-MiniLM-L6-v2`. This model was trained to produce meaningful 384-dimensional embeddings.

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")
vectors = model.encode(["text 1", "text 2"], normalize_embeddings=True)
# Returns a 2x384 array of floats
```

**The fallback: Hash Embedding**

If `sentence-transformers` is not installed (e.g., in a lightweight Docker container), we use our own deterministic hash embedding:

```python
def hash_embedding(text: str, dimension: int = 384) -> list[float]:
    vector = [0.0] * 384
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode()).digest()
        index = int.from_bytes(digest[:4], "big") % 384  # which dimension?
        sign  = 1.0 if digest[4] % 2 == 0 else -1.0      # positive or negative?
        vector[index] += sign
    norm = math.sqrt(sum(v*v for v in vector)) or 1.0
    return [v / norm for v in vector]  # L2 normalise
```

For each word token, we deterministically pick a vector dimension and add +1 or -1. This is not as good as a trained model (it doesn't understand that "citation" and "reference" are similar) but it still works — words that appear together often will end up with similar vectors.

---

### 3.6 What is FastAPI?

FastAPI is a Python web framework for building REST APIs. It is:
- **Fast** — built on async Python (ASGI), handles thousands of concurrent requests
- **Automatic** — generates OpenAPI documentation automatically
- **Validated** — integrates with Pydantic so all inputs/outputs are type-checked

A minimal FastAPI app:
```python
from fastapi import FastAPI
app = FastAPI()

@app.get("/hello")
async def hello():
    return {"message": "world"}
```

Our app has two routes:
- `GET /health` → returns `{"status": "ok"}` (for monitoring)
- `POST /api/analyze` → runs the 5-agent pipeline and returns results

FastAPI automatically validates that `POST /api/analyze` receives a JSON body with a `query` field between 2–500 characters. If not, it returns a `422 Unprocessable Entity` response with a clear error message — without us writing any validation code.

---

### 3.7 What is Pydantic?

Pydantic is a Python library for **data validation using type annotations**.

Instead of:
```python
def process(data: dict):
    title = data.get("title", "Unknown")  # might crash if data is None
    year = int(data.get("year", 0))       # might crash if year is "abc"
```

You write:
```python
class PaperMetadata(BaseModel):
    title: str = "Unknown title"
    year: int | None = None
    doi: str | None = None
```

Now:
- `PaperMetadata(title=123)` → Pydantic coerces 123 to "123" (or raises a clear error)
- `PaperMetadata()` → all defaults applied automatically
- `metadata.title` → guaranteed to be a string, never None
- `metadata.model_dump()` → converts to dict for JSON serialisation

FastAPI uses Pydantic for all request parsing and response serialisation. When Semantic Scholar returns messy JSON, Pydantic cleans it up.

---

### 3.8 What is Async/Await in Python?

**The problem:** Our system makes 5 external API calls. Each takes 5–15 seconds. If we call them one by one:
```
CrossRef:         12 seconds
Semantic Scholar: 15 seconds
OpenAlex:         12 seconds
GitHub:           8 seconds
Google Patents:   12 seconds
Total:            59 seconds ← unacceptable
```

**The solution:** Call them all at the same time:
```python
results = await asyncio.gather(
    fetch_semantic_scholar(client, metadata, query),
    fetch_openalex_fallback(client, title),
    fetch_openalex_enrichment(client, metadata),
    fetch_github_adoption(client, metadata),
    fetch_google_patents(client, metadata),
)
# Total: ~15 seconds (slowest single call)
```

`async def` declares a function that can be paused while waiting (e.g., for a network response). `await` pauses that function and lets other work happen while waiting. `asyncio.gather` starts multiple async functions simultaneously and waits for all to finish.

This is not multithreading — there is only one thread. Python uses an **event loop** that switches between tasks whenever one is waiting for I/O. It's like a chef who has 5 pots on the stove — they don't stand watching each pot; they start all 5 and check each one when it needs attention.

---

### 3.9 What is React and TypeScript?

**React** is a JavaScript library for building UIs as a tree of components.

Instead of:
```html
<div id="app">...</div>
<script>
  document.getElementById('app').innerHTML = `<h1>${title}</h1>`;
</script>
```

You write:
```tsx
function App() {
  const [title, setTitle] = useState("Loading...");
  return <h1>{title}</h1>;
}
```

When `title` changes, React automatically re-renders the `<h1>`. You never touch the DOM directly.

**TypeScript** is JavaScript with types:
```typescript
// Plain JavaScript — no protection
function process(data) {
    return data.title.toUpperCase();  // crashes if data.title is undefined
}

// TypeScript — error caught at compile time
function process(data: { title: string }): string {
    return data.title.toUpperCase();  // guaranteed to be a string
}
```

TypeScript catches errors before you run the code. In our Dashboard, all API response types are defined:
```typescript
type AnalyzeResponse = {
    metadata: PaperMetadata;
    summary: string;
    evidence: EvidenceItem[];
    faithfulness_score: number;
    // ...
};
```
If Gemini changes its response format, TypeScript tells us immediately instead of crashing at runtime.

---

## 4. The External World

Our system talks to 5 external services. Here is what each one is and why we chose it.

### CrossRef — Paper Metadata

**What it is:** A not-for-profit that registers DOIs for academic publishers. Every academic paper with a DOI is registered with CrossRef.

**Why we use it first:** It is the authoritative source for paper identity. If a DOI exists, CrossRef has the title, authors, year, and abstract.

**What we get:**
```json
{
  "title": ["Human-level control through deep reinforcement learning"],
  "author": [{"given": "Volodymyr", "family": "Mnih"}, ...],
  "published-print": {"date-parts": [[2015, 2, 26]]},
  "DOI": "10.1038/nature14539",
  "abstract": "<jats:p>The theory of...</jats:p>"
}
```

**The polite pool trick:** CrossRef has two rate limit tiers. Normal: 50 requests/second shared. Polite (users who add their email to User-Agent): 100 requests/second dedicated. We add: `User-Agent: ResearchImpactSummariser/0.1 (mailto:student@example.com)`.

---

### Semantic Scholar — Citations

**What it is:** Allen Institute for AI's academic search engine. Unlike Google Scholar, it has a free public API.

**Why we use it:** It gives us the actual list of papers that CITED our paper — their titles, abstracts, year, authors, and citation counts.

**What we get:** Up to 20 citing papers, each becoming an `EvidenceItem(kind="citation")`. These are the most important evidence items because they directly prove that other researchers read and built upon the work.

**Rate limit note:** Without an API key, limited to 100 requests/minute. With `SEMANTIC_SCHOLAR_API_KEY` in `.env`, much higher. Either way, for single-paper lookups we are nowhere near the limit.

---

### OpenAlex — The Open Everything Database

**What it is:** A fully open, free database of scholarly works, institutions, authors, topics, and funders. Created in 2022 as the open successor to Microsoft Academic Graph.

**Why we use it in TWO ways:**

1. **Citation fallback:** If Semantic Scholar fails or returns nothing, OpenAlex has its own citation database. We query 8 papers by title search as a fallback.

2. **Enrichment:** OpenAlex knows things Semantic Scholar doesn't:
   - **Topics:** "Reinforcement Learning", "Game Theory", "Neural Networks" — AI-assigned topic labels
   - **Funders:** Who paid for this research (NSF, NIH, EPSRC, etc.)
   - **Open Access links:** The actual PDF URL or landing page URL

**The inverted abstract:** OpenAlex doesn't store abstracts as text. It stores them as a map of `word → [positions]`:
```json
{
  "abstract_inverted_index": {
    "The": [0, 15, 42],
    "theory": [1],
    "of": [2, 16],
    ...
  }
}
```
We reconstruct the text by sorting words by position:
```python
words = [(pos, word) for word, positions in index.items() for pos in positions]
text  = " ".join(word for _, word in sorted(words))
```
This is an OpenAlex-specific format designed to reduce storage costs.

---

### GitHub — Code Adoption

**What it is:** The world's largest code hosting platform.

**Why we use it:** If a machine learning paper published a new algorithm, developers around the world may have implemented it and posted the code on GitHub. A GitHub repo implementing the paper is strong evidence the research had real-world impact.

**The anti-noise filter:** We search for `"Deep Learning" in:name,description,readme`. That query would return millions of irrelevant repos. So before searching, we filter title terms:

```python
GENERIC_TITLE_TERMS = {"deep","learning","machine","analysis","survey",
                       "review","introduction","method","methods","model","models","data"}

def meaningful_title_terms(title: str) -> list[str]:
    return [
        term for term in re.findall(r"[a-z0-9]+", title.lower())
        if len(term) > 3 and term not in GENERIC_TITLE_TERMS
    ]
```

For `"Attention Is All You Need"`: tokens are `["attention", "you", "need"]`. After filter: `["attention"]`. Only 1 meaningful term → skip GitHub search (too generic, would return spam).

For `"BERT: Pre-training of Deep Bidirectional Transformers"`: tokens include `["bert", "training", "deep", "bidirectional", "transformers"]`. After filter: `["bert", "bidirectional", "transformers"]`. 3 meaningful terms → search proceeds.

---

### Google Patents — Industrial Adoption

**What it is:** Google's patent search engine covering patents from 100+ countries.

**Why we use it:** When a corporation patents a technology derived from a paper, that is the strongest possible evidence of real-world industrial impact. Patents are filed by companies (Amazon, Apple, Pfizer) who found the research valuable enough to build products on.

**The XHR API note:** Google does not publish a public API for patents. We use the internal `xhr/query` endpoint that the Google Patents website itself uses. This is undocumented and could change. However it is the only free way to search patents programmatically. In production, the USPTO or EPO APIs would be more reliable.

---

## 5. The System Architecture

Here is how all the pieces connect:

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR BROWSER                               │
│                                                                 │
│  ┌─────────────┐     ┌──────────────────────────────────────┐  │
│  │ Landing     │     │ Dashboard                            │  │
│  │ Page        │     │                                      │  │
│  │             │     │  [Search Form]   [Agent Status Bar]  │  │
│  │ "Sign In"   │────►│  [Summary Panel] [Evidence Panel]    │  │
│  │ button      │     │  [REF Report]    [Trace Log]         │  │
│  └─────────────┘     └──────────────┬───────────────────────┘  │
│                                     │                           │
│  React + TypeScript + Vite          │ POST /api/analyze         │
│  localStorage cache                 │ {query: "10.1038/..."}    │
└─────────────────────────────────────┼───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI SERVER (Port 8000)                   │
│                                                                 │
│  main.py: receives request, validates with Pydantic,           │
│           calls analyze_paper(query)                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LangGraph Pipeline (services.py)            │   │
│  │                                                         │   │
│  │  [1. metadata_node] ──────► CrossRef API               │   │
│  │         │                                               │   │
│  │  [2. retrieval_node] ─────► Semantic Scholar            │   │
│  │         │          ├──────► OpenAlex (fallback)         │   │
│  │         │          ├──────► OpenAlex (enrichment)       │   │
│  │         │          ├──────► GitHub                      │   │
│  │         │          └──────► Google Patents              │   │
│  │         │                                               │   │
│  │  [3. rag_node] ───────────► ChromaDB (embed + query)   │   │
│  │         │                   (rag.py)                    │   │
│  │         │                                               │   │
│  │  [4. synthesis_node] ─────► Gemini API (llm.py)        │   │
│  │         │                   summary + faithfulness      │   │
│  │         │                                               │   │
│  │  [5. ref_node] ───────────► Gemini API (llm.py)        │   │
│  │                              REF case study             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Returns: AnalyzeResponse JSON (32 evidence items, summary,    │
│           sections, faithfulness, logs, REF report, etc.)      │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle: The frontend and backend know NOTHING about each other's internals.** The frontend only knows that `POST /api/analyze` accepts `{query}` and returns an `AnalyzeResponse`. The backend only knows the response shape. They are completely decoupled.

---

## 6. The Backend

### 6.1 `models.py` — The Blueprint for All Data

This file defines the shapes of all data in the system. Think of it as the contract — if you know `models.py`, you know what every piece of data looks like everywhere.

**`AgentState` — the possible states of each agent**
```python
class AgentState(str, Enum):
    pending  = "pending"   # not started yet
    running  = "running"   # currently working
    complete = "complete"  # finished successfully
    warning  = "warning"   # finished with degraded results
    error    = "error"     # hard failure (reserved)
```

**`AnalyzeRequest` — what the frontend sends us**
```python
class AnalyzeRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
```
This is the ONLY thing the frontend sends. One field. Pydantic validates it — if `query` is 1 character, Pydantic returns `422` automatically.

**`PaperMetadata` — what we know about the paper**
```python
class PaperMetadata(BaseModel):
    title: str = "Unknown title"   # has default — never crashes
    authors: list[str] = Field(default_factory=list)
    year: int | None = None        # None means we don't know
    doi: str | None = None
    abstract: str | None = None
    source_url: str | None = None
```
Note the defaults. If CrossRef fails, we create `PaperMetadata(title=query_string)` — all other fields default to None/empty. The pipeline continues.

**`EvidenceItem` — one piece of evidence from any source**
```python
class EvidenceItem(BaseModel):
    title: str              # required — every evidence item has a title
    url: str | None = None
    year: int | None = None
    authors: list[str] = Field(default_factory=list)
    snippet: str | None = None     # abstract excerpt or description
    source: str                    # "Semantic Scholar", "GitHub", "Google Patents", etc.
    kind: str = "citation"         # "citation", "code", "full_text", "funding", "patent"
    citation_count: int | None = None
    metric_label: str | None = None   # e.g., "Stars"
    metric_value: str | None = None   # e.g., "1,234"
```
Every evidence item from every source — citations, repos, patents, funders, full-text links — uses this SAME class. The `kind` field distinguishes them. This uniformity is why the frontend can display all evidence in one list with one component.

**`AnalyzeResponse` — what we send back to the frontend**
```python
class AnalyzeResponse(BaseModel):
    metadata: PaperMetadata
    summary: str
    sections: list[ImpactSection]
    evidence: list[EvidenceItem]
    agent_statuses: list[AgentStatus]
    logs: list[TraceLog]
    faithfulness_score: float
    citation_count: int
    topics: list[str] = Field(default_factory=list)
    model_provider: str = "deterministic"
    rag_context_count: int = 0
    guardrail_status: str = "not_run"
    limitations: list[str] = Field(default_factory=list)
    ref_report: str = ""
```
This is a big object. The frontend receives all of this in one JSON response — no websockets, no polling, no separate requests. One call, everything included.

---

### 6.2 `main.py` — The Front Door

This is the simplest file. It creates the FastAPI app and defines two routes.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models import AnalyzeRequest, AnalyzeResponse
from .services import analyze_paper
import os

app = FastAPI(title="Research Impact Summariser API", version="0.1.0")
```

**CORS middleware — why it exists:**
Browsers enforce a security policy called CORS (Cross-Origin Resource Sharing). If your React app is on `localhost:5173` and your API is on `localhost:8000`, the browser will BLOCK the request unless the server explicitly says "localhost:5173 is allowed".

```python
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175,"
    "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
In production, `ALLOWED_ORIGINS` is set to just the deployed frontend URL (e.g., `https://impactlab.example.com`). This prevents random websites from calling our API.

**The two routes:**
```python
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    result = await analyze_paper(request.query)
    return AnalyzeResponse(**result)
```

`/health` is used by Docker, cloud hosting, and monitoring tools to check if the server is alive. A health check that returns anything other than 200 triggers an alert or container restart.

`/api/analyze` receives the validated `AnalyzeRequest`, calls the pipeline, and returns the result as `AnalyzeResponse`. FastAPI handles all the JSON serialisation.

---

### 6.3 `services.py` — The Brain

This is the largest and most complex file (~690 lines). It contains:
- All external API call functions
- All 5 LangGraph node functions
- The graph construction
- The synthesis and faithfulness heuristic functions

Let me walk through each piece.

#### The DOI Pattern

```python
DOI_PATTERN = re.compile(r"10\.\d{4,9}/[-._();/:A-Z0-9]+", re.IGNORECASE)
```

DOIs always start with `10.` followed by a 4-9 digit registrant code, then a `/`, then an identifier string. Examples:
- `10.1038/nature14539` → `10.` + `1038` + `/` + `nature14539`
- `10.1145/3292500.3330701` → `10.` + `1145` + `/` + `3292500.3330701`

The regex catches these wherever they appear in the user's query — even if the user types `"doi: 10.1038/nature14539"`, we extract just the DOI part.

#### `fetch_crossref` — The First API Call

```python
async def fetch_crossref(client: httpx.AsyncClient, query: str) -> tuple[PaperMetadata | None, list[TraceLog]]:
    logs = [log("Metadata", "Resolving input with CrossRef")]
    doi = extract_doi(query)
    try:
        if doi:
            # Direct DOI lookup — most reliable
            url = f"https://api.crossref.org/works/{quote(doi, safe='')}"
            response = await client.get(url, timeout=12)
            response.raise_for_status()
            work = response.json()["message"]
        else:
            # Title search — less reliable, returns best match
            url = "https://api.crossref.org/works"
            response = await client.get(url, params={"query.title": query, "rows": 1}, timeout=12)
            response.raise_for_status()
            items = response.json()["message"].get("items", [])
            if not items:
                return None, logs
            work = items[0]  # best match by relevance score

        # Extract what we need
        title = (work.get("title") or ["Unknown title"])[0]
        metadata = PaperMetadata(
            title=title,
            authors=authors_from_crossref(work),
            year=year_from_crossref(work),
            doi=work.get("DOI"),
            abstract=clean_abstract(work.get("abstract")),
            source_url=work.get("URL"),
        )
        return metadata, logs
    except Exception as exc:
        logs.append(log("Metadata", "CrossRef lookup failed", error=str(exc)))
        return None, logs   # None triggers fallback in metadata_node
```

**Why `quote(doi, safe='')`?** DOIs can contain `/` characters. If we put `10.1038/nature14539` directly in a URL path, the server might interpret the `/` as a path separator. `quote()` encodes it to `10.1038%2Fnature14539`, which is unambiguous.

**Why `.raise_for_status()`?** If CrossRef returns HTTP 404 (not found) or 500 (server error), this raises an exception that our `except` catches. Without it, we'd try to parse the error response as valid data.

**Why `(work.get("title") or ["Unknown title"])[0]`?** CrossRef stores titles as arrays (because some works have subtitle arrays). The `or ["Unknown title"]` handles the case where the title array is empty or None. `[0]` takes the first (main) title.

#### `fetch_semantic_scholar` — Citations

```python
async def fetch_semantic_scholar(client, metadata, original_query):
    paper_id = metadata.doi or extract_doi(original_query) or original_query
    fields = "title,year,authors,citationCount,url,abstract,citations.title,citations.year,citations.authors,citations.url,citations.abstract,citations.citationCount"
    
    headers = {}
    if os.getenv("SEMANTIC_SCHOLAR_API_KEY"):
        headers["x-api-key"] = os.environ["SEMANTIC_SCHOLAR_API_KEY"]

    url = f"https://api.semanticscholar.org/graph/v1/paper/{quote(paper_id, safe='')}"
    response = await client.get(url, params={"fields": fields}, headers=headers, timeout=15)
    response.raise_for_status()
    payload = response.json()
    
    citations = payload.get("citations", [])[:20]  # max 20 citing papers
    evidence = [
        EvidenceItem(
            title=item.get("title") or "Untitled citing paper",
            url=item.get("url"),
            year=item.get("year"),
            authors=[author.get("name", "") for author in item.get("authors", [])[:5]],
            snippet=item.get("abstract"),
            source="Semantic Scholar",
            kind="citation",
            citation_count=item.get("citationCount"),
        )
        for item in citations
        if item.get("title")  # skip citations with no title
    ]
    count = int(payload.get("citationCount") or len(evidence))
    return count, evidence, logs
```

**Why `fields=` parameter?** Semantic Scholar charges against rate limits based on fields requested. By explicitly listing only what we need, we avoid fetching unnecessary data. The nested `citations.*` fields get data on each citing paper in one API call.

**Why `[:20]`?** More than 20 evidence items from one source would overwhelm the context. We prioritise quality over quantity.

#### The 5 Concurrent Calls in `retrieval_node`

```python
async def retrieval_node(state: AnalysisState) -> AnalysisState:
    metadata = state["metadata"]
    
    async with httpx.AsyncClient(headers={"User-Agent": "..."}) as client:
        # Start all 5 tasks simultaneously
        (citation_count, scholar_evidence, scholar_logs),
        (fallback_count, fallback_evidence, fallback_logs),
        (content_evidence, topics, content_logs),
        (code_evidence, code_logs),
        (patent_evidence, patent_logs) = await asyncio.gather(
            fetch_semantic_scholar(client, metadata, state["query"]),
            fetch_openalex_fallback(client, metadata.title),
            fetch_openalex_enrichment(client, metadata),
            fetch_github_adoption(client, metadata),
            fetch_google_patents(client, metadata),
        )
    
    # Merge citation counts (Scholar preferred, OpenAlex as fallback)
    citation_count = citation_count or fallback_count
    
    # Merge all evidence and remove duplicates
    evidence = dedupe_evidence(
        scholar_evidence + fallback_evidence + content_evidence + code_evidence + patent_evidence
    )
    ...
```

**Why one `AsyncClient` for all 5 calls?** `httpx.AsyncClient` maintains a connection pool. Sharing one client means HTTP connections are reused, reducing latency. Creating 5 separate clients would mean 5 separate TCP handshakes per request.

**`dedupe_evidence`:**
```python
def dedupe_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    seen: set[str] = set()
    unique: list[EvidenceItem] = []
    for item in items:
        key = (item.url or item.title).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique
```
Both Semantic Scholar and OpenAlex may return the same paper. Without deduplication, the same citation appears twice, inflating the evidence count and confusing Gemini.

#### The Synthesis Functions

**`synthesize()` — The orchestrator (not AI, just Python)**

This function takes all the evidence and coordinates the AI calls:

```python
def synthesize(metadata, citation_count, evidence, topics, rag_contexts):
    # Count evidence by type
    code_count      = len([e for e in evidence if e.kind == "code"])
    full_text_count = len([e for e in evidence if e.kind == "full_text"])
    funding_count   = len([e for e in evidence if e.kind == "funding"])
    
    # The evidence sentence for the deterministic fallback
    evidence_titles = [item.title for item in evidence[:4]]
    evidence_sentence = "Citing work includes " + "; ".join(evidence_titles[:3]) + "."
    
    # Try Gemini first, fall back to template
    hf_summary, model_provider, hf_logs = hf_synthesizer.generate(...)
    deterministic_summary = f"{title} ({year}) by {authors} appears to have..."
    summary = hf_summary or deterministic_summary
    
    # Build the 4 structured sections (always deterministic — not AI)
    sections = [
        ImpactSection(title="Research Influence", body=f"...{citation_count:,} citations..."),
        ImpactSection(title="Applications", body=f"...{', '.join(topics[:5])}..."),
        ImpactSection(title="Technical Adoption", body=f"...{code_count} repository matches..."),
        ImpactSection(title="Access & Funding", body=f"...{full_text_count} source routes..."),
    ]
    
    # Score faithfulness
    slm_faithfulness, judge_logs = hf_synthesizer.evaluate_faithfulness(...)
    faithfulness = slm_faithfulness if slm_faithfulness >= 0 else score_faithfulness(...)
    guardrail_status = "passed" if faithfulness >= 0.75 else "review"
    
    return summary, sections, faithfulness, ...
```

**Why are the 4 sections deterministic (not AI)?** Because they contain specific numbers — "6 repository leads", "3 full-text links". If we let Gemini generate these, it might make up numbers. By computing them in Python from actual evidence counts, they are always accurate.

**`score_faithfulness()` — The Heuristic**

```python
def score_faithfulness(summary, evidence, rag_contexts, citation_count, topics):
    if not evidence:
        return 0.38   # hard floor — no evidence = low score
    
    # Build a bag of all evidence words
    evidence_text = " ".join([
        item.title + " " + (item.snippet or "") 
        for item in evidence
    ] + rag_contexts).lower()
    
    # Find meaningful summary words (>4 chars)
    summary_terms = [t for t in re.findall(r"[a-z0-9]+", summary.lower()) if len(t) > 4]
    
    if not summary_terms:
        return 0.45
    
    # What fraction of summary terms appear in evidence text?
    overlap = sum(1 for term in summary_terms if term in evidence_text) / len(summary_terms)
    
    # Combine bonuses
    score = 0.45                             # base
    score += min(0.30, overlap * 0.35)       # term overlap (max +0.30)
    score += 0.08 if citation_count else 0   # has citations
    score += 0.07 if rag_contexts else 0     # has RAG context
    score += 0.04 if topics else 0           # has topic labels
    
    return round(min(0.91, score), 2)        # cap at 0.91
```

**Why 0.91 cap?** A heuristic can never be perfectly confident. Even if every summary word appears in evidence, we cannot guarantee the summary is faithful without actually reading it. The cap communicates appropriate uncertainty.

---

### 6.4 `rag.py` — The Memory System

#### `EmbeddingProvider` — Lazy Loading Pattern

```python
class EmbeddingProvider:
    def __init__(self):
        self.provider = "hash"      # starts as hash, upgrades if HF loads
        self.dimension = 384
        self._model = None          # not loaded yet
        self._load_error = None     # set on first failure to avoid retrying

    def embed(self, texts: list[str]) -> tuple[list[list[float]], list[TraceLog]]:
        # First call: try to load the HF model
        if self._model is None and self._load_error is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(EMBEDDING_MODEL)
                self.provider = f"hf:{EMBEDDING_MODEL}"
            except Exception as exc:
                self._load_error = str(exc)  # remember the error
        
        # If model loaded: use it
        if self._model is not None:
            vectors = self._model.encode(texts, normalize_embeddings=True).tolist()
            return vectors, logs
        
        # Fallback: hash embeddings
        return [hash_embedding(text, self.dimension) for text in texts], logs
```

**Why lazy loading?** Starting the server does not download or load a 90MB model. The model loads on the first API call. This means:
- Server starts fast (< 1 second)
- First analysis is slow if model hasn't been downloaded (~30 seconds for model download)
- All subsequent analyses are fast (model stays in memory)

**Why cache `_load_error`?** If `sentence_transformers` is not installed, we don't want to retry the import on every single API call. Setting `_load_error` after the first failure means we skip the import attempt forever.

#### `index_and_retrieve` — The Core RAG Function

```python
def index_and_retrieve(metadata, evidence, topics):
    if not evidence:
        return [], embedding_provider.provider, logs  # nothing to index
    
    # 1. Get ChromaDB collection
    collection = get_chroma_collection()
    
    # 2. Convert evidence to text documents
    texts = [evidence_text(item) for item in evidence]
    
    # 3. Embed all evidence texts
    vectors, embed_logs = embedding_provider.embed(texts)
    
    # 4. Create stable IDs
    ids = [stable_id(metadata, item, i) for i, item in enumerate(evidence)]
    
    # 5. Attach metadata for filtering
    metadatas = [{"paper_title": metadata.title, "kind": item.kind, ...} for item in evidence]
    
    # 6. Upsert into ChromaDB (insert or update if already exists)
    collection.upsert(ids=ids, documents=texts, embeddings=vectors, metadatas=metadatas)
    
    # 7. Build query from paper context
    query = "\n".join([
        metadata.title,
        metadata.abstract or "",
        " ".join(topics),
        "research impact applications citation adoption methodology influence",
    ])
    
    # 8. Embed the query
    query_vectors, _ = embedding_provider.embed([query])
    
    # 9. Find the 6 most relevant evidence chunks
    result = collection.query(
        query_embeddings=query_vectors,
        n_results=min(6, len(evidence)),
        where={"paper_title": metadata.title},  # ONLY this paper's evidence
    )
    
    contexts = result.get("documents", [[]])[0]
    return contexts, embedding_provider.provider, logs
```

**Why `where={"paper_title": metadata.title}`?** The ChromaDB collection persists across server restarts. If we analyse Paper A today and Paper B tomorrow, both papers' evidence is in the same collection. The `where` filter ensures when we query for Paper A, we only get Paper A's evidence chunks.

**`stable_id` — Deterministic Document IDs:**
```python
def stable_id(metadata, item, index):
    raw = "|".join([metadata.doi or metadata.title, item.kind, item.url or item.title, str(index)])
    return hashlib.sha1(raw.encode()).hexdigest()
```

If you analyse the same paper twice, `stable_id` produces the same ID both times. `collection.upsert` with the same ID updates the existing document rather than creating a duplicate. Without this, the collection would grow infinitely.

---

### 6.5 `llm.py` — Talking to Gemini

This module is the only place in the entire backend that talks to an LLM. Everything else is pure Python.

#### `_to_gemini_payload` — Format Conversion

Gemini's API format is different from OpenAI's. We use OpenAI-style internally (because it's a common standard), and convert at the boundary:

```python
def _to_gemini_payload(messages, max_tokens):
    system_parts = []
    contents = []
    
    for message in messages:
        if message["role"] == "system":
            system_parts.append({"text": message["content"]})
        elif message["role"] == "user":
            contents.append({"role": "user",  "parts": [{"text": message["content"]}]})
        elif message["role"] == "assistant":
            contents.append({"role": "model", "parts": [{"text": message["content"]}]})
    
    payload = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.3,   # low temperature = more focused, less creative
        },
    }
    if system_parts:
        payload["systemInstruction"] = {"parts": system_parts}
    return payload
```

**Why temperature 0.3?** Temperature controls randomness. At 0.0, Gemini always picks the highest-probability word (very focused, repetitive). At 1.0, it picks more randomly (creative but inconsistent). At 0.3, it is focused enough for factual tasks but with enough flexibility to write naturally.

#### `_complete` — The HTTP Call

```python
async def _complete(messages, max_tokens=400, timeout=60):
    key = _api_key()
    if not key:
        return None   # no key → caller uses fallback
    
    url  = _gemini_url(_model())   # "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    payload = _to_gemini_payload(messages, max_tokens)
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            params={"key": key},          # API key as query parameter
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=timeout,
        )
        if not resp.is_success:
            body = resp.json() if "json" in resp.headers.get("content-type", "") else {}
            err_msg = body.get("error", {}).get("message", resp.text[:200])
            raise RuntimeError(f"Gemini API {resp.status_code}: {err_msg}")
        
        candidates = resp.json().get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned empty candidates list")
        
        return candidates[0]["content"]["parts"][0]["text"].strip()
```

**Why `params={"key": key}` instead of a header?** The Gemini REST API uses the API key as a URL query parameter (`?key=...`), unlike OpenAI which uses an `Authorization: Bearer` header. This is just Gemini's design.

**The error ring buffer:**
```python
_last_llm_error: list[str] = []   # module-level list, persists across requests

# In _complete():
except Exception as exc:
    _last_llm_error.append(str(exc))
    if len(_last_llm_error) > 5:
        _last_llm_error.pop(0)   # keep only last 5 errors
    return None

# Exposed as:
def get_last_llm_error() -> str | None:
    return _last_llm_error[-1] if _last_llm_error else None
```

When the synthesis node uses the deterministic fallback, it calls `get_last_llm_error()` and includes the error in the `limitations` list so the user knows why AI generation was skipped.

#### `generate_impact_summary` — The Main Prompt

```python
async def generate_impact_summary(metadata, citation_count, evidence, topics, rag_contexts):
    if not _api_key():
        logs.append(log("LLM", "GOOGLE_API_KEY not set — using deterministic synthesis"))
        return None, "deterministic", logs
    
    # Format evidence for the prompt
    evidence_lines = "\n".join(
        f"- [{item.kind.upper()}] {item.title} ({item.source}, {item.year or 'n.d.'}) — {(item.snippet or '')[:200]}"
        for item in evidence[:12]
    )
    rag_text = "\n".join(f"• {ctx[:400]}" for ctx in rag_contexts[:5])
    
    system_msg = (
        "You are a rigorous research impact analyst writing for academic audiences. "
        "Ground every claim in the evidence provided. Do not invent statistics or institutions. "
        "If evidence is limited, acknowledge uncertainty explicitly. Be precise and scholarly."
    )
    
    user_msg = f"""Write a 200-word impact narrative for this research paper grounded strictly in the evidence below.

Paper: {metadata.title}
Authors: {", ".join(metadata.authors[:5]) or "Unknown"}
Year: {metadata.year or "Unknown"}
Total Citations: {citation_count:,}
Research Topics: {", ".join(topics[:6]) or "Not identified"}

Retrieved Evidence:
{evidence_lines or "No external evidence retrieved."}

RAG Context Chunks:
{rag_text or "No vector-memory context."}

Write exactly one paragraph (~200 words). Open with the paper's core contribution, cite citation evidence, mention application domains, highlight any code/patent/policy/grant signals, and close with an overall impact assessment. Be honest about uncertainty where evidence is thin."""
    
    summary = await _complete([
        {"role": "system", "content": system_msg},
        {"role": "user",   "content": user_msg},
    ], max_tokens=400)
    
    if summary:
        return summary, f"gemini:{_model()}", logs
    return None, "deterministic", logs   # API failed → caller uses template
```

**Why show `citation_count:,`?** Python's `:,` format adds commas for thousands: `14500` → `"14,500"`. This makes the prompt more human-readable for Gemini and results in better-formatted output.

**Why `evidence[:12]` and `rag_contexts[:5]`?** Gemini has a context window limit. Showing too many evidence items increases cost and may cause the model to miss key details. 12 evidence items + 5 RAG chunks provides rich context without overwhelming the model.

---

### 6.6 `services_support.py` — The Little Helper

```python
from datetime import datetime, timezone
from .models import TraceLog

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")

def log(agent: str, message: str, **data) -> TraceLog:
    return TraceLog(
        timestamp=now_iso(),
        agent=agent,
        message=message,
        data=data,
    )
```

Every agent uses `log()` to create trace entries. The `**data` means you can pass any keyword arguments:
```python
log("Scholar", "Retrieved citations", citation_count=14500, evidence_items=20)
# Creates TraceLog(timestamp="14:23:01", agent="Scholar", 
#                  message="Retrieved citations",
#                  data={"citation_count": 14500, "evidence_items": 20})
```

These logs are returned to the frontend in `AnalyzeResponse.logs` and displayed in the trace log panel.

---

## 7. The Frontend

### 7.1 `main.tsx` — The App Router

```tsx
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
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                }/>
                <Route path="*" element={<Navigate to="/" replace />}/>
            </Routes>
        </BrowserRouter>
    );
}
```

**`BrowserRouter`** gives each page a real URL (`/`, `/dashboard`). Without it, the SPA would not have navigable URLs.

**`ProtectedRoute`:**
```tsx
function ProtectedRoute({ children }) {
    const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
    return isAuthenticated ? children : <Navigate to="/" replace />;
}
```

If you go to `/dashboard` without logging in, you are redirected to `/`. This is a frontend-only guard — it's about UX, not real security. The backend `/api/analyze` endpoint has no auth middleware. In production, auth would be enforced on the backend.

---

### 7.2 `LandingPage.tsx` — The Welcome Mat

Pure presentation. No state. No API calls. It shows the hero section with a "Try Demo Access" button that triggers the login modal via the `onLoginClick` prop.

The 3 feature cards in the features grid directly correspond to the system's key differentiators:
- **Glass Box Auditing** → the evidence panel + trace log
- **Real-time Synthesis** → the concurrent API retrieval  
- **Agentic Pipeline** → the LangGraph multi-agent orchestration

---

### 7.3 `LoginModal.tsx` — The Gate

Sets `localStorage.isAuthenticated = "true"` on form submit and navigates to `/dashboard`. This is a demo-grade implementation — in a real system, this would send credentials to the backend, receive a JWT token, and store the token instead.

---

### 7.4 `Dashboard.tsx` — The Real UI

This is the most complex file in the frontend (~534 lines). Let me explain its key pieces.

#### State Management

```tsx
const [query, setQuery]               = useState(sampleQueries[0]);  // search input value
const [result, setResult]             = useState<AnalyzeResponse | null>(null);  // API response
const [loading, setLoading]           = useState(false);  // is a request in flight?
const [error, setError]               = useState<string | null>(null);  // error message
const [history, setHistory]           = useState<string[]>(...)  // recent searches
const [evidenceFilter, setEvidenceFilter] = useState("all");  // which evidence kind to show
const [openSections, setOpenSections] = useState({...all true});  // accordion state
```

#### Memoised Values with `useMemo`

```tsx
const statuses = loading
    ? activeStatuses(result?.agent_statuses ?? initialStatuses)
    : result?.agent_statuses ?? initialStatuses;

const filteredEvidence = useMemo(() => {
    const evidence = result?.evidence ?? [];
    if (evidenceFilter === "all") return evidence;
    return evidence.filter(item => item.kind === evidenceFilter);
}, [evidenceFilter, result]);  // only recompute when these change
```

**Why `useMemo`?** Without it, `filteredEvidence` would be recomputed on every render. Filtering 30 items is fast, but it's good practice — on a large list it matters.

#### The `analyze` Function — Fully Annotated

```tsx
async function analyze(event?: FormEvent, q?: string) {
    event?.preventDefault();   // prevent form from refreshing the page
    const searchQuery = (q || query).trim();
    if (!searchQuery) return;  // don't send empty queries
    
    setQuery(searchQuery);

    // ── Step 1: Check localStorage cache ──────────────────────────────
    const cacheKey = `cache_${searchQuery}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const data = JSON.parse(cached) as AnalyzeResponse;
            setResult(data);          // show cached result immediately
            updateHistory(searchQuery);
            return;                   // skip the API call entirely
        } catch (e) {
            // JSON.parse failed (corrupted cache) → fall through to API call
        }
    }

    // ── Step 2: Start loading state ───────────────────────────────────
    setLoading(true);
    setError(null);
    setResult(null);

    try {
        // ── Step 3: POST to backend ────────────────────────────────────
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const response = await fetch(`${API_URL}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: searchQuery }),
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        // ── Step 4: Parse and display result ──────────────────────────
        const data = await response.json() as AnalyzeResponse;
        setResult(data);
        
        // ── Step 5: Cache for next time ───────────────────────────────
        localStorage.setItem(cacheKey, JSON.stringify(data));
        
        updateHistory(searchQuery);
    } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
        setLoading(false);   // always stop loading, success or failure
    }
}
```

**`import.meta.env.VITE_API_URL`** — Vite's way of reading environment variables at build time. In development, this is undefined so `"http://localhost:8000"` is used. In production, set `VITE_API_URL=https://api.yoursite.com`.

#### The Agent Status Strip

During loading, the agent pills show animated spinners. After the result arrives, they show their final states (complete/warning). The `activeStatuses` function handles the loading animation:

```tsx
function activeStatuses(statuses: AgentStatus[]): AgentStatus[] {
    // If any status is already "running", use as-is
    if (statuses.some(item => item.state === "running")) return statuses;
    // Otherwise, show first status as running to indicate work started
    return statuses.map((item, index) =>
        index === 0
            ? { ...item, state: "running", detail: "Starting" }
            : item
    );
}
```

#### The Evidence Distribution Bar

```tsx
const citationsCount = result?.evidence.filter(e => e.kind === "citation").length || 0;
const patentsCount   = result?.evidence.filter(e => e.kind === "patent").length || 0;
const codeCount      = result?.evidence.filter(e => e.kind === "code").length || 0;
const totalVisual    = Math.max(1, citationsCount + patentsCount + codeCount);

// In JSX:
<div className="evidence-visual-bar">
    <div className="bar-segment citation" 
         style={{ width: `${(citationsCount / totalVisual) * 100}%` }}/>
    <div className="bar-segment code"
         style={{ width: `${(codeCount / totalVisual) * 100}%` }}/>
    <div className="bar-segment patent"
         style={{ width: `${(patentsCount / totalVisual) * 100}%` }}/>
</div>
```

**Why `Math.max(1, ...)`?** If all three counts are zero (no evidence at all), dividing by zero would give `NaN`. The max ensures we always divide by at least 1, giving 0% width for all bars, which is correct.

#### The REF Report Download

```tsx
function downloadReport() {
    if (!result?.ref_report) return;
    
    // Convert markdown to HTML that Word can understand
    const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' 
              xmlns:w='urn:schemas-microsoft-com:office:word' 
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>REF Impact Case Study</title></head>
        <body>
            ${result.ref_report.split('\n').map(line => {
                if (line.startsWith('### ')) return `<h3>${line.replace('### ', '')}</h3>`;
                if (line.startsWith('- ')) return `<ul><li>${line.replace('- ', '')}</li></ul>`;
                if (line.trim() === '') return '<br/>';
                return `<p>${line}</p>`;
            }).join('')}
        </body>
        </html>
    `;
    
    const blob = new Blob([htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `REF_Impact_Case_Study_${result.metadata.doi || "Report"}.doc`;
    a.click();
    URL.revokeObjectURL(url);   // free memory
}
```

**The `xmlns:w='urn:schemas-microsoft-com:office:word'` namespace** tells Microsoft Word that this HTML file should be treated as a Word document. Word can open HTML files with this namespace and render them as formatted documents. The `.doc` extension triggers Word to open it.

---

## 8. The Complete Journey

Here is exactly what happens from the moment you type `10.1038/nature14539` and click Analyze.

### Phase 0: Cache Check (< 1ms)

1. `analyze()` is called
2. `localStorage.getItem("cache_10.1038/nature14539")` → null (first time)
3. Proceed to API call

### Phase 1: Frontend → Backend (< 50ms)

4. `setLoading(true)` → React re-renders → spinner appears on button, first agent pill shows as "running"
5. `fetch("http://localhost:8000/api/analyze", {method:"POST", body: '{"query":"10.1038/nature14539"}'})` is called
6. FastAPI receives request
7. Pydantic validates: query is between 2-500 chars ✓
8. `analyze_paper("10.1038/nature14539")` is called

### Phase 2: LangGraph Initialisation (< 5ms)

9. `analysis_graph.ainvoke({query: "10.1038/nature14539", statuses: initial_statuses(), logs: [...], ...})` is called
10. LangGraph starts the graph from `START`

### Phase 3: metadata_node (2–12 seconds)

11. `extract_doi("10.1038/nature14539")` → `"10.1038/nature14539"` (DOI matched)
12. `httpx.AsyncClient` GET `https://api.crossref.org/works/10.1038%2Fnature14539` with timeout 12s
13. CrossRef responds:
    ```json
    {"message": {"title": ["Human-level control through deep reinforcement learning"], "author": [...], "DOI": "10.1038/nature14539", ...}}
    ```
14. `PaperMetadata(title="Human-level control...", authors=["Volodymyr Mnih", ...], year=2015, doi="10.1038/nature14539", ...)` created
15. `statuses[0] = AgentStatus(name="metadata", state="complete", detail="Paper metadata resolved")`
16. State updated: `{metadata: <PaperMetadata>, ...}`

### Phase 4: retrieval_node (8–15 seconds, all parallel)

17. 5 tasks start simultaneously via `asyncio.gather`:

    **Task A — Semantic Scholar:**
    - GET `https://api.semanticscholar.org/graph/v1/paper/10.1038%2Fnature14539?fields=...`
    - Returns: citationCount=14500, citations=[20 items with titles, abstracts, authors]
    - 20 EvidenceItem(kind="citation") created
    
    **Task B — OpenAlex Fallback:**
    - GET `https://api.openalex.org/works?search=Human-level+control...&per-page=8`
    - Returns: 8 results with citation counts and inverted abstracts
    - 8 EvidenceItem(kind="citation") created (mostly duplicates of Scholar results)
    
    **Task C — OpenAlex Enrichment:**
    - GET `https://api.openalex.org/works/doi:10.1038/nature14539`
    - Returns: topics=["Reinforcement Learning","Atari Games","Deep Learning"], 
              best_oa_location={pdf_url: "https://..."}, funders=[{name:"Google DeepMind"}]
    - 2 EvidenceItem(kind="full_text"), 1 EvidenceItem(kind="funding") created
    - topics=["Reinforcement Learning","Atari Games","Deep Learning"] extracted
    
    **Task D — GitHub:**
    - `meaningful_title_terms("Human-level control through deep reinforcement learning")`
      → ["human", "level", "control", "reinforcement"] (4 meaningful terms, ≥2 required) ✓
    - GET `https://api.github.com/search/repositories?q="Human-level+control..."&sort=stars`
    - Returns: 6 repos, top one is "openai/gym" (14,000 stars)
    - 6 EvidenceItem(kind="code") created
    
    **Task E — Google Patents:**
    - GET `https://patents.google.com/xhr/query?url=q%3D"Human-level+control..."`
    - Returns: 5 patent records from Google, Microsoft, etc.
    - 5 EvidenceItem(kind="patent") created

18. `asyncio.gather` resolves when the slowest task (probably Patents) finishes
19. `citation_count = 14500` (Scholar's count used, OpenAlex fallback not needed)
20. `dedupe_evidence(20 + 8 + 3 + 6 + 5)` → removes ~7 duplicates → ~35 unique items
21. statuses[1,2,3,5] updated to "complete"

### Phase 5: rag_node (1–3 seconds)

22. `index_and_retrieve(metadata, evidence, topics)` runs in thread pool (non-blocking)
23. For each of 35 evidence items, `evidence_text(item)` serialises to multi-line string
24. `EmbeddingProvider.embed(35 texts)`:
    - First call: lazy-loads `all-MiniLM-L6-v2` model (or uses hash fallback)
    - Returns 35 × 384-dimensional vectors
25. `collection.upsert(ids=[...35 SHA-1 hashes...], documents=[...], embeddings=[...], metadatas=[...])`
26. Query built: `"Human-level control... Reinforcement Learning Atari Games research impact applications..."`
27. Query embedded → 1 × 384-dim vector
28. `collection.query(n_results=6, where={"paper_title": "Human-level control..."})` → top 6 chunks
29. 6 most relevant evidence text strings returned as `rag_contexts`
30. statuses[4] = "complete" with "6 context chunks"

### Phase 6: synthesis_node (3–8 seconds)

31. `generate_impact_summary(metadata, 14500, evidence, topics, rag_contexts)` called
32. `GOOGLE_API_KEY` found in env → proceed
33. Evidence formatted into prompt:
    ```
    - [CITATION] Mastering the game of Go... (Semantic Scholar, 2016) — We introduce...
    - [CITATION] Playing Atari with Deep Reinforcement Learning (Semantic Scholar, 2013) — ...
    - [CODE] openai/gym (GitHub, n.d.) — A toolkit for developing reinforcement learning...
    - [PATENT] US20170178631A1 Deep reinforcement learning... (Google Patents) — ...
    ...
    ```
34. POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
35. Gemini returns ~200-word scholarly paragraph
36. `evaluate_faithfulness(summary, evidence, rag_contexts)`:
    - Separate Gemini call with summary + evidence
    - Gemini returns "8" → score = 8/10 = 0.80
37. `guardrail_status = "passed"` (0.80 ≥ 0.75)
38. 4 deterministic ImpactSections built from Python-computed evidence counts
39. statuses[6] = "complete"

### Phase 7: ref_node (2–5 seconds)

40. `generate_ref_report(metadata, evidence, summary, topics, 14500)` called
41. Gemini generates ~400-word formal REF case study with 4 sections
42. statuses[7] = "complete"

### Phase 8: Response Assembly (< 10ms)

43. `analyze_paper()` assembles the final dict:
    ```python
    {
        "metadata": state["metadata"],
        "summary": state["summary"],          # Gemini narrative
        "sections": state["sections"],         # 4 deterministic sections
        "evidence": state["evidence"][:32],   # capped at 32
        "agent_statuses": state["statuses"],   # 8 agent states
        "logs": state["logs"],                 # all trace entries
        "faithfulness_score": 0.80,
        "citation_count": 14500,
        "topics": ["Reinforcement Learning", "Atari Games", "Deep Learning"],
        "model_provider": "gemini:gemini-2.5-flash",
        "rag_context_count": 6,
        "guardrail_status": "passed",
        "limitations": [],
        "ref_report": "### 1. Summary of Impact\n...",
    }
    ```
44. FastAPI serialises to JSON and sends HTTP 200 response

### Phase 9: Frontend Update (< 50ms)

45. `fetch()` resolves with the JSON response
46. `setResult(data)` → React re-renders the entire Dashboard
47. `localStorage.setItem("cache_10.1038/nature14539", JSON.stringify(data))`
48. Paper header, summary, metrics, sections, evidence panel, REF report all render
49. `setLoading(false)` → spinner removed

**Total time: ~15–25 seconds** (mostly external API calls)

---

## 9. Every Design Decision Explained

### Why LangGraph over plain function calls?

**Plain function call version:**
```python
async def analyze_paper(query):
    metadata = await get_metadata(query)           # crashes → nothing after this
    evidence = await get_evidence(metadata)
    contexts = await get_rag_contexts(evidence)
    summary  = await synthesize(evidence, contexts)
    report   = await generate_ref(summary)
    return build_response(...)
```

Problems:
- If `get_metadata` raises an exception → the whole function crashes, user gets a 500 error
- No visibility into which step failed
- Cannot inspect state between steps
- Cannot add branches without restructuring

**LangGraph version:**
- Each node catches its own exceptions and returns safe defaults
- State is inspectable at each step
- The graph can be extended with conditional edges without changing existing nodes
- Future: add a "retry" node, a "cache lookup" node, a "parallel synthesis" branch

### Why one AnalysisState TypedDict shared across all nodes?

Alternative: Pass only what each node needs as explicit parameters.

Problem: Adding a new field (e.g., `user_id`) would require changing every node's function signature. With shared state, you add `user_id` to the TypedDict and only the nodes that care about it use it.

### Why concurrent API calls instead of sequential?

Sequential: CrossRef(12s) + Scholar(15s) + OpenAlex×2(12s each) + GitHub(8s) + Patents(12s) = **71 seconds**

Concurrent (asyncio.gather): max(all 5) ≈ **15 seconds**

The savings (56 seconds) make the difference between a usable and an unusable product.

### Why ChromaDB over just passing all evidence to Gemini?

1. **Context window cost:** Sending all 35 evidence items to Gemini is expensive (tokens)
2. **Quality:** Not all evidence is equally relevant. The RAG query finds the 6 MOST relevant chunks
3. **Persistence:** ChromaDB stores evidence across requests. Re-analysing the same paper is fast
4. **Scalability:** If we later add 100 evidence sources, we still send 6 chunks to Gemini

### Why Gemini-as-judge for faithfulness instead of human review?

Human review does not scale. You cannot ask a person to review every analysis. Gemini-as-judge provides an automated signal — not perfect, but systematic and fast. The score is shown to the user so they can decide how much to trust the output.

The judge is susceptible to "sycophancy" (rating its own outputs highly). Mitigations:
- Temperature 0.3 (less room for rationalisation)
- Request only an integer output (no narrative that could be self-justifying)
- Show the score to the user with context (≥0.85 "Strong", ≥0.70 "Developing", else "Needs evidence")
- Future: use a separate judge model

### Why hash embedding fallback over just failing?

If `sentence_transformers` fails to install (e.g., Docker image without PyTorch), there are two options:
1. Crash with an error → entire RAG system unavailable
2. Fall back to hash embeddings → RAG still works (worse quality, but functional)

Option 2 is always better for a production system. Graceful degradation.

### Why LocalStorage caching with no TTL?

**Pro:** Eliminates repeated API calls for the same paper. A paper's impact does not change in seconds.

**Con:** Stale data. If Semantic Scholar adds 1000 new citations for a paper, the cached result still shows the old number.

**Why no TTL anyway?** This is an MVP/demo. Implementing TTL adds complexity (storing timestamp + cache key + checking expiry). The user can clear their cache. In production, a 24-hour TTL would be appropriate.

### Why no persistent user database?

The current system is stateless. Every analysis is fresh. This means:
- No PostgreSQL to set up
- No user accounts to manage
- No GDPR concerns about personal data
- Simpler deployment

The trade-off: users cannot save or retrieve past analyses. This is intentional for the MVP.

### Why FastAPI over Flask or Django?

| Feature | FastAPI | Flask | Django |
|---|---|---|---|
| Async support | Native | Workaround | Partial |
| Pydantic integration | Built-in | Manual | Manual |
| OpenAPI docs | Automatic | Plugin | Plugin |
| Speed | Very fast | Moderate | Moderate |
| Learning curve | Low | Very low | High |

FastAPI is the modern choice for API-first Python backends. Our app is entirely API-driven — no server-rendered HTML — so Django's full-stack features are wasted weight.

---

## 10. What Makes This Production-Grade

### Fault Tolerance at Every Layer

Every external API call is wrapped in `try/except`. A single failure never crashes the pipeline. Instead:
- The failed agent returns empty data and a warning status
- The pipeline continues with whatever data it has
- The user sees which agents succeeded/failed via the status strip

### Input Sanitisation

The DOI regex (`10\.\d{4,9}/[-._();/:A-Z0-9]+`) only matches valid DOI patterns. Garbage like `<script>alert(1)</script>` matches nothing. CrossRef/Semantic Scholar receive a cleaned DOI, not raw user input.

The Pydantic `min_length=2, max_length=500` constraint prevents empty or excessively long queries from reaching the pipeline at all.

### Idempotent Storage

SHA-1 stable document IDs mean you can run the same analysis 100 times and ChromaDB never accumulates duplicates. The vector store grows with new papers, not with repeated analyses.

### Environment-Based Configuration

No secrets are hardcoded. Every sensitive value (`GOOGLE_API_KEY`, `GITHUB_TOKEN`, etc.) is read from environment variables. The `.env` file is gitignored. In production, environment variables are set via the deployment platform's secret management.

### Docker Containerisation

The entire system (frontend + backend) runs via `docker-compose up`. No installation required beyond Docker. The system behaves identically on your MacBook, a Windows machine, and a Linux cloud server.

### Separation of Concerns

- `models.py` → data shapes only (no business logic)
- `rag.py` → vector operations only (no API calls)
- `llm.py` → Gemini calls only (no data processing)
- `services.py` → orchestration (calls the others)
- `main.py` → routing only (calls `analyze_paper`)
- `Dashboard.tsx` → rendering only (calls the API, displays results)

Each file can be tested, replaced, or refactored independently.

---

## 11. The Data — What Goes In, What Comes Out

### Request (what you send)

```json
{
  "query": "10.1038/nature14539"
}
```

Or a title: `"Attention Is All You Need"`. That's it.

### Response (what you get back) — Full Annotated Example

```json
{
  "metadata": {
    "title": "Human-level control through deep reinforcement learning",
    "authors": ["Volodymyr Mnih", "Koray Kavukcuoglu", "David Silver"],
    "year": 2015,
    "doi": "10.1038/nature14539",
    "abstract": "The theory of reinforcement learning provides a normative...",
    "source_url": "http://dx.doi.org/10.1038/nature14539"
  },
  
  "summary": "Human-level control through deep reinforcement learning (2015) by Mnih et al. 
               has accumulated over 14,500 citations, establishing deep reinforcement 
               learning as a foundational approach in artificial intelligence...",
  
  "sections": [
    {
      "title": "Research Influence",
      "body": "The paper is represented in citation databases with 14,500 citations. 
               The RAG layer retrieved 6 vector-memory chunks for synthesis."
    },
    {
      "title": "Applications",
      "body": "Detected topics include Reinforcement Learning, Atari Games, Deep Learning."
    },
    {
      "title": "Technical Adoption",
      "body": "The GitHub agent found 6 repository matches for adoption signals."
    },
    {
      "title": "Access & Funding",
      "body": "The content agent found 2 source routes and 1 funder signal."
    }
  ],
  
  "evidence": [
    {
      "title": "Mastering the game of Go with deep neural networks",
      "url": "https://www.semanticscholar.org/paper/...",
      "year": 2016,
      "authors": ["David Silver", "Aja Huang"],
      "snippet": "The game of Go has long been viewed as the most challenging...",
      "source": "Semantic Scholar",
      "kind": "citation",
      "citation_count": 9800,
      "metric_label": null,
      "metric_value": null
    },
    {
      "title": "openai/gym",
      "url": "https://github.com/openai/gym",
      "year": null,
      "authors": ["openai"],
      "snippet": "A toolkit for developing and comparing reinforcement learning algorithms",
      "source": "GitHub",
      "kind": "code",
      "citation_count": null,
      "metric_label": "Stars",
      "metric_value": "34,000"
    },
    {
      "title": "[US20170178631A1] Deep reinforcement learning system",
      "url": "https://patents.google.com/patent/US20170178631A1/en",
      "year": 2017,
      "authors": ["Google LLC"],
      "snippet": "Systems and methods for training a reinforcement learning model...",
      "source": "Google Patents",
      "kind": "patent",
      "citation_count": null,
      "metric_label": "Assignee",
      "metric_value": "Google LLC"
    }
  ],
  
  "agent_statuses": [
    {"name": "metadata",  "label": "Metadata",   "state": "complete", "detail": "Paper metadata resolved"},
    {"name": "scholar",   "label": "Scholar",    "state": "complete", "detail": "35 evidence items retrieved"},
    {"name": "content",   "label": "Content",    "state": "complete", "detail": "3 topics, 2 links"},
    {"name": "code",      "label": "Code",       "state": "complete", "detail": "6 repository leads"},
    {"name": "rag",       "label": "RAG",        "state": "complete", "detail": "6 context chunks"},
    {"name": "impact",    "label": "Impact",     "state": "complete", "detail": "Patent search lead prepared"},
    {"name": "synthesis", "label": "Synthesis",  "state": "complete", "detail": "Summary ready"},
    {"name": "ref",       "label": "REF Report", "state": "complete", "detail": "Report generated"}
  ],
  
  "logs": [
    {"timestamp": "14:23:00", "agent": "Supervisor", "message": "LangGraph analysis started", "data": {"query": "10.1038/nature14539"}},
    {"timestamp": "14:23:00", "agent": "Metadata",   "message": "Resolving input with CrossRef", "data": {}},
    {"timestamp": "14:23:02", "agent": "Metadata",   "message": "Metadata resolved", "data": {"title": "Human-level control...", "doi": "10.1038/nature14539"}},
    {"timestamp": "14:23:02", "agent": "Scholar",    "message": "Querying Semantic Scholar Academic Graph", "data": {}},
    {"timestamp": "14:23:14", "agent": "Scholar",    "message": "Citation data retrieved", "data": {"citation_count": 14500, "evidence_items": 20}},
    {"timestamp": "14:23:14", "agent": "RAG",        "message": "Loaded Hugging Face embedding model", "data": {"model": "sentence-transformers/all-MiniLM-L6-v2"}},
    {"timestamp": "14:23:15", "agent": "RAG",        "message": "Retrieved vector context", "data": {"chunks": 6}},
    {"timestamp": "14:23:16", "agent": "LLM",        "message": "Gemini generated impact narrative", "data": {"model": "gemini-2.5-flash", "words": 198}},
    {"timestamp": "14:23:17", "agent": "Judge",      "message": "Gemini faithfulness score: 0.8", "data": {"model": "gemini-2.5-flash"}},
    {"timestamp": "14:23:17", "agent": "Guardrail",  "message": "Faithfulness guardrail evaluated summary", "data": {"faithfulness_score": 0.8, "status": "passed"}},
    {"timestamp": "14:23:18", "agent": "LLM",        "message": "Gemini generated REF case study", "data": {"model": "gemini-2.5-flash"}},
    {"timestamp": "14:23:18", "agent": "Supervisor", "message": "Analysis complete", "data": {}}
  ],
  
  "faithfulness_score": 0.8,
  "citation_count": 14500,
  "topics": ["Reinforcement Learning", "Atari Games", "Deep Learning"],
  "model_provider": "gemini:gemini-2.5-flash",
  "rag_context_count": 6,
  "guardrail_status": "passed",
  "limitations": [],
  "ref_report": "### 1. Summary of Impact\nThis seminal 2015 paper by Mnih et al. demonstrated..."
}
```

---

## 12. Common Questions and Misconceptions

**Q: Does this system store my paper searches permanently?**

A: The ChromaDB vector store on disk persists evidence from past analyses. The browser localStorage cache persists responses. Neither contains user identity — it is just paper data. No user database exists.

---

**Q: Can the AI make things up (hallucinate)?**

A: The design minimises this but cannot eliminate it. Gemini only receives evidence we retrieved from real APIs, so it cannot invent citations we didn't find. However, Gemini could misinterpret or misattribute evidence within what we give it. This is why the faithfulness score and the evidence panel exist — the user can verify every claim.

---

**Q: What happens if Gemini's API is down?**

A: The `_complete()` function returns `None`. `generate_impact_summary()` returns `(None, "deterministic", logs)`. In `synthesis_node`, the code falls back to the deterministic template:
```python
summary = hf_summary or deterministic_summary
```
The response still includes `limitations: ["GOOGLE_API_KEY not set — using deterministic synthesis"]`. The user knows why.

---

**Q: Why does the system use 5 different APIs? Isn't one enough?**

A: No single database has everything. Semantic Scholar has citations but not GitHub repos. GitHub has repos but not patents. Google Patents has patents but not funding records. OpenAlex has topics and funders but limited citation depth. The five-source approach is what enables REF-quality evidence — which the UK government explicitly requires to be multi-dimensional.

---

**Q: Why does analysing an obscure paper give a low faithfulness score?**

A: An obscure paper has few or no citations in Semantic Scholar, no GitHub repos, and no patents. The evidence list is nearly empty. Gemini has almost nothing to write about. The heuristic faithfulness score starts at 0.45 (base) with no bonuses because there are no citations, no RAG contexts, and no topics. The system correctly communicates "we don't have enough evidence to make strong claims" — which is honest and useful.

---

**Q: Why is the authentication so simple (localStorage only)?**

A: The current auth is a frontend-only UX gate for demo purposes. The backend `/api/analyze` endpoint accepts any request from allowed origins. A production system would:
1. Issue JWT tokens from a backend auth endpoint
2. Validate the token in a FastAPI dependency on every request
3. Rate-limit per user
4. The `dazzling-williamson` branch has Firebase + LinkedIn auth partially implemented in `auth.py`

---

**Q: Why does the same paper sometimes give different summaries?**

A: Gemini uses temperature 0.3 (not 0.0). Temperature > 0 means there is randomness in token selection. The summary will be similar but not identical across runs. If you want perfectly reproducible outputs, set temperature to 0.0 — but this makes the text more robotic.

---

**Q: What is the `model_provider` field for?**

A: It tells you HOW the summary was generated:
- `"gemini:gemini-2.5-flash"` → Gemini API was used successfully
- `"deterministic"` → No API key or API failed, template was used
- `"deterministic+hf-rag"` → Older branch: HF SLM used for RAG but not generation

This is useful for debugging and for auditing which outputs came from the AI vs. the template.

---

**Q: Why are some evidence items duplicated across Semantic Scholar and OpenAlex?**

A: Both databases index the same academic literature, so the same paper may appear in both. `dedupe_evidence()` removes duplicates by comparing normalised URLs or titles. The key is `(item.url or item.title).lower()` — same URL or same title is treated as the same paper.

---

**Q: Why are the 4 ImpactSections always the same structure regardless of the paper?**

A: By design. The 4 sections (Research Influence, Applications, Technical Adoption, Access & Funding) correspond to 4 types of evidence we retrieve. The content of each section varies (different numbers, different topic names), but the categories are fixed. This ensures consistent, comparable output across all papers. Users know exactly what to expect and where to look.

---

This document covers every concept, every design decision, every line of code that matters. You now have a complete mental model of the system — from the HTTP request entering the frontend to the Gemini response returning to the user, and every piece in between.
