import json
import logging
import threading
import time
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query

from database import bounding_box, get_connection, haversine_m
from env_config import get_lta_account_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["stops"])

# In-memory cache for arrivals (per-stop)
_arrivals_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()
CACHE_TTL = 10  # seconds
CACHE_MAX_ENTRIES = 2000

# Crude per-process rate limiter for upstream LTA calls to avoid burning quota
_rate_lock = threading.Lock()
_rate_window_s = 60
_rate_max = 120  # ~ LTA DataMall free-tier ceiling per minute
_rate_calls: list[float] = []


def _rate_limit() -> None:
    now = time.monotonic()
    with _rate_lock:
        # Drop entries outside the window
        cutoff = now - _rate_window_s
        while _rate_calls and _rate_calls[0] < cutoff:
            _rate_calls.pop(0)
        if len(_rate_calls) >= _rate_max:
            wait = _rate_window_s - (now - _rate_calls[0])
            raise HTTPException(
                status_code=429,
                detail=f"Upstream rate limit reached, retry in {int(wait) + 1}s",
            )
        _rate_calls.append(now)


def _cache_get(stop_code: str):
    now = time.time()
    with _cache_lock:
        entry = _arrivals_cache.get(stop_code)
        if entry and now - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None


def _cache_put(stop_code: str, data: dict) -> None:
    now = time.time()
    with _cache_lock:
        if len(_arrivals_cache) >= CACHE_MAX_ENTRIES:
            # Drop oldest ~10% of entries to bound memory
            evict = max(1, CACHE_MAX_ENTRIES // 10)
            for k in list(_arrivals_cache.keys())[:evict]:
                _arrivals_cache.pop(k, None)
        _arrivals_cache[stop_code] = {"ts": now, "data": data}


@router.get("/stops")
def get_stops(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(300, ge=50, le=2000),
    limit: int = Query(200, ge=1, le=500),
):
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radius)

    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT stop_code, name, road, lat, lng
              FROM bus_stops
             WHERE lat BETWEEN ? AND ?
               AND lng BETWEEN ? AND ?
            """,
            (min_lat, max_lat, min_lng, max_lng),
        ).fetchall()
    finally:
        conn.close()

    results = []
    for r in rows:
        dist = haversine_m(lat, lng, r["lat"], r["lng"])
        if dist <= radius:
            results.append({
                "stop_code": r["stop_code"],
                "name": r["name"],
                "road": r["road"],
                "lat": r["lat"],
                "lng": r["lng"],
                "distance_m": round(dist),
            })

    results.sort(key=lambda x: x["distance_m"])
    return {"stops": results[:limit]}


SGT = ZoneInfo("Asia/Singapore")


def _compute_duration_ms(estimated_arrival_str: str) -> int | None:
    if not estimated_arrival_str:
        return None
    try:
        arrival = datetime.fromisoformat(estimated_arrival_str)
        if arrival.tzinfo is None:
            arrival = arrival.replace(tzinfo=SGT)
        delta = arrival - datetime.now(SGT)
        return int(delta.total_seconds() * 1000)
    except (ValueError, TypeError):
        return None


def _transform_bus(bus_obj):
    if not bus_obj:
        return None
    est = bus_obj.get("EstimatedArrival", "")
    return {
        "time": est,
        "duration_ms": _compute_duration_ms(est),
        "lat": float(bus_obj.get("Latitude", 0) or 0),
        "lng": float(bus_obj.get("Longitude", 0) or 0),
        "load": bus_obj.get("Load", ""),
        "feature": bus_obj.get("Feature", ""),
        "type": bus_obj.get("Type", ""),
        "visit_number": bus_obj.get("VisitNumber", 1),
        "origin_code": bus_obj.get("OriginCode", ""),
        "destination_code": bus_obj.get("DestinationCode", ""),
        "monitored": bus_obj.get("Monitored", 0),
    }


def _resolve_destination_names(services: list[dict]) -> dict[str, str]:
    codes: set[str] = set()
    for svc in services:
        for bus in (svc.get("next"), svc.get("subsequent")):
            if bus and bus.get("destination_code"):
                codes.add(bus["destination_code"])
    if not codes:
        return {}
    conn = get_connection()
    try:
        placeholders = ",".join("?" for _ in codes)
        rows = conn.execute(
            f"SELECT stop_code, name FROM bus_stops WHERE stop_code IN ({placeholders})",
            list(codes),
        ).fetchall()
    finally:
        conn.close()
    return {r["stop_code"]: r["name"] for r in rows}


def _transform_lta_response(lta_data) -> dict:
    raw_services = lta_data.get("Services", []) if isinstance(lta_data, dict) else []
    services = []
    for svc in raw_services:
        services.append({
            "no": svc.get("ServiceNo", ""),
            "operator": svc.get("Operator", ""),
            "next": _transform_bus(svc.get("NextBus")),
            "subsequent": _transform_bus(svc.get("NextBus2")),
        })
    dest_map = _resolve_destination_names(services)
    for svc in services:
        for bus in (svc.get("next"), svc.get("subsequent")):
            if bus and bus.get("destination_code"):
                bus["destination_name"] = dest_map.get(bus["destination_code"], "")
    return {"services": services}


@router.get("/stops/{stop_code}/arrivals")
def get_arrivals(stop_code: str):
    cached = _cache_get(stop_code)
    if cached is not None:
        return cached

    account_key = get_lta_account_key()
    if not account_key:
        raise HTTPException(status_code=500, detail="LTA API key not configured")

    _rate_limit()

    url = f"https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode={stop_code}"
    headers = {"AccountKey": account_key, "Accept": "application/json"}

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=502, detail=f"LTA API returned {resp.status}")
            raw = json.loads(resp.read().decode("utf-8"))
            result = _transform_lta_response(raw)
            _cache_put(stop_code, result)
            return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch arrivals")
        raise HTTPException(status_code=502, detail="Failed to fetch arrivals")
