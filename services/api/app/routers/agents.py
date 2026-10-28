from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AgentGraph, Run, User
from ..schemas import AgentCreate, AgentOut, AgentUpdate
from ..security import audit, effective_role, require, RANK
from .graph import ROOT, prune_graphs

router = APIRouter(prefix="/agents", tags=["agents"])


def get_agent_or_404(db: Session, agent_id: str) -> Agent:
    a = db.get(Agent, agent_id)
    if not a:
        raise HTTPException(404, "Agent not found")
    return a


@router.get("", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return db.scalars(select(Agent).order_by(Agent.name)).all()


@router.post("", response_model=AgentOut, status_code=201)
def create_agent(body: AgentCreate, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    a = Agent(**body.model_dump(mode="json"))
    if not a.roles:
        a.roles = [{"who": user.email, "role": "Admin"}]
    db.add(a)
    audit(db, user.email, "agent.create", body.name)
    db.commit()
    return a


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return get_agent_or_404(db, agent_id)


@router.patch("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, body: AgentUpdate, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    a = get_agent_or_404(db, agent_id)
    if RANK[effective_role(user, a)] < RANK["admin"]:
        raise HTTPException(403, "Requires admin role on this agent")
    data = body.model_dump(exclude_unset=True, mode="json")
    for k, v in data.items():
        setattr(a, k, v)
    if data:
        a.version += 1
    audit(db, user.email, "agent.update", f"{a.id}:{','.join(data)}")
    db.commit()
    return a


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    a = get_agent_or_404(db, agent_id)
    own = db.get(AgentGraph, a.id)
    if own:
        db.delete(own)
    # keep every other canvas consistent: drop this agent wherever it was used as a sub-agent
    prune_graphs(db, lambda n: n["type"] == "agent" and n["ref"] == a.id)
    audit(db, user.email, "agent.delete", a.id)
    db.delete(a)
    db.commit()


@router.post("/{agent_id}/duplicate", response_model=AgentOut, status_code=201)
def duplicate_agent(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    src = get_agent_or_404(db, agent_id)
    cols = ["description", "prompt", "icon", "skills", "framework", "pattern", "model", "max_tokens", "temperature",
            "top_p", "top_k", "guardrails", "approvals", "memory"]
    copy = Agent(name=f"{src.name} (copy)"[:80], roles=[{"who": user.email, "role": "Admin"}],
                 **{c: __import__("copy").deepcopy(getattr(src, c)) for c in cols})
    db.add(copy)
    db.flush()
    g = db.get(AgentGraph, src.id)
    if g and g.data:
        data = __import__("copy").deepcopy(g.data)
        for n in data["nodes"]:
            if n["id"] == ROOT:
                n["ref"] = copy.id
        db.add(AgentGraph(agent_id=copy.id, data=data))
    audit(db, user.email, "agent.duplicate", f"{src.id}->{copy.id}")
    db.commit()
    return copy


@router.get("/{agent_id}/stats")
def stats(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    get_agent_or_404(db, agent_id)
    runs = db.scalars(select(Run).where(Run.agent_id == agent_id)).all()
    tokens = sum(r.tokens for r in runs)
    done = [r for r in runs if r.status == "completed"]
    tools: dict[str, dict] = {}
    for r in runs:
        for s in r.steps:
            if s["kind"] in ("tool", "endpoint"):
                t = tools.setdefault(s["label"], {"calls": 0, "ok": 0})
                t["calls"] += 1
                t["ok"] += 1 if s["status"] == "done" else 0
    by_day: dict[str, int] = {}
    for r in runs:
        d = r.created_at.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0) + r.tokens
    return {
        "sessions": len(runs),
        "completed": len(done),
        "blocked": sum(1 for r in runs if r.status == "blocked"),
        "tokens": tokens,
        "avg_latency_ms": int(sum(r.latency_ms for r in done) / len(done)) if done else 0,
        "est_cost_usd": round(tokens / 1000 * 0.003, 4),  # illustrative rate, configurable later
        "tools": [{"name": k, **v} for k, v in tools.items()],
        "tokens_by_day": [{"day": d, "tokens": t} for d, t in sorted(by_day.items())],
    }
