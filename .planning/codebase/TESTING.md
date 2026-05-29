# Testing Patterns

**Analysis Date:** 2026-05-29

## Test Framework

**Status: No test framework configured in either backend or frontend.**

- No test files exist anywhere in the codebase (no `*.test.*`, `*.spec.*`, or test directories found)
- No Jest, Vitest, pytest, or unittest configuration files detected
- No test scripts defined in `web/package.json`
- No test runner configuration in `backend/` (no `pytest.ini`, `pyproject.toml` with test config, or `setup.cfg`)

**Run Commands:**
```bash
# No test commands available in any package manager script
```

## Test File Organization

No test organization exists. Based on the project structure, tests would logically be placed in:

- **Backend:** `backend/tests/` or co-located with modules as `test_*.py`
- **Frontend:** `web/__tests__/` or co-located as `*.test.tsx`

## Existing Test Infrastructure Hints

- **Backend `requirements.txt` includes `httpx==0.28.1`** — this is the standard async HTTP client for testing FastAPI endpoints via `TestClient` (from `fastapi.testclient`, which depends on `httpx`). This suggests testing was anticipated.
- **Frontend `.gitignore` includes `/coverage`** — indicates coverage tooling was anticipated or is part of the Next.js default template.
- **No test files in `__pycache__`** confirms no test discovery has ever occurred.

## Dependencies Available for Testing

**Backend (from `backend/requirements.txt`):**
- `httpx==0.28.1` — HTTP client, required by FastAPI's `TestClient`
- FastAPI's `TestClient` would be the expected approach for API testing

**Frontend (from `web/package.json`):**
- No testing packages in `dependencies` or `devDependencies`

## Recommended Testing Setup

**Backend — pytest + httpx (via FastAPI TestClient):**
```python
# Expected pattern for backend tests (not yet implemented):
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_register():
    resp = client.post("/api/register", json={"username": "test", "password": "test1234"})
    assert resp.status_code == 200
    assert "token" in resp.json()
```

**Frontend — Jest or Vitest + React Testing Library:**
- No test runner is currently configured for the Next.js frontend
- The Next.js 16 application would need Jest (with `@testing-library/react`) or Vitest to be added

## Test Types

**Unit Tests:**
- Not present in the codebase

**Integration Tests:**
- Not present in the codebase

**E2E Tests:**
- Not present in the codebase

## What Should Be Tested

Based on the codebase analysis, these areas lack test coverage:

### Backend (Python/FastAPI)

| Area | Files | What to test |
|------|-------|-------------|
| Auth endpoints | `backend/routers/auth.py` | Registration validation, duplicate user, login success/failure, token expiry |
| Auth helpers | `backend/auth.py` | Password hashing roundtrip, token create/decode, expired token handling |
| Stops endpoint | `backend/routers/stops.py` | Geo-query with Haversine, radius bounds, empty results |
| Arrivals endpoint | `backend/routers/stops.py` | LTA proxy transform, cache behavior, missing API key error |
| Favourites CRUD | `backend/routers/favourites.py` | Add/remove/list, duplicate detection, auth requirement |
| Database helpers | `backend/database.py` | Connection factory, table creation, Haversine calculation |
| Setup script | `backend/setup_db.py` | DB creation, data insertion, force flag |

### Frontend (TypeScript/React/Next.js)

| Area | Files | What to test |
|------|-------|-------------|
| API client | `web/lib/api.ts` | Request formation, auth header injection, error handling |
| Auth form | `web/components/auth-form.tsx` | Form validation, mode toggle, submit flow |
| Map view | `web/components/map-view.tsx` | Marker rendering, stop loading, favourite integration |
| Sidebar | `web/components/sidebar.tsx` | Arrival display, favourite toggle, duration formatting |
| Home page | `web/app/page.tsx` | Auth check flow, view switching, logout |
| Root layout | `web/app/layout.tsx` | Metadata, HTML structure |

## Known Test Gaps

1. **No automated testing at all** — entire codebase is untested
2. **No CI pipeline** — no CI configuration detected
3. **No coverage requirements** — not defined anywhere
4. **`httpx` in requirements.txt** suggests backend testing was planned but not executed
5. **`/coverage` in `.gitignore`** suggests coverage output was anticipated

---

*Testing analysis: 2026-05-29*
