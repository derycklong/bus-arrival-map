# Coding Conventions

**Analysis Date:** 2026-05-29

## Languages

**Backend:** Python 3.11 — FastAPI server
**Frontend:** TypeScript 5.x — Next.js 16.2.6 React 19.2.4 app

## Naming Patterns

**Files:**
- **Python (backend):** `snake_case.py` — e.g., `setup_db.py`, `database.py`, `auth.py`
- **TypeScript/TSX (frontend):** `kebab-case.ts` / `kebab-case.tsx` — e.g., `auth-form.tsx`, `map-view.tsx`, `globals.css`

**Functions:**
- **Python:** `snake_case` — e.g., `hash_password()`, `verify_password()`, `get_connection()`, `init_db()`, `haversine_m()`, `_load_account_key()`, `_compute_duration_ms()`, `_transform_bus()`, `_transform_lta_response()`
- **TypeScript:** `camelCase` — e.g., `handleSubmit()`, `handleAuth()`, `handleLogout()`, `loadStops()`, `loadFavourites()`, `renderStops()`, `getToken()`, `formatDuration()`, `handleFav()`
- React event handlers prefixed with `handle`: `handleSubmit`, `handleAuth`, `handleFav`
- Private/internal Python functions prefixed with underscore: `_load_account_key()`, `_compute_duration_ms()`, `_transform_bus()`

**Variables:**
- **Python:** `snake_case` — e.g., `pw_hash`, `user_id`, `stop_code`, `bus_no`, `account_key`
- **TypeScript:** `camelCase` — e.g., `username`, `stopCode`, `busNo`, `favMap`, `currentStops`

**Types/Interfaces:**
- **TypeScript:** `PascalCase` — e.g., `SidebarProps`, `AuthFormProps`, `Stop`, `Bus`, `Service`, `StopsResponse`, `ArrivalsResponse`, `AuthResponse`, `UserResponse`, `FavouritesResponse`
- **Python (Pydantic):** `PascalCase` — e.g., `AuthBody`, `FavBody`

**Components:**
- **React:** `PascalCase` default exports — e.g., `Sidebar`, `MapView`, `AuthForm`, `RootLayout`, `Home`

## Code Style

**Formatting:**
- **Python:** No formatter config detected (no `.pyproject.toml`, `setup.cfg`, or equivalent found). Standard library style used.
- **TypeScript:** No Prettier config detected. Code uses 2-space indentation consistently.

**Linting:**
- **Frontend:** ESLint v9 via `eslint.config.mjs` at `web/eslint.config.mjs`
  - Config: uses `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
  - Custom ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
  - Run: `npm run lint` (alias: `eslint` in `web/package.json`)
- **Backend:** No linter config detected (no `pylint`, `ruff`, `flake8`, `mypy` configs found)

**Line lengths:** No explicit limit enforced. Functions tend to stay under 60 lines.

## Import Organization

**Python (backend):**
1. Standard library imports first: `import os`, `import sys`, `import json`, `import time`, `from datetime import datetime`
2. Third-party library imports: `from fastapi import FastAPI`, `import bcrypt`, `import jwt`
3. Internal module imports: `from database import init_db, get_connection`, `from routers import auth, stops, favourites`
4. All imports at module top level, one import per line style

**TypeScript (frontend):**
1. React/Next.js imports: `import { useState, useEffect } from "react"`, `import dynamic from "next/dynamic"`
2. Third-party library imports: `import L from "leaflet"`, `import "leaflet/dist/leaflet.css"`
3. Internal imports via `@/` path alias: `import AuthForm from "@/components/auth-form"`, `import { getMe } from "@/lib/api"`
4. Type-only imports: `import type { Metadata } from "next"`
5. CSS imports: `import "./globals.css"`

## Path Aliases

**TypeScript (`tsconfig.json`):**
- `@/*` maps to `./*` (project root)
- Usage: `@/components/map-view`, `@/lib/api`, `@/components/auth-form`

## Error Handling

**Backend (Python):**
- HTTP errors raised as `HTTPException(status_code=..., detail="...")` from `fastapi`
- Status codes used explicitly: `400`, `401`, `404`, `409`, `500`, `502`
- Pattern: validate early, raise HTTPException with descriptive `detail` message
- Token validation catches `jwt.ExpiredSignatureError` and `jwt.InvalidTokenError` separately
- Database operations: manual `conn.close()` in both success and error paths
- LTA API proxy: re-raises `HTTPException`, catches generic `Exception` and wraps in 502

```python
# Standard Python backend error pattern (routers/auth.py:16-19):
if len(body.username) < 3:
    raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

# Token decode with specific exceptions (auth.py:33-38):
try:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
except jwt.InvalidTokenError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
```

**Frontend (TypeScript):**
- `try/catch` blocks with empty catch or `err instanceof Error` check
- API errors: response body parsed as JSON, `detail` field extracted into `Error` message
- Empty catch blocks used for non-critical failures (`catch { /* noop */ }` or `catch { /* ignore */ }`)
- Form validation errors shown via state, not thrown

```typescript
// Standard TS error pattern (api.ts:25-28):
if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
}

// Empty catch for non-critical (sidebar.tsx:71):
} catch { /* ignore */ }
```

## Logging

**Backend:**
- `print()` statements for startup diagnostics and data fetching progress
- No structured logging library detected

**Frontend:**
- No console logging in production code
- No structured logging library detected

## Comments

**When to Comment:**
- Module-level docstrings: not used (no functions have docstrings)
- Inline comments for non-obvious logic: minimal; used in `stops.py` for cache section headers (`# Check cache`)
- `# noop` comments in empty catch blocks to indicate intentional silence
- `# In-memory cache for arrivals` — clarifying comment before a module-level variable

**JSDoc/TSDoc:**
- Not used anywhere in the codebase

## Function Design

**Size:**
- Backend functions range from 2–55 lines; most are under 30 lines
- Frontend component functions range from 10–110 lines (render logic inline)
- `Sidebar` component at 132 lines is the largest function — includes both logic and JSX

**Parameters:**
- Python: positional and keyword parameters, type-annotated
- TypeScript: typed interface for component props (`SidebarProps`, `AuthFormProps`), inline types for callbacks

**Return Values:**
- API endpoints return dicts (FastAPI auto-serializes to JSON)
- API functions in TypeScript return typed Promises via generic `api<T>()`
- Transform functions return dicts or `None` for invalid input

## Module Design

**Exports:**
- Python modules export via standard `import` / `from ... import ...` — no `__all__` defined
- React components are `export default function ComponentName()`
- API functions are named exports: `export function login()`, `export function getStops()`
- TypeScript interfaces are exported for use across modules

**Barrel Files:**
- `backend/routers/__init__.py` is empty (no re-exports)
- `backend/__init__.py` is empty (just a package marker)
- No barrel/index files in web components or lib directories

## Async Patterns

**Python:**
- Not used — all endpoints are synchronous (no `async def`)
- LTA API calls use `urllib.request.urlopen` (blocking)
- Startup event uses synchronous `@app.on_event("startup")`

**TypeScript:**
- `async/await` for all API calls and event handlers
- `useEffect` cleanup via returned callback for cancellation flags

```typescript
// Effect cleanup pattern (sidebar.tsx:33,51):
let cancelled = false;
// ...
return () => { cancelled = true; };
```

## React Conventions

- All components use `"use client"` directive (client-side rendered)
- Functional components with hooks (`useState`, `useEffect`, `useRef`, `useCallback`)
- Props typed via `interface ComponentProps` in the same file
- `dynamic()` import with `{ ssr: false }` for Leaflet map component to avoid SSR issues
- Tailwind CSS classes used extensively for styling — no separate CSS modules
- Inline `dangerouslySetInnerHTML` used in `sidebar.tsx` for HTML-rich arrival duration strings

---

*Convention analysis: 2026-05-29*
