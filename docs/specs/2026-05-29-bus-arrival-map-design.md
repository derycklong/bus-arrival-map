# Bus Arrival Map — Design Spec

## Overview

A single-page web application that displays Singapore bus stops on an interactive Leaflet + OSM map. Users click a bus stop to see real-time arrival times (from LTA DataMall API), and can star their favourite bus lines per stop. Multi-user support with JWT-based auth.

## Architecture

```
Frontend (HTML/JS/CSS + Leaflet.js)
    ↕ HTTP/JSON (REST API)
Backend (Python FastAPI)
    ↕ SQLite
Database (data/bus_stops.db)

External APIs:
- OpenStreetMap tiles (via CDN)
- LTA DataMall v3 BusArrival (server-side proxy, AccountKey kept secret)
- LTA DataMall BusStops (for seeding DB)
```

## Database Schema

### bus_stops table

| Column     | Type    | Notes                        |
|------------|---------|------------------------------|
| stop_code  | TEXT PK | e.g. "60101"                 |
| name       | TEXT    | "Opp Blk 105"                |
| road       | TEXT    | "Jln Bt Batok"              |
| lat        | REAL    |                              |
| lng        | REAL    |                              |

Seeded once by `setup_db.py` (adapted from existing script):
- Remove `fav_bus` column from schema
- Remove the `populate_db` fav-bus-preservation logic
- Table creation: `CREATE TABLE bus_stops (stop_code TEXT PK, name TEXT, road TEXT, lat REAL, lng REAL)`
- Data downloaded from LTA DataMall BusStops API with pagination (same as existing script)

### users table

| Column        | Type    | Notes                  |
|---------------|---------|------------------------|
| id            | INT PK  | autoincrement           |
| username      | TEXT UNIQUE |                    |
| password_hash | TEXT    | bcrypt/argon2 hash     |
| created_at    | TEXT    | ISO datetime           |

### user_favourites table

| Column    | Type | Notes                              |
|-----------|------|------------------------------------|
| id        | INT PK | autoincrement                    |
| user_id   | INT  | FK → users(id)                    |
| stop_code | TEXT | FK → bus_stops(stop_code)         |
| bus_no    | TEXT | e.g. "133"                        |
| UNIQUE    |      | (user_id, stop_code, bus_no)      |

## API Endpoints

All under `/api/`. Auth endpoints require no token. Fav endpoints require `Authorization: Bearer <token>`.

### Auth
- `POST /api/register` — `{ username, password }` → `{ token }`
- `POST /api/login` — `{ username, password }` → `{ token }`
- `GET /api/me` — `{}` → `{ id, username }`

### Stops
- `GET /api/stops?lat=1.3083&lng=103.9026&radius=300` → `{ stops: [{ stop_code, name, road, lat, lng, distance_m }] }`
  - Uses Haversine formula (reuse from query_bus.py)
  - Returns max 50 nearest stops within radius

### Arrivals
- `GET /api/stops/{stop_code}/arrivals` → `{ services: [{ no, operator, next: { duration_ms, ... }, next2: {...}, next3: {...} }] }`
  - Proxies LTA DataMall v3 BusArrival API
  - Transforms response (reuse from query_bus.py)
  - LTA AccountKey stays server-side
  - Brief in-memory cache (~10s) to avoid rate limits

### Favourites
- `GET /api/favourites` → `{ by_stop: { "60101": ["133", "985"], ... } }`
- `POST /api/favourites` — `{ stop_code, bus_no }` → `{ ... }`
- `DELETE /api/favourites` — `{ stop_code, bus_no }` → `{ ... }`

## Frontend

### Stack
- Vanilla HTML/CSS/JS (no framework)
- Leaflet.js 1.x from CDN
- OpenStreetMap tile layer (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)

### Pages / States

1. **Login/Register modal** — shown when no valid token stored. Simple form, username + password. Toggle between login/register modes.

2. **Map** — fills entire viewport. Centered on Singapore (1.3521, 103.8198) by default. Standard Leaflet zoom controls. OSM tile layer.

3. **Bus stop markers** — Leaflet circle markers (or custom icons). Blue = has active services, Grey = no/unknown services. Star overlay for stops where user has favourites.

4. **Sidebar/panel** — slides in from right when a marker is clicked. Contains:
   - Stop name, road, code
   - Arrival table: columns Bus No | T1 (next) | T2 (subsequent) | Destination | Favourite star (⭐/☆)
   - Close button
   - Escape or clicking empty map closes it

5. **Favourites** — Star toggles via click. Changes send `POST`/`DELETE` to backend immediately. Favourites sync on login/page load.

### Flow
1. User opens page → sees login modal
2. Logs in or registers → token saved to `localStorage`
3. Map loads centered on Singapore, fetches all stops from API
4. Stops displayed as markers
5. User clicks marker → sidebar shows arrivals with star toggles
6. User stars a bus → POST /api/favourites → marker gets star indicator
7. User refreshes → favourites persist (loaded from API at startup)

## Implementation Plan

### Phase 1: Backend
1. Create `backend/` with FastAPI app, database setup, auth
2. Adapt `setup_db.py` to create DB without fav_bus column
3. Implement stop query endpoint (Haversine)
4. Implement arrivals endpoint (proxy LTA API)
5. Implement favourites CRUD
6. Test all endpoints

### Phase 2: Frontend
1. Create `index.html` with Leaflet map, auth modal, sidebar
2. Create `style.css` for layout
3. Create `app.js` with map rendering, marker management, API calls
4. Implement auth flow (login/register, token storage)
5. Implement stop marker rendering
6. Implement click → arrivals sidebar
7. Implement favourite star toggle
8. Wire up all API calls
9. Polish UX (loading states, error handling, mobile responsiveness)

## Edge Cases & Notes
- LTA API rate limit: ~100 req/min per IP. Cache arrivals per stop for 10s in memory (dict keyed by stop_code, stores response + timestamp). Avoids redundant calls when user clicks the same stop rapidly.
- No nearby stops: show "No stops found" message in sidebar.
- Arrivals API error: show "Unable to fetch arrivals" with retry button.
- Token expired: show login modal again, clear localStorage token.
- Large stop set: use Leaflet marker clustering if > 200 markers.
- Mobile: sidebar collapses to full-width bottom sheet.
- Password hashing: use bcrypt via `passlib` + `bcrypt` Python package.
