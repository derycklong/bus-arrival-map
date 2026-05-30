import os
import sys
import logging
import threading
from datetime import datetime, time, timedelta
from dotenv import load_dotenv

# Load environment variables from data/.env
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

# Add backend dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

app = FastAPI(title="Bus Arrival Map")

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


def refresh_bus_stops():
    try:
        logger.info("Refreshing bus stop data from LTA DataMall...")
        stops = download_stops()
        conn = create_db()
        populate_db(conn, stops)
        conn.close()
        logger.info(f"Bus stop data refreshed: {len(stops)} stops")
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


@app.on_event("startup")
def startup():
    init_db()
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) as c FROM bus_stops").fetchone()["c"]
    conn.close()
    if count == 0:
        logger.warning("Bus stops table is empty. Refreshing now...")
        refresh_bus_stops()
    else:
        logger.info(f"Database has {count} bus stops.")
    schedule_daily_refresh()


# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
