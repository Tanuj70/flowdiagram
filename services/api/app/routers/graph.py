"""Per-agent canvases. Each agent owns a graph: a 'root' node (the agent) plus sub-agents, MCP tools and
endpoints connected through typed sockets. Sub-agents have their own canvas (open them to edit)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AgentGraph, Endpoint, McpServer, User
from ..schemas import GraphIO
from ..security import RANK, audit, effective_role, require

router = APIRouter(tags=["graph"])
ROOT = "root"


def default_graph(agent_id: str) -> dict:
    return {"nodes": [{"id": ROOT, "type": "agent", "ref": agent_id, "x": 240, "y": 40}], "edges": []}


def load_graphs(db: Session) -> dict[str, dict]:
    return {r.agent_id: r.data for r in db.scalars(select(AgentGraph)).all() if r.data}


def prune_graphs(db: Session, match) -> None:
    """Remove nodes (and their edges) matching `match(node)` from every agent canvas."""
    for row in db.scalars(select(AgentGraph)).all():
        d = row.data or {}
        gone = {n["id"] for n in d.get("nodes", []) if n["id"] != ROOT and match(n)}
        if gone:
            row.data = {
                "nodes": [n for n in d["nodes"] if n["id"] not in gone],
                "edges": [e for e in d["edges"] if e["source"] not in gone and e["target"] not in gone],
            }


def strip_approvals(db: Session, match) -> None:
    for a in db.scalars(select(Agent)).all():
        keep = [x for x in (a.approvals or []) if not match(x)]
        if len(keep) != len(a.approvals or []):
            a.approvals = keep


def validate_graph(agent_id: str, g: GraphIO, db: Session) -> None:
    nodes = {n.id: n for n in g.nodes}
    if len(nodes) != len(g.nodes):
        raise HTTPException(422, "Duplicate node ids")
    root = nodes.get(ROOT)
    if not root or root.type != "agent" or root.ref != agent_id:
        raise HTTPException(422, "The canvas must contain this agent as its 'root' node")
    agents = set(db.scalars(select(Agent.id)).all())
    eps = set(db.scalars(select(Endpoint.id)).all())
    tools = {f"{m.id}.{t['name']}" for m in db.scalars(select(McpServer)).all() for t in m.tools}
    seen_refs = set()
    for n in g.nodes:
        if n.id == ROOT:
            continue
        if n.type == "agent" and (n.ref == agent_id or n.ref not in agents):
            raise HTTPException(422, "A sub-agent must be another existing agent")
        if n.type == "endpoint" and n.ref not in eps:
            raise HTTPException(422, f"Unknown endpoint '{n.ref}'")
        if n.type == "tool" and n.ref not in tools:
            raise HTTPException(422, f"Unknown tool '{n.ref}'")
        key = (n.type, n.ref)
        if key in seen_refs:
            raise HTTPException(422, f"'{n.ref}' appears twice on this canvas")
        seen_refs.add(key)
    targets = set()
    for e in g.edges:
        if e.source != ROOT:
            raise HTTPException(422, "Connections must start at the agent itself")
        t = nodes.get(e.target)
        if not t or t.id == ROOT:
            raise HTTPException(422, f"Edge {e.id} points to a missing node")
        want = {"agents": "agent", "tools": "tool", "endpoints": "endpoint"}[e.socket]
        if t.type != want:
            raise HTTPException(422, f"Socket '{e.socket}' only accepts {want} nodes")
        if e.target in targets:
            raise HTTPException(422, "Duplicate connection")
        targets.add(e.target)
    # cross-canvas cycle check: agent -> sub-agents (from every canvas, with this one replaced)
    graphs = load_graphs(db)
    graphs[agent_id] = g.model_dump(mode="json")
    adj = {a: [n["ref"] for n in d["nodes"] if n["type"] == "agent" and n["id"] != ROOT] for a, d in graphs.items()}
    seen, stack = set(), list(adj.get(agent_id, []))
    while stack:
        x = stack.pop()
        if x == agent_id:
            raise HTTPException(422, "Circular delegation between agents is not allowed")
        if x in seen:
            continue
        seen.add(x)
        stack.extend(adj.get(x, []))


def _agent_or_404(db: Session, agent_id: str) -> Agent:
    a = db.get(Agent, agent_id)
    if not a:
        raise HTTPException(404, "Agent not found")
    return a


@router.get("/agents/{agent_id}/graph", response_model=GraphIO)
def get_graph(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    _agent_or_404(db, agent_id)
    row = db.get(AgentGraph, agent_id)
    return row.data if row and row.data else default_graph(agent_id)


@router.put("/agents/{agent_id}/graph", response_model=GraphIO)
def put_graph(agent_id: str, body: GraphIO, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    a = _agent_or_404(db, agent_id)
    if RANK[effective_role(user, a)] < RANK["admin"]:
        raise HTTPException(403, "Requires admin role on this agent")
    validate_graph(agent_id, body, db)
    row = db.get(AgentGraph, agent_id)
    if not row:
        row = AgentGraph(agent_id=agent_id, data={})
        db.add(row)
    row.data = body.model_dump(mode="json")
    audit(db, user.email, "graph.save", f"{agent_id}: {len(body.nodes)} nodes")
    db.commit()
    return row.data


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    """What each agent is wired to, for library badges, node details and cycle checks in the UI."""
    graphs = load_graphs(db)
    out = {}
    for aid in db.scalars(select(Agent.id)).all():
        d = graphs.get(aid, default_graph(aid))
        out[aid] = {
            "tools": [n["ref"] for n in d["nodes"] if n["type"] == "tool"],
            "endpoints": [n["ref"] for n in d["nodes"] if n["type"] == "endpoint"],
            "agents": [n["ref"] for n in d["nodes"] if n["type"] == "agent" and n["id"] != ROOT],
        }
    return out


def _users_of(db: Session, match) -> list[dict]:
    names = {a.id: a.name for a in db.scalars(select(Agent)).all()}
    res = []
    for aid, d in load_graphs(db).items():
        hits = [n["ref"] for n in d["nodes"] if n["id"] != ROOT and match(n)]
        if hits and aid in names:
            res.append({"id": aid, "name": names[aid], "refs": hits})
    return res


@router.get("/agents/{agent_id}/usage")
def agent_usage(agent_id: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    _agent_or_404(db, agent_id)
    return {"used_by": _users_of(db, lambda n: n["type"] == "agent" and n["ref"] == agent_id)}


@router.get("/mcp/{mid}/usage")
def mcp_usage(mid: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return {"used_by": _users_of(db, lambda n: n["type"] == "tool" and n["ref"].split(".")[0] == mid)}


@router.get("/endpoints/{eid}/usage")
def endpoint_usage(eid: str, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    return {"used_by": _users_of(db, lambda n: n["type"] == "endpoint" and n["ref"] == eid)}
