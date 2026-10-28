from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import Agent, AgentGraph, Endpoint, McpServer, User
from .security import hash_password

MCP = [
    ("github", "GitHub", "github", [("create_issue", "write"), ("search_repos", "read")]),
    ("slack", "Slack", "slack", [("post_message", "write"), ("read_channel", "read")]),
    ("postgres", "Postgres", "database", [("query", "read"), ("list_tables", "read")]),
    ("files", "Filesystem", "folder", [("read_file", "read"), ("write_file", "write")]),
]
EPS = [
    ("ep_order", "Get order", "GET", "https://api.shop.example.com/orders/{id}", "Bearer", "read", "Shop API"),
    ("ep_refund", "Create refund", "POST", "https://api.shop.example.com/refunds", "Bearer", "write", "Shop API"),
    ("ep_weather", "Weather", "GET", "https://api.weather.example.com/v1/now", "API key", "read", "Public data"),
]
MCP_INFO = {
    "github": ("Source code, issues and pull requests.", ["Dev"]),
    "slack": ("Post and read messages in team channels.", ["Chat"]),
    "postgres": ("Read-only SQL access to the analytics database.", ["Core", "Data"]),
    "files": ("Read and write files in the shared workspace.", ["Core"]),
}


def seed(db: Session) -> None:
    if not db.scalar(select(User).limit(1)):
        db.add(User(email=settings.admin_email.lower(), password_hash=hash_password(settings.admin_password), role="admin"))
        if not settings.is_prod and settings.seed_demo_data:
            db.add(User(email="executor@example.com", password_hash=hash_password("executor123"), role="executor"))
            db.add(User(email="viewer@example.com", password_hash=hash_password("viewer123"), role="viewer"))
    if not settings.seed_demo_data or db.scalar(select(McpServer).limit(1)):
        db.commit()
        return
    for mid, name, icon, tools in MCP:
        desc, tags = MCP_INFO[mid]
        db.add(McpServer(id=mid, name=f"{name} MCP Server", icon=icon, url=f"https://mcp.example.com/{mid}", description=desc, tags=tags,
                         tools=[{"name": n, "mode": m, "description": f"{n.replace('_', ' ').capitalize()} ({m})", "input_schema": None} for n, m in tools]))
    for eid, name, method, url, auth, mode, coll in EPS:
        db.add(Endpoint(id=eid, name=name, method=method, url=url, auth=auth, mode=mode, collection=coll))
    mk = lambda i, n, d, **kw: Agent(id=i, name=n, description=d, prompt=f"You are the {n}.", skills=["summarize"],
        roles=[{"who": settings.admin_email, "role": "Admin"}, {"who": "executor@example.com", "role": "Executor"}],
        memory={"short": True, "long": False, "backend": "Vector DB", "retention": 30, "max": 500},
        guardrails={"pii": "block", "injection": "block", "toxicity": "warn", "topics": "off", "schema": "log"}, **kw)
    db.add_all([
        mk("a_orch", "Support Orchestrator", "Routes customer requests", pattern="parallel", icon="network"),
        mk("a_bill", "Billing Agent", "Refunds and invoices", icon="receipt", approvals=["ep_refund"]),
        mk("a_res", "Research Agent", "Looks things up", icon="search"),
        mk("a_kb", "KB Agent", "Answers from docs", icon="book-open"),
    ])
    R = lambda ref: {"id": "root", "type": "agent", "ref": ref, "x": 300, "y": 40}
    N = lambda i, t, ref, x, y: {"id": i, "type": t, "ref": ref, "x": x, "y": y}
    E = lambda i, t, k: {"id": i, "source": "root", "target": t, "socket": k}
    graphs = {
        "a_orch": {"nodes": [{**R("a_orch"), "x": 380}, N("n_b", "agent", "a_bill", 40, 330), N("n_r", "agent", "a_res", 360, 330), N("n_k", "agent", "a_kb", 680, 330)],
                   "edges": [E("e1", "n_b", "agents"), E("e2", "n_r", "agents"), E("e3", "n_k", "agents")]},
        "a_bill": {"nodes": [R("a_bill"), N("n_1", "endpoint", "ep_order", 290, 330), N("n_2", "endpoint", "ep_refund", 440, 330)],
                   "edges": [E("e1", "n_1", "endpoints"), E("e2", "n_2", "endpoints")]},
        "a_res": {"nodes": [R("a_res"), N("n_1", "tool", "github.search_repos", 360, 330)], "edges": [E("e1", "n_1", "tools")]},
        "a_kb": {"nodes": [R("a_kb"), N("n_1", "tool", "postgres.query", 360, 330)], "edges": [E("e1", "n_1", "tools")]},
    }
    for aid, data in graphs.items():
        db.add(AgentGraph(agent_id=aid, data=data))
    db.commit()
