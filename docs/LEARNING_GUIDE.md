# Impact Lab — Complete Learning Guide
### Own Every Line of This Project

> **How to use this guide:** Work through the modules in order. Each module has a "why it matters to THIS project" section so you always understand *why* you're learning something. Don't just watch — build small experiments as you go. Estimated total: **6–8 weeks** at 1–2 hours/day.

---

## Study Roadmap

```
Week 1   → Python foundations + FastAPI
Week 2   → Async Python + APIs + httpx
Week 3   → AI/ML concepts + RAG + ChromaDB
Week 4   → LangGraph + multi-agent systems
Week 5   → React + TypeScript frontend
Week 6   → Docker + deployment + CI/CD
Week 7   → Read and explain every file in the project
Week 8   → Extend the project (add a feature yourself)
```

---

## MODULE 1 — Python & FastAPI (Week 1)

### Why this matters to your project
`main.py` is the entire backend API. Every HTTP request from the browser goes through FastAPI. You need to understand decorators, type hints, async functions, and Pydantic models to own the backend.

### Core Concepts to Master
- [ ] Python type hints (`str`, `int`, `list[str]`, `dict[str, Any]`)
- [ ] Pydantic models — validation, serialisation, `.model_dump()`
- [ ] FastAPI route decorators (`@app.get`, `@app.post`)
- [ ] `Depends()` — dependency injection (used for auth in your project)
- [ ] `HTTPException` — how errors are returned
- [ ] CORS middleware — why it exists, what it protects

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [Python Type Hints — Full Tutorial](https://youtu.be/QORvB-_mbZ0) | ArjanCodes | Type hints are everywhere in your codebase |
| [FastAPI Course for Beginners](https://youtu.be/tLKKmouUams) | freeCodeCamp | 1 hour, covers everything used in main.py |
| [Pydantic V2 Tutorial](https://youtu.be/XIdQ6gO3Anc) | ArjanCodes | Your models.py uses Pydantic V2 |
| [FastAPI in 100 Seconds](https://youtu.be/_wZr0VXB1aY) | Fireship | Quick mental model first |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/main.py — understand every line
@app.post("/api/analyze")
async def analyze(
    request: Request,
    body: AnalyzeRequest = Body(...),          # Pydantic validation
    current_user: Optional[dict] = Depends(get_current_user)  # Dependency injection
) -> dict:
    rate_limit(request, limit=10, window=60)   # Custom middleware
    ...

# backend/app/models.py — understand every model
class EvidenceItem(BaseModel):
    title: str
    url: str | None = None    # Optional field
    kind: str = "citation"    # Default value
```

### Mini Exercise
Build a FastAPI app with 3 routes:
1. `GET /papers` — returns a hardcoded list of papers
2. `POST /papers` — accepts a Pydantic model with title + doi
3. `GET /papers/{doi}` — returns a specific paper

---

## MODULE 2 — Async Python + HTTP Clients (Week 2)

### Why this matters to your project
Every retrieval agent in `services.py` makes async HTTP calls to 7 external APIs simultaneously. If you don't understand `async/await` and `asyncio`, you can't understand how the pipeline works or debug it.

### Core Concepts to Master
- [ ] `async def` vs `def` — what's the difference
- [ ] `await` — what it actually does (pauses, gives control back)
- [ ] `asyncio.gather()` — running multiple async tasks at once
- [ ] `asyncio.to_thread()` — running sync code without blocking (used for Gemini calls)
- [ ] `httpx.AsyncClient` — async HTTP requests
- [ ] Context managers (`async with`)

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [Python Async Explained Simply](https://youtu.be/t5Bo1Je9EmE) | Tech With Tim | Best beginner async explanation |
| [AsyncIO Complete Tutorial](https://youtu.be/Qb9s3UiMSTA) | ArjanCodes | Deep dive, covers asyncio.gather |
| [HTTPX Tutorial](https://youtu.be/OPyoXx0rWqo) | ArjanCodes | Same library used in your project |
| [Async Python in 7 Minutes](https://youtu.be/2IW-ZEui4h4) | Fireship | Quick mental model |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/services.py — how 6 agents run in parallel
async def analyze_paper(query: str) -> dict:
    # LangGraph runs these nodes — each makes async HTTP calls
    # Understanding async is key to understanding why it's ~6 seconds not ~36 seconds

# backend/app/hf_synthesis.py — sync function called async
summary = await asyncio.to_thread(_call, system, user, 2000)
# _call() is sync (httpx.post) but we don't want it to block the event loop
# asyncio.to_thread() runs it in a thread pool — this is the RIGHT way to do it
```

### Mini Exercise
Write an async script that calls 3 APIs simultaneously (OpenAlex, CrossRef, GitHub) using `asyncio.gather()` and prints all results. Compare the time vs calling them sequentially.

---

## MODULE 3 — REST APIs & HTTP (Week 2, Part 2)

### Why this matters to your project
Your project calls 7 external APIs. You need to understand how APIs work, what JSON is, what HTTP status codes mean, and how to read API documentation.

### Core Concepts to Master
- [ ] HTTP methods: GET, POST, PUT, DELETE
- [ ] Status codes: 200, 201, 400, 401, 403, 404, 422, 429, 500
- [ ] Headers: `Authorization`, `Content-Type`, `User-Agent`
- [ ] Query parameters vs body vs path parameters
- [ ] Rate limiting — what 429 means, why you handle it in your project
- [ ] JSON — parsing, serialising

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [REST API Crash Course](https://youtu.be/qbLc5a9jdXo) | Traversy Media | Foundation for understanding all 7 APIs |
| [HTTP Status Codes Explained](https://youtu.be/wJa5CTIFj7U) | Fireship | You'll debug these constantly |
| [Working with APIs in Python](https://youtu.be/tb8gHvYlCFs) | freeCodeCamp | Practical Python API calls |

### APIs Used in YOUR Project — Read Their Docs
| API | Docs URL | What your code does with it |
|---|---|---|
| CrossRef | [api.crossref.org](https://api.crossref.org) | DOI resolution, metadata |
| OpenAlex | [docs.openalex.org](https://docs.openalex.org) | Citations, topics |
| Semantic Scholar | [api.semanticscholar.org](https://api.semanticscholar.org/graph/v1) | Citation graph |
| GitHub | [docs.github.com/rest](https://docs.github.com/rest) | Repo search |
| Europe PMC | [europepmc.org/RestfulWebService](https://europepmc.org/RestfulWebService) | Policy mentions |

### Mini Exercise
Using just `httpx`, call the CrossRef API for `10.1038/nature14539` and print the title, authors, and citation count. No framework — raw HTTP.

---

## MODULE 4 — AI / LLMs / RAG (Week 3)

### Why this matters to your project
The entire point of the project is AI-generated summaries. You need to understand what an LLM is, what a prompt is, what "grounding" means, and what RAG does — otherwise you can't explain your own project.

### Core Concepts to Master
- [ ] What is an LLM — tokens, context window, temperature
- [ ] Prompt engineering — system prompt vs user prompt
- [ ] What "hallucination" means and why it's a problem
- [ ] RAG — Retrieval Augmented Generation: what it is and why it helps
- [ ] Vector embeddings — how text becomes a vector of numbers
- [ ] Semantic similarity — how ChromaDB finds relevant chunks
- [ ] Faithfulness — is the summary grounded in the evidence?

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [LLMs Explained Simply](https://youtu.be/zjkBMFhNj_g) | Andrej Karpathy | The best LLM explanation ever made |
| [RAG Explained](https://youtu.be/T-D1OfcDW1M) | IBM Technology | Exactly what your project does |
| [Vector Embeddings Explained](https://youtu.be/yfHHvmjyafk) | Fireship | How ChromaDB works |
| [Prompt Engineering Guide](https://youtu.be/jC4v5AS4RIM) | freeCodeCamp | You write prompts in hf_synthesis.py |
| [ChromaDB Tutorial](https://youtu.be/QSW2L8dkaZk) | Sam Witteveen | Exactly the library you use |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/hf_synthesis.py — YOUR LLM prompts
system = (
    "You are a rigorous research impact analyst. Ground every claim in the evidence. "
    "Do not invent statistics or institutions. Acknowledge uncertainty when evidence is thin."
)
user = f"""Write a 200-word impact narrative for this paper based strictly on the evidence below.
Paper: {metadata.title}
Citations: {citation_count:,}
Evidence:
{ev}
RAG context:
{rag}
Write exactly one paragraph (~200 words). Be honest about uncertainty."""

# backend/app/rag.py — YOUR vector store
collection.upsert(ids=ids, documents=texts, embeddings=vectors, metadatas=metadatas)
result = collection.query(query_embeddings=query_vectors, n_results=6)
```

### The RAG Flow in YOUR Project (Read This Carefully)
```
Evidence items (30-50 items from 7 APIs)
    │
    ▼
sentence-transformers embeds each item → 384-dimension vector
    │
    ▼
ChromaDB stores all vectors (upsert — won't duplicate)
    │
    ▼
Query vector built from: title + abstract + topics + "research impact..."
    │
    ▼
ChromaDB returns 6 most similar chunks (semantic similarity)
    │
    ▼
Those 6 chunks go into the Gemini prompt
    │
    ▼
Gemini generates 200-word summary grounded in those chunks
```

### Mini Exercise
1. Install `sentence-transformers` and `chromadb`
2. Embed 10 sentences about AI papers
3. Store them in ChromaDB
4. Query with "transformer architecture" and see what comes back

---

## MODULE 5 — LangGraph & Multi-Agent Systems (Week 4)

### Why this matters to your project
`services.py` is built entirely on LangGraph. The whole retrieval pipeline is a LangGraph state machine. You need to understand graphs, nodes, edges, and state to explain how 6 agents run.

### Core Concepts to Master
- [ ] What is an agent — a function that takes state and returns state
- [ ] State machine — nodes + edges + shared state
- [ ] LangGraph `StateGraph` — how to define nodes and connect them
- [ ] `TypedDict` — the typed state object flowing through the graph
- [ ] `START` and `END` — entry and exit nodes
- [ ] Why agents vs a simple for-loop (structured state, future parallelism, auditability)

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [LangGraph Tutorial for Beginners](https://youtu.be/5h-JBkySK34) | freeCodeCamp | Full tutorial on exactly what you use |
| [AI Agents Explained](https://youtu.be/F8NKVhkZZWI) | IBM Technology | What an agent actually is |
| [LangGraph in 10 Minutes](https://youtu.be/hvAPnpSfSGo) | Patrick Loeber | Quick LangGraph mental model |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/services.py — YOUR LangGraph graph
class PipelineState(TypedDict):
    query: str
    doi: str | None
    metadata: PaperMetadata | None
    evidence: list[EvidenceItem]
    logs: list[TraceLog]
    ...

graph = StateGraph(PipelineState)
graph.add_node("metadata", metadata_node)      # Node 1: resolve DOI
graph.add_node("openalex", openalex_node)      # Node 2: get citations
graph.add_node("github", github_node)          # Node 3: find code repos
# ... more nodes ...
graph.add_node("synthesise", synthesise_node)  # Final node: LLM summary

graph.add_edge(START, "metadata")
graph.add_edge("metadata", "openalex")
# ... edges connect nodes in sequence ...
graph.add_edge("synthesise", END)
```

### Mini Exercise
Build a 3-node LangGraph that:
1. Takes a paper title as input
2. Node 1: fetches DOI from CrossRef
3. Node 2: fetches citation count from OpenAlex
4. Node 3: prints a summary

---

## MODULE 6 — React & TypeScript Frontend (Week 5)

### Why this matters to your project
`Dashboard.tsx` is 1300+ lines. You need to understand React hooks, state management, component composition, and TypeScript types to own the frontend.

### Core Concepts to Master
- [ ] JSX — HTML inside JavaScript
- [ ] Components — functions that return JSX
- [ ] Props — passing data into components
- [ ] State (`useState`) — data that changes and triggers re-renders
- [ ] Effects (`useEffect`) — running code when component mounts or state changes
- [ ] Event handlers — `onClick`, `onSubmit`, `onChange`
- [ ] `fetch` / `async` in React — calling your backend API
- [ ] TypeScript interfaces and types
- [ ] React Router — `useNavigate`, route definitions
- [ ] React Context — global state (used for auth in your project)

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [React Full Course 2024](https://youtu.be/CgkZ7MvWUAA) | freeCodeCamp | Comprehensive, covers everything |
| [React in 100 Seconds](https://youtu.be/Tn6-PIqc4UM) | Fireship | Quick mental model first |
| [TypeScript for React Developers](https://youtu.be/FJDVKeh7RJI) | Traversy Media | Types + React together |
| [React useState Hook](https://youtu.be/O6P86uwfdR0) | Web Dev Simplified | Most important hook |
| [React Context Explained](https://youtu.be/5LrDIWkK_Bc) | Web Dev Simplified | Used for auth in your project |
| [React Router v6](https://youtu.be/Ul3y1LXxzdU) | Web Dev Simplified | Routing in your project |

### Key Code in YOUR Project to Read After Watching
```typescript
// frontend/src/Dashboard.tsx — core state
const [result, setResult] = useState<AnalyzeResponse | null>(null);
const [loading, setLoading] = useState(false);
const [activeTab, setActiveTab] = useState("overview");

// The analyze function — calling your FastAPI backend
const analyze = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    setLoading(true);
    try {
        const res = await fetch(`${API_URL}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        setResult(data);           // triggers re-render
        setActiveTab("overview");
    } finally {
        setLoading(false);
    }
};

// frontend/src/AuthContext.tsx — React Context
const Ctx = createContext<AuthCtx>({ ... });
export const useAuth = () => useContext(Ctx);  // used in any component
```

### Mini Exercise
Build a React + TypeScript component that:
1. Has an input box for a DOI
2. On submit, calls `GET https://api.crossref.org/works/{doi}`
3. Displays the title, authors, and year
4. Shows a loading spinner while fetching

---

## MODULE 7 — CSS & Design Systems (Week 5, Part 2)

### Why this matters to your project
`styles.css` is 2500 lines. It uses CSS custom properties (variables) to implement the entire Impact Lab design system. You need to understand how the design tokens work.

### Core Concepts to Master
- [ ] CSS custom properties (`--paper`, `--accent`, etc.)
- [ ] Flexbox — most of your layout uses it
- [ ] CSS selectors and specificity
- [ ] `@media` queries (responsive design)
- [ ] CSS transitions and animations (the `.spin` class, `.running-dot`)
- [ ] BEM naming convention (`.sidebar-stat-label`, `.faith-chip.strong`)

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [CSS Variables in 6 Minutes](https://youtu.be/oZPR_78wCnY) | Web Dev Simplified | Exactly what your design tokens use |
| [Flexbox in 15 Minutes](https://youtu.be/fYq5PXgSsbE) | Web Dev Simplified | 90% of your layout is flexbox |
| [CSS Design Systems](https://youtu.be/lRaL-8qZ0mM) | Kevin Powell | How design tokens work |

### Key Pattern in YOUR Project
```css
/* Design tokens — defined once, used everywhere */
:root {
    --paper:   #FCFCFA;   /* page background */
    --accent:  #3D4ED8;   /* indigo — buttons, links */
    --sage:    #4F7A5C;   /* green — "complete" state */
    --ochre:   #A7791B;   /* amber — "running" state */
    --rust:    #9F3A2E;   /* red — "error" state */
}

/* Usage — change --accent once, updates everything */
.btn-primary { background: var(--accent); }
.tab-btn.active { color: var(--accent); }
.faith-chip.strong { background: var(--sage-100); color: var(--sage); }
```

---

## MODULE 8 — Authentication & Security (Week 5, Part 3)

### Why this matters to your project
Your project has 3 auth methods (Google, GitHub, LinkedIn) and multiple security layers. You need to understand JWT, OAuth, and Firebase to explain the auth system.

### Core Concepts to Master
- [ ] What JWT is — header, payload, signature
- [ ] OAuth 2.0 flow — why you redirect, what the code exchange is
- [ ] Firebase Authentication — what it handles for you
- [ ] Why CORS exists and what `ALLOWED_ORIGINS` does
- [ ] What the sliding window rate limiter does and why

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [JWT Explained](https://youtu.be/7Q17ubqLfaM) | Web Dev Simplified | Used for LinkedIn auth in your project |
| [OAuth 2.0 Explained](https://youtu.be/ZV5yTm4pT8g) | Web Dev Simplified | LinkedIn OAuth flow in your project |
| [Firebase Auth Tutorial](https://youtu.be/9kRgVxULbag) | Fireship | Google/GitHub auth in your project |
| [CORS Explained](https://youtu.be/4KHiSt0oLJ0) | Fireship | Why you have ALLOWED_ORIGINS |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/main.py — rate limiter (pure Python sliding window)
_rate_buckets: dict[str, list[float]] = defaultdict(list)

def _check_rate(key: str, limit: int, window: int) -> None:
    now = time.time()
    _rate_buckets[key] = [t for t in _rate_buckets[key] if now-t < window]
    if len(_rate_buckets[key]) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests")
    _rate_buckets[key].append(now)
```

Can you explain what this does line by line? (You should be able to after this module.)

---

## MODULE 9 — Docker & Containers (Week 6)

### Why this matters to your project
Your backend runs in Docker on Railway. You have 3 Docker Compose files. You need to understand images, containers, layers, and volumes to debug deployment issues.

### Core Concepts to Master
- [ ] Image vs container — what's the difference
- [ ] `Dockerfile` — `FROM`, `WORKDIR`, `COPY`, `RUN`, `CMD`
- [ ] Layer caching — why `COPY requirements.txt` comes before `COPY app/`
- [ ] Volumes — persisting data between container restarts
- [ ] Docker Compose — multi-container apps
- [ ] Environment variables in Docker (`ENV`, `--env-file`, `${VAR}`)
- [ ] Port mapping — `"8000:8000"` means host:container

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [Docker in 100 Seconds](https://youtu.be/Gjnup-PuquQ) | Fireship | Best quick mental model |
| [Docker Tutorial for Beginners](https://youtu.be/pTFZFxd5hgI) | NetworkChuck | Fun, comprehensive |
| [Docker Compose Tutorial](https://youtu.be/DM65_JyGxCo) | TechWorld with Nana | Your project has 3 compose files |

### Key Code in YOUR Project to Read After Watching
```dockerfile
# backend/Dockerfile — understand every line
FROM python:3.11-slim              # base image (slim = smaller)

WORKDIR /app                       # all commands run from here

COPY requirements.txt .            # copy JUST this first
RUN pip install -r requirements.txt  # install — cached if requirements.txt unchanged

COPY app/ ./app/                   # copy code AFTER deps (cache efficiency)

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Key insight:** If you `COPY . .` first then `RUN pip install`, every code change invalidates the pip cache → slow builds. Always copy `requirements.txt` first.

### Mini Exercise
Write a Dockerfile for a simple FastAPI app with 2 routes. Build it, run it, curl it. Then change the code and notice the layer cache kicks in.

---

## MODULE 10 — CI/CD & GitHub Actions (Week 6, Part 2)

### Why this matters to your project
You have 3 GitHub Actions workflows. You need to understand YAML syntax, jobs, steps, secrets, and environments to extend or debug the CI/CD pipeline.

### Core Concepts to Master
- [ ] YAML syntax — indentation, lists, maps
- [ ] Workflow triggers — `on: push`, `on: pull_request`
- [ ] Jobs — run in parallel by default
- [ ] Steps — run sequentially within a job
- [ ] `needs:` — job dependency (run after another job)
- [ ] Secrets — `${{ secrets.MY_KEY }}` — never in code
- [ ] Variables — `${{ vars.MY_URL }}` — non-sensitive config
- [ ] `environment:` — deployment environments with approval gates

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [GitHub Actions Tutorial](https://youtu.be/R8_veQiYBjI) | TechWorld with Nana | Best comprehensive tutorial |
| [GitHub Actions in 100 Seconds](https://youtu.be/eB0nUzAI7M8) | Fireship | Quick mental model |
| [CI/CD Explained](https://youtu.be/scEDHsr3APg) | IBM Technology | Concept before implementation |

### Key Code in YOUR Project to Read After Watching
```yaml
# .github/workflows/ci.yml — understand this whole file
name: CI — Test & Build

on:
  push:
    branches: [main, develop]   # triggers on push to these branches

jobs:
  backend-test:                  # job 1
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # downloads your code
      - uses: actions/setup-python@v5      # installs Python
        with:
          python-version: "3.11"
      - run: pip install -r backend/requirements.txt
      - run: cd backend && pytest tests/   # runs your tests
```

---

## MODULE 11 — SQLite & Databases (Self-study)

### Why this matters to your project
`database.py` stores every analysis and evaluation in SQLite. You need to understand SQL, table schemas, and queries to understand what data is persisted.

### Core Concepts to Master
- [ ] SQL: `CREATE TABLE`, `INSERT INTO`, `SELECT`, `WHERE`, `ORDER BY`
- [ ] SQLite vs PostgreSQL — when to use which
- [ ] Python `sqlite3` module — connections, cursors, `row_factory`
- [ ] Why JSON is stored as text in SQLite (`json.dumps`, `json.loads`)

### YouTube
| Video | Channel | Why Watch |
|---|---|---|
| [SQLite in Python](https://youtu.be/byHcYRpMgI4) | Tech With Tim | Exactly the library used in database.py |
| [SQL Crash Course](https://youtu.be/HXV3zeQKqGY) | Traversy Media | Foundation for reading database.py |

### Key Code in YOUR Project to Read After Watching
```python
# backend/app/database.py
def get_stats() -> dict:
    with _conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
        avg_faith = conn.execute(
            "SELECT AVG(faithfulness_score) FROM analyses WHERE faithfulness_score IS NOT NULL"
        ).fetchone()[0]
        return {"total_analyses": total, "avg_faithfulness": round(float(avg_faith or 0), 2)}
```

---

## MODULE 12 — Read Every File (Week 7)

After studying all the above, go through each file in order and write **one paragraph** explaining what it does in your own words. Don't look at any notes — just read the code.

### Reading Order
```
1.  backend/app/validation.py      (simplest — start here)
2.  backend/app/models.py          (data shapes)
3.  backend/app/database.py        (SQL persistence)
4.  backend/app/access_guard.py    (fuzzy name matching)
5.  backend/app/auth.py            (JWT + OAuth)
6.  backend/app/rag.py             (ChromaDB + embeddings)
7.  backend/app/hf_synthesis.py    (Gemini prompts)
8.  backend/app/evaluation.py      (baseline comparison)
9.  backend/app/ref_beta.py        (REF 2029 writer)
10. backend/app/services.py        (LangGraph pipeline — hardest)
11. backend/app/main.py            (API routes)
12. frontend/src/AuthContext.tsx   (auth state)
13. frontend/src/LoginModal.tsx    (auth UI)
14. frontend/src/LandingPage.tsx   (marketing page)
15. frontend/src/Dashboard.tsx     (main app — hardest)
```

**Test:** Can you explain any file to your supervisor without looking at it?

---

## MODULE 13 — Extend the Project (Week 8)

The real test of ownership: add something yourself.

### Suggested Features (pick one)
1. **Add ORCID API retrieval** — fetch researcher profile data alongside the paper
2. **Add citation trend chart** — show citations per year using a simple bar chart
3. **Add paper comparison** — analyse 2 papers and compare their impact side by side
4. **Add email export** — send the impact summary to an email address
5. **Add search history search** — filter the sidebar recent queries

### How to approach it
1. Decide which file(s) you need to change
2. Write the backend route first — test with curl
3. Update the Pydantic models if needed
4. Add the UI in Dashboard.tsx
5. Test end to end

---

## Quick Reference — Key Concepts by File

| File | Key Concepts to Know |
|---|---|
| `main.py` | FastAPI, CORS, rate limiting, Pydantic, Depends |
| `models.py` | Pydantic BaseModel, type hints, Optional, Field |
| `services.py` | LangGraph, StateGraph, async/await, TypedDict |
| `rag.py` | ChromaDB, embeddings, semantic search, vector similarity |
| `hf_synthesis.py` | LLM, prompting, Gemini API, faithfulness scoring |
| `evaluation.py` | Baseline comparison, RAG vs no-RAG, JATS XML |
| `ref_beta.py` | Multi-step LLM pipeline, JSON parsing, word count |
| `database.py` | SQLite, SQL queries, JSON serialisation |
| `access_guard.py` | Fuzzy string matching, difflib, auth gates |
| `auth.py` | JWT, OAuth 2.0, Firebase, PyJWT |
| `validation.py` | Regex, input sanitisation, security |
| `Dashboard.tsx` | React, useState, useEffect, TypeScript, fetch |
| `AuthContext.tsx` | React Context, Firebase SDK, OAuth |
| `styles.css` | CSS variables, Flexbox, design tokens |

---

## Questions You Should Be Able to Answer

After completing this guide, you should be able to answer all of these without notes:

1. What happens between clicking "Analyse" and seeing the result?
2. Why does the app use 7 APIs instead of just one?
3. What is RAG and why does it improve faithfulness?
4. Why was `torch` removed from requirements.txt for deployment?
5. What does the faithfulness score measure and how is it calculated?
6. Why can't you just use ChatGPT directly — what does this system add?
7. What is LangGraph and why is it better than a for-loop?
8. How does the rate limiter work?
9. What does DEMO_MODE=true do?
10. What happens if Gemini returns a 429 error?
11. Why are `develop` and `main` separate branches?
12. What is a JWT and how does LinkedIn auth use it?
13. What does CORS protect against?
14. Why does the Dockerfile copy `requirements.txt` before `app/`?
15. What is the difference between a Docker image and a container?

---

## Recommended Daily Schedule

```
Day 1  — Module 1: FastAPI basics + build the mini exercise
Day 2  — Module 2: Async Python + mini exercise
Day 3  — Module 3: REST APIs + call CrossRef manually
Day 4  — Module 4: LLMs + RAG concepts + ChromaDB mini exercise
Day 5  — Module 5: LangGraph + build the 3-node graph
Day 6  — Module 6: React basics
Day 7  — Module 7-8: TypeScript + Auth concepts
Day 8  — Module 9: Docker + build + run your own container
Day 9  — Module 10: GitHub Actions + CI/CD
Day 10 — Module 11: SQLite
Day 11-14 — Module 12: Read every project file
Day 15-21 — Module 13: Add a feature
```

---

*The goal isn't to memorise — it's to reach the point where you can open any file, read it, and explain exactly what it does and why.*
