# Research Impact Summariser

[![CI](https://github.com/yourusername/ai-research-impact-summariser/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/ai-research-impact-summariser/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/yourdockerimage?label=Docker%20Pulls)](https://hub.docker.com/r/yourdockerimage)
[![Coverage](https://img.shields.io/coveralls/github/yourusername/ai-research-impact-summariser)](https://coveralls.io/github/yourusername/ai-research-impact-summariser)

## Contributing

- Fork the repository and create a feature branch.
- Install dependencies as described in the **Run Locally** section.
- Run the test suite (`pytest` for backend, `npm test` for frontend) before submitting a PR.
- Follow the code style guidelines (black for Python, Prettier for TypeScript).

## Stack

Agentic AI web application for evidence-grounded research impact summaries.

## What This MVP Does

- Accepts a DOI, paper title, arXiv ID, or Semantic Scholar paper id.
- Retrieves metadata from CrossRef and citation data from Semantic Scholar when available.
- Falls back to OpenAlex for citation counts, topic labels, source links, and funder signals.
- Searches GitHub for repository adoption leads when the paper title is distinctive enough.
- Creates a patent verification search lead for downstream manual checking.
- Runs an agent-style backend pipeline with transparent logs.
- Produces a structured research impact summary with evidence links.
- Shows a Glass Box UI with agent status, logs, evidence, and summary sections.

## Stack

- Frontend: React, TypeScript, Vite, lucide-react
- Backend: FastAPI, httpx, Pydantic
- AI/RAG: LangGraph, ChromaDB, Hugging Face embeddings, optional Hugging Face SLM generation
- Planned next: RAGAS, parsed patent records, persisted user sessions

## Optional API Keys

The MVP works without keys, but keys improve reliability and rate limits:

```bash
export SEMANTIC_SCHOLAR_API_KEY="..."
export GITHUB_TOKEN="..."
```

Semantic Scholar can rate-limit anonymous requests, so OpenAlex is used as a dependable fallback.

## Hugging Face Local Models

The app now uses Hugging Face embeddings for local RAG memory:

- Default embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- Vector store: local ChromaDB under `backend/.data/chroma`

Local generation is optional because even small SLMs can be slow on CPU. To enable it:

```bash
export ENABLE_HF_GENERATION=1
export HF_GENERATION_MODEL="Qwen/Qwen2.5-0.5B-Instruct"
```

Without that flag, summaries use deterministic synthesis over Hugging Face RAG context, so the app stays fast and reliable.

## Current limitations

HF SLM generation is optional and currently not active; set ENABLE_HF_GENERATION=1 to use a local Hugging Face instruct model.
RAGAS and parsed patent records are still planned for the next integration pass.

## Run Locally

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.
