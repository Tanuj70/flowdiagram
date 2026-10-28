from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AuditLog, Endpoint, Run, User
from ..runtime import advance, plan_run
from ..schemas import RunIn, RunListItem, RunOut
from ..security import audit, effective_role, require, RANK
from .agents import get_agent_or_404
from .graph import load_graphs

router = APIRouter(tags=["runs"])


def _agent_dicts(db: Session) -> dict:
    return {
        a.id: {"id": a.id, "name": a.name, "pattern": a.pattern, "model": a.model,
               "guardrails": a.guardrails or {}, "approvals": a.approvals or []}
        for a in db.scalars(select(Agent)).all()
    }


@router.post("/agents/{agent_id}/runs", response_model=RunOut, status_code=201)
def start_run(agent_id: str, body: RunIn, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    a = get_agent_or_404(db, agent_id)
    if RANK[effective_role(user, a)] < RANK["executor"]:
        raise HTTPException(403, "Requires executor role on this agent")
    agents = _agent_dicts(db)
    endpoints = {e.id: {"name": e.name} for e in db.scalars(select(Endpoint)).all()}
    steps = plan_run(load_graphs(db), agents, endpoints, agent_id)
    run = Run(agent_id=agent_id, user_email=user.email, input=body.input, steps=steps, status="running", tokens=0, latency_ms=0, output="")
    advance(run, agents)
    db.add(run)
    audit(db, user.email, "run.start", agent_id)
    db.commit()
    return run


RUN_STATUSES = "^(running|awaiting_approval|completed|blocked)$"


@router.get("/runs", response_model=list[RunListItem])
def list_all_runs(status: str | None = Query(None, pattern=RUN_STATUSES), agent_id: str | None = None,
                  limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    """Run history across all agents (newest first). Powers the Runs page and the approvals inbox."""
    q = select(Run).order_by(Run.created_at.desc()).limit(limit)
    if status:
        q = q.where(Run.status == status)
    if agent_id:
        q = q.where(Run.agent_id == agent_id)
    names = {a.id: a.name for a in db.scalars(select(Agent)).all()}
    return [
        RunListItem(id=r.id, agent_id=r.agent_id, agent_name=names.get(r.agent_id, "(deleted agent)"), status=r.status,
                    input=r.input[:200], steps_total=len(r.steps), steps_done=sum(1 for s in r.steps if s["status"] in ("done", "approved")),
                    tokens=r.tokens, latency_ms=r.latency_ms, created_at=r.created_at, user_email=r.user_email)
        for r in db.scalars(q).all()
    ]


@router.get("/runs/summary")
def runs_summary(db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    rows = db.execute(select(Run.status, func.count()).group_by(Run.status)).all()
    by = {s: n for s, n in rows}
    return {"awaiting": by.get("awaiting_approval", 0), "blocked": by.get("blocked", 0), "completed": by.get("completed", 0), "total": sum(by.values())}


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    r = db.get(Run, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    return r


@router.get("/agents/{agent_id}/runs", response_model=list[RunOut])
def list_runs(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    get_agent_or_404(db, agent_id)
    return db.scalars(select(Run).where(Run.agent_id == agent_id).order_by(Run.created_at.desc()).limit(50)).all()


@router.post("/runs/{run_id}/steps/{idx}/approve", response_model=RunOut)
def approve(run_id: str, idx: int, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    r = db.get(Run, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    a = get_agent_or_404(db, r.agent_id)
    if RANK[effective_role(user, a)] < RANK["executor"]:
        raise HTTPException(403, "Requires executor role on this agent")
    if r.status != "awaiting_approval" or idx < 0 or idx >= len(r.steps) or r.steps[idx]["status"] != "awaiting_approval":
        raise HTTPException(409, "This step is not awaiting approval")
    steps = [dict(s) for s in r.steps]
    steps[idx]["status"] = "approved"
    r.steps = steps
    r.status = "running"
    advance(r, _agent_dicts(db))
    audit(db, user.email, "run.approve", f"{run_id}#{idx}")
    db.commit()
    return r


@router.get("/audit")
def audit_log(db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(200)).all()
    return [{"at": r.at.isoformat(), "actor": r.actor, "action": r.action, "target": r.target} for r in rows]
