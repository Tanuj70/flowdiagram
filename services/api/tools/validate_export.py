"""Validate a generated package against the REAL google-adk (run with an environment that has it installed):
    python tools/validate_export.py <package_dir>
Checks: every .py compiles, agent.py imports and builds the agent tree, names are unique, tools resolve.
"""
import importlib, os, py_compile, sys, pathlib

pkg = pathlib.Path(sys.argv[1]).resolve()
for f in pkg.glob("*.py"):
    py_compile.compile(str(f), doraise=True)
print("compiled:", sorted(p.name for p in pkg.glob("*.py")))
sys.path.insert(0, str(pkg))
os.chdir(pkg)
agent = importlib.import_module("agent")
root = agent.root_agent

names = []
def walk(a, d=0):
    names.append(a.name)
    kind = type(a).__name__
    tools = [type(t).__name__ + (":" + getattr(t, "name", "") if hasattr(t, "name") else "") for t in getattr(a, "tools", [])]
    print("  " * d + f"- {a.name} [{kind}]" + (f" tools={tools}" if tools else ""))
    for s in a.sub_agents:
        walk(s, d + 1)
walk(root)

# ADK templates {name} in string instructions from session state and raises KeyError; make sure none of our prompts do.
import asyncio
from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.run_config import RunConfig
from google.adk.sessions import InMemorySessionService
from google.adk.utils.instructions_utils import inject_session_state

async def check_instructions(a):
    svc = InMemorySessionService()
    for ag in [a] + list(a.find_sub_agents() if hasattr(a, "find_sub_agents") else []):
        if not isinstance(ag, LlmAgent):
            continue
        s = await svc.create_session(app_name="t", user_id="u")
        rc = ReadonlyContext(InvocationContext(session_service=svc, invocation_id="i", agent=ag, session=s, run_config=RunConfig()))
        ins, bypass = await ag.canonical_instruction(rc)
        if not bypass:
            await inject_session_state(ins, rc)          # raises KeyError for unresolved {placeholders}
asyncio.run(check_instructions(root))
print("OK: instructions resolve without session-state errors")
assert len(names) == len(set(names)), f"duplicate agent names: {names}"
print("OK: %d agents, names unique" % len(names))
