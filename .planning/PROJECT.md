# Bus Arrival Map

## What This Is

A web app for Singapore that shows nearby bus stops on an interactive map with real-time arrival times from the LTA DataMall API. Users can save their favorite bus stops and view all arrivals in a dedicated panel.

## Core Value

Users can instantly see when the next bus arrives at any stop near them, and keep their most-used stops bookmarked for quick access.

## Requirements

### Validated

- ✓ JWT-based user registration and login — existing
- ✓ Nearby bus stops by geolocation with haversine distance — existing
- ✓ LTA DataMall v3 BusArrival API integration with 10s cache — existing
- ✓ Interactive Leaflet map centered on Singapore with stop markers — existing
- ✓ Stop detail sidebar showing bus service arrival times — existing
- ✓ SQLite database with bus_stops, users, user_favourites tables — existing
- ✓ Next.js frontend with API proxy to FastAPI backend — existing

### Active

- [ ] **FAV-01**: User can favorite an entire bus stop (not individual buses)
- [ ] **FAV-02**: User can view a persistent panel listing all favorited stops with real-time arrivals
- [ ] **FAV-03**: User can unfavorite a bus stop from the panel
- [ ] **FAV-04**: Favorited stops are visually highlighted on the map
- [ ] **FAV-05**: User can navigate to a stop on the map by clicking it in the favorites panel

### Out of Scope

- Push notifications for bus arrivals — defer to v2
- Multi-city transit data — Singapore LTA only for v1

## Context

- Frontend: Next.js 16 with React 19, Leaflet maps, Tailwind CSS
- Backend: Python FastAPI, SQLite, JWT auth
- Data source: Singapore LTA DataMall API (requires AccountKey)
- Existing codebase has auth, map, stop search, arrivals display, and per-bus favorites — needs conversion to stop-level favorites + favorites panel

## Constraints

- **Data Source**: LTA DataMall API rate limits (~100 req/min) — mitigated by 10s server-side cache
- **Auth State**: JWT stored in localStorage (XSS-vulnerable — known tech debt)
- **Threading**: Single-process uvicorn assumed — cache not thread-safe

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stop-level favorites | User wants to favorite stops, not individual buses | — Pending |
| Persistent favorites panel | Always-accessible side panel showing all saved stops with live arrivals | — Pending |
| Singapore LTA | Only data source for v1 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-29 after initialization*
