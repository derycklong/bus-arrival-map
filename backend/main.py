import os
import sys
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta

# Ensure backend/ is on sys.path so sibling modules (env_config, database,
# routers, setup_db) resolve when this file is the entry point
# (e.g. `python -m uvicorn backend.main:app`).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from data/.env (side-effect import)
import env_config  # noqa: E402, F401

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db, get_connection
from routers import auth, stops, favourites
from setup_db import download_stops, create_db, populate_db

logger = logging.getLogger(__name__)


def refresh_bus_stops():
    try:
        logger.info("Refreshing bus stop data from LTA DataMall...")
        rows = download_stops()
        conn = create_db()
        populate_db(conn, rows)
        conn.close()
        logger.info(f"Bus stop data refreshed: {len(rows)} stops")
    except Exception:
        logger.exception("Failed to refresh bus stops")


def schedule_daily_refresh():
    now = datetime.now()
    target = datetime.combine(now.date(), time(1, 0))
    if now >= target:
        target += timedelta(days=1)
    delay_sec = (target - now).total_seconds()

    def run():
        refresh_bus_stops()
        schedule_daily_refresh()

    timer = threading.Timer(delay_sec, run)
    timer.daemon = True
    timer.start()
    logger.info(f"Next bus stop refresh scheduled at {target.strftime('%Y-%m-%d %H:%M')}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    conn = get_connection()
    try:
        count = conn.execute("SELECT COUNT(*) as c FROM bus_stops").fetchone()["c"]
    finally:
        conn.close()
    if count == 0:
        logger.warning("Bus stops table is empty. Refreshing now...")
        refresh_bus_stops()
    else:
        logger.info(f"Database has {count} bus stops.")
    schedule_daily_refresh()
    yield


app = FastAPI(title="Bus Arrival Map", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stops.router)
app.include_router(favourites.router)

# Serve frontend static export (Docker build) if it exists
_project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_frontend_dir = os.path.join(_project_dir, "web", "out")
if not os.path.isdir(_frontend_dir):
    _frontend_dir = os.path.join(_project_dir, "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
    logger.info(f"Serving frontend from {_frontend_dir}")
