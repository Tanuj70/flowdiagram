"""Agent Runtime export: structure, safety against hostile input, permissions. (ADK itself is exercised by
tools/validate_export.py and tools/validate_runtime.py in an environment that has google-adk installed.)"""
import ast
import io
import zipfile

import pytest

from app.db import SessionLocal
from app.exporter import generate, slug
from app.schemas import ExportOptions

pytestmark = pytest.mark.usefixtures("client")      # starts the app (creates tables) for direct DB access

OPTS = {"project": "my-project-1", "location": "us-central1"}


def _gen(agent_id="a_orch", **kw):
    with SessionLocal() as db:
        return generate(db, agent_id, ExportOptions(**{**OPTS, **kw}))


def _tree(src: str) -> ast.AST:
    return ast.parse(src)


def _calls(tree, name):
    return [n for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, "id", getattr(n.func, "attr", None)) == name]


def _unused_imports(tree) -> list[str]:
    imported = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            imported |= {(a.asname or a.name).split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom):
            imported |= {a.asname or a.name for a in n.names}
    used = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)} | {n.value.id for n in ast.walk(tree) if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name)}
    return sorted(imported - used)


# ---------- structure
def test_package_files_and_valid_python():
    r = _gen()
    assert {"agent.py", "server.py", "Dockerfile", "cloudbuild.yaml", "deploy.py", "requirements.txt", ".dockerignore", ".env.example", "README.md"} <= set(r.files)
    for name, src in r.files.items():
        if name.endswith(".py"):
            ast.parse(src)          # every generated module is valid Python
    assert r.summary["agents"] == 4 and r.summary["tools"] == 2 and r.summary["endpoints"] == 2


def test_no_unused_imports_in_agent_py():
    for aid in ("a_orch", "a_res"):
        assert _unused_imports(_tree(_gen(aid).files["agent.py"])) == [], aid


def test_requirements_pin_adk_and_include_mcp_when_needed():
    reqs = _gen().files["requirements.txt"]
    assert "google-adk==" in reqs and "mcp>=" in reqs and "google-cloud-aiplatform[agent_engines,adk]" in reqs


def test_blank_agent_generates():
    with SessionLocal() as db:
        from app.models import Agent
        a = Agent(name="Blank Agent", prompt="", description="")
        db.add(a); db.commit(); aid = a.id
    r = _gen(aid)
    tree = _tree(r.files["agent.py"])
    assert "root_agent = build_blank_agent()" in r.files["agent.py"] and "guardrails.py" not in r.files   # no guardrails configured
    assert any("empty prompt" in w["text"] for w in r.warnings)
    assert "mcp>=" not in r.files["requirements.txt"] and "tools_api.py" not in r.files
    assert _unused_imports(tree) == []


# ---------- mapping fidelity
def test_mcp_tool_filter_is_exactly_the_selected_tools():
    src = _gen("a_res").files["agent.py"]
    assert 'tool_filter=["search_repos"]' in src and "create_issue" not in src


def test_approvals_become_require_confirmation():
    src = _gen("a_bill").files["agent.py"]
    assert "FunctionTool(api_create_refund, require_confirmation=True)" in src
    assert "FunctionTool(api_get_order)" in src


def test_orchestration_patterns_map_to_workflow_agents():
    src = _gen("a_orch").files["agent.py"]             # seeded as "parallel"
    assert "ParallelAgent(" in src and "SequentialAgent(" in src
    assert any(w["area"] == "Orchestration" for w in _gen("a_orch").warnings)


def test_router_pattern_uses_sub_agents():
    from app.models import Agent
    with SessionLocal() as db:
        a = db.get(Agent, "a_orch"); old = a.pattern; a.pattern = "router"; db.commit()
    try:
        src = _gen("a_orch").files["agent.py"]
        assert "sub_agents=[build_billing_agent(), build_research_agent(), build_kb_agent()]" in src
        assert "ParallelAgent" not in src
    finally:
        with SessionLocal() as db:
            db.get(Agent, "a_orch").pattern = old; db.commit()


def test_claude_models_are_mapped_with_a_warning():
    r = _gen(model="gemini-2.5-flash")
    assert 'MODEL_MAP = {\n    "claude-sonnet-5-5": "gemini-2.5-flash"\n}' in r.files["agent.py"]
    assert any(w["area"] == "Model" for w in r.warnings)


def test_generation_settings_exact():
    src = _gen("a_res").files["agent.py"]
    assert "temperature=0.4" in src and "top_p=0.9" in src and "top_k=40" in src and "max_output_tokens=2048" in src


def test_deterministic_output():
    assert _gen().files == _gen().files


def test_same_sub_agent_used_twice_gets_unique_names(admin):
    # Billing and Research both delegate to KB -> KB appears under two parents
    g = admin.get("/api/agents/a_res/graph").json()
    g["nodes"].append({"id": "n_kb2", "type": "agent", "ref": "a_kb", "x": 0, "y": 0})
    g["edges"].append({"id": "e_kb2", "source": "root", "target": "n_kb2", "socket": "agents"})
    assert admin.put("/api/agents/a_res/graph", json=g).status_code == 200
    try:
        r = _gen("a_orch")
        names = [n.args[0].value if n.args else n.keywords[0].value.value for n in _calls(_tree(r.files["agent.py"]), "Agent")]
        kw = [k.value.value for n in _calls(_tree(r.files["agent.py"]), "Agent") for k in n.keywords if k.arg == "name"]
        assert len(kw) == len(set(kw)), kw
        assert any("more than once" in w["text"] for w in r.warnings)
        _ = names
    finally:
        g["nodes"] = [n for n in g["nodes"] if n["id"] != "n_kb2"]
        g["edges"] = [e for e in g["edges"] if e["id"] != "e_kb2"]
        admin.put("/api/agents/a_res/graph", json=g)


# ---------- hostile input
EVIL = 'x"); import os; os.system("echo pwned") #'


def test_hostile_text_cannot_inject_code(admin):
    nasty_prompt = 'Line1\n"""\n\\n \\ \' ); __import__("os").system("id") #\u0000\u0007 ‮ emoji 😀'
    a = admin.post("/api/agents", json={"name": EVIL, "description": EVIL, "prompt": nasty_prompt}).json()
    m = admin.post("/api/mcp", json={"name": EVIL, "url": 'https://x.example.com/"+__import__("os").system("id")+"', "tools": [{"name": "t1", "mode": "write"}]}).json()
    e = admin.post("/api/endpoints", json={"name": EVIL, "url": 'https://api.example.com/{id}/"); os.system("x"); ("', "collection": EVIL}).json()
    g = admin.get(f"/api/agents/{a['id']}/graph").json()
    g["nodes"] += [{"id": "n1", "type": "tool", "ref": f"{m['id']}.t1", "x": 0, "y": 0}, {"id": "n2", "type": "endpoint", "ref": e["id"], "x": 0, "y": 0}]
    g["edges"] += [{"id": "e1", "source": "root", "target": "n1", "socket": "tools"}, {"id": "e2", "source": "root", "target": "n2", "socket": "endpoints"}]
    assert admin.put(f"/api/agents/{a['id']}/graph", json=g).status_code == 200
    try:
        r = _gen(a["id"])
        for name, src in r.files.items():
            if name.endswith(".py"):
                tree = ast.parse(src)
                assert not _calls(tree, "system") or name in ("deploy.py",), f"os.system call appeared in {name}"
                assert not [c for c in _calls(tree, "__import__")], f"__import__ appeared in {name}"
        tree = ast.parse(r.files["agent.py"])
        agent_names = [k.value.value for n in _calls(tree, "Agent") for k in n.keywords if k.arg == "name"]
        assert all(n.isidentifier() for n in agent_names), agent_names
        instr = [k.value for n in _calls(tree, "Agent") for k in n.keywords if k.arg == "instruction"][0]
        text = ast.literal_eval(instr)                       # round-trips as a plain string literal
        assert "__import__" in text and "\x00" not in text and "\x07" not in text
        for line in r.files[".env.example"].splitlines():
            assert "\n" not in line and not line.startswith("import")
    finally:
        admin.delete(f"/api/agents/{a['id']}"); admin.delete(f"/api/mcp/{m['id']}"); admin.delete(f"/api/endpoints/{e['id']}")


@pytest.mark.parametrize("bad", [
    {"project": 'p"; rm -rf /'}, {"project": "UPPER"}, {"location": "us central"}, {"repository": "Repo;x"},
    {"model": "m; echo"}, {"cpu": "3"}, {"memory": "99Gi"}, {"min_instances": 5, "max_instances": 2}, {"min_instances": -1},
])
def test_options_are_strictly_validated(admin, bad):
    assert admin.post("/api/agents/a_res/export", json=bad).status_code == 422


# ---------- API + permissions
def test_export_endpoint_and_zip_match(admin):
    j = admin.post("/api/agents/a_bill/export", json=OPTS).json()
    z = admin.post("/api/agents/a_bill/export.zip", json=OPTS)
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip" and "billing_agent-agent-runtime.zip" in z.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        assert sorted(zf.namelist()) == sorted(f["path"] for f in j["files"])
        assert zf.read("agent.py").decode() == next(f["content"] for f in j["files"] if f["path"] == "agent.py")
    assert j["summary"]["agent"] == "Billing Agent" and j["commands"][0].startswith("gcloud auth")
    assert any(m["area"] == "Approvals" and m["status"] == "exact" for m in j["mapping"])


def test_export_requires_admin_on_the_agent(viewer, executor):
    assert viewer.post("/api/agents/a_res/export", json=OPTS).status_code == 403
    assert executor.post("/api/agents/a_res/export.zip", json=OPTS).status_code == 403


def test_export_unauthenticated_and_missing_agent(client, admin):
    from fastapi.testclient import TestClient
    from app.main import app
    assert TestClient(app).post("/api/agents/a_res/export", json=OPTS).status_code == 401
    assert admin.post("/api/agents/nope/export", json=OPTS).status_code == 404


def test_export_is_audited(admin):
    admin.post("/api/agents/a_kb/export", json=OPTS)
    assert any(x["action"] == "agent.export" and x["target"] == "a_kb" for x in admin.get("/api/audit").json())


def test_package_contains_no_secrets_or_placeholders_left():
    r = _gen()
    blob = "\n".join(r.files.values())
    assert "__CONFIG__" not in blob and "__IMAGE__" not in blob
    assert "admin123" not in blob and "secret_key" not in blob.lower()


def test_slug_helper_is_safe():
    for s in ["Billing Agent", "9 lives", "user", "", "a" * 200, "ünïcödé", "x; rm -rf /"]:
        out = slug(s)
        assert out.isidentifier() and len(out) <= 40 and out != "user", (s, out)


def test_clean_removes_control_chars_and_lone_surrogates():
    from app.exporter import clean, lit
    out = clean("a\ud800b\x00c\x07d")
    out.encode("utf-8")                                  # must be encodable
    assert "\x00" not in out and "\x07" not in out and out.startswith("a")
    assert lit('he said "hi"\\') == '"he said \\"hi\\"\\\\"'


# ---------- size cap
def test_tangled_teams_are_capped(admin, monkeypatch):
    import app.exporter as ex
    monkeypatch.setattr(ex, "MAX_AGENTS", 3)                     # the seeded orchestrator team has 4 agents
    with pytest.raises(ValueError, match="more than 3 agent instances"):
        _gen("a_orch")
    r = admin.post("/api/agents/a_orch/export", json=OPTS)
    assert r.status_code == 422 and "more than 3" in r.json()["detail"]


# ---------- complex scenario: SSE + name clash + MCP approvals + shared sub-agent + every pattern
def test_complex_scenario_dump(admin):
    """Builds a team that exercises every generator branch. If EXPORT_DUMP_DIR is set the package is written there so
    tools/validate_export.py can load it with the real google-adk (see docs/DEPLOYMENT_AGENT_RUNTIME.md)."""
    import os, pathlib
    created: dict[str, list] = {"agents": [], "mcp": [], "ep": []}
    try:
        m1 = admin.post("/api/mcp", json={"name": "Alpha Server", "url": "https://alpha.example.com/sse", "tools": [{"name": "query", "mode": "read"}, {"name": "write_it", "mode": "write"}]}).json()
        m2 = admin.post("/api/mcp", json={"name": "Beta Server", "url": "https://beta.example.com/mcp", "tools": [{"name": "query", "mode": "read"}]}).json()
        ep = admin.post("/api/endpoints", json={"name": "Basic API", "url": "https://api.example.com/items/{id}", "auth": "Basic", "method": "POST", "mode": "write"}).json()
        created["mcp"] += [m1["id"], m2["id"]]; created["ep"].append(ep["id"])
        mk = lambda name, pattern, **kw: admin.post("/api/agents", json={"name": name, "pattern": pattern, "prompt": f"You are {name}.", "model": "gemini-2.5-flash", **kw}).json()
        root = mk("Scenario Root", "router", prompt='Reply with JSON like {"status": "ok"} and mention {customer_name}.'); a = mk("Branch Sequential", "sequential"); b = mk("Branch Loop", "loop"); c = mk("Shared Leaf", "sequential"); d = mk("Plain Leaf", "sequential")
        created["agents"] += [x["id"] for x in (root, a, b, c, d)]
        admin.patch(f"/api/agents/{c['id']}", json={"approvals": [f"{m1['id']}.write_it", ep["id"]], "guardrails": {"pii": "log", "injection": "warn", "toxicity": "off", "topics": "block", "schema": "off"}})

        def wire(agent_id, nodes):
            g = admin.get(f"/api/agents/{agent_id}/graph").json()
            for i, (t, ref, sock) in enumerate(nodes):
                nid = f"n{i}"
                g["nodes"].append({"id": nid, "type": t, "ref": ref, "x": 0, "y": 0}); g["edges"].append({"id": f"e{i}", "source": "root", "target": nid, "socket": sock})
            assert admin.put(f"/api/agents/{agent_id}/graph", json=g).status_code == 200, agent_id
        wire(c["id"], [("tool", f"{m1['id']}.query", "tools"), ("tool", f"{m1['id']}.write_it", "tools"), ("tool", f"{m2['id']}.query", "tools"), ("endpoint", ep["id"], "endpoints")])
        wire(a["id"], [("agent", c["id"], "agents"), ("agent", d["id"], "agents")])
        wire(b["id"], [("agent", c["id"], "agents")])                       # Shared Leaf used under two parents
        wire(root["id"], [("agent", a["id"], "agents"), ("agent", b["id"], "agents")])

        r = _gen(root["id"])
        src = r.files["agent.py"]
        tree = _tree(src)
        assert "SseConnectionParams" in src and "StreamableHTTPConnectionParams" in src          # both transports
        assert src.count("tool_name_prefix=") >= 2                                              # query exists on two servers
        assert src.count("require_confirmation=True") == 4                                      # (MCP write_it + endpoint) x 2 instances of the shared leaf
        assert "LoopAgent(" in src and "max_iterations=3" in src and "SequentialAgent(" in src
        names = [k.value.value for n in _calls(tree, "Agent") + _calls(tree, "SequentialAgent") + _calls(tree, "LoopAgent") + _calls(tree, "ParallelAgent") for k in n.keywords if k.arg == "name"]
        assert len(names) == len(set(names)), names                                              # shared agent got distinct names
        assert any("more than once" in w["text"] for w in r.warnings) and any(w["area"] == "Not exported" and "topics" in w["text"] for w in r.warnings)
        assert _unused_imports(tree) == []
        root_call = [n for n in _calls(tree, "Agent") if any(k.arg == "name" and k.value.value == "scenario_root" for k in n.keywords)][0]
        assert isinstance([k.value for k in root_call.keywords if k.arg == "instruction"][0], ast.Lambda)   # braces -> callable instruction
        assert any("{ } braces" in w["text"] for w in r.warnings)
        assert "API_" in r.files[".env.example"] and "MCP_" in r.files[".env.example"]
        dump = os.environ.get("EXPORT_DUMP_DIR")
        if dump:
            out = pathlib.Path(dump) / "scenario_complex"; out.mkdir(parents=True, exist_ok=True)
            for n, content in r.files.items():
                (out / n).write_text(content)
    finally:
        for i in created["agents"]:
            admin.delete(f"/api/agents/{i}")
        for i in created["mcp"]:
            admin.delete(f"/api/mcp/{i}")
        for i in created["ep"]:
            admin.delete(f"/api/endpoints/{i}")
