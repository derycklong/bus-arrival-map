import re
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from database import get_connection
from auth import hash_password, verify_password, create_token, require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["auth"])


class AuthBody(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be at most 30 characters")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username can only contain letters, numbers and underscores")
        return v


class RegisterBody(AuthBody):
    email: str
    mobile_number: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        if len(v) > 100:
            raise ValueError("Email is too long")
        return v

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        if not re.match(r"^[89]\d{7}$", v):
            raise ValueError("Mobile number must start with 8 or 9 and be 8 digits")
        return v


@router.post("/register")
def register(body: RegisterBody):
    try:
        conn = get_connection()
        existing = conn.execute("SELECT id FROM users WHERE username=?", (body.username,)).fetchone()
        if existing:
            conn.close()
            raise HTTPException(status_code=400, detail="Registration failed")

        pw_hash = hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, email, mobile_number) VALUES (?, ?, ?, ?)",
            (body.username, pw_hash, body.email, body.mobile_number),
        )
        conn.commit()
        user_id = cur.lastrowid
        token = create_token(user_id)
        conn.close()
        return {"token": token, "user": {"id": user_id, "username": body.username}}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Registration error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/login")
def login(body: AuthBody):
    try:
        conn = get_connection()
        row = conn.execute("SELECT id, password_hash FROM users WHERE username=?", (body.username,)).fetchone()
        conn.close()

        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = create_token(row["id"])
        return {"token": token, "user": {"id": row["id"], "username": body.username}}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Login error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/me")
def me(user_id: int = Depends(require_user)):
    conn = get_connection()
    row = conn.execute("SELECT id, username, email, mobile_number, created_at FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "mobile_number": row["mobile_number"],
        "created_at": row["created_at"],
    }
