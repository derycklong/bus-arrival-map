import os
import sys
import logging

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


@app.on_event("startup")
def startup():
    init_db()
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) as c FROM bus_stops").fetchone()["c"]
    conn.close()
    if count == 0:
        print("WARNING: bus_stops table is empty. Run setup_db.py first.")
    else:
        print(f"Database has {count} bus stops.")


# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
