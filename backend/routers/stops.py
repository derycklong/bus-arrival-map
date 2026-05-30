import time
import json
import os
import logging
from urllib.request import Request, urlopen
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from database import get_connection, haversine_m

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["stops"])

# In-memory cache for arrivals
_arrivals_cache = {}
CACHE_TTL = 10  # seconds


def _load_account_key():
    for env_path in [
        os.path.expanduser("~/.openclaw/.env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data", ".env"),
    ]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("LTA_DATAMALL_ACCOUNT_KEY=") and "=" in line:
                        return line.split("=", 1)[1].strip()
    return os.environ.get("LTA_DATAMALL_ACCOUNT_KEY")


@router.get("/stops")
def get_stops(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(300, ge=50, le=2000),
    limit: int = Query(200, ge=1, le=500),
):
    conn = get_connection()
    rows = conn.execute("SELECT stop_code, name, road, lat, lng FROM bus_stops").fetchall()
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


def _compute_duration_ms(estimated_arrival_str):
    if not estimated_arrival_str:
        return None
    try:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone(timedelta(hours=8)))
        arrival = datetime.fromisoformat(estimated_arrival_str)
        delta = arrival - now
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


def _resolve_destination_names(services):
    codes = set()
    for svc in services:
        for bus in [svc.get("next"), svc.get("subsequent"), svc.get("next2"), svc.get("next3")]:
            if bus and bus.get("destination_code"):
                codes.add(bus["destination_code"])
    if not codes:
        return {}
    conn = get_connection()
    placeholders = ",".join("?" for _ in codes)
    rows = conn.execute(f"SELECT stop_code, name FROM bus_stops WHERE stop_code IN ({placeholders})", list(codes)).fetchall()
    conn.close()
    return {r["stop_code"]: r["name"] for r in rows}


def _transform_lta_response(lta_data):
    raw_services = lta_data.get("Services", []) if isinstance(lta_data, dict) else []
    services = []
    for svc in raw_services:
        services.append({
            "no": svc.get("ServiceNo", ""),
            "operator": svc.get("Operator", ""),
            "next": _transform_bus(svc.get("NextBus")),
            "subsequent": _transform_bus(svc.get("NextBus2")),
            "next2": _transform_bus(svc.get("NextBus2")),
            "next3": _transform_bus(svc.get("NextBus3")),
        })
    dest_map = _resolve_destination_names(services)
    for svc in services:
        for bus in [svc.get("next"), svc.get("subsequent"), svc.get("next2"), svc.get("next3")]:
            if bus and bus.get("destination_code"):
                bus["destination_name"] = dest_map.get(bus["destination_code"], "")
    return {"services": services}


@router.get("/stops/{stop_code}/arrivals")
def get_arrivals(stop_code: str):
    global _arrivals_cache

    # Check cache
    now = time.time()
    cached = _arrivals_cache.get(stop_code)
    if cached and now - cached["ts"] < CACHE_TTL:
        return cached["data"]

    account_key = _load_account_key()
    if not account_key:
        raise HTTPException(status_code=500, detail="LTA API key not configured")

    url = f"https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode={stop_code}"
    headers = {"AccountKey": account_key, "Accept": "application/json"}

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=502, detail=f"LTA API returned {resp.status}")
            raw = json.loads(resp.read().decode("utf-8"))
            result = _transform_lta_response(raw)
            _arrivals_cache[stop_code] = {"ts": now, "data": result}
            return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch arrivals")
        raise HTTPException(status_code=502, detail="Failed to fetch arrivals")
