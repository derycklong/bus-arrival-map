# Codebase Concerns

**Analysis Date:** 2026-05-29

## Tech Debt

### Hardcoded JWT Secret Fallback
- **Issue:** `backend/auth.py:8` uses `os.environ.get("JWT_SECRET", "bus-arrival-map-secret-dev")` — if the `JWT_SECRET` env var is not set, a predictable hardcoded string is used as the signing key.
- **Files:** `backend/auth.py:8`
- **Impact:** Any developer or attacker who knows the codebase can forge valid JWT tokens, impersonating any user. Trivially exploitable if accidentally deployed without the env var.
- **Fix approach:** Remove the default fallback; crash loudly at startup if `JWT_SECRET` is not set. Add a startup validation check in `main.py:28-37`.

### Duplicated `_load_account_key()` Function
- **Issue:** The exact same `_load_account_key()` function is copy-pasted in `backend/setup_db.py:15-27` and `backend/routers/stops.py:16-28`.
- **Files:** `backend/setup_db.py:15-27`, `backend/routers/stops.py:16-28`
- **Impact:** DRY violation — any change to the key-loading logic (e.g., adding a new env file path) must be made in two places. Already out of sync risk.
- **Fix approach:** Extract to a shared module (e.g., `backend/config.py`) and import from both locations.

### Missing `.gitignore`
- **Issue:** No `.gitignore` file exists at the project root. Files like `.env`, `__pycache__/`, and `node_modules/` are not excluded from version control.
- **Files:** (root directory)
- **Impact:** `.env` containing `LTA_DATAMALL_ACCOUNT_KEY` could be accidentally committed. `__pycache__/` bytecode files already exist in the working tree (`backend/__pycache__/`, `backend/routers/__pycache__/`) and would be included.
- **Fix approach:** Create `.gitignore` with entries for `.env`, `__pycache__/`, `*.pyc`, `node_modules/`, `.next/`, `server.pid`.

### Bytecode Cache Files Present in Working Tree
- **Issue:** `__pycache__/` directories with `.pyc` files are present in `backend/__pycache__/` and `backend/routers/__pycache__/` (8 files, ~26KB total). These are generated artifacts.
- **Files:** `backend/__pycache__/*.pyc`, `backend/routers/__pycache__/*.pyc`
- **Impact:** Pollutes the repo with platform-specific generated files. Can cause merge conflicts and confusion.
- **Fix approach:** Add `__pycache__/` to `.gitignore` and remove from working tree with `git rm --cached`.

### Spec/Implementation Mismatch — Vanilla JS vs Next.js/React
- **Issue:** Design spec at `docs/specs/2026-05-29-bus-arrival-map-design.md` explicitly states "Vanilla HTML/CSS/JS (no framework)" but the actual frontend is built with Next.js 16 + React 19 on TypeScript.
- **Files:** `docs/specs/2026-05-29-bus-arrival-map-design.md:88-92`, `web/package.json:14-17`
- **Impact:** Documentation is misleading. Any developer reading the spec will have incorrect assumptions about the stack, build tooling, and conventions.
- **Fix approach:** Update the spec to reflect the actual stack (Next.js, React, TypeScript, Tailwind CSS).

### Unused Dependency: `react-leaflet`
- **Issue:** `react-leaflet` v5.0.0 is listed in `web/package.json:17` as a dependency but is never imported anywhere. All Leaflet usage is direct through the `L` namespace from the `leaflet` package (`web/components/map-view.tsx:4-5`).
- **Files:** `web/package.json:17`
- **Impact:** Unnecessary dependency that increases install size and dependency surface area. Adds to `node_modules/` bloat.
- **Fix approach:** Remove `react-leaflet` from `package.json`.

### `print()` Instead of Structured Logging
- **Issue:** Backend uses `print()` for all operational messages (`backend/main.py:35,37`, `backend/setup_db.py:40,50,54,91,97,98,104`) instead of Python's `logging` module.
- **Files:** `backend/main.py:35,37`, `backend/setup_db.py:40,50,54,91,97,98,104`
- **Impact:** No log levels (info/warning/error), no structured output, no log rotation, no way to control verbosity. FastAPI/Uvicorn has integrated logging infrastructure going unused.
- **Fix approach:** Replace `print()` with `logging.getLogger(__name__)` calls. Configure log level and format in `main.py`.

### Manual `.env` Parsing Instead of `python-dotenv`
- **Issue:** `backend/setup_db.py:15-27` manually reads `.env` files line-by-line rather than using the `python-dotenv` package already listed in `backend/requirements.txt:5`.
- **Files:** `backend/setup_db.py:15-27`, `backend/requirements.txt:5`
- **Impact:** Inconsistent env loading approach. Manual parsing can miss edge cases (quoted values, comments, multi-line values).
- **Fix approach:** Use `dotenv.load_dotenv()` and `os.environ.get()` consistently.

### Inconsistent HTTP Client Usage
- **Issue:** `backend/routers/stops.py:125` uses `urllib.request` (stdlib) for LTA API calls, but `httpx` is already listed in `backend/requirements.txt:4`.
- **Files:** `backend/routers/stops.py:1-4,125`, `backend/requirements.txt:4`
- **Impact:** Mixes stdlib and third-party HTTP clients. `urllib.request` has a less ergonomic API and lacks connection pooling, timeouts configuration, and retry support that `httpx` provides.
- **Fix approach:** Replace `urllib.request` with `httpx` in `routers/stops.py`.

## Known Bugs

### Duplicate `next2` Field in Arrivals Response
- **Symptoms:** The arrivals response contains two identical bus objects for the "second bus" prediction. `subsequent` and `next2` both map to `svc.get("NextBus2")`, while the LTA API provides `NextBus`, `NextBus2`, and `NextBus3`.
- **Files:** `backend/routers/stops.py:99-102`
  - Line 99: `"subsequent": _transform_bus(svc.get("NextBus2"))` — correct
  - Line 100: `"next2": _transform_bus(svc.get("NextBus2"))` — **BUG: should be `NextBus3`**
  - Line 101: `"next3": _transform_bus(svc.get("NextBus3"))` — correct
- **Trigger:** Any request to `/api/stops/{stop_code}/arrivals` for a stop that has multiple buses with multiple predictions.
- **Workaround:** The frontend (`web/lib/api.ts:53-54`) only reads `next` and `subsequent` fields, so the bug is invisible to users. But the API response contains redundant/corrupt data.

### Favourites Endpoint Misreports All DB Errors as "Already Exists"
- **Symptoms:** Any SQL error on `POST /api/favourites` (not just UNIQUE constraint violations) is caught by a bare `except Exception` and returns HTTP 409 "Favourite already exists".
- **Files:** `backend/routers/favourites.py:36-44`
- **Trigger:** Database connection failure, disk full, SQL constraint errors — all silently mapped to 409.
- **Workaround:** None. Real errors are hidden from the client and server logs.

### Missing Mobile-Sidebar CSS for Auth Form
- **Symptoms:** The auth form modal at `web/components/auth-form.tsx` has no responsive mobile styles. The CSS media query at `web/app/globals.css:10-18` only targets `.mobile-sidebar` class (used by `web/components/sidebar.tsx`), not the auth form.
- **Files:** `web/components/auth-form.tsx:39-94`, `web/app/globals.css:10-18`
- **Trigger:** Using the app on a screen narrower than 600px.
- **Workaround:** The auth form uses `max-width: 90vw` which prevents overflow, but no mobile-optimized layout.

## Security Considerations

### CORS: Wildcard Origin with Credentials
- **Risk:** `backend/main.py:17-18` sets `allow_origins=["*"]` combined with `allow_credentials=True`. Per the CORS specification, the `Access-Control-Allow-Origin: *` header is invalid when credentials are included. Browsers will reject credentialed requests entirely.
- **Files:** `backend/main.py:15-21`
- **Current mitigation:** None. The configuration is mutually contradictory.
- **Recommendations:** Either remove `allow_credentials=True` and keep `*`, or set explicit allowed origins matching the frontend deployment URL (e.g., `http://localhost:3000` for dev).

### Hardcoded JWT Secret (Repeated)
- **Risk:** As noted in Tech Debt. If this code is deployed to production without setting the `JWT_SECRET` env var, ANY user can forge tokens. The string `"bus-arrival-map-secret-dev"` is trivially guessable.
- **Files:** `backend/auth.py:8`
- **Current mitigation:** Only the env-var-based override — no warning or startup validation.
- **Recommendations:** Remove the default. Add startup validation: `if not SECRET_KEY: raise RuntimeError("JWT_SECRET must be set")`.

### `dangerouslySetInnerHTML` for Bus Arrival Times
- **Risk:** `web/components/sidebar.tsx:112-113` uses `dangerouslySetInnerHTML` to render formatted arrival times. While the current `formatDuration()` function (lines 13-19) returns only controlled `<span>` HTML, any future modification that includes user data or API response values here would create an XSS vector.
- **Files:** `web/components/sidebar.tsx:13-20,112-113`
- **Current mitigation:** `formatDuration()` returns only hardcoded HTML strings with class names and numeric values.
- **Recommendations:** Refactor to avoid `dangerouslySetInnerHTML`. Use React state/variables for the display values and conditional CSS classes instead of inline HTML strings.

### Weak Password Minimum (4 Characters)
- **Risk:** `backend/routers/auth.py:18` enforces a minimum password length of only 4 characters. This is extremely weak — brute-forceable in seconds.
- **Files:** `backend/routers/auth.py:18`
- **Current mitigation:** The 4-character minimum exists.
- **Recommendations:** Raise minimum to 8 characters. Optionally add complexity requirements (mixed case, digits).

### JWT Token in `localStorage`
- **Risk:** Auth tokens are stored in `localStorage` (`web/lib/api.ts:5`, `web/app/page.tsx:16`, `web/components/auth-form.tsx:30`). This is accessible to any JavaScript running on the page, making it vulnerable to XSS attacks. HttpOnly cookies would be more secure.
- **Files:** `web/lib/api.ts:5`, `web/app/page.tsx:16`, `web/components/auth-form.tsx:30`
- **Current mitigation:** None.
- **Recommendations:** Store tokens in HttpOnly cookies set by the backend `/api/login` response instead of returning them as JSON body payloads.

### No Rate Limiting on Auth Endpoints
- **Risk:** `POST /api/register` and `POST /api/login` have no rate limiting. An attacker can brute-force passwords or create thousands of accounts with no throttling.
- **Files:** `backend/routers/auth.py:14-56`
- **Current mitigation:** None.
- **Recommendations:** Add rate limiting middleware (e.g., `slowapi` for FastAPI) or use a reverse proxy with rate limiting.

### Missing `.gitignore` for `.env` (Repeated)
- **Risk:** No `.gitignore` means `.env` containing `LTA_DATAMALL_ACCOUNT_KEY` could be accidentally committed to the repository.
- **Files:** (root directory)
- **Current mitigation:** None.
- **Recommendations:** Create `.gitignore` with `.env` entry immediately.

## Performance Bottlenecks

### Full Table Scan for Nearest Stops
- **Problem:** `GET /api/stops` (`backend/routers/stops.py:38-39`) loads ALL bus stops from the database (`SELECT ... FROM bus_stops` with no WHERE clause) and computes Haversine distance in Python for every row. The spatial index `idx_bus_stops_lat_lng` exists (created at `backend/database.py:43`) but is never used.
- **Files:** `backend/routers/stops.py:38-56`, `backend/database.py:43`
- **Cause:** The query does not filter by `lat`/`lng` range. All ~5000 Singapore bus stops are loaded into memory and filtered in Python.
- **Improvement path:** Add a bounding-box WHERE clause (`WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`) calculated from the request lat/lng + radius to leverage the spatial index. This reduces the row set from ~5000 to a few hundred before the Haversine computation.

### Thread-Unsafe Global Cache
- **Problem:** `backend/routers/stops.py:12` uses a plain module-level dict `_arrivals_cache` shared across all requests. No locks, no max size, no TTL cleanup background task. With concurrent requests (e.g., multiple users clicking the same stop), race conditions on `_arrivals_cache.get()` and `_arrivals_cache[stop_code]` can occur.
- **Files:** `backend/routers/stops.py:12-13,108-114`
- **Cause:** Simple dict without synchronization or size bounds. FastAPI runs with multiple workers/threads by default.
- **Improvement path:** Use `threading.Lock` around cache access. Add a maximum cache size (LRU eviction). Consider using a library like `cachetools.TTLCache`.

### Per-Request Database Connections
- **Problem:** Every request handler opens and closes a new SQLite connection via `get_connection()` (`backend/database.py:9-13`). No connection pooling is used. With SQLite's WAL mode, concurrent reads are possible, but each request pays the overhead of creating and tearing down a connection.
- **Files:** `backend/database.py:9-13`, `backend/routers/*.py` (all routers open/close per request)
- **Cause:** Simple connection-creation pattern without pooling.
- **Improvement path:** Use a connection pool or at least a connection-per-thread pattern. FastAPI's dependency injection with `Depends()` could manage a single connection per request.

## Fragile Areas

### Duplicated and Brittle Key-Loading Path Traversals
- **Files:** `backend/routers/stops.py:17-20`, `backend/setup_db.py:15-20`
- **Why fragile:** Both functions hardcode multi-level `os.path.dirname()` traversals to find the project root. The stops router version uses four levels of nesting (`os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(...))))`). Any restructuring of the backend module hierarchy will silently break key loading.
- **Safe modification:** Extract the project-root detection to a single module. Use a predictable marker file (e.g., look for `requirements.txt` or `start_server.ps1` going upward) instead of hardcoded `..` counts.
- **Test coverage:** No tests for either function.

### Bare `except Exception` in Favourites POST
- **Files:** `backend/routers/favourites.py:42`
- **Why fragile:** Catches ALL exceptions (DB deadlock, connection failure, out-of-disk-space) and reports them all as "Favourite already exists". This masks real operational issues and makes debugging impossible.
- **Safe modification:** Catch only `sqlite3.IntegrityError` for the 409 case. Let other exceptions propagate to FastAPI's error handler (which logs and returns 500).
- **Test coverage:** No tests.

### Bare `except Exception` in Arrivals Endpoint
- **Files:** `backend/routers/stops.py:132-135`
- **Why fragile:** Wraps all unexpected errors as HTTP 502 with a generic "Failed to fetch arrivals" message. The original exception is swallowed — no logging, no traceback.
- **Safe modification:** Log the original exception via `logging.exception()` before raising the 502. Or better, let FastAPI's default exception handler log it.
- **Test coverage:** No tests.

### Hardcoded Absolute Path in `start_server.ps1`
- **Files:** `start_server.ps1:1`
- **Why fragile:** The PowerShell script contains `-WorkingDirectory "X:\0. Vibe Code\bus-arrival-map"` — a machine-specific absolute path. This will fail on any other machine or if the repo is cloned to a different directory.
- **Safe modification:** Use relative paths or `$PSScriptRoot` to derive the working directory dynamically.

## Scaling Limits

### Arrivals Cache Unbounded Growth
- **Current capacity:** In-memory dict `_arrivals_cache` grows with every unique stop_code requested. No eviction, no max size.
- **Limit:** With ~5000 bus stops in Singapore, if all are queried, the cache stores 5000 entries indefinitely (though individual entries expire after 10 seconds). Under sustained usage across many stops, memory usage grows linearly.
- **Scaling path:** Add LRU eviction with a max cache size (e.g., 200 entries). Or use TTL-only and accept the memory tradeoff (5000 small JSON blobs is ~a few MB — acceptable, but pattern is risky).

### SQLite Single-Writer Bottleneck
- **Current capacity:** SQLite supports concurrent reads (WAL mode) but serializes writes. Current write operations are infrequent (auth registration, favourite toggles).
- **Limit:** If write traffic increases (e.g., heavy registration, rapid favourite toggling), all write operations queue behind the single write lock. Reads may block briefly during checkpoint.
- **Scaling path:** For current scale, SQLite is adequate. If needed, add a write queue or migrate to PostgreSQL.

## Dependencies at Risk

### `eslint-config-next` (Non-Standard Config)
- **Risk:** `web/eslint.config.mjs:2-3` imports from `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` — these are non-standard entry points specific to the Next.js 16 ESLint integration. If the import paths change in a future version, linting will break.
- **Impact:** Linting pipeline becomes non-functional requiring config migration.
- **Migration plan:** Pin `eslint-config-next` version. Monitor Next.js changelogs for ESLint config API changes.

### `react-leaflet` (Unused)
- **Risk:** Listed as a dependency but never used. Adds supply-chain risk (transitive dependencies, CVEs) with zero benefit.
- **Impact:** Unnecessary attack surface and install size.
- **Migration plan:** Remove from `web/package.json:17` and run `npm uninstall react-leaflet`.

## Missing Critical Features

### No Loading State for Initial Favourites
- **Problem:** `web/components/map-view.tsx:55-62` fetches favourites asynchronously in `loadFavourites()`, but the initial render happens before this completes. When a user clicks a stop marker immediately after login, `favMap.current[stop.stop_code]` may be `undefined`, causing `initialFavourites` to be an empty array even if the user has favourites.
- **Blocks:** Users may not see their star indicators until they reload the sidebar.
- **Priority:** Medium

### No Retry Button for Arrivals Errors
- **Problem:** Design spec (`docs/specs/2026-05-29-bus-arrival-map-design.md:141`) specifies "show 'Unable to fetch arrivals' with retry button", but `web/components/sidebar.tsx:88` only shows a static "Failed to load arrivals" message with no way to retry.
- **Blocks:** Users must close and re-open the sidebar to retry a failed arrivals fetch.
- **Priority:** Low

### No Escape-Key or Click-Outside to Close Sidebar
- **Problem:** Design spec (`docs/specs/2026-05-29-bus-arrival-map-design.md:104`) specifies "Escape or clicking empty map closes it", but `web/components/map-view.tsx` has no keyboard event listener for Escape and no click-outside handler.
- **Blocks:** Users must click the × button to close the sidebar.
- **Priority:** Low

### No Marker Clustering
- **Problem:** Design spec (`docs/specs/2026-05-29-bus-arrival-map-design.md:143`) suggests "use Leaflet marker clustering if > 200 markers", but `web/components/map-view.tsx:38-53` renders all visible stops as individual circle markers with no clustering.
- **Blocks:** At zoom levels where hundreds of stops are visible, the map becomes visually cluttered. On mobile devices, performance may degrade.
- **Priority:** Medium

## Test Coverage Gaps

### Entire Codebase Has Zero Tests
- **What's not tested:** All backend endpoints (`/api/register`, `/api/login`, `/api/me`, `/api/stops`, `/api/stops/{code}/arrivals`, `/api/favourites` CRUD), database layer, auth token creation/verification, LTA API response transformation, frontend API client, React components, state management.
- **Files:** All files in `backend/` and `web/`
- **Risk:** Any change to any part of the codebase has no safety net. Regressions cannot be detected automatically. The arrivals transform bug (duplicate `next2` field) would have been caught by a unit test.
- **Priority:** High

### No Backend Tests
- **Files:** `backend/` (no `test_*.py` files)
- **What's not tested:** Route handlers, auth logic, database queries, Haversine calculation, LTA response transformer, cache logic.
- **Risk:** The LTA API proxy has complex error handling (timeouts, HTTP errors, JSON parsing) with zero coverage.
- **Priority:** High

### No Frontend Tests
- **Files:** `web/` (no `*.test.*` or `*.spec.*` files)
- **What's not tested:** Component rendering (MapView, Sidebar, AuthForm), API client error handling, auth flow (token storage, logout), state management edge cases.
- **Risk:** UI regressions, particularly in the fav/star toggle flow and arrivals display.
- **Priority:** High

### No Integration Tests
- **What's not tested:** End-to-end auth flow (register → login → call /me), favourites CRUD lifecycle, arrivals caching behavior, database schema migrations, API proxy against real/recorded LTA responses.
- **Risk:** Cross-layer issues (e.g., API response schema changes that break the frontend) go undetected until production.
- **Priority:** Medium

---

*Concerns audit: 2026-05-29*
