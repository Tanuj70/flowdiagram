"""Turn an Agent Studio agent (and everything on its canvas) into a deployable Agent Runtime package.

Output is plain text files (ADK agent code, a contract-compliant server, Dockerfile, Cloud Build config, deploy
script). Nothing here talks to Google Cloud. User-controlled text is only ever embedded through `lit()`/`pytext()`
(JSON-escaped string literals) or sanitised identifiers, so a hostile agent name or prompt cannot inject code.
"""
import io
import json
import re
import zipfile
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import exporter_templates as T
from .models import Agent, AgentGraph, Endpoint, McpServer
from .schemas import ExportOptions

ADK_VERSION = "2.13.0"          # the version this generator was validated against (see docs/DEPLOYMENT_AGENT_RUNTIME.md)
ROOT = "root"
MAX_DEPTH = 8
MAX_AGENTS = 60      # agent *instances* in the tree; guards against exponential blow-up when agents share sub-agents


# ---------------------------------------------------------------- safe text helpers
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean(s: str) -> str:
    """Drop control chars and lone surrogates so the text is always valid UTF-8 source."""
    return _CTRL.sub(" ", s).encode("utf-8", "replace").decode("utf-8")


def lit(s: str) -> str:
    """A one-line Python string literal (JSON escaping is valid Python)."""
    return json.dumps(clean(s), ensure_ascii=False)


def pytext(s: str, indent: str) -> str:
    """Readable multi-line literal using implicit concatenation, one JSON-escaped line per source line."""
    s = clean(s)
    if "\n" not in s:
        return lit(s)
    lines = s.split("\n")
    parts = [json.dumps(ln + ("\n" if i < len(lines) - 1 else ""), ensure_ascii=False) for i, ln in enumerate(lines)]
    return "(\n" + "\n".join(f"{indent}    {p}" for p in parts) + f"\n{indent})"


def slug(s: str, fallback: str = "agent") -> str:
    t = re.sub(r"[^a-z0-9]+", "_", clean(s).lower()).strip("_") or fallback
    if t[0].isdigit():
        t = "a_" + t
    if t in {"user", "none", "true", "false", "class", "def", "return", "import", "from", "global", "lambda", "pass"}:
        t += "_agent"
    return t[:40]


def envname(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", clean(s).upper()).strip("_") or "X"


# ---------------------------------------------------------------- model
@dataclass
class Node:
    agent: Agent
    tools: list = field(default_factory=list)        # [(server, tool_dict)]
    endpoints: list = field(default_factory=list)    # [Endpoint]
    subs: list = field(default_factory=list)         # [Node]


@dataclass
class Result:
    files: dict
    warnings: list
    mapping: list
    summary: dict
    commands: list


def _load(db: Session, agent_id: str, path: tuple, depth: int, ctx: dict) -> Node:
    agent = ctx["agents"][agent_id]
    ctx["count"] = ctx.get("count", 0) + 1
    if ctx["count"] > MAX_AGENTS:
        raise ValueError(f"This agent team expands to more than {MAX_AGENTS} agent instances (agents shared between branches are counted once per use). Simplify the team before exporting.")
    g = (ctx["graphs"].get(agent_id) or {"nodes": [], "edges": []})
    nodes = {n["id"]: n for n in g["nodes"]}
    node = Node(agent=agent)
    for e in g["edges"]:
        n = nodes.get(e["target"])
        if not n:
            continue
        if n["type"] == "tool":
            sid, _, tname = n["ref"].partition(".")
            server = ctx["mcp"].get(sid)
            tool = next((t for t in (server.tools if server else []) if t["name"] == tname), None)
            if server and tool:
                node.tools.append((server, tool))
        elif n["type"] == "endpoint":
            ep = ctx["endpoints"].get(n["ref"])
            if ep:
                node.endpoints.append(ep)
        elif n["type"] == "agent":
            if n["ref"] in path or n["ref"] == agent_id or depth >= MAX_DEPTH or n["ref"] not in ctx["agents"]:
                ctx["warnings"].append({"level": "warn", "area": "Sub-agents", "text": f"Skipped sub-agent '{n['ref']}' of '{agent.name}' (loop, too deep or missing)."})
                continue
            node.subs.append(_load(db, n["ref"], path + (agent_id,), depth + 1, ctx))
    return node


# ---------------------------------------------------------------- code generation
class Gen:
    def __init__(self, opts: ExportOptions, ctx: dict):
        self.o = opts
        self.ctx = ctx
        self.names: set[str] = set()
        self.funcs: list[str] = []
        self.uses = {"mcp": False, "api": False, "guard": False, "seq": False, "par": False, "loop": False, "sse": False, "confirm": False}
        self.models: dict[str, str] = {}
        self.endpoint_funcs: dict[str, str] = {}
        self.endpoint_defs: list[str] = []
        self.seen_agents: dict[str, int] = {}
        self.env_notes: list[str] = []
        self.guard_setups: dict[str, str] = {}
        self.braces: list[str] = []

    def unique(self, base: str) -> str:
        n, i = base, 2
        while n in self.names:
            n, i = f"{base}_{i}", i + 1
        self.names.add(n)
        return n

    def model(self, source: str) -> None:
        if source.startswith("gemini"):
            self.models.setdefault(source, source)
        else:
            self.models.setdefault(source, self.o.model)

    # ---- tools
    def endpoint_func(self, ep: Endpoint) -> str:
        if ep.id in self.endpoint_funcs:
            return self.endpoint_funcs[ep.id]
        fn = self.unique("api_" + slug(ep.name, "call"))
        env = "API_" + envname(ep.id)
        self.endpoint_funcs[ep.id] = fn
        self.uses["api"] = True
        doc = clean(f"{ep.method} {ep.name} ({ep.collection}). Access: {ep.mode}. Calls {ep.url}.")
        self.endpoint_defs.append(
            f"def {fn}(path_params_json: str = \"{{}}\", query_json: str = \"{{}}\", body_json: str = \"\") -> dict:\n"
            f"    \"\"\"{doc.replace(chr(34) * 3, chr(39) * 3).replace(chr(92), '/')}\n\n"
            f"    Args:\n"
            f"        path_params_json: JSON object with values for any {{placeholders}} in the URL.\n"
            f"        query_json: JSON object of query-string parameters.\n"
            f"        body_json: JSON request body (empty for none).\n"
            f"    \"\"\"\n"
            f"    return _call({lit(ep.method)}, {lit(ep.url)}, {lit(ep.auth)}, {lit(env)}, path_params_json, query_json, body_json)\n"
        )
        suffix = {"Bearer": "_TOKEN", "API key": "_KEY", "Basic": "_USER / _PASSWORD"}.get(ep.auth)
        if suffix:
            self.env_notes.append(f"{env}{suffix}   # {clean(ep.name)} ({ep.auth})")
        return fn

    def tool_exprs(self, node: Node) -> list[str]:
        appr = set(node.agent.approvals or [])
        out: list[str] = []
        by_server: dict[str, list] = {}
        for server, tool in node.tools:
            by_server.setdefault(server.id, []).append((server, tool))
        # Two servers exposing a tool with the same name would collide in ADK -> prefix when needed
        names = [t["name"] for lst in by_server.values() for _, t in lst]
        clash = len(names) != len(set(names))
        for sid, lst in by_server.items():
            server = lst[0][0]
            self.uses["mcp"] = True
            url = server.url or ""
            sse = url.rstrip("/").endswith("/sse")
            self.uses["sse"] |= sse
            params = ("SseConnectionParams" if sse else "StreamableHTTPConnectionParams")
            for needs, group in ((True, [t for _, t in lst if f"{sid}.{t['name']}" in appr]), (False, [t for _, t in lst if f"{sid}.{t['name']}" not in appr])):
                if not group:
                    continue
                self.uses["confirm"] |= needs
                prefix = f", tool_name_prefix={lit(slug(server.name, sid))}" if clash else ""
                out.append(
                    f"McpToolset(connection_params={params}(url={lit(url)}, headers=_mcp_headers({lit(envname(sid))})), "
                    f"tool_filter={json.dumps([clean(t['name']) for t in group], ensure_ascii=False)}"
                    f"{', require_confirmation=True' if needs else ''}{prefix})"
                )
            self.env_notes.append(f"MCP_{envname(sid)}_TOKEN   # bearer token for {clean(server.name)} (optional)")
            if not url:
                self.ctx["warnings"].append({"level": "warn", "area": "MCP", "text": f"MCP server '{server.name}' has no URL; the generated toolset will not connect."})
        for ep in node.endpoints:
            fn = self.endpoint_func(ep)
            need = ep.id in appr
            self.uses["confirm"] |= need
            out.append(f"FunctionTool({fn}{', require_confirmation=True' if need else ''})")
        return out

    # ---- agents
    def llm_agent(self, node: Node, name: str, subs: list[str], with_tools: bool = True, indent: str = "    ") -> str:
        a = node.agent
        self.model(a.model)
        cfg = []
        if a.temperature is not None:
            cfg.append(f"temperature={float(a.temperature)}")
        if a.top_p is not None:
            cfg.append(f"top_p={float(a.top_p)}")
        if a.top_k is not None:
            cfg.append(f"top_k={int(a.top_k)}")
        if a.max_tokens:
            cfg.append(f"max_output_tokens={int(a.max_tokens)}")
        lines = [f"{indent}name={lit(name)},", f"{indent}model=model_for({lit(a.model)}),"]
        if a.description:
            lines.append(f"{indent}description={pytext(a.description, indent)},")
        instr = pytext(a.prompt or "", indent)
        if "{" in (a.prompt or "") or "}" in (a.prompt or ""):
            # ADK treats {name} in a *string* instruction as a session-state variable and raises KeyError at run time.
            # A callable instruction is used verbatim, which matches how Studio uses the prompt.
            instr = f"lambda _ctx: {instr}"
            self.braces.append(a.name)
        lines.append(f"{indent}instruction={instr},")
        tools = self.tool_exprs(node) if with_tools else []
        if tools:
            lines.append(f"{indent}tools=[\n" + "".join(f"{indent}    {t},\n" for t in tools) + f"{indent}],")
        if subs:
            lines.append(f"{indent}sub_agents=[{', '.join(s + '()' for s in subs)}],")
        if cfg:
            lines.append(f"{indent}generate_content_config=types.GenerateContentConfig({', '.join(cfg)}),")
        g = {k: v for k, v in (a.guardrails or {}).items() if k in ("pii", "injection", "toxicity") and v != "off"}
        if g:
            self.uses["guard"] = True
            var = "_GUARD_" + name.upper()
            self.guard_setups[var] = f"{var}_BEFORE, {var}_AFTER = guardrails.make_callbacks({json.dumps(g)})"
            lines.append(f"{indent}before_model_callback={var}_BEFORE,")
            lines.append(f"{indent}after_model_callback={var}_AFTER,")
        return "Agent(\n" + "\n".join(lines) + f"\n{indent[:-4]})"

    def emit(self, node: Node) -> str:
        """Returns the name of a zero-arg factory function building this node (each use gets its own instance)."""
        a = node.agent
        self.seen_agents[a.id] = self.seen_agents.get(a.id, 0) + 1
        subs = [self.emit(c) for c in node.subs]
        name = self.unique(slug(a.name))
        fn = f"build_{name}"
        pattern = a.pattern
        has_own = bool(node.tools or node.endpoints or (a.prompt or "").strip())
        if not (a.prompt or "").strip():
            self.ctx["warnings"].append({"level": "info", "area": "Prompt", "text": f"'{a.name}' has an empty prompt (instruction)."})
        if subs and pattern in ("sequential", "parallel", "loop"):
            self.ctx["approx"].add("workflow")
            inner = None
            if has_own:
                inner_name = self.unique(name + "_self")
                inner = f"build_{inner_name}"
                self.funcs.append(f"def {inner}():\n    return {self.llm_agent(node, inner_name, [], indent='        ')}\n")
            if pattern == "sequential":
                self.uses["seq"] = True
                seq = ([inner] if inner else []) + subs
                body = f"SequentialAgent(name={lit(name)}, sub_agents=[{', '.join(s + '()' for s in seq)}])"
            elif pattern == "parallel":
                self.uses["par"] = self.uses["seq"] = True
                par = f"ParallelAgent(name={lit(name + '_fanout')}, sub_agents=[{', '.join(s + '()' for s in subs)}])"
                body = (f"SequentialAgent(name={lit(name)}, sub_agents=[{par}" + (f", {inner}()" if inner else "") + "])")
            else:
                self.uses["loop"] = True
                loop = ([inner] if inner else []) + subs
                body = f"LoopAgent(name={lit(name)}, sub_agents=[{', '.join(s + '()' for s in loop)}], max_iterations=3)"
            self.funcs.append(f"def {fn}():\n    return {body}\n")
        else:
            self.funcs.append(f"def {fn}():\n    return {self.llm_agent(node, name, subs, indent='        ')}\n")
        return fn

    def agent_py(self, root_fn: str) -> str:
        imp = ["from google.adk.agents import Agent"]
        extra = [n for flag, n in (("seq", "SequentialAgent"), ("par", "ParallelAgent"), ("loop", "LoopAgent")) if self.uses[flag]]
        if extra:
            imp[0] += ", " + ", ".join(extra)
        imp.append("from google.genai import types")
        if self.uses["api"]:
            imp.append("from google.adk.tools import FunctionTool")
        if self.uses["mcp"]:
            imp.append("from google.adk.tools.mcp_tool.mcp_toolset import McpToolset")
            params = ["StreamableHTTPConnectionParams"] + (["SseConnectionParams"] if self.uses["sse"] else [])
            imp.append(f"from google.adk.tools.mcp_tool.mcp_session_manager import {', '.join(params)}")
        if self.uses["guard"]:
            imp.append("import guardrails")
        if self.uses["api"]:
            imp.append("from tools_api import " + ", ".join(sorted(self.endpoint_funcs.values())))
        model_map = {k: v for k, v in self.models.items() if k != v}
        head = [
            '"""Generated by Agent Studio. Review before deploying; do NOT put secrets in this file."""',
            "import os",
            "",
            *imp,
            "",
            "# Source model -> model served by the runtime. Edit as needed, or set AGENT_MODEL to force one model.",
            f"MODEL_MAP = {json.dumps(model_map, indent=4, ensure_ascii=False)}",
            "",
            "",
            "def model_for(source: str) -> str:",
            '    return os.environ.get("AGENT_MODEL") or MODEL_MAP.get(source, source)',
            "",
        ]
        if self.uses["mcp"]:
            head += [
                "",
                "def _mcp_headers(server_env: str):",
                '    """Optional bearer token for an MCP server, read from MCP_<SERVER>_TOKEN."""',
                '    token = os.environ.get(f"MCP_{server_env}_TOKEN")',
                '    return {"Authorization": f"Bearer {token}"} if token else None',
                "",
            ]
        if self.guard_setups:
            head += ["", *self.guard_setups.values(), ""]
        return "\n".join(head) + "\n\n" + "\n\n".join(self.funcs) + f"\n\nroot_agent = {root_fn}()\n"


def _tree_stats(node: Node, acc: dict):
    acc["agents"] += 1
    acc["tools"] += len(node.tools)
    acc["endpoints"] += len(node.endpoints)
    acc["servers"].update(s.id for s, _ in node.tools)
    for c in node.subs:
        _tree_stats(c, acc)


def generate(db: Session, agent_id: str, opts: ExportOptions) -> Result:
    agents = {a.id: a for a in db.scalars(select(Agent)).all()}
    if agent_id not in agents:
        raise KeyError(agent_id)
    ctx = {
        "agents": agents,
        "graphs": {r.agent_id: r.data for r in db.scalars(select(AgentGraph)).all() if r.data},
        "mcp": {m.id: m for m in db.scalars(select(McpServer)).all()},
        "endpoints": {e.id: e for e in db.scalars(select(Endpoint)).all()},
        "warnings": [], "approx": set(),
    }
    tree = _load(db, agent_id, (), 0, ctx)
    gen = Gen(opts, ctx)
    root_fn = gen.emit(tree)
    root = agents[agent_id]
    stats = {"agents": 0, "tools": 0, "endpoints": 0, "servers": set()}
    _tree_stats(tree, stats)

    # ---- warnings and honesty mapping
    w = ctx["warnings"]
    if any(k != v for k, v in gen.models.items()):
        mapped = ", ".join(f"{k} -> {v}" for k, v in gen.models.items() if k != v)
        w.append({"level": "warn", "area": "Model", "text": f"Models mapped to '{opts.model}': {mapped}. The runtime serves Gemini models; confirm the target model exists in your region, or use Claude on Vertex AI (not generated)."})
    if gen.braces:
        w.append({"level": "info", "area": "Prompt", "text": "Prompts with { } braces are emitted as callable instructions so ADK does not treat {name} as a session-state variable: " + ", ".join(sorted(set(gen.braces))) + "."})
    dup = [agents[i].name for i, n in gen.seen_agents.items() if n > 1]
    if dup:
        w.append({"level": "warn", "area": "Sub-agents", "text": f"Used more than once in the tree (each use becomes its own instance with a numbered name): {', '.join(dup)}."})
    if "workflow" in ctx["approx"]:
        w.append({"level": "warn", "area": "Orchestration", "text": "Sequential/parallel/loop patterns are approximated: the parent's own prompt/tools run as one step next to its sub-agents (parallel: after the fan-out; loop: max 3 iterations). Review agent.py."})
    off = []

    def walk(n: Node):
        g = n.agent.guardrails or {}
        for k in ("topics", "schema"):
            if g.get(k, "off") != "off":
                off.append(f"{n.agent.name}: {k}")
        if (n.agent.memory or {}).get("long"):
            off.append(f"{n.agent.name}: long-term memory")
        for c in n.subs:
            walk(c)
    walk(tree)
    if off:
        w.append({"level": "warn", "area": "Not exported", "text": "These settings are stored in Agent Studio but not generated: " + "; ".join(off) + "."})
    if gen.uses["api"]:
        w.append({"level": "info", "area": "Endpoints", "text": "Endpoints become generic HTTP tools (JSON string arguments, no schema). Provide credentials through environment variables / Secret Manager."})
    if gen.uses["sse"]:
        w.append({"level": "info", "area": "MCP", "text": "MCP URLs ending in /sse use the SSE transport; all others use streamable HTTP. Check each server's transport."})
    if gen.uses["mcp"]:
        w.append({"level": "info", "area": "MCP", "text": "MCP servers must be reachable from the runtime (public URL or Private Service Connect)."})
    w.append({"level": "info", "area": "Access", "text": "Agent Studio roles are not exported; control access with Google IAM on the deployed agent."})
    w.append({"level": "info", "area": "Security", "text": "The container has no authentication of its own: it relies on the runtime in front of it. Never expose the image publicly (for example on Cloud Run with unauthenticated access)."})

    mapping = [
        {"area": "Prompt, description, generation settings", "status": "exact", "note": "instruction, description, temperature, top_p, top_k, max_output_tokens"},
        {"area": "Model", "status": "approximate" if any(k != v for k, v in gen.models.items()) else "exact", "note": f"Non-Gemini models map to {opts.model}"},
        {"area": "Sub-agents", "status": "approximate" if "workflow" in ctx["approx"] else "exact", "note": "Router pattern = ADK sub_agents; other patterns wrap workflow agents"},
        {"area": "MCP tools", "status": "exact", "note": "McpToolset with tool_filter (only the tools you selected)"},
        {"area": "API endpoints", "status": "approximate", "note": "Generated HTTP function tools"},
        {"area": "Approvals", "status": "exact", "note": "require_confirmation=True (the client must handle ADK confirmation requests)"},
        {"area": "Guardrails: PII, injection, toxicity", "status": "approximate", "note": "Same regex rules as Studio, as ADK model callbacks (consider Model Armor)"},
        {"area": "Guardrails: topics, schema", "status": "not exported", "note": "Engines are not built in Studio either"},
        {"area": "Memory", "status": "not exported", "note": "Sessions use platform defaults"},
        {"area": "Roles / RBAC", "status": "not exported", "note": "Use Google IAM"},
        {"area": "Skills", "status": "not exported", "note": "Skill names are not used by ADK"},
    ]

    # ---- files
    version = int(root.version or 1)
    image_name = slug(root.name)
    image = f"{opts.location}-docker.pkg.dev/{opts.project}/{opts.repository}/{image_name}:v{version}"
    reqs = [f"google-adk=={ADK_VERSION}", "google-cloud-aiplatform[agent_engines,adk]>=1.144", "fastapi>=0.110", "uvicorn[standard]>=0.29"]
    if gen.uses["mcp"]:
        reqs.append("mcp>=1.10")          # NOT installed with google-adk 2.x; McpToolset needs it
    if gen.uses["api"]:
        reqs.append("requests>=2.31")
    config = {
        "project": opts.project, "location": opts.location, "image": image, "display_name": clean(root.name)[:100],
        "min_instances": opts.min_instances, "max_instances": opts.max_instances, "cpu": opts.cpu, "memory": opts.memory,
        "requirements": [r for r in reqs if not r.startswith(("fastapi", "uvicorn"))],
    }
    files = {
        "agent.py": gen.agent_py(root_fn),
        "server.py": T.SERVER_PY,
        "requirements.txt": "\n".join(reqs) + "\n",
        "Dockerfile": T.DOCKERFILE,
        ".dockerignore": T.DOCKERIGNORE,
        "cloudbuild.yaml": T.CLOUDBUILD.replace("__IMAGE__", image),
        "deploy.py": T.DEPLOY_PY.replace("__CONFIG__", json.dumps(config, indent=4, ensure_ascii=False)),
    }
    if gen.uses["guard"]:
        files["guardrails.py"] = T.GUARDRAILS_PY
    if gen.uses["api"]:
        files["tools_api.py"] = T.TOOLS_API_HEADER + "\n\n" + "\n\n".join(gen.endpoint_defs)
    env_lines = ["# Copy to .env for local runs; on the runtime pass secrets via deploy config / Secret Manager.",
                 f"GOOGLE_CLOUD_PROJECT={opts.project}", f"GOOGLE_CLOUD_LOCATION={opts.location}", "# AGENT_MODEL=   # force one model for all agents",
                 *sorted(set(gen.env_notes))]
    files[".env.example"] = "\n".join(env_lines) + "\n"
    cmds = [
        "gcloud auth application-default login",
        f"gcloud services enable aiplatform.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project {opts.project}",
        f"gcloud artifacts repositories create {opts.repository} --repository-format=docker --location={opts.location} --project {opts.project}",
        "pip install -r requirements.txt",
        "python deploy.py build",
        "python deploy.py deploy --method container",
        'python deploy.py smoke "Hello"',
    ]
    files["README.md"] = _readme(root, opts, image, mapping, w, cmds, stats)
    result = Result(files=files, warnings=w, mapping=mapping, commands=cmds,
                    summary={"agent": clean(root.name), "agents": stats["agents"], "mcp_servers": len(stats["servers"]), "tools": stats["tools"], "endpoints": stats["endpoints"], "image": image, "adk_version": ADK_VERSION})
    total = sum(len(v) for v in files.values())
    if total > 1_000_000:
        raise ValueError("Generated package is unexpectedly large")
    return result


def _readme(root: Agent, opts: ExportOptions, image: str, mapping, warnings, cmds, stats) -> str:
    rows = "\n".join(f"| {m['area']} | {m['status']} | {m['note']} |" for m in mapping)
    warn = "\n".join(f"- **{w['area']}** ({w['level']}): {w['text']}" for w in warnings)
    steps = "\n".join(f"    {c}" for c in cmds)
    return f"""# {clean(root.name)} — Agent Runtime package

Generated by Agent Studio. {stats['agents']} agent(s), {stats['tools']} MCP tool(s), {stats['endpoints']} endpoint(s).
Target image: `{image}`

## Deploy (container method, Cloud Build -> Artifact Registry -> Agent Runtime)
{steps}

Quick try without Cloud Build: `python deploy.py deploy --method sdk --staging-bucket gs://YOUR_BUCKET`.

## Files
`agent.py` ADK agent tree · `server.py` runtime-contract server (port 8080) · `Dockerfile` · `cloudbuild.yaml` ·
`deploy.py` build/deploy/smoke/delete · `guardrails.py`, `tools_api.py` when used · `.env.example` secrets list.

## What maps and what does not
| Studio setting | Status | Note |
|---|---|---|
{rows}

## Warnings
{warn}

## Not verified
This package was **not deployed** to a live project by the generator. The ADK code was imported and checked against
google-adk {ADK_VERSION}; the SDK calls in `deploy.py` follow Google's current docs but are renamed between
releases (`client.agent_engines` vs `client.runtimes`). Health checks, in-container auth and timeouts are not
specified in the docs the generator was built from. Read the generated code before deploying, and never commit `.env`.
"""


def to_zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path, content in sorted(files.items()):
            if "/" in path or path.startswith(".."):
                raise ValueError("Unexpected file path")
            z.writestr(path, content)
    return buf.getvalue()
