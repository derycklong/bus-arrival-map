# Codebase Structure

**Analysis Date:** 2026-05-29

## Directory Layout

```
bus-arrival-map/
├── backend/                 # Python FastAPI backend
│   ├── __init__.py          # Package marker
│   ├── main.py              # FastAPI app entry point
│   ├── database.py          # SQLite connection, schema init, Haversine formula
│   ├── auth.py              # Password hashing, JWT create/verify, Bearer dependency
│   ├── setup_db.py          # One-time DB seed from LTA DataMall API
│   ├── requirements.txt     # Python dependencies
│   ├── routers/             # API endpoint handlers
│   │   ├── __init__.py      # Package marker (empty)
│   │   ├── auth.py          # /api/register, /api/login, /api/me
│   │   ├── stops.py         # /api/stops, /api/stops/{code}/arrivals (LTA proxy)
│   │   └── favourites.py    # /api/favourites CRUD
│   └── __pycache__/         # Python bytecode cache (gitignored)
├── web/                     # Next.js frontend
│   ├── app/                 # Next.js App Router pages
│   │   ├── layout.tsx       # Root layout, metadata, global CSS
│   │   ├── page.tsx         # Home page (auth vs map orchestrator)
│   │   ├── globals.css      # Tailwind import, global body styles, mobile breakpoints
│   │   └── favicon.ico      # Browser tab icon
│   ├── components/          # React client components
│   │   ├── auth-form.tsx    # Login/register modal form
│   │   ├── map-view.tsx     # Leaflet map with stop markers
│   │   └── sidebar.tsx      # Arrival times panel with favourite toggles
│   ├── lib/                 # Shared utilities
│   │   └── api.ts           # Typed HTTP API client, all endpoint functions
│   ├── public/              # Static assets (served at /)
│   ├── next.config.ts       # Next.js config (API rewrites → backend)
│   ├── tsconfig.json        # TypeScript config (@/ path alias)
│   ├── package.json         # NPM dependencies and scripts
│   ├── package-lock.json    # Lockfile
│   ├── postcss.config.mjs   # PostCSS config (Tailwind v4)
│   ├── eslint.config.mjs    # ESLint flat config (Next.js core-web-vitals + TS)
│   ├── README.md            # Project readme
│   ├── AGENTS.md            # Agent instructions (Next.js version warning)
│   └── CLAUDE.md            # Claude-specific instructions
├── data/                    # Data files
│   └── bus_stops.db         # SQLite database (bus stops, users, favourites)
├── docs/                    # Documentation
│   └── specs/               # Design specifications
│       └── 2026-05-29-bus-arrival-map-design.md
├── .planning/               # GSD planning artifacts
│   └── codebase/            # Codebase analysis documents
├── .env                     # Environment variables (LTA key, JWT secret) — NOT committed
├── start_server.ps1         # PowerShell script to launch uvicorn backend
└── .git/                    # Git repository data
```

## Directory Purposes

**`backend/`:**
- Purpose: All server-side Python code — API, auth, database access
- Contains: FastAPI application modules, router packages, library modules, seed script
- Key files:
  - `backend/main.py`: FastAPI app factory, middleware, router registration
  - `backend/database.py`: SQLite connection and schema
  - `backend/auth.py`: JWT + bcrypt auth primitives
  - `backend/routers/stops.py`: LTA API proxy with caching
  - `backend/setup_db.py`: One-time database seeder

**`backend/routers/`:**
- Purpose: API endpoint handler modules organized by domain
- Contains: FastAPI `APIRouter` instances with route decorators
- Key files:
  - `backend/routers/auth.py`: Auth endpoints (register, login, me)
  - `backend/routers/stops.py`: Stop query and arrivals proxy
  - `backend/routers/favourites.py`: Favourites CRUD
- **Where to add a new domain:** Create `backend/routers/{domain}.py` with `router = APIRouter(prefix="/api", tags=["domain"])`, define Pydantic models and endpoints, then register in `backend/main.py` with `app.include_router(domain.router)`

**`web/`:**
- Purpose: All frontend code — Next.js App Router pages, React components, styles, API client
- Contains: App layout/pages, shared components, library modules, config files
- Key files:
  - `web/app/page.tsx`: Home page — auth vs map view routing
  - `web/app/layout.tsx`: Root HTML document shell
  - `web/lib/api.ts`: All frontend-accessible API functions and TypeScript types

**`web/app/`:**
- Purpose: Next.js App Router pages and layouts
- Contains: `layout.tsx` (root), `page.tsx` (home), `globals.css` (global styles)
- **Where to add a new page:** Create `web/app/{route}/page.tsx` following Next.js App Router conventions

**`web/components/`:**
- Purpose: Reusable React client components
- Contains: All `.tsx` files using `"use client"` directive
- Key files: `auth-form.tsx`, `map-view.tsx`, `sidebar.tsx`
- **Where to add a new component:** Create `web/components/{component-name}.tsx` with `"use client"` directive at top

**`web/lib/`:**
- Purpose: Shared non-component code — API client, utilities
- Contains: `api.ts` (all API types and functions)
- **Where to add a new utility:** Create `web/lib/{utility}.ts` — import using `@/lib/{utility}` path alias

**`data/`:**
- Purpose: Persistent data storage
- Contains: SQLite database file(s)
- Note: `bus_stops.db` is created by `setup_db.py` and populated/queried at runtime

**`docs/`:**
- Purpose: Design specifications and documentation
- Contains: Subdirectories per document type
- Note: `docs/specs/` holds Design Spec documents

## Key File Locations

**Entry Points:**
- `backend/main.py`: Backend entry — uvicorn target (`backend.main:app`)
- `web/app/page.tsx`: Frontend entry — first rendered page
- `web/app/layout.tsx`: Root HTML shell rendered for all pages
- `start_server.ps1`: Launch script for development

**Configuration:**
- `web/next.config.ts`: Next.js configuration (API rewrites)
- `web/tsconfig.json`: TypeScript configuration (`@/*` path alias mapped to `./*`)
- `web/postcss.config.mjs`: PostCSS/Tailwind configuration
- `web/eslint.config.mjs`: ESLint flat config
- `web/package.json`: NPM dependencies and scripts
- `backend/requirements.txt`: Python dependencies

**Core Logic:**
- `backend/main.py`: Application assembly, middleware, startup
- `backend/database.py`: Database connection, schema, utility functions
- `backend/auth.py`: Authentication primitives
- `backend/routers/auth.py`: Auth endpoint handlers
- `backend/routers/stops.py`: Stop query + LTA API proxy
- `backend/routers/favourites.py`: Favourites CRUD
- `web/lib/api.ts`: Frontend API client (all types + functions)
- `web/components/map-view.tsx`: Map rendering and interaction
- `web/components/sidebar.tsx`: Stop details and arrivals display
- `web/components/auth-form.tsx`: Auth UI

**Testing:** Not detected — no test files, test configurations, or test directories present in the codebase.

## Naming Conventions

**Files:**
- **Python:** `snake_case.py` — e.g., `setup_db.py`, `database.py`, `auth.py`
- **TypeScript/React:** `kebab-case.ts` for library files (`auth-form.tsx` follows the component name convention with kebab); `camelCase.ts` for non-component modules (`api.ts`, `next.config.ts`)
- **Config files:** `kebab-case.config.*` — e.g., `postcss.config.mjs`, `eslint.config.mjs`

**Directories:**
- Lowercase, singular descriptor — e.g., `backend/`, `web/`, `data/`, `docs/`, `routers/`, `components/`, `lib/`

**Functions:**
- **Python:** `snake_case` — e.g., `get_connection()`, `hash_password()`, `create_token()`, `_transform_bus()`, `_compute_duration_ms()`
- **TypeScript:** `camelCase` — e.g., `getToken()`, `getMe()`, `loadStops()`, `handleFav()`, `formatDuration()`

**Variables:**
- **Python:** `snake_case` — e.g., `SCRIPT_DIR`, `DB_PATH`, `account_key`, `stop_code`
- **TypeScript:** `camelCase` — e.g., `selectedStop`, `mapInstance`, `currentStops`, `favMap`

**Types/Interfaces:**
- **Python (Pydantic models):** `PascalCase` — e.g., `AuthBody`, `FavBody`
- **TypeScript (interfaces):** `PascalCase` — e.g., `Stop`, `Service`, `Bus`, `AuthResponse`, `StopsResponse`, `FavouritesResponse`

**Classes:**
- Not used — no classes found in either backend or frontend code

## Where to Add New Code

**New API Endpoint:**
- Implementation: Add a new router file at `backend/routers/{domain}.py` or extend an existing router
- Register in `backend/main.py` with `app.include_router(router)`
- Add frontend API function in `web/lib/api.ts`
- Add any TypeScript response types in `web/lib/api.ts` as new interfaces

**New React Component:**
- UI component: `web/components/{name}.tsx` with `"use client"` directive
- Import using `@/components/{name}` path alias

**New Page/Route:**
- Create `web/app/{route-name}/page.tsx` following Next.js App Router conventions
- Root layout from `web/app/layout.tsx` wraps all pages

**New Shared Utility (frontend):**
- Add to `web/lib/{utility}.ts`
- Import using `@/lib/{utility}` path alias

**New Shared Utility (backend):**
- Add module to `backend/{name}.py`
- Import directly from `backend/` package

**Database Schema Change:**
- Modify `CREATE TABLE` statements in `backend/database.py:init_db()`
- Update `backend/setup_db.py` if seed logic is affected
- Add migration logic if production data exists

## Special Directories

**`data/`:**
- Purpose: SQLite database storage
- Generated: Yes (by `setup_db.py` and runtime writes)
- Committed: No — `bus_stops.db` is created locally; `.gitignore` should exclude it

**`node_modules/`:**
- Purpose: NPM dependencies
- Generated: Yes (`npm install`)
- Committed: No — in `.gitignore`

**`__pycache__/`:**
- Purpose: Python bytecode cache
- Generated: Yes (by Python runtime)
- Committed: No — in `.gitignore`

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (`next build` or `next dev`)
- Committed: No — in `.gitignore`

**`.planning/`:**
- Purpose: GSD workflow planning artifacts
- Generated: Yes (by GSD commands)
- Committed: Yes — used for project planning and codebase mapping

---

*Structure analysis: 2026-05-29*
