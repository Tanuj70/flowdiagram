import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.hash import pbkdf2_sha256
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuditLog, User

ALGO = "HS256"
RANK = {"viewer": 1, "executor": 2, "admin": 3}


def hash_password(p: str) -> str:
    return pbkdf2_sha256.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pbkdf2_sha256.verify(p, h)


def make_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": user.id, "exp": exp}, settings.secret_key, algorithm=ALGO)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(401, "Unknown user")
    return user


def require(min_role: str):
    def dep(user: User = Depends(current_user)) -> User:
        if RANK[user.role] < RANK[min_role]:
            raise HTTPException(403, f"Requires {min_role} role")
        return user
    return dep


def effective_role(user: User, agent) -> str:
    """Per-agent role (matched by email) can only *narrow or grant within* the global role ceiling for admins;
    for non-admins the agent entry decides, defaulting to the global role."""
    if user.role == "admin":
        return "admin"
    for r in agent.roles or []:
        if r.get("who", "").lower() == user.email.lower():
            return r.get("role", "viewer").lower()
    return user.role


def audit(db: Session, actor: str, action: str, target: str = "") -> None:
    db.add(AuditLog(actor=actor, action=action, target=target))


# --- naive login throttle (per process; use Redis when running >1 replica) ---
_fails: dict[str, list[float]] = {}


def throttle_check(key: str) -> None:
    now = time.time()
    recent = [t for t in _fails.get(key, []) if now - t < settings.login_window_seconds]
    _fails[key] = recent
    if len(recent) >= settings.login_max_failures:
        raise HTTPException(429, "Too many failed attempts. Try again later.")


def throttle_fail(key: str) -> None:
    _fails.setdefault(key, []).append(time.time())


def throttle_reset(key: str) -> None:
    _fails.pop(key, None)
