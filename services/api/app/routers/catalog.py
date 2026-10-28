import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Endpoint, McpServer, User
from ..netguard import assert_public_url
from ..schemas import EndpointIn, EndpointOut, EndpointUpdate, McpIn, McpOut, McpUpdate
from ..security import audit, require
from .graph import prune_graphs, strip_approvals

router = APIRouter(tags=["catalog"])


def _ping(url: str) -> dict:
    """Reachability check. HEAD only (never writes); public hosts only (SSRF guard)."""
    assert_public_url(url)
    try:
        r = httpx.head(url, timeout=5, follow_redirects=False)
        return {"reachable": True, "status": r.status_code}
    except httpx.HTTPError as ex:
        return {"reachable": False, "error": type(ex).__name__}


@router.get("/mcp", response_model=list[McpOut])
def list_mcp(db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return db.scalars(select(McpServer).order_by(McpServer.name)).all()


@router.post("/mcp", response_model=McpOut, status_code=201)
def add_mcp(body: McpIn, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    m = McpServer(**body.model_dump(mode="json"))
    db.add(m)
    audit(db, user.email, "mcp.create", body.name)
    db.commit()
    return m


@router.patch("/mcp/{mid}", response_model=McpOut)
def update_mcp(mid: str, body: McpUpdate, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    m = db.get(McpServer, mid)
    if not m:
        raise HTTPException(404, "Not found")
    data = body.model_dump(exclude_unset=True, mode="json")
    if "tools" in data:
        names = {t["name"] for t in data["tools"]}
        if len(names) != len(data["tools"]):
            raise HTTPException(422, "Duplicate tool names")
        removed = {t["name"] for t in m.tools} - names
        if removed:  # tools that no longer exist must leave every canvas and approval list
            gone = {f"{mid}.{n}" for n in removed}
            prune_graphs(db, lambda n: n["type"] == "tool" and n["ref"] in gone)
            strip_approvals(db, lambda x: x in gone)
    for k, v in data.items():
        setattr(m, k, v)
    audit(db, user.email, "mcp.update", f"{mid}:{','.join(data)}")
    db.commit()
    return m


@router.delete("/mcp/{mid}", status_code=204)
def del_mcp(mid: str, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    m = db.get(McpServer, mid)
    if not m:
        raise HTTPException(404, "Not found")
    prune_graphs(db, lambda n: n["type"] == "tool" and n["ref"].split(".")[0] == mid)
    strip_approvals(db, lambda x: x.split(".")[0] == mid)
    audit(db, user.email, "mcp.delete", m.name)
    db.delete(m)
    db.commit()


@router.post("/mcp/{mid}/test")
def test_mcp(mid: str, db: Session = Depends(get_db), user: User = Depends(require("executor"))):
    m = db.get(McpServer, mid)
    if not m:
        raise HTTPException(404, "Not found")
    if not m.url:
        raise HTTPException(400, "This server has no URL")
    return _ping(m.url)


@router.get("/endpoints", response_model=list[EndpointOut])
def list_eps(db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return db.scalars(select(Endpoint).order_by(Endpoint.collection, Endpoint.name)).all()


@router.post("/endpoints", response_model=EndpointOut, status_code=201)
def add_ep(body: EndpointIn, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    e = Endpoint(**body.model_dump(mode="json"))
    db.add(e)
    audit(db, user.email, "endpoint.create", body.name)
    db.commit()
    return e


@router.patch("/endpoints/{eid}", response_model=EndpointOut)
def update_ep(eid: str, body: EndpointUpdate, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    e = db.get(Endpoint, eid)
    if not e:
        raise HTTPException(404, "Not found")
    data = body.model_dump(exclude_unset=True, mode="json")
    for k, v in data.items():
        setattr(e, k, v)
    audit(db, user.email, "endpoint.update", f"{eid}:{','.join(data)}")
    db.commit()
    return e


@router.delete("/endpoints/{eid}", status_code=204)
def del_ep(eid: str, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    e = db.get(Endpoint, eid)
    if not e:
        raise HTTPException(404, "Not found")
    prune_graphs(db, lambda n: n["type"] == "endpoint" and n["ref"] == eid)
    strip_approvals(db, lambda x: x == eid)
    audit(db, user.email, "endpoint.delete", e.name)
    db.delete(e)
    db.commit()


@router.post("/endpoints/{eid}/test")
def test_ep(eid: str, db: Session = Depends(get_db), user: User = Depends(require("executor"))):
    e = db.get(Endpoint, eid)
    if not e:
        raise HTTPException(404, "Not found")
    return _ping(e.url)
