from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Mode = Literal["off", "log", "warn", "block"]
Pattern = Literal["sequential", "parallel", "loop", "router"]
Framework = Literal["ADK 2.0", "LangGraph", "CrewAI", "Custom"]
GUARD_KEYS = {"pii", "injection", "toxicity", "topics", "schema"}


class RoleEntry(BaseModel):
    who: str = Field(min_length=1, max_length=200)
    role: Literal["Admin", "Executor", "Viewer"]


class MemoryCfg(BaseModel):
    short: bool = True
    long: bool = False
    backend: Literal["Vector DB", "Key-value", "SQL"] = "Vector DB"
    retention: int = Field(30, ge=1, le=3650)
    max: int = Field(500, ge=1, le=1_000_000)


class AgentBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field("", max_length=300)
    prompt: str = Field("", max_length=20_000)
    icon: str = Field("bot", max_length=40)
    skills: list[str] = Field(default_factory=list, max_length=50)
    framework: Framework = "ADK 2.0"
    pattern: Pattern = "sequential"
    model: str = Field("claude-sonnet-5-5", max_length=80)
    max_tokens: int = Field(2048, ge=64, le=200_000)
    temperature: float = Field(0.4, ge=0, le=2)
    top_p: float = Field(0.9, ge=0, le=1)
    top_k: int = Field(40, ge=1, le=1000)
    guardrails: dict[str, Mode] = Field(
        default_factory=lambda: {"pii": "block", "injection": "block", "toxicity": "warn", "topics": "off", "schema": "log"}
    )
    approvals: list[str] = Field(default_factory=list)
    roles: list[RoleEntry] = Field(default_factory=list)
    memory: MemoryCfg = Field(default_factory=MemoryCfg)
    status: Literal["draft", "published"] = "draft"

    @field_validator("guardrails")
    @classmethod
    def _keys(cls, v):
        bad = set(v) - GUARD_KEYS
        if bad:
            raise ValueError(f"unknown guardrails: {sorted(bad)}")
        return v


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    """Partial update; every field optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=300)
    prompt: Optional[str] = Field(None, max_length=20_000)
    icon: Optional[str] = Field(None, max_length=40)
    skills: Optional[list[str]] = None
    framework: Optional[Framework] = None
    pattern: Optional[Pattern] = None
    model: Optional[str] = Field(None, max_length=80)
    max_tokens: Optional[int] = Field(None, ge=64, le=200_000)
    temperature: Optional[float] = Field(None, ge=0, le=2)
    top_p: Optional[float] = Field(None, ge=0, le=1)
    top_k: Optional[int] = Field(None, ge=1, le=1000)
    guardrails: Optional[dict[str, Mode]] = None
    approvals: Optional[list[str]] = None
    roles: Optional[list[RoleEntry]] = None
    memory: Optional[MemoryCfg] = None
    status: Optional[Literal["draft", "published"]] = None


class AgentOut(AgentBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    version: int


class ToolDef(BaseModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    mode: Literal["read", "write"] = "read"
    description: str = Field("", max_length=300)
    input_schema: Optional[dict] = None


class McpIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field("", max_length=500)
    icon: str = "plug"
    description: str = Field("", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=10)
    tools: list[ToolDef] = Field(default_factory=list, max_length=200)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v):
        return [t.strip()[:30] for t in v if t.strip()]


class McpUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    url: Optional[str] = Field(None, max_length=500)
    icon: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    tags: Optional[list[str]] = Field(None, max_length=10)
    tools: Optional[list[ToolDef]] = Field(None, max_length=200)


class McpOut(McpIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class EndpointIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    url: str = Field(min_length=8, max_length=500, pattern=r"^https?://")
    auth: Literal["None", "Bearer", "API key", "Basic"] = "None"
    mode: Literal["read", "write"] = "read"
    collection: str = Field("General", min_length=1, max_length=60)


class EndpointUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    method: Optional[Literal["GET", "POST", "PUT", "PATCH", "DELETE"]] = None
    url: Optional[str] = Field(None, min_length=8, max_length=500, pattern=r"^https?://")
    auth: Optional[Literal["None", "Bearer", "API key", "Basic"]] = None
    mode: Optional[Literal["read", "write"]] = None
    collection: Optional[str] = Field(None, min_length=1, max_length=60)


class EndpointOut(EndpointIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class NodeIn(BaseModel):
    id: str = Field(max_length=60)
    type: Literal["agent", "tool", "endpoint"]
    ref: str = Field(max_length=120)
    x: float = 0
    y: float = 0


class EdgeIn(BaseModel):
    id: str = Field(max_length=60)
    source: str = Field(max_length=60)
    target: str = Field(max_length=60)
    socket: Literal["agents", "tools", "endpoints"] = "tools"


class GraphIO(BaseModel):
    nodes: list[NodeIn] = Field(default_factory=list, max_length=500)
    edges: list[EdgeIn] = Field(default_factory=list, max_length=2000)


class RunIn(BaseModel):
    input: str = Field(min_length=1, max_length=20_000)


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    agent_id: str
    status: str
    input: str
    output: str
    steps: list
    tokens: int
    latency_ms: int
    created_at: Optional[datetime] = None
    user_email: Optional[str] = None


class RunListItem(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    status: str
    input: str
    steps_total: int
    steps_done: int
    tokens: int
    latency_ms: int
    created_at: Optional[datetime] = None
    user_email: str


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    role: str


class ExportOptions(BaseModel):
    """Settings for the Agent Runtime export. Strictly validated: they are written into shell/YAML/Python files."""
    project: str = Field("your-project-id", pattern=r"^[a-z][a-z0-9-]{4,61}[a-z0-9]$")
    location: str = Field("us-central1", pattern=r"^[a-z]+-[a-z]+[0-9]+$")
    repository: str = Field("agent-studio", pattern=r"^[a-z][a-z0-9-]{0,62}$")
    model: str = Field("gemini-2.5-flash", pattern=r"^[A-Za-z0-9._@:/-]{1,100}$")
    min_instances: int = Field(1, ge=0, le=75)
    max_instances: int = Field(10, ge=1, le=1000)
    cpu: Literal["1", "2", "4", "6", "8"] = "2"
    memory: str = Field("2Gi", pattern=r"^([1-9]|[12][0-9]|3[0-2])Gi$")

    @model_validator(mode="after")
    def _range(self):
        if self.max_instances < self.min_instances:
            raise ValueError("max_instances must be >= min_instances")
        return self
