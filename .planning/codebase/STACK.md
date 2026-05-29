# Technology Stack

**Analysis Date:** 2026-05-29

## Languages

**Primary:**
- TypeScript 5 (via `web/tsconfig.json`) — Frontend application code in `web/`
- Python 3 — Backend API in `backend/`

**Secondary:**
- CSS 3 (via Tailwind v4) — Styling in `web/app/globals.css`

## Runtime

**Environment:**
- Node.js (required for Next.js) — Frontend dev/build/start
- Python 3 (for backend) — FastAPI server via uvicorn

**Package Manager (Frontend):**
- npm
- Lockfile: `web/package-lock.json` present

**Package Manager (Backend):**
- pip (via `backend/requirements.txt`)
- No lockfile — `requirements.txt` only

**Base Python:** Not explicitly pinned; no `.python-version` or `runtime.txt` found.

**Base Node.js:** Not explicitly pinned; no `.nvmrc` or `.node-version` found.

## Frameworks

**Core Frontend:**
- **Next.js** 16.2.6 (App Router, includes React 19.2.4) — Full-stack React framework
- **React** 19.2.4 — UI component library
- **React-DOM** 19.2.4 — React rendering

**Core Backend:**
- **FastAPI** 0.115.12 — Python async web framework for REST API
- **Uvicorn** 0.34.2 — ASGI server running the FastAPI app

**Mapping:**
- **Leaflet** 1.9.4 — Interactive map library
- **react-leaflet** 5.0.0 — React bindings for Leaflet
- **@types/leaflet** 1.9.21 — TypeScript type definitions for Leaflet

**Testing:**
- Not detected — No test framework, no test files (`*.test.*`, `*.spec.*`) found in either frontend or backend.

**Build/Dev:**
- **TypeScript** 5 (`web/tsconfig.json`) — Type checking and compilation
- **Tailwind CSS** 4 (via `@tailwindcss/postcss`) — Utility-first CSS
- **ESLint** 9 with `eslint-config-next` 16.2.6 — Linting (config at `web/eslint.config.mjs`)
- **PostCSS** (via `web/postcss.config.mjs`) — CSS transformation pipeline

## Key Dependencies

**Frontend (`web/package.json`):**

| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.2.6 | React framework with App Router, SSR, API proxying |
| react | 19.2.4 | UI component model |
| react-dom | 19.2.4 | React rendering to DOM |
| leaflet | 1.9.4 | Interactive map tiles and markers |
| react-leaflet | 5.0.0 | React component wrappers for Leaflet |
| tailwindcss | 4 | Utility-first CSS framework |
| @tailwindcss/postcss | 4 | Tailwind PostCSS plugin |

**Backend (`backend/requirements.txt`):**

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.115.12 | REST API framework with Pydantic validation |
| uvicorn | 0.34.2 | ASGI server to serve FastAPI |
| PyJWT | 2.10.1 | JWT token creation and verification |
| bcrypt | 4.3.0 | Password hashing and verification |
| httpx | 0.28.1 | HTTP client (declared but not imported in current code — probable future use) |
| python-dotenv | 1.1.0 | `.env` file loading |

**Infrastructure (no dedicated tool):**
- SQLite 3 (stdlib) — Embedded database via `sqlite3` module

## Configuration

**Environment:**
- `.env` file at project root — contains `LTA_DATAMALL_ACCOUNT_KEY` and `JWT_SECRET` (fallback hardcoded in `backend/auth.py`)
- Environment variables read from multiple paths: `~/.openclaw/.env`, `backend/.env`, project root `.env`
- `python-dotenv` installed but not explicitly invoked in current code — env is read manually via file parsing

**Build (Frontend):**
- `web/next.config.ts` — API proxy rewrites `/api/:path*` → `http://127.0.0.1:8000/api/:path*`
- `web/tsconfig.json` — Path alias `@/*` maps to `./*`
- `web/postcss.config.mjs` — Tailwind v4 PostCSS plugin
- `web/eslint.config.mjs` — Core Web Vitals + TypeScript rules from `eslint-config-next`

**Build (Backend):**
- No build step — Python source is run directly

## Platform Requirements

**Development:**
- Python 3 with pip (for FastAPI deps)
- Node.js 18+ with npm (for Next.js)
- `LTA_DATAMALL_ACCOUNT_KEY` env var required for bus data
- Run `backend/setup_db.py` to populate SQLite database with bus stops

**Production:**
- No Dockerfile or deployment config found
- Frontend built via `next build` (in `web/`)
- Backend served via `uvicorn backend.main:app`
- `start_server.ps1` starts the backend on `127.0.0.1:8000`
- Frontend dev mode via `next dev` in `web/`
- Production path: `next build && next start` (static export or standalone mode possible)

---

*Stack analysis: 2026-05-29*
