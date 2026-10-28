from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, UserOut
from ..security import (audit, current_user, make_token, throttle_check, throttle_fail, throttle_reset, verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else '?'}|{body.email.lower()}"
    throttle_check(key)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        throttle_fail(key)
        raise HTTPException(401, "Invalid email or password")
    throttle_reset(key)
    response.set_cookie(
        "access_token", make_token(user), httponly=True, samesite="lax",
        secure=settings.cookie_secure, max_age=settings.access_token_minutes * 60, path="/",
    )
    audit(db, user.email, "login")
    db.commit()
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
