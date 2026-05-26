# Deployment Guide — Impact Lab

## Environments

| Environment | Branch | Frontend | Backend | Purpose |
|---|---|---|---|---|
| **Local** | any | `localhost:5173` | `localhost:8000` | Development |
| **Staging** | `develop` | `staging-impact-lab.vercel.app` | Railway staging service | Testing before prod |
| **Production** | `main` | `impact-lab.vercel.app` | Railway production service | Live for users |

Every push to `develop` → auto-deploys to **Staging**.  
Every push/merge to `main` → auto-deploys to **Production** + creates a GitHub Release.

---

## Branch Strategy

```
main          ← production (protected, requires PR from develop)
  │
  └── develop ← staging (auto-deploys, where you commit features)
        │
        └── feature/xxx ← your work branch → PR to develop
```

**Workflow:**
```bash
git checkout develop
git checkout -b feature/my-new-feature
# ... make changes ...
git push origin feature/my-new-feature
# Open PR → develop → deploys to staging automatically
# When ready → merge develop → main → deploys to production
```

---

## One-Time Setup

### 1. Backend — Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `Data-eng15/Ai-research-impact-summariser`
3. Set **Root Directory** to `backend`
4. Railway auto-detects the `Dockerfile`
5. Add these **environment variables** in Railway dashboard:

```
GOOGLE_API_KEY        = your_gemini_api_key
DEMO_MODE             = true
GEMINI_MODEL          = gemini-2.5-flash
ALLOWED_ORIGINS       = https://impact-lab.vercel.app,https://staging-impact-lab.vercel.app
LINKEDIN_SECRET       = any_random_string_32chars
```

6. Note your Railway service URL (e.g. `https://impact-lab-api.up.railway.app`)
7. **Create a second Railway service** for staging with `DEMO_MODE=true` and different `ALLOWED_ORIGINS`
8. Get your Railway token: Railway Dashboard → Account → Tokens → Create token

### 2. Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the repo → set **Root Directory** to `frontend`
3. Vercel auto-detects Vite
4. Add **environment variable**:
   ```
   VITE_API_URL = https://impact-lab-api.up.railway.app
   ```
5. Deploy
6. Note your Vercel project ID and org ID (Settings → General)

### 3. GitHub Secrets & Variables

Go to: **GitHub repo → Settings → Secrets and variables → Actions**

**Secrets** (sensitive — hidden):
```
RAILWAY_TOKEN_STAGING    ← Railway token for staging service
RAILWAY_TOKEN_PROD       ← Railway token for production service
VERCEL_TOKEN             ← Vercel personal access token
VERCEL_ORG_ID            ← From Vercel → Settings → General
VERCEL_PROJECT_ID        ← From Vercel → Settings → General
```

**Variables** (non-sensitive — visible in logs):
```
STAGING_API_URL          = https://impact-lab-api-staging.up.railway.app
PROD_API_URL             = https://impact-lab-api.up.railway.app
PROD_FRONTEND_URL        = https://impact-lab.vercel.app
```

---

## Local Development

```bash
# Clone
git clone https://github.com/Data-eng15/Ai-research-impact-summariser.git
cd Ai-research-impact-summariser
git checkout develop

# Backend
cd backend
cp ../.env.example .env
# Edit .env → add your GOOGLE_API_KEY
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev        # uses .env.development → points to localhost:8000
```

Open [http://localhost:5173](http://localhost:5173)

---

## Docker (local full-stack)

```bash
# Copy env template
cp .env.example backend/.env
# Edit backend/.env with your API key

# Start everything
docker compose up --build

# Frontend: http://localhost:8080
# Backend:  http://localhost:8000
# API docs: http://localhost:8000/docs
```

---

## CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  Push to any branch / PR opened                         │
│                                                         │
│  ci.yml runs:                                           │
│    ├── Backend tests (pytest)                           │
│    ├── Frontend type-check (tsc --noEmit)               │
│    ├── Frontend tests (vitest)                          │
│    └── Docker build validation                          │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   Push to develop                   Merge to main
        │                                 │
        ▼                                 ▼
deploy-staging.yml              deploy-prod.yml
  ├── Run CI                      ├── Run CI
  ├── Deploy → Railway staging    ├── Deploy → Railway prod
  └── Deploy → Vercel preview     ├── Deploy → Vercel prod
                                  ├── Health check
                                  └── Create GitHub Release
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | ✅ | — | Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | — | `gemini-2.5-flash` | LLM model name |
| `DEMO_MODE` | — | `true` | If true, author check never blocks |
| `ALLOWED_ORIGINS` | ✅ | localhost | CORS whitelist (comma-separated) |
| `SEMANTIC_SCHOLAR_API_KEY` | — | — | Improves S2 rate limits |
| `GITHUB_TOKEN` | — | — | Improves GitHub search rate limits |
| `LINKEDIN_CLIENT_ID` | — | — | LinkedIn OAuth app ID |
| `LINKEDIN_CLIENT_SECRET` | — | — | LinkedIn OAuth app secret |
| `LINKEDIN_SECRET` | — | — | JWT signing secret for LinkedIn tokens |
| `HF_EMBEDDING_MODEL` | — | `all-MiniLM-L6-v2` | Sentence transformer model |

---

## Troubleshooting

**Backend returns 500 on `/api/analyze`:**
- Check `GOOGLE_API_KEY` is set correctly in Railway env vars
- Visit `/health` first — if it returns `{"status":"ok"}`, the server is up

**Frontend shows "Network Error":**
- Check `VITE_API_URL` in Vercel env vars points to the correct Railway URL
- Make sure the Railway URL is in `ALLOWED_ORIGINS` on the backend

**Gemini returns truncated summaries:**
- This is a known issue if `maxOutputTokens` is too low
- The code already sets 2000 for summaries — no action needed

**Railway service sleeping (free tier):**
- Railway free tier doesn't sleep services (unlike Render)
- If using Render: first request after 15 min may take 30s to wake

**ChromaDB / SQLite data lost after deploy:**
- Railway provides persistent volumes — data survives redeploys
- Docker volumes (`staging_data`, `prod_data`) persist between container restarts
