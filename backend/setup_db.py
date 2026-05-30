import json
import sqlite3
import sys
import os
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "data", "bus_stops.db")

LTA_BUSSTOPS_URL = "https://datamall2.mytransport.sg/ltaodataservice/BusStops"
PAGE_SIZE = 500


def _load_account_key():
    for env_path in [
        os.path.expanduser("~/.openclaw/.env"),
        os.path.join(PROJECT_DIR, "data", ".env"),
        os.path.join(PROJECT_DIR, "data", ".env"),
    ]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("LTA_DATAMALL_ACCOUNT_KEY=") and "=" in line:
                        return line.split("=", 1)[1].strip()
    return os.environ.get("LTA_DATAMALL_ACCOUNT_KEY")


def download_stops():
    account_key = _load_account_key()
    if not account_key:
        raise RuntimeError("LTA_DATAMALL_ACCOUNT_KEY not found")

    headers = {"AccountKey": account_key, "Accept": "application/json"}
    all_stops = []
    skip = 0
    while True:
        url = f"{LTA_BUSSTOPS_URL}?$skip={skip}"
        print(f"Fetching {url} ...")
        req = Request(url, headers=headers)
        with urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
            data = json.loads(resp.read().decode("utf-8"))
        page = data.get("value", [])
        if not page:
            break
        all_stops.extend(page)
        print(f"  Got {len(page)} stops (total: {len(all_stops)})")
        if len(page) < PAGE_SIZE:
            break
        skip += PAGE_SIZE
    print(f"Loaded {len(all_stops)} bus stops total")
    return all_stops


def create_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bus_stops (
            stop_code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            road TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_bus_stops_lat_lng ON bus_stops(lat, lng)")
    return conn


def populate_db(conn, lta_stops):
    rows = []
    for s in lta_stops:
        code = s.get("BusStopCode", "")
        name = s.get("Description", "")
        road = s.get("RoadName", "")
        lat = float(s.get("Latitude", 0) or 0)
        lng = float(s.get("Longitude", 0) or 0)
        rows.append((code, name, road, lat, lng))

    conn.execute("DELETE FROM bus_stops")
    conn.executemany(
        "INSERT INTO bus_stops (stop_code, name, road, lat, lng) VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    print(f"Inserted {len(rows)} stops into {DB_PATH}")


def main():
    force = "--force" in sys.argv
    if os.path.exists(DB_PATH) and not force:
        print(f"Database already exists: {DB_PATH}")
        print("Use --force to rebuild")
        return
    lta_stops = download_stops()
    conn = create_db()
    populate_db(conn, lta_stops)
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
