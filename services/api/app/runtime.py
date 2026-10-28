"""Run engine.

`plan_run` turns the canvas graph below an agent into an ordered list of steps.
`advance` executes steps until it finishes, is blocked by a guardrail, or reaches
a tool that needs human approval. The LLM/tool calls go through `Executor`; the
shipped `SimulatedExecutor` is deterministic and makes NO network calls. Swap it
for an ADK / MCP / HTTP executor in production (see docs/ARCHITECTURE.md).
"""
import hashlib
import re
from dataclasses import dataclass

PII = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[EMAIL]"),
    (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "[CARD]"),
    (re.compile(r"\+?\d[\d\s().-]{8,}\d"), "[PHONE]"),
]
INJECTION = re.compile(
    r"(ignore (all |any )?(previous|prior) instructions|disregard (the )?system prompt|reveal (your )?(system )?prompt)", re.I
)
TOXIC = re.compile(r"\b(idiot|stupid|hate you|kill yourself)\b", re.I)


@dataclass
class Finding:
    rule: str
    mode: str
    detail: str


def check_text(text: str, guardrails: dict) -> tuple[str, list[Finding]]:
    """Return (possibly redacted text, findings). 'block' findings mean the run must stop."""
    findings: list[Finding] = []
    out = text
    mode = guardrails.get("pii", "off")
    if mode != "off":
        red = out
        for rx, tag in PII:
            red = rx.sub(tag, red)
        if red != out:
            findings.append(Finding("pii", mode, "PII detected"))
            if mode in ("warn", "log", "block"):
                out = red  # always redact when the rule is on
    mode = guardrails.get("injection", "off")
    if mode != "off" and INJECTION.search(text):
        findings.append(Finding("injection", mode, "Prompt-injection pattern"))
    mode = guardrails.get("toxicity", "off")
    if mode != "off" and TOXIC.search(text):
        findings.append(Finding("toxicity", mode, "Toxic language"))
    return out, findings


def blocking(findings: list[Finding]) -> list[Finding]:
    # PII under 'block' is neutralised by redaction; injection/toxicity under 'block' stop the run.
    return [f for f in findings if f.mode == "block" and f.rule != "pii"]


def _h(s: str, mod: int) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16) % mod


def tokens_of(text: str) -> int:
    return max(1, len(text) // 4)


class Executor:
    def agent(self, agent: dict, text: str) -> tuple[str, int]:
        raise NotImplementedError

    def tool(self, ref: str, text: str) -> tuple[str, int]:
        raise NotImplementedError


class SimulatedExecutor(Executor):
    def agent(self, agent, text):
        out = f"[{agent['name']}] handled: {text[:120]}"
        return out, 120 + _h(agent["id"] + text, 400)

    def tool(self, ref, text):
        return f"{ref} ok", 40 + _h(ref + text, 300)


def plan_run(graphs: dict, agents: dict, endpoints: dict, agent_id: str) -> list[dict]:
    """Flatten an agent's canvas into ordered steps. Sub-agents are expanded from *their own* canvases."""
    steps: list[dict] = []

    def walk(aid: str, depth: int, path: frozenset):
        a = agents.get(aid)
        if not a or aid in path:
            return
        steps.append({"kind": "agent", "ref": aid, "label": a["name"], "depth": depth, "pattern": a["pattern"], "status": "pending"})
        g = graphs.get(aid) or {"nodes": [], "edges": []}
        nodes = {n["id"]: n for n in g["nodes"]}
        for e in g["edges"]:
            n = nodes.get(e["target"])
            if not n:
                continue
            if n["type"] == "agent":
                walk(n["ref"], depth + 1, path | {aid})
            elif n["type"] == "tool":
                steps.append({"kind": "tool", "ref": n["ref"], "label": n["ref"].split(".")[-1], "depth": depth + 1, "status": "pending", "owner": aid})
            else:
                steps.append({"kind": "endpoint", "ref": n["ref"], "label": (endpoints.get(n["ref"]) or {}).get("name", n["ref"]), "depth": depth + 1, "status": "pending", "owner": aid})

    walk(agent_id, 0, frozenset())
    return steps


def advance(run, agents: dict, executor: Executor | None = None) -> None:
    """Mutates `run` (ORM object). Resumable: steps already done are skipped."""
    ex = executor or SimulatedExecutor()
    steps = [dict(s) for s in run.steps]
    root = agents[run.agent_id]
    text = run.input

    for s in steps:
        if s["status"] == "done":
            continue
        if s["kind"] == "agent":
            a = agents[s["ref"]]
            red, finds = check_text(text, a["guardrails"])
            s["findings"] = [f.__dict__ for f in finds]
            if blocking(finds):
                s["status"] = "blocked"
                run.status = "blocked"
                run.output = "Blocked by guardrail: " + ", ".join(f.rule for f in blocking(finds))
                run.steps = steps
                return
            res, ms = ex.agent(a, red)
            s.update(status="done", ms=ms, tokens=tokens_of(red) + tokens_of(res), output=res)
            run.latency_ms += ms
            run.tokens += s["tokens"]
        else:
            owner = agents.get(s.get("owner") or "", root)
            if s["ref"] in owner["approvals"] and s["status"] != "approved":
                s["status"] = "awaiting_approval"
                run.status = "awaiting_approval"
                run.steps = steps
                return
            res, ms = ex.tool(s["ref"], text)
            s.update(status="done", ms=ms, tokens=tokens_of(res), output=res)
            run.latency_ms += ms
            run.tokens += s["tokens"]

    final, finds = check_text(steps[0].get("output", "") if steps else "", root["guardrails"])
    run.output = final
    run.status = "completed"
    run.steps = steps
