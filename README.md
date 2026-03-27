# Agentic Image Studio

Upload one or more images, describe what you want changed, and watch an **agentic workflow** run in real time: **vision analysis → planning → image execution (Sharp / Replicate) → critic**, with optional **Langfuse** tracing and **user feedback** (thumbs up / down with comment).

The UI is a React + Vite + Tailwind SPA; the backend is Express + TypeScript with WebSockets and in-memory job storage.

---

## What it does

| Area | Behavior |
|------|----------|
| **Upload** | Multiple images (first = primary; others = references where the model supports it). |
| **Models** | User picks a Replicate image model (e.g. Nano Banana 2, Qwen Image Edit 2511) or enters a custom Replicate model id. |
| **Reasoning** | Vision, planner, and critic use a **Replicate-hosted LLM** (`LLM_MODEL`, default `openai/gpt-4o` on Replicate). |
| **Editing** | Plans mix **Sharp** (pixel ops) and **Replicate** image-to-image; model I/O is handled via adapters in `backend/src/models/`. |
| **Live trace** | WebSocket pushes `vision`, `plan`, `execute`, `critic`, `status`, `completed`, and `error` messages with structured payloads. |
| **Observability** | Optional **Langfuse**: traces, spans, generations, media uploads (original + final images), and scores from user feedback. |

---

## Architecture

| Piece | Stack | Notes |
|-------|--------|--------|
| Frontend | React 19, Vite 6, Tailwind 4 | Calls `/api` by default; override with `VITE_API_BASE`. |
| Backend | Express, `ws`, Multer, Sharp, Axios, Langfuse SDK | Serves uploads under `/api/uploads`. |
| Deploy | Docker, Helm, Tilt (optional) | Ingress + nginx body size limits for large uploads. |

Local ingress hostnames (Helm defaults): `app.lvh.me` (frontend), `backend.lvh.me` (backend API).

---

## Prerequisites

- **Node.js** 20+ (backend targets Node 22 in Docker; 20+ is fine locally)
- **Docker**
- **Minikube**, **Helm**, **Tilt** — for the Kubernetes path below

---

## Configuration (environment variables)

Copy `.env.example` to `.env` at the **repository root** (backend loads it via `loadEnv`).

### Required (Replicate)

| Variable | Purpose |
|----------|---------|
| `REPLICATE_API_TOKEN` | Single API token (`r8_…`) for **all** Replicate calls: LLM (vision/plan/critic) and image models. |

### Core tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_MODEL` | `openai/gpt-4o` | Replicate model id for the chat/vision LLM. |
| `LLM_MIN_REQUEST_GAP_MS` | `2000` | Minimum spacing between LLM requests (helps with rate limits). |
| `MAX_ITERATIONS` | `5` | Max critic loop iterations per job. |
| `PORT` | `3000` | HTTP port (local / container). |

### Optional — Langfuse

| Variable | Purpose |
|----------|---------|
| `LANGFUSE_PUBLIC_KEY` | Project public key (`pk-lf-…`). |
| `LANGFUSE_SECRET_KEY` | Secret key (`sk-lf-…`). |
| `LANGFUSE_BASE_URL` | e.g. `https://cloud.langfuse.com` or your self-hosted URL. |

If public + secret keys are unset, observability is disabled; the app still runs.

### Frontend (build-time)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE` | API prefix (default `/api`). Set to full URL if the UI is served separately from the API. |

---

## API overview

Base path: `/api` (unless you mount the app differently).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `status`, `replicate`, `llmModel`, `observability`. |
| `POST` | `/api/jobs` | `multipart/form-data`: field `images` (1–10 files), `goal`, `model`. Returns `{ jobId, imageUrls }`. |
| `GET` | `/api/jobs/:jobId` | Job summary. |
| `GET` | `/api/jobs/:jobId/history` | Full WebSocket history (JSON array). |
| `GET` | `/api/jobs/:jobId/download` | JPEG download when `status === "completed"`. |
| `POST` | `/api/jobs/:jobId/cancel` | Cancel running job. |
| `POST` | `/api/jobs/:jobId/feedback` | Body: `{ "score": 1 \| -1, "comment?": "…" }` — recorded in Langfuse when configured. |

**WebSocket:** `GET /api/jobs/:jobId/ws` — connect after creating the job; server replays history then streams updates.

---

## Local development (no Kubernetes)

From the repo root:

```bash
cp .env.example .env
# Edit .env — at minimum set REPLICATE_API_TOKEN
```

**Backend**

```bash
cd backend
npm install
npm run dev
```

**Frontend** (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Configure Vite to proxy API calls to the backend, or set `VITE_API_BASE` to `http://localhost:3000/api` in `frontend/.env.local` if you run the UI on another origin.

Production builds:

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm run preview
```

---

## Kubernetes + Tilt (recommended cluster flow)

### 1. Minikube + ingress

```bash
minikube start
minikube addons enable ingress
```

### 2. Docker points at Minikube

```bash
eval $(minikube docker-env)
```

### 3. Secrets for Helm

Copy `helm/agentic-image-studio/values-secrets.local.yaml.example` to `helm/agentic-image-studio/values-secrets.local.yaml` (gitignored) and set `replicateApiToken`, optional Langfuse keys, and `backend.env.extra` (`LLM_MODEL`, etc.).

Alternatively, keep secrets only in repo-root `.env`: **Tilt** reads `.env` and passes known keys to Helm via `--set` (see `Tiltfile`).

### 4. Run Tilt

```bash
tilt up
```

Tilt builds images, runs `helm upgrade --install`, and port-forwards **backend `:3000`** and **frontend `:5173`** to localhost (see `k8s_resource` in `Tiltfile`).

### 5. Ingress hostnames (optional)

In another terminal:

```bash
minikube tunnel
```

Resolve `app.lvh.me` / `backend.lvh.me` to `127.0.0.1` (e.g. `/etc/hosts` or your DNS setup) so ingress routes work.

### Helm without Tilt

```bash
eval $(minikube docker-env)
docker build -t agentic-image-studio-backend:latest ./backend
docker build -t agentic-image-studio-frontend:latest ./frontend
helm upgrade --install studio ./helm/agentic-image-studio -f ./helm/agentic-image-studio/values-secrets.local.yaml
```

---

## Project layout

```
.
├── backend/                 # Express API, workflow, LLM, imaging, Langfuse
│   ├── src/
│   │   ├── models/          # Replicate model adapters + registry
│   │   ├── prompts/       # LLM prompt text
│   │   └── services/      # workflow, llm, imaging, observability, broadcast
│   └── Dockerfile
├── frontend/                # Vite + React UI
├── helm/agentic-image-studio/
├── Tiltfile
├── .env.example
└── README.md
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `413 Request Entity Too Large` | Ingress / nginx `client_max_body_size` (chart includes raised limits; ensure proxies match). |
| `misconfigured` health | `REPLICATE_API_TOKEN` missing or wrong in the **running** process (pod secret, `.env`, or Tilt `--set`). |
| WebSocket empty | Connect only after job exists; path must be `/api/jobs/<jobId>/ws`. |
| Langfuse errors | Keys and `LANGFUSE_BASE_URL`; media upload uses presigned S3 — use a current backend build with correct checksum handling. |
