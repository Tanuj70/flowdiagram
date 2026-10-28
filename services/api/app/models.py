import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _id("u"))
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="viewer")  # admin | executor | viewer


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _id("a"))
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String, default="bot")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    framework: Mapped[str] = mapped_column(String, default="ADK 2.0")
    pattern: Mapped[str] = mapped_column(String, default="sequential")
    model: Mapped[str] = mapped_column(String, default="claude-sonnet-5-5")
    max_tokens: Mapped[int] = mapped_column(Integer, default=2048)
    temperature: Mapped[float] = mapped_column(default=0.4)
    top_p: Mapped[float] = mapped_column(default=0.9)
    top_k: Mapped[int] = mapped_column(Integer, default=40)
    guardrails: Mapped[dict] = mapped_column(JSON, default=dict)
    approvals: Mapped[list] = mapped_column(JSON, default=list)  # tool refs needing approval
    roles: Mapped[list] = mapped_column(JSON, default=list)  # [{who, role}]
    memory: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="draft")  # draft | published
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class McpServer(Base):
    __tablename__ = "mcp_servers"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _id("m"))
    name: Mapped[str] = mapped_column(String)
    url: Mapped[str] = mapped_column(String, default="")
    icon: Mapped[str] = mapped_column(String, default="plug")
    description: Mapped[str] = mapped_column(String, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    tools: Mapped[list] = mapped_column(JSON, default=list)  # [{name, mode, description, input_schema}]


class Endpoint(Base):
    __tablename__ = "endpoints"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _id("e"))
    name: Mapped[str] = mapped_column(String)
    method: Mapped[str] = mapped_column(String, default="GET")
    url: Mapped[str] = mapped_column(String)
    auth: Mapped[str] = mapped_column(String, default="None")
    mode: Mapped[str] = mapped_column(String, default="read")
    collection: Mapped[str] = mapped_column(String, default="General")


class AgentGraph(Base):
    """One canvas per agent: {nodes:[{id,type,ref,x,y}], edges:[{id,source,target,socket}]}.
    Node id 'root' is the agent itself; every edge starts at the root."""
    __tablename__ = "agent_graphs"
    agent_id: Mapped[str] = mapped_column(String, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _id("r"))
    agent_id: Mapped[str] = mapped_column(String, index=True)
    user_email: Mapped[str] = mapped_column(String)
    input: Mapped[str] = mapped_column(Text)
    output: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="running")  # running|awaiting_approval|completed|blocked
    steps: Mapped[list] = mapped_column(JSON, default=list)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    target: Mapped[str] = mapped_column(String, default="")
