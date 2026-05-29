<!-- refreshed: 2026-05-29 -->
# Architecture

**Analysis Date:** 2026-05-29

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js 16)                       │
│                                                                       │
│  ┌──────────────┐  ┌───────────────────┐  ┌────────────────────────┐ │
│  │ AuthForm      │  │ MapView           │  │ Sidebar               │ │
│  │ (auth-form.tsx)│  │ (map-view.tsx)    │  │ (sidebar.tsx)         │ │
│  │ Login/Register│  │ Leaflet map +     │  │ Arrival times table   │ │
│  │ modal         │  │ stop markers       │  │ + favourite toggles   │ │
│  └──────┬───────┘  └────────┬──────────┘  └──────────┬─────────────┘ │
│         │                   │                        │               │
│         └──────────┬────────┴────────────────────────┘               │
│                    │                                                 │
│            ┌───────▼────────┐                                        │
│            │ lib/api.ts     │  ← single API client module            │
│            │ (fetch wrapper)│                                        │
│            └───────┬────────┘                                        │
└────────────────────┼─────────────────────────────────────────────────┘
                     │ HTTP/JSON via Next.js rewrites → /api/* → 127.0.0.1:8000
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                   main.py (FastAPI app)                      │    │
│  │  CORS middleware · startup event · static file mount          │    │
│  │  Includes: auth.router, stops.router, favourites.router      │    │
│  └────────┬────────────┬──────────────┬─────────────────────────┘    │
│           │            │              │                              │
│  ┌────────▼───┐ ┌──────▼──────┐ ┌─────▼──────────┐                  │
│  │ routers/   │ │ routers/    │ │ routers/       │                  │
│  │ auth.py    │ │ stops.py    │ │ favourites.py  │                  │
│  │ /register  │ │ /stops      │ │ /favourites    │                  │
│  │ /login     │ │ /stops/{sc} │ │ CRUD           │                  │
│  │ /me        │ │ /arrivals   │ │                │                  │
│  └──────┬─────┘ └──────┬──────┘ └───────┬────────┘                  │
│         │              │                │                           │
│  ┌──────▼─────┐  ┌─────▼──────┐        │                           │
│  │ auth.py    │  │ database.py│        │                           │
│  │ (lib)      │  │ (lib)      │        │                           │
│  │ bcrypt/JWT │  │ SQLite3    │        │                           │
│  │ hash/verify │  │ connection  │        │                           │
│  └────────────┘  │ haversine  │        │                           │
│                  └──────┬─────┘        │                           │
└─────────────────────────┼──────────────┼───────────────────────────┘
                          │              │
                          ▼              ▼
               ┌────────────────┐  ┌─────────────────────────────┐
               │ data/          │  │ LTA DataMall v3 API         │
               │ bus_stops.db   │  │ (external)                  │
               │ (SQLite)       │  │ BusArrival endpoint         │
               └────────────────┘  └─────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `app/page.tsx` | Top-level orchestrator — auth vs map view state, logout | `web/app/page.tsx` |
| `app/layout.tsx` | Root HTML layout, metadata, global CSS import | `web/app/layout.tsx` |
| `AuthForm` | Login/register UI, form validation, token storage | `web/components/auth-form.tsx` |
| `MapView` | Leaflet map lifecycle, stop markers, pan/zoom → reload stops, sidebar management | `web/components/map-view.tsx` |
| `Sidebar` | Arrival times display, favourite star toggles, stop info | `web/components/sidebar.tsx` |
| `api.ts` | Typed HTTP client, token injection, all API functions | `web/lib/api.ts` |
| `backend/main.py` | FastAPI app factory, CORS, router registration, startup health check | `backend/main.py` |
| `backend/database.py` | SQLite connection factory, schema init, Haversine formula | `backend/database.py` |
| `backend/auth.py` | Password hashing (bcrypt), JWT create/decode, bearer token extraction | `backend/auth.py` |
| `routers/auth.py` | `/api/register`, `/api/login`, `/api/me` endpoints | `backend/routers/auth.py` |
| `routers/stops.py` | `/api/stops` (proximity query), `/api/stops/{stop_code}/arrivals` (LTA proxy) | `backend/routers/stops.py` |
| `routers/favourites.py` | `/api/favourites` CRUD endpoints | `backend/routers/favourites.py` |
| `setup_db.py` | One-time DB seed script — downloads LTA BusStops into SQLite | `backend/setup_db.py` |
| `next.config.ts` | API rewrites proxy (`/api/*` → `http://127.0.0.1:8000/api/*`) | `web/next.config.ts` |
| `start_server.ps1` | Launch script for uvicorn on port 8000 | `start_server.ps1` |

## Pattern Overview

**Overall:** REST API backend (FastAPI) + single-page application frontend (Next.js client components) with server-side proxy for external API calls.

**Key Characteristics:**
- **Backend as pure API layer** — no server-side rendering for the application logic; FastAPI serves as a JSON API only
- **Single API client module** — all frontend HTTP calls go through `web/lib/api.ts` which handles token injection, error normalization, and typed responses
- **Client-side Leaflet** — the map (`MapView`) is dynamically imported with SSR disabled (`dynamic(() => import(...), { ssr: false })`)
- **Server-side LTA proxy** — the LTA DataMall AccountKey never reaches the browser; all LTA API calls are proxied through `backend/routers/stops.py`
- **In-memory arrivals cache** — a module-level dict in `stops.py` caches LTA arrivals per stop with a 10-second TTL to avoid rate limits
- **JWT auth** — stateless bearer token authentication with user ID embedded in the `sub` claim

## Layers

**Frontend Components (presentation):**
- Purpose: UI rendering and user interaction
- Location: `web/components/`
- Contains: React client components (`"use client"`), JSX+Tailwind styling
- Depends on: `web/lib/api.ts` for data fetching
- Used by: `web/app/page.tsx`

**Frontend API Client (data access):**
- Purpose: Typed HTTP communication with backend
- Location: `web/lib/api.ts`
- Contains: Generic `api<T>()` fetch wrapper, typed request/response types, all endpoint functions
- Depends on: Browser `fetch`, `localStorage` for token
- Used by: All components

**Backend Routers (API layer):**
- Purpose: HTTP endpoint definitions, request validation, response formatting
- Location: `backend/routers/`
- Contains: FastAPI `APIRouter` instances, Pydantic request models, endpoint handler functions
- Depends on: `database.py`, `auth.py` (lib)
- Used by: `main.py` (app assembly)

**Backend Library (shared logic):**
- Purpose: Auth primitives, database connections, utility formulas
- Location: `backend/` (root)
- Contains: `database.py`, `auth.py`
- Depends on: SQLite3 (stdlib), bcrypt, PyJWT
- Used by: All routers

**Backend App Entry (app assembly):**
- Purpose: Application factory, middleware, startup logic
- Location: `backend/main.py`
- Contains: `FastAPI()` instance, CORS middleware, router includes, startup health check, static file mount
- Depends on: All other backend modules
- Used by: uvicorn runner

**Database (persistence):**
- Purpose: Persistent storage and querying
- Location: `data/bus_stops.db`
- Contains: SQLite file with `bus_stops`, `users`, `user_favourites` tables
- Depends on: Nothing (accessed via `database.py`)
- Used by: All routers

**Seed Script (one-time setup):**
- Purpose: Database population with LTA bus stop data
- Location: `backend/setup_db.py`
- Contains: LTA BusStops API downloader, SQLite DB creation, bulk insert
- Depends on: urllib (stdlib), LTA DataMall AccountKey (env)
- Used by: Run manually via `python backend/setup_db.py`

## Data Flow

### Primary Request Path: User Opens Map → Sees Stops

1. User opens `web/` → Next.js serves `web/app/layout.tsx` (root HTML shell)
2. `web/app/page.tsx` checks localStorage for token → shows `AuthForm` or `MapView` depending on token validity (verified via `GET /api/me`)
3. `MapView` mounts → creates Leaflet map centered on Singapore coordinates `(1.3521, 103.8198)`
4. After initial render and on every `moveend` event (debounced 500ms), `MapView.loadStops()` is called
5. `loadStops()` computes a viewport-covering radius using the bounding box diagonal, calls `getStops(lat, lng, radius)` from `web/lib/api.ts`
6. `api.ts` sends `GET /api/stops?lat=...&lng=...&radius=...` with Bearer token
7. Next.js dev server rewrites `/api/*` → `http://127.0.0.1:8000/api/*` (per `web/next.config.ts`)
8. `backend/routers/stops.py:get_stops()` reads ALL rows from `bus_stops` table via `database.py`, computes Haversine distance for each, filters by radius, sorts by distance, returns top 50
9. Response flows back through the same path to `MapView.renderStops()` which creates `L.circleMarker` for each stop

### User Clicks Stop → Sees Arrivals

1. User clicks a circle marker → `setSelectedStop(stop)` updates state
2. `Sidebar` component mounts with `stop`, `initialFavourites`, `onFavChange` props
3. Sidebar `useEffect` triggers `getArrivals(stop.stop_code)` from `web/lib/api.ts`
4. `api.ts` sends `GET /api/stops/{stop_code}/arrivals`
5. `stops.py:get_arrivals()` checks in-memory `_arrivals_cache` dict — if cached within 10s, returns cached data
6. Otherwise, calls LTA DataMall v3 BusArrival API (`https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=...`) with the server-side AccountKey
7. Response is transformed via `_transform_lta_response()` → `_transform_bus()` per bus, cached in `_arrivals_cache`, returned
8. Sidebar sorts services (favourites first, then by next bus duration), renders table with arrival times and star toggles

### Auth Flow: Register/Login

1. `AuthForm` collects username/password, calls `login()` or `register()` from `web/lib/api.ts`
2. `api.ts` sends `POST /api/login` or `POST /api/register` with JSON body
3. `routers/auth.py` validates input, hashes/verifies password via `auth.py`, creates JWT token
4. Response returns `{ token, user: { id, username } }`
5. `AuthForm` stores token in `localStorage`, calls `onAuth(token, username)` callback
6. `page.tsx` receives callback, sets `view` to `"map"` — `MapView` renders

### Favourites Flow: Star Toggle

1. User clicks star in `Sidebar` → calls `handleFav(busNo, isFav)`
2. If adding: `POST /api/favourites` with `{ stop_code, bus_no }`
3. If removing: `DELETE /api/favourites` with same body
4. `routers/favourites.py` validates auth via `Depends(require_user)`, performs SQL insert/delete, returns 409 on duplicate
5. After successful mutation, `onFavChange()` triggers `MapView.loadFavourites()` → re-fetches full favourites map from `GET /api/favourites`

**State Management:**
- **Auth token** — stored in `localStorage` (key: `"token"`), injected by `api.ts` into every request
- **Map data** — ephemeral React state (`currentStops`, `favMap` useRefs), re-fetched on every pan/zoom
- **Favourites** — cached in `MapView` via `favMap` ref (keyed `stop_code → bus_no[]`), re-fetched after any mutation
- **Arrivals cache** — in-memory server-side Python dict `_arrivals_cache` with 10s TTL (global module-level in `stops.py`)

## Key Abstractions

**`api<T>(method, path, body?)` — Generic typed HTTP client:**
- Purpose: Single function wrapping all API calls with token injection, JSON serialization, and error normalization
- Location: `web/lib/api.ts:11`
- Pattern: Generic async function with `RequestInit` construction, all endpoint-specific functions (`login`, `getStops`, `getArrivals` etc.) delegate to it

**`get_connection()` — SQLite connection factory:**
- Purpose: Creates a configured SQLite connection with row factory, WAL mode, and foreign keys enabled
- Location: `backend/database.py:9`
- Pattern: Direct open/close per request (no connection pooling — lightweight for SQLite)

**`require_user` — Auth dependency:**
- Purpose: FastAPI `Depends` callable that extracts and validates Bearer token, returns user ID
- Location: `backend/auth.py:41`
- Pattern: FastAPI dependency injection — used as `user_id: int = Depends(require_user)` in protected routes

**APIRouter modules — Route grouping:**
- Purpose: Each router file owns a domain area, registered in `main.py` with `prefix="/api"`
- Examples: `backend/routers/auth.py`, `backend/routers/stops.py`, `backend/routers/favourites.py`
- Pattern: FastAPI `APIRouter(prefix="/api")` with Pydantic request models inline

## Entry Points

**Frontend (development):**
- Location: `web/` — `npx next dev` starts Next.js on port 3000
- Triggers: User navigates to `http://localhost:3000`
- Responsibilities: Serves the SPA, rewrites `/api/*` to backend at `127.0.0.1:8000`

**Backend:**
- Location: `backend/main.py` — launched via `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`
- Triggers: `start_server.ps1` or manual uvicorn invocation
- Responsibilities: JSON REST API server, CORS, startup DB health check, optional static file mount

**Database Seeder:**
- Location: `backend/setup_db.py` — run as `python backend/setup_db.py`
- Triggers: Manual execution (with optional `--force` flag)
- Responsibilities: Downloads all Singapore bus stops from LTA DataMall, creates/populates SQLite DB

## Architectural Constraints

- **Threading:** FastAPI runs on uvicorn with async workers by default; however, all handler functions are synchronous (no `async def`). SQLite WAL mode allows concurrent reads but single-writer. The `_arrivals_cache` global dict is accessed without locks — safe only under single-process single-threaded uvicorn.
- **Global state:** Module-level `_arrivals_cache` dict in `backend/routers/stops.py:12` — mutable shared state, not thread-safe. The `SECRET_KEY` and `ALGORITHM` module constants in `backend/auth.py:8-9`.
- **Circular imports:** Not detected — dependency graph is acyclic (routers import `database` and `auth`; `main.py` imports routers; no mutual imports).
- **No ORM:** Direct SQLite3 access via raw SQL strings — no SQLAlchemy or other ORM. Schema defined as `CREATE TABLE` strings in `database.py:init_db()`.
- **No migration system:** Schema is created on startup via `init_db()` using `CREATE TABLE IF NOT EXISTS`. Schema changes require manual migration or DB deletion.
- **No HTTPS in development:** Backend serves plain HTTP on `127.0.0.1:8000`. JWT secret defaults to a hardcoded dev value (`"bus-arrival-map-secret-dev"`) when `JWT_SECRET` env var is not set.

## Anti-Patterns

### Full-table scan for proximity queries

**What happens:** `backend/routers/stops.py:get_stops()` fetches ALL rows from `bus_stops` table and computes Haversine distance in Python for every row on every request, then filters by radius.
**Why it's wrong:** For a dataset of ~5000 bus stops, this loads the entire table into memory and does O(n) math per request. It does not scale to larger datasets or higher traffic. The spatial index (`idx_bus_stops_lat_lng`) is defined but never used.
**Do this instead:** Use a bounding-box pre-filter in SQL (e.g., `WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`) to reduce rows before Haversine filtering. Or use SQLite's R-tree extension for proper spatial queries.

### In-memory cache without thread safety

**What happens:** `_arrivals_cache` in `backend/routers/stops.py:12` is a plain Python dict with no locking. Under concurrent requests for the same stop, race conditions can produce stale or partially written cache entries.
**Why it's wrong:** If uvicorn runs with multiple workers, each worker has its own cache (cache duplication + inconsistency). Within a single worker, concurrent ASGI handlers may interleave reads/writes.
**Do this instead:** Use `threading.Lock` for thread safety, or switch to `cachetools.TTLCache` with built-in expiry, or use a shared external cache (Redis) if multi-worker.

### Raw SQL strings throughout

**What happens:** All database queries are raw SQL string literals passed to `conn.execute()`. There is no ORM, query builder, or parameterized query abstraction beyond basic `?` placeholders.
**Why it's wrong:** Raw SQL is harder to maintain, test, and refactor. Schema changes require finding all affected string literals. No type safety between Python types and SQL column types.
**Do this instead:** Introduce a lightweight query builder or at minimum centralize table/column name constants to avoid drift between `.py` files.

### Client-side token stored in localStorage

**What happens:** The JWT token is stored in `localStorage` under key `"token"` in `web/components/auth-form.tsx:30` and read in `web/lib/api.ts:5`.
**Why it's wrong:** `localStorage` is accessible to any JavaScript running on the same origin, making it vulnerable to XSS attacks.
**Do this instead:** Use an HTTP-only cookie for the JWT token, or store in memory with refresh token in a secure cookie.

## Error Handling

**Strategy:** Hybrid — FastAPI HTTP exceptions for backend, error-boundary-style try/catch on frontend.

**Patterns:**
- **Backend:** Raise `HTTPException(status_code, detail)` for all error cases (invalid credentials, duplicate favourites, LTA API failures). LTA proxy errors are caught, wrapped, and re-raised as 502.
- **Frontend:** `api.ts` catches non-ok responses, parses `err.detail`, throws `Error` with the detail message. Components catch these in try/catch blocks — most silently ignore errors (`catch { /* ignore */ }`) or show an error message in local state.
- **Auth token expiry:** Handled at the `page.tsx` level — if `getMe()` fails, token is cleared and user sees login form.

## Cross-Cutting Concerns

**Logging:** None — no logger configuration. Uses `print()` statements in `main.py` startup and `setup_db.py`. All request/response logging is absent.
**Validation:** Minimal — backend validates username length (>=3), password length (>=4), radius bounds (50-1000m), limit bounds (1-100). Uses Pydantic `BaseModel` for request bodies. Frontend does basic "both fields filled" check only.
**Authentication:** Bearer JWT token via FastAPI `HTTPBearer` security scheme. Token contains `sub` (user ID), `exp`, `iat`. Default 7-day expiry. Protected routes use `Depends(require_user)`.
**Rate limiting:** Not implemented server-side. LTA API rate limiting (~100 req/min) is partially mitigated by 10s in-memory arrivals cache.
**Environment configuration:** `LTA_DATAMALL_ACCOUNT_KEY` loaded from `.env` files or environment variable. `JWT_SECRET` defaults to a hardcoded dev value if `JWT_SECRET` env var not set.

---

*Architecture analysis: 2026-05-29*
