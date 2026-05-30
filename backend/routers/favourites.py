import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from database import get_connection
from auth import require_user

router = APIRouter(prefix="/api", tags=["favourites"])


class AddFavBody(BaseModel):
    stop_code: str

    @field_validator("stop_code")
    @classmethod
    def validate_stop_code(cls, v: str) -> str:
        if len(v) > 10:
            raise ValueError("Invalid stop code")
        return v


class DelFavBody(BaseModel):
    stop_code: str

    @field_validator("stop_code")
    @classmethod
    def validate_stop_code(cls, v: str) -> str:
        if len(v) > 10:
            raise ValueError("Invalid stop code")
        return v


@router.get("/favourites")
def get_favourites(user_id: int = Depends(require_user)):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT bs.stop_code, bs.name, bs.road, bs.lat, bs.lng FROM user_favourites uf JOIN bus_stops bs ON uf.stop_code = bs.stop_code WHERE uf.user_id=? ORDER BY bs.name",
            (user_id,),
        ).fetchall()
        return {"stops": [dict(r) for r in rows]}
    finally:
        conn.close()


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
        raise HTTPException(status_code=409, detail="Favourite already exists")
    finally:
        conn.close()
    return {"ok": True, "stop_code": body.stop_code}


@router.delete("/favourites")
def remove_favourite(body: DelFavBody, user_id: int = Depends(require_user)):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM user_favourites WHERE user_id=? AND stop_code=?",
            (user_id, body.stop_code),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "stop_code": body.stop_code}
