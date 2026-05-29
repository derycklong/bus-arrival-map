import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_connection
from auth import require_user

router = APIRouter(prefix="/api", tags=["favourites"])


class AddFavBody(BaseModel):
    stop_code: str


class DelFavBody(BaseModel):
    stop_code: str


@router.get("/favourites")
def get_favourites(user_id: int = Depends(require_user)):
    conn = get_connection()
    rows = conn.execute(
        "SELECT bs.stop_code, bs.name, bs.road, bs.lat, bs.lng FROM user_favourites uf JOIN bus_stops bs ON uf.stop_code = bs.stop_code WHERE uf.user_id=? ORDER BY bs.name",
        (user_id,),
    ).fetchall()
    conn.close()
    return {"stops": [dict(r) for r in rows]}


@router.post("/favourites")
def add_favourite(body: AddFavBody, user_id: int = Depends(require_user)):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO user_favourites (user_id, stop_code) VALUES (?, ?)",
            (user_id, body.stop_code),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Favourite already exists")
    conn.close()
    return {"ok": True, "stop_code": body.stop_code}


@router.delete("/favourites")
def remove_favourite(body: DelFavBody, user_id: int = Depends(require_user)):
    conn = get_connection()
    conn.execute(
        "DELETE FROM user_favourites WHERE user_id=? AND stop_code=?",
        (user_id, body.stop_code),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "stop_code": body.stop_code}
