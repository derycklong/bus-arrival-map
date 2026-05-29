import sqlite3
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "data", "bus_stops.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _migrate_user_favourites(conn):
    cols = [r[1] for r in conn.execute("PRAGMA table_info(user_favourites)").fetchall()]
    if "bus_no" in cols:
        conn.executescript("""
            CREATE TABLE user_favourites_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                stop_code TEXT NOT NULL REFERENCES bus_stops(stop_code),
                UNIQUE(user_id, stop_code)
            );
            INSERT OR IGNORE INTO user_favourites_new (user_id, stop_code)
                SELECT DISTINCT user_id, stop_code FROM user_favourites;
            DROP TABLE user_favourites;
            ALTER TABLE user_favourites_new RENAME TO user_favourites;
            CREATE INDEX idx_user_favourites_user ON user_favourites(user_id);
        """)
        conn.commit()


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bus_stops (
            stop_code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            road TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_favourites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            stop_code TEXT NOT NULL REFERENCES bus_stops(stop_code),
            UNIQUE(user_id, stop_code)
        );

        CREATE INDEX IF NOT EXISTS idx_bus_stops_lat_lng ON bus_stops(lat, lng);
        CREATE INDEX IF NOT EXISTS idx_user_favourites_user ON user_favourites(user_id);
    """)
    conn.commit()
    _migrate_user_favourites(conn)
    conn.close()


def haversine_m(lat1, lng1, lat2, lng2):
    import math
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
