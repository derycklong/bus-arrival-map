# External Integrations

**Analysis Date:** 2026-05-29

## APIs & External Services

**Singapore LTA DataMall (Land Transport Authority):**
- **Purpose:** Source of Singapore bus stop data and real-time bus arrival information
- **Endpoints consumed:**
  - `https://datamall2.mytransport.sg/ltaodataservice/BusStops` — Paginated list of all bus stops (used in `backend/setup_db.py`)
  - `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode={code}` — Real-time arrivals for a specific stop (used in `backend/routers/stops.py`)
- **Auth:** API key via `AccountKey` HTTP header
- **Env var:** `LTA_DATAMALL_ACCOUNT_KEY`
- **Client:** Python stdlib `urllib.request` (no SDK wrapper)
- **Rate limiting:** Not explicitly handled; `PAGE_SIZE=500` used in bulk download
- **Caching:** In-memory cache `_arrivals_cache` in `backend/routers/stops.py` with 10-second TTL

**OpenStreetMap (Tile Layer):**
- **Purpose:** Map tile rendering for the Leaflet map
- **URL:** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- **Used in:** `web/components/map-view.tsx` via `L.tileLayer()`
- **Auth:** None (free tier, attribution required)
- **Attribution:** `'&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'`

## Data Storage

**Databases:**
- **SQLite** (embedded, via Python `sqlite3` stdlib)
  - Database file: `data/bus_stops.db`
  - Connection wrapper: `backend/database.py` (`get_connection()`)
  - WAL mode enabled: `PRAGMA journal_mode=WAL`
  - Foreign keys enforced: `PRAGMA foreign_keys=ON`
  - Tables:
    - `users` — id, username, password_hash, created_at
    - `bus_stops` — stop_code (PK), name, road, lat, lng
    - `user_favourites` — id, user_id (FK→users), stop_code (FK→bus_stops), bus_no

**File Storage:**
- Local filesystem only
- SQLite DB stored at `data/bus_stops.db`
- No cloud storage (S3, etc.) detected

**Caching:**
- **In-memory cache only** (no Redis, memcached, etc.)
- Arrivals cache: `_arrivals_cache` dict in `backend/routers/stops.py` with 10-second TTL
- Cache keyed by `stop_code`
- Cache invalidated by time expiration; no LRU eviction (grows unbounded with unique stops requested)

## Authentication & Identity

**Auth Provider:**
- **Custom JWT-based auth** (no third-party provider like Auth0, Clerk, Supabase)
- Implementation:
  - `backend/auth.py` — JWT creation (HS256), verification, password hashing (bcrypt), user extraction
  - `backend/routers/auth.py` — `/register`, `/login`, `/me` endpoints
- Token storage: `localStorage` in browser (via `web/lib/api.ts`)
- Token format: JWT with `sub` (user_id), `exp` (7 days), `iat`
- Secret: `JWT_SECRET` env var (fallback hardcoded: `"bus-arrival-map-secret-dev"`)
- Algorithm: HS256
- Password hashing: bcrypt with auto-generated salt

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Datadog, etc.)

**Logs:**
- Console-based (`print()`) — `backend/main.py` prints DB stop count on startup; `backend/setup_db.py` prints download progress
- No structured logging library found

**Metrics:**
- Not detected

## CI/CD & Deployment

**Hosting:**
- No hosting provider configured
- No Dockerfile, no `docker-compose.yml`
- Local-only startup via `start_server.ps1` (PowerShell script)

**CI Pipeline:**
- Not detected (no `.github/`, `.gitlab-ci.yml`, etc.)

**Domain:**
- No domain or DNS configuration found

## Environment Configuration

**Required env vars:**
- `LTA_DATAMALL_ACCOUNT_KEY` — API key for Singapore LTA DataMall bus data
- `JWT_SECRET` — Secret key for JWT signing (optional; has hardcoded fallback `"bus-arrival-map-secret-dev"`)

**Secrets location:**
- `.env` file at project root (not committed — in `.gitignore`)
- Also checked: `~/.openclaw/.env` and `backend/.env`

## Webhooks & Callbacks

**Incoming:**
- None detected — no webhook endpoint handlers

**Outgoing:**
- None detected — no outgoing webhook / callback configuration

## Third-Party SDKs & Libraries

**Direct HTTP calls (no SDK):**
- LTA DataMall API — Called via Python `urllib.request` (`backend/setup_db.py`, `backend/routers/stops.py`)
- OpenStreetMap tiles — Loaded directly from standard tile URL via Leaflet client-side

**Client-side libraries served from CDN/NPM:**
- Leaflet CSS loaded from `leaflet/dist/leaflet.css` (npm package)
- OpenStreetMap tile images loaded dynamically by Leaflet at runtime

---

*Integration audit: 2026-05-29*
