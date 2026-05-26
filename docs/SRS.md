# Software Requirements Specification (SRS)
## AI Research Impact Summariser
**Version:** 2.0  
**Date:** 2026-05-18  
**Status:** Baseline

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [External Interface Requirements](#5-external-interface-requirements)
6. [System Constraints](#6-system-constraints)
7. [Use Cases](#7-use-cases)
8. [Acceptance Criteria](#8-acceptance-criteria)

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for the **AI Research Impact Summariser** — a web application that takes an academic paper identifier (DOI, title, or arXiv ID) and produces a transparent, multi-source, evidence-grounded impact analysis report using an agentic AI pipeline.

### 1.2 Scope
The system comprises:
- A React/TypeScript single-page application (SPA) serving the user interface
- A Python/FastAPI backend exposing a REST API
- A LangGraph-orchestrated multi-agent pipeline that retrieves, synthesizes, and evaluates research impact evidence
- A local ChromaDB vector store for Retrieval-Augmented Generation (RAG)
- Google Gemini API (`gemini-2.5-flash`) for text generation and faithfulness evaluation, with deterministic template fallback

**In scope:** Paper lookup, multi-source evidence retrieval, agentic orchestration, RAG-grounded synthesis, REF Impact Case Study generation, faithfulness scoring, evidence traceability.

**Out of scope:** User account management with persistent database, WebSocket streaming, payment processing, batch analysis.

### 1.3 Definitions

| Term | Definition |
|---|---|
| DOI | Digital Object Identifier — a persistent identifier for academic papers |
| RAG | Retrieval-Augmented Generation — using retrieved documents as LLM context |
| REF | Research Excellence Framework — UK research impact evaluation standard |
| Gemini API | Google Generative Language API (`gemini-2.5-flash`) used for summary generation, REF report, and faithfulness judging |
| Faithfulness Score | 0–1 metric quantifying how well the generated summary is grounded in retrieved evidence |
| Evidence Item | A single retrieved data point (citation, code repo, patent, funding record, full-text link) |
| Glass-Box | UI design principle: every AI claim is traceable to a specific retrieved evidence item |
| LangGraph | Python library for defining agentic workflows as directed state graphs |
| ChromaDB | Embedded vector database used for semantic retrieval of evidence chunks |

### 1.4 References
- CrossRef REST API: `https://api.crossref.org`
- Semantic Scholar Academic Graph API: `https://api.semanticscholar.org/graph/v1`
- OpenAlex API: `https://api.openalex.org`
- GitHub REST API v3: `https://api.github.com`
- Google Patents XHR API: `https://patents.google.com/xhr/query`
- LangGraph Documentation: `https://langchain-ai.github.io/langgraph/`
- Research England REF 2021 Impact Case Study Template

---

## 2. Overall Description

### 2.1 Product Perspective
The system is a standalone research intelligence tool targeted at academics, research administrators, and university impact officers. It bridges the gap between raw citation counts (offered by tools like Google Scholar) and a fully narrated, evidence-backed impact assessment.

```
[User Browser] ──HTTP POST /api/analyze──► [FastAPI Backend]
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                        [CrossRef]        [Semantic Scholar]          [OpenAlex]
                              │                     │                     │
                              └──────────► [LangGraph Pipeline] ◄────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                          [GitHub]            [ChromaDB]            [HF SLM]
                              │                     │                     │
                              └──────────► [Synthesized Response] ────────┘
                                                    │
                                              [User Browser]
```

### 2.2 User Classes

| User Class | Description | Primary Need |
|---|---|---|
| Researcher | Academic submitting their own paper | Understand real-world impact; generate REF report |
| Impact Officer | University administrator | Batch evidence for REF submissions |
| Student | Learning research methods | Understand how papers propagate |
| Developer | Evaluating/extending the system | API access, reproducibility |

### 2.3 Operating Environment
- **Frontend:** Any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- **Backend:** Python 3.11+, Linux/macOS (ARM and x86)
- **Runtime dependencies:** Docker + Docker Compose (for containerized deployment) or local Python venv + Node.js 18+

### 2.4 Assumptions and Dependencies
- Public scholarly APIs (CrossRef, Semantic Scholar, OpenAlex) are accessible without authentication for standard usage volumes
- `GITHUB_TOKEN` and `SEMANTIC_SCHOLAR_API_KEY` are optional; the system degrades gracefully without them
- `GOOGLE_API_KEY` must be set to activate Gemini-based text generation and faithfulness judging; without it the system uses deterministic templates
- The system assumes internet connectivity for all external API calls

---

## 3. Functional Requirements

### FR-01: Paper Input Acceptance
The system **shall** accept the following input formats in the query field:
- DOI (e.g., `10.1038/nature14539`)
- Paper title (e.g., `Attention Is All You Need`)
- arXiv ID (e.g., `1706.03762`)
- Semantic Scholar paper ID

Input **shall** be between 2 and 500 characters. The system **shall** strip leading/trailing whitespace.

### FR-02: Metadata Resolution via CrossRef
The system **shall** attempt to resolve the input query against the CrossRef REST API to extract:
- Paper title
- Authors (up to 8)
- Publication year
- DOI
- Abstract (HTML-stripped)
- Source URL

If the input contains a DOI pattern (regex: `10\.\d{4,9}/[-._();/:A-Z0-9]+`), the system **shall** perform a direct DOI lookup; otherwise a title search with `rows=1`.

If CrossRef resolution fails, the system **shall** fall back to using the raw query string as the paper title and continue without blocking other agents.

### FR-03: Citation Retrieval via Semantic Scholar
The system **shall** query the Semantic Scholar Academic Graph API using the paper's DOI (preferred) or title.

The system **shall** retrieve:
- Total citation count
- Up to 20 citing papers with: title, year, authors, URL, abstract, citation count

### FR-04: Multi-Source Evidence Fallback (OpenAlex)
If Semantic Scholar returns zero results, the system **shall** query the OpenAlex Works API using the paper title as a fallback.

The system **shall** also always run OpenAlex enrichment in parallel to extract:
- Topic labels (up to 6)
- Best open-access location (PDF URL or landing page URL)
- Funder records

### FR-05: GitHub Adoption Search
The system **shall** search GitHub repositories for adoption signals using the paper title.

The system **shall** skip the GitHub search if:
- The title is empty or `"Unknown title"`
- The title yields fewer than 2 "meaningful" terms (terms > 3 chars, excluding generic words like "deep", "learning", "model")

Up to 6 repositories sorted by stars **shall** be returned as evidence items.

### FR-06: Patent Search via Google Patents
The system **shall** search Google Patents for patent records referencing the paper title.

Up to 5 patent records **shall** be returned with: publication number, title, assignee/inventor, publication date, and snippet.

### FR-07: Evidence Deduplication
The system **shall** deduplicate evidence items by (URL or title, lowercased). Only the first occurrence of a duplicate key **shall** be retained.

### FR-08: RAG Indexing and Retrieval (ChromaDB)
The system **shall** convert all retrieved evidence items to text documents and embed them using:
1. (Preferred) Hugging Face `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional)
2. (Fallback) Deterministic hash embedding when `sentence-transformers` is unavailable

The embedded documents **shall** be upserted into a ChromaDB persistent collection named `research_impact_evidence`.

The system **shall** then perform a semantic query against the collection using a query constructed from: paper title + abstract + topics + fixed impact keywords.

Up to 6 context chunks **shall** be retrieved for synthesis.

### FR-09: Summary Synthesis
The system **shall** generate a human-readable ~200-word impact narrative using:
1. (Preferred) Google Gemini API (`gemini-2.5-flash`) via `GOOGLE_API_KEY` — scholarly, evidence-grounded paragraph
2. (Fallback) Deterministic template embedding citation count, evidence titles, and a traceability disclaimer when the key is absent or the API fails

### FR-10: Structured Impact Sections
The system **shall** produce exactly 4 structured impact sections:
1. **Research Influence** — citation count, RAG chunk count
2. **Applications** — topic labels from OpenAlex
3. **Technical Adoption** — GitHub repository lead count
4. **Access & Funding** — full-text link count and funder signal count

### FR-11: Faithfulness Scoring (Guardrail)
The system **shall** compute a faithfulness score (0.0–1.0) using:
1. (Preferred) Gemini-as-judge: Gemini is prompted to rate the summary against evidence on a 0–10 integer scale, mapped to 0.0–1.0
2. (Fallback) Heuristic: `0.45 + term_overlap_bonus + citation_bonus + rag_bonus + topic_bonus` when `GOOGLE_API_KEY` is absent

The system **shall** set `guardrail_status = "passed"` if `faithfulness >= 0.75`, else `"review"`.

### FR-12: REF Impact Case Study Generation
The system **shall** generate a UK Research Excellence Framework (REF) Impact Case Study formatted with 4 markdown sections:
1. Summary of Impact
2. Underpinning Research
3. Details of Impact
4. References to the Research

The case study is generated by Gemini (`generate_ref_report()`) with a deterministic 4-section markdown template as fallback. It **shall** be downloadable as a `.doc` file from the frontend.

### FR-13: Agent Status Tracking
The system **shall** track and return the execution state of each named agent:

| Agent Name | Label | Role |
|---|---|---|
| `metadata` | Metadata | CrossRef resolution |
| `scholar` | Scholar | Semantic Scholar retrieval |
| `content` | Content | OpenAlex enrichment |
| `code` | Code | GitHub search |
| `rag` | RAG | ChromaDB embedding + retrieval |
| `impact` | Impact | Patent search coordination |
| `synthesis` | Synthesis | Summary generation |
| `ref` | REF Report | Case study generation |

Each agent status **shall** have one of: `pending`, `running`, `complete`, `warning`, `error`.

### FR-14: Execution Trace Logging
The system **shall** return a timestamped trace log of all agent actions. Each log entry **shall** contain: `timestamp` (HH:MM:SS UTC), `agent` name, `message`, and optional `data` dictionary.

### FR-15: Client-Side Search Caching
The frontend **shall** cache analysis results in `localStorage` keyed by `cache_<query>`. A cached result **shall** be served without re-querying the backend.

### FR-16: Search History
The frontend **shall** persist up to 8 recent search queries in `localStorage` and display them in the sidebar for one-click re-analysis.

### FR-17: Evidence Filtering
The frontend **shall** allow users to filter the evidence panel by kind: All, Citations, Code, Full text, Funding, Patents.

### FR-18: Authentication (Lightweight)
The frontend **shall** protect the `/dashboard` route behind a `ProtectedRoute` that checks `localStorage.isAuthenticated === "true"`. Users not authenticated **shall** be redirected to `/`.

The `LoginModal` **shall** accept email/password and set `isAuthenticated` in localStorage on success (demo implementation).

---

## 4. Non-Functional Requirements

### NFR-01: Performance
- The backend **shall** complete a full analysis pipeline in under 20 seconds for a paper with available metadata and citations (subject to external API response times)
- All external API calls **shall** have individual timeouts: CrossRef 12s, Semantic Scholar 15s, OpenAlex 12s, GitHub 12s, Google Patents 15s
- Semantic Scholar, OpenAlex, GitHub, and Google Patents calls **shall** execute concurrently using `asyncio.gather`

### NFR-02: Availability and Fault Tolerance
- Failure of any single external API **shall not** crash the pipeline; the agent **shall** log the error and continue
- Absence of a Hugging Face model **shall** trigger automatic fallback to deterministic synthesis
- Absence of ChromaDB or embedding libraries **shall** result in synthesis proceeding without RAG context

### NFR-03: Traceability (Glass-Box)
- Every claim in the generated summary **shall** be derivable from returned evidence items or RAG context
- The frontend **shall** display all retrieved evidence items with source name, URL, year, and snippet

### NFR-04: Security
- CORS **shall** be restricted to known localhost development origins (ports 5173–5175) by default; configurable via `ALLOWED_ORIGINS` env var
- API keys (`GITHUB_TOKEN`, `SEMANTIC_SCHOLAR_API_KEY`, `LINKEDIN_JWT_SECRET`) **shall** be loaded from environment variables only — never hardcoded

### NFR-05: Scalability
- The FastAPI application **shall** be fully async, enabling concurrent request handling
- ChromaDB uses a persistent on-disk store (`backend/.data/chroma`) supporting incremental upserts

### NFR-06: Maintainability
- All Pydantic models **shall** be defined in `models.py` with strict typing
- Agent logic **shall** be isolated into named node functions (`metadata_node`, `retrieval_node`, etc.) registered with the LangGraph `StateGraph`
- All external API calls **shall** use `httpx.AsyncClient` with a shared `User-Agent` header identifying the application

### NFR-07: Portability
- The full system **shall** be runnable via `docker-compose up` without any host-level configuration beyond providing environment variables
- The backend Dockerfile **shall** expose port 8000; the frontend Dockerfile **shall** serve on port 80 via Nginx

---

## 5. External Interface Requirements

### 5.1 API Endpoints

#### `GET /health`
Returns `{"status": "ok"}`. Used by container health checks and monitoring.

#### `POST /api/analyze`
**Request body:**
```json
{
  "query": "string (2–500 chars)"
}
```

**Response body:** `AnalyzeResponse` (see LLD §2.3 for full schema)

**HTTP errors:**
- `422 Unprocessable Entity` — query length violation (Pydantic validation)
- `500 Internal Server Error` — unhandled pipeline exception

### 5.2 External APIs Consumed

| API | Base URL | Auth | Used For |
|---|---|---|---|
| CrossRef | `https://api.crossref.org` | None (polite pool via User-Agent email) | Paper metadata |
| Semantic Scholar | `https://api.semanticscholar.org/graph/v1` | Optional `x-api-key` header | Citations |
| OpenAlex | `https://api.openalex.org` | None | Fallback citations, topics, funders, OA links |
| GitHub | `https://api.github.com` | Optional Bearer token | Repository adoption search |
| Google Patents | `https://patents.google.com/xhr/query` | None | Patent records |

### 5.3 User Interface Requirements
- The application **shall** be a single-page application served from `/`
- The `/dashboard` route **shall** require authentication
- The evidence panel **shall** open source URLs in a new browser tab (`target="_blank"`)
- Agent status pills **shall** use visual icons: spinner for `running`, checkmark for `complete`, triangle for `warning/error`, dot for `pending`
- The faithfulness score **shall** render as a colored badge: green (`>= 0.85`), amber (`>= 0.70`), red (below 0.70)

---

## 6. System Constraints

| Constraint | Detail |
|---|---|
| Language | Python 3.11+ (backend), TypeScript 5+ / React 18+ (frontend) |
| Framework | FastAPI + Uvicorn (backend), Vite + React Router v6 (frontend) |
| Orchestration | LangGraph (sequential DAG: metadata → retrieval → rag → synthesis → ref_report) |
| Vector DB | ChromaDB v1.5.x (embedded, persistent) |
| Embedding | `sentence-transformers/all-MiniLM-L6-v2` (fallback: SHA-256 hash embedding) |
| SLM | `Qwen/Qwen2.5-0.5B-Instruct` (optional, disabled by default) |
| Evidence cap | Max 32 evidence items returned in API response; max 20 Semantic Scholar citations fetched |
| Storage | ChromaDB data directory: `backend/.data/chroma` |
| No persistent user DB | User authentication state stored in browser `localStorage` only |

---

## 7. Use Cases

### UC-01: Analyze Paper by DOI
**Actor:** Researcher  
**Precondition:** User is authenticated and on the Dashboard  
**Main Flow:**
1. User enters a DOI (e.g., `10.1038/nature14539`) in the search field
2. User clicks "Analyze"
3. System checks `localStorage` cache — cache miss
4. Frontend posts `{query: "10.1038/nature14539"}` to `POST /api/analyze`
5. Backend: Metadata agent resolves paper via CrossRef
6. Backend: Retrieval agent runs Scholar + OpenAlex + GitHub + Patents concurrently
7. Backend: RAG agent embeds evidence into ChromaDB, retrieves top-6 context chunks
8. Backend: Synthesis agent generates summary + sections + faithfulness score
9. Backend: REF agent generates case study report
10. Frontend renders: paper header, summary, metrics, impact sections, evidence list, trace log, REF report
11. Frontend caches result in `localStorage`

**Alternate Flow — CrossRef Miss:**
- Step 5: CrossRef returns no match → agent uses query string as title → `warning` status
- Pipeline continues with degraded metadata

**Alternate Flow — Cache Hit:**
- Step 3: Cache found → result rendered immediately, steps 4–10 skipped

### UC-02: Download REF Report
**Actor:** Impact Officer  
**Precondition:** Analysis result with `ref_report` content is loaded  
**Main Flow:**
1. User clicks "Download .doc"
2. Frontend converts markdown REF report to HTML wrapped in Office XML namespace
3. Blob is created with MIME type `application/msword`
4. Browser downloads file as `REF_Impact_Case_Study_<DOI>.doc`

### UC-03: Filter Evidence by Kind
**Actor:** Researcher  
**Main Flow:**
1. User clicks a filter tab (e.g., "Citations 15")
2. Frontend filters `result.evidence` array client-side by `kind === "citation"`
3. Evidence panel re-renders with filtered items

### UC-04: Re-run from History
**Actor:** Researcher  
**Main Flow:**
1. User sees previous queries in sidebar history list
2. User clicks a history item
3. `analyze()` is called with the history item as query
4. Cache check runs; if hit, renders immediately; if miss, posts to backend

---

## 8. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | Given a valid DOI, the API returns a response with non-empty `metadata.title` within 20 seconds |
| AC-02 | Given a valid DOI for a highly-cited paper, `citation_count > 0` and `evidence` contains at least 1 item |
| AC-03 | Given a failed CrossRef lookup, the pipeline completes successfully with `agent_statuses[0].state == "warning"` |
| AC-04 | Given no `GOOGLE_API_KEY`, `model_provider` in response equals `"deterministic"` |
| AC-05 | Given any query, `faithfulness_score` is a float between 0.0 and 1.0 inclusive |
| AC-06 | Given a paper with GitHub-searchable title containing 2+ meaningful terms, `evidence` contains at least 1 item with `kind == "code"` |
| AC-07 | Given an unauthenticated browser navigating to `/dashboard`, the browser is redirected to `/` |
| AC-08 | Given a cached query, re-submitting the same query renders the result without a network request to the backend |
| AC-09 | Given a result with `ref_report`, clicking "Download .doc" triggers a browser file download |
| AC-10 | The `GET /health` endpoint returns `{"status": "ok"}` with HTTP 200 within 1 second |
