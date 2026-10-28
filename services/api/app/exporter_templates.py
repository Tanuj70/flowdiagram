"""Static file templates for the Agent Runtime export. Placeholders look like __NAME__ (never str.format)."""

GUARDRAILS_PY = '''"""Input/output guardrails mirrored from Agent Studio (regex based). Attached as ADK model callbacks.

These are simple pattern checks, not a security boundary. For production consider Google's Model Armor.
"""
import json
import logging
import re

from google.adk.models import LlmResponse
from google.genai import types

log = logging.getLogger("guardrails")

_PII = [
    (re.compile(r"[\\w.+-]+@[\\w-]+\\.[\\w.-]+"), "[EMAIL]"),
    (re.compile(r"\\b(?:\\d[ -]?){13,16}\\b"), "[CARD]"),
    (re.compile(r"\\+?\\d[\\d\\s().-]{8,}\\d"), "[PHONE]"),
]
_INJECTION = re.compile(
    r"(ignore (all |any )?(previous|prior) instructions|disregard (the )?system prompt|reveal (your )?(system )?prompt)", re.I
)
_TOXIC = re.compile(r"\\b(idiot|stupid|hate you|kill yourself)\\b", re.I)


def redact(text: str) -> str:
    for rx, tag in _PII:
        text = rx.sub(tag, text)
    return text


def _latest_strings(llm_request) -> list[str]:
    out: list[str] = []
    contents = getattr(llm_request, "contents", None) or []
    if not contents:
        return out
    for part in contents[-1].parts or []:
        if getattr(part, "text", None):
            out.append(part.text)
        fr = getattr(part, "function_response", None)
        if fr is not None and getattr(fr, "response", None) is not None:
            try:
                out.append(json.dumps(fr.response, default=str))
            except Exception:  # noqa: BLE001 - never let a guardrail crash the agent
                log.debug("could not serialise function response for guardrail scan")
    return out


def _refusal(reason: str) -> LlmResponse:
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=f"Blocked by guardrail: {reason}")]))


def make_callbacks(config: dict):
    """config: {"pii": "off|log|warn|block", "injection": ..., "toxicity": ...}. Returns (before_model, after_model)."""
    pii = config.get("pii", "off")
    inj = config.get("injection", "off")
    tox = config.get("toxicity", "off")

    def before_model(callback_context, llm_request):
        texts = _latest_strings(llm_request)
        blob = "\\n".join(texts)
        if inj != "off" and _INJECTION.search(blob):
            log.warning("guardrail injection (%s)", inj)
            if inj == "block":
                return _refusal("prompt injection")
        if tox != "off" and _TOXIC.search(blob):
            log.warning("guardrail toxicity (%s)", tox)
            if tox == "block":
                return _refusal("toxic language")
        if pii != "off":
            for content in getattr(llm_request, "contents", None) or []:
                for part in content.parts or []:
                    if getattr(part, "text", None):
                        redacted = redact(part.text)
                        if redacted != part.text:
                            log.warning("guardrail pii redacted (%s)", pii)
                            part.text = redacted
        return None

    def after_model(callback_context, llm_response):
        if pii == "off" or llm_response is None or llm_response.content is None:
            return None
        for part in llm_response.content.parts or []:
            if getattr(part, "text", None):
                part.text = redact(part.text)
        return None

    return before_model, after_model
'''

TOOLS_API_HEADER = '''"""HTTP tools generated from Agent Studio endpoints.

Each tool calls ONE fixed URL. Secrets are read from environment variables (use Secret Manager references in
deploy.py / .env.example, never put them in code). The model passes arguments as JSON strings.
"""
import json
import os
import re
from urllib.parse import quote

import requests

_MAX_CHARS = 20000
_TIMEOUT = 15


def _call(method: str, url: str, auth: str, env: str, path_params_json: str, query_json: str, body_json: str) -> dict:
    try:
        path_params = json.loads(path_params_json or "{}")
        query = json.loads(query_json or "{}")
        body = json.loads(body_json) if body_json else None
    except json.JSONDecodeError as e:
        return {"error": f"Arguments must be valid JSON: {e}"}
    if not isinstance(path_params, dict) or not isinstance(query, dict):
        return {"error": "path_params_json and query_json must be JSON objects"}

    names = re.findall(r"{([A-Za-z0-9_]+)}", url)
    missing = [n for n in names if n not in path_params]
    if missing:
        return {"error": f"Missing path parameters: {missing}"}
    for n in names:
        url = url.replace("{" + n + "}", quote(str(path_params[n]), safe=""))

    headers = {"Accept": "application/json"}
    basic = None
    if auth == "Bearer" and os.environ.get(env + "_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ[env + "_TOKEN"]
    elif auth == "API key" and os.environ.get(env + "_KEY"):
        headers["X-API-Key"] = os.environ[env + "_KEY"]
    elif auth == "Basic" and os.environ.get(env + "_USER"):
        basic = (os.environ[env + "_USER"], os.environ.get(env + "_PASSWORD", ""))

    try:
        r = requests.request(method, url, params=query or None, json=body, headers=headers, auth=basic,
                             timeout=_TIMEOUT, allow_redirects=False)
    except requests.RequestException as e:
        return {"error": f"Request failed: {type(e).__name__}"}
    text = r.text[:_MAX_CHARS]
    try:
        payload = json.loads(text)
    except ValueError:
        payload = text
    return {"status": r.status_code, "body": payload}

'''

SERVER_PY = '''"""HTTP server that follows the Agent Platform runtime contract for custom containers.

  POST /api/reasoning_engine         -> {"output": ...}                     (unary methods)
  POST /api/stream_reasoning_engine  -> one JSON object per line            (streaming methods)
Request body: {"class_method": "<name>", "input": {...}}.  Listens on 0.0.0.0:$PORT (default 8080).

Assumptions to verify against the current docs: authentication is handled by the platform in front of the container;
the media type for streaming; the health endpoint (/healthz) is only for your own probes.
"""
import inspect
import json
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import iterate_in_threadpool

from agent import root_agent

log = logging.getLogger("server")
app = FastAPI(title="Agent Runtime container")
_adk = None


def adk_app():
    """Build the AdkApp lazily (needs Google credentials/project, which the runtime provides)."""
    global _adk
    if _adk is None:
        from vertexai import agent_engines
        _adk = agent_engines.AdkApp(agent=root_agent)
        _adk.set_up()
    return _adk


async def query(user_id: str, message: str, session_id: str | None = None) -> dict:
    """Unary convenience method required by the SDK's standard query: runs the agent and returns all events."""
    adk = adk_app()
    if session_id is None:
        session = await adk.async_create_session(user_id=user_id)
        session_id = session["id"] if isinstance(session, dict) else session.id
    events = []
    async for ev in adk.async_stream_query(user_id=user_id, session_id=session_id, message=message):
        events.append(ev)
    return {"session_id": session_id, "events": events}


def _operations() -> dict[str, list[str]]:
    ops = {k: list(v) for k, v in adk_app().register_operations().items()}
    ops.setdefault("async", []).append("query")
    return ops


UNARY = ("", "async")
STREAM = ("stream", "async_stream")


def _allowed(modes) -> set[str]:
    return {name for mode, names in _operations().items() if mode in modes for name in names}


def _resolve(name: str):
    return query if name == "query" else getattr(adk_app(), name)


async def _parse(request: Request, modes):
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return None, JSONResponse({"error": "Body must be JSON"}, status_code=400)
    name, inp = body.get("class_method"), body.get("input", {})
    if not isinstance(name, str) or not isinstance(inp, dict):
        return None, JSONResponse({"error": "Expected {class_method: string, input: object}"}, status_code=400)
    if name not in _allowed(modes):
        return None, JSONResponse({"error": f"Unknown or unsupported method: {name}"}, status_code=400)
    fn = _resolve(name)
    try:
        inspect.signature(fn).bind(**inp)
    except TypeError as e:
        return None, JSONResponse({"error": f"Bad arguments: {e}"}, status_code=400)
    return (fn, inp), None


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/reasoning_engine")
async def reasoning_engine(request: Request):
    parsed, err = await _parse(request, UNARY)
    if err:
        return err
    fn, inp = parsed
    try:
        out = fn(**inp)
        if inspect.isawaitable(out):
            out = await out
        return JSONResponse({"output": json.loads(json.dumps(out, default=str))})
    except Exception:  # noqa: BLE001
        log.exception("method failed")
        return JSONResponse({"error": "Internal error"}, status_code=500)


@app.post("/api/stream_reasoning_engine")
async def stream_reasoning_engine(request: Request):
    parsed, err = await _parse(request, STREAM)
    if err:
        return err
    fn, inp = parsed

    async def lines():
        try:
            gen = fn(**inp)
            it = gen if inspect.isasyncgen(gen) else iterate_in_threadpool(gen)
            async for item in it:
                yield json.dumps({"output": item}, default=str) + "\\n"
        except Exception:  # noqa: BLE001
            log.exception("stream failed")
            yield json.dumps({"error": "Internal error"}) + "\\n"

    return StreamingResponse(lines(), media_type="application/json")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
'''

DOCKERFILE = '''FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd -r -u 10001 appuser && chown -R appuser /app
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
'''

DOCKERIGNORE = '''.env
.git
__pycache__
*.pyc
deploy.py
deployment.json
cloudbuild.yaml
README.md
'''

CLOUDBUILD = '''# Build the image, smoke-test that the agent imports, push to Artifact Registry.
# Run:  gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE=<image-uri> .
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-t", "${_IMAGE}", "."]
  - name: "${_IMAGE}"
    entrypoint: python
    args: ["-c", "import agent; print('agent ok:', agent.root_agent.name)"]
images:
  - "${_IMAGE}"
substitutions:
  _IMAGE: "__IMAGE__"
options:
  logging: CLOUD_LOGGING_ONLY
'''

DEPLOY_PY = '''#!/usr/bin/env python3
"""Build and deploy this agent to Agent Platform Runtime.   (generated by Agent Studio)

Two methods:
  container  Cloud Build builds the Docker image -> Artifact Registry -> runtime runs the image (production).
  sdk        Package the in-memory agent with the SDK (needs a Cloud Storage staging bucket; quickest to try).

    pip install -r requirements.txt
    gcloud auth application-default login
    python deploy.py build                        # container method, step 1
    python deploy.py deploy --method container    # container method, step 2
    python deploy.py deploy --method sdk --staging-bucket gs://YOUR_BUCKET
    python deploy.py smoke "Hello"                # call the deployed agent
    python deploy.py delete                       # remove it

NOT verified against a live project: Google renames/changes these SDK calls between releases (the docs show both
client.agent_engines and client.runtimes). If a call fails, check the current docs and adjust the marked lines.
"""
import argparse
import asyncio
import json
import subprocess
import sys

CONFIG = __CONFIG__
STATE_FILE = "deployment.json"


def _client():
    import vertexai
    return vertexai.Client(project=CONFIG["project"], location=CONFIG["location"])


def _manager(client):
    # The docs use both names depending on the page/SDK version.
    return getattr(client, "runtimes", None) or client.agent_engines


def build(args):
    cmd = ["gcloud", "builds", "submit", "--project", CONFIG["project"], "--config", "cloudbuild.yaml",
           f"--substitutions=_IMAGE={CONFIG['image']}", "."]
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def deploy(args):
    client = _client()
    mgr = _manager(client)
    if args.method == "sdk":
        if not args.staging_bucket:
            sys.exit("--staging-bucket gs://... is required for the sdk method")
        from vertexai import agent_engines, types
        from agent import root_agent
        app = agent_engines.AdkApp(agent=root_agent)
        config = {
            "requirements": CONFIG["requirements"],
            "staging_bucket": args.staging_bucket,
            "display_name": CONFIG["display_name"],
            "identity_type": types.IdentityType.AGENT_IDENTITY,
            "min_instances": CONFIG["min_instances"], "max_instances": CONFIG["max_instances"],
            "resource_limits": {"cpu": CONFIG["cpu"], "memory": CONFIG["memory"]},
        }
        remote = mgr.create(agent=app, config=config)
    else:
        from vertexai import agent_engines
        from agent import root_agent
        ops = agent_engines.AdkApp(agent=root_agent).register_operations()
        ops.setdefault("async", []).append("query")          # provided by server.py
        class_methods = [{"name": n, "api_mode": mode} for mode, names in ops.items() for n in names]
        config = {
            "container_spec": {"image_uri": args.image or CONFIG["image"]},
            "class_methods": class_methods,
            "display_name": CONFIG["display_name"],
            "min_instances": CONFIG["min_instances"], "max_instances": CONFIG["max_instances"],
            "resource_limits": {"cpu": CONFIG["cpu"], "memory": CONFIG["memory"]},
        }
        remote = mgr.create(config=config)
    name = remote.api_resource.name
    print("Deployed:", name)
    with open(STATE_FILE, "w") as f:
        json.dump({"resource_name": name, "method": args.method, "image": CONFIG["image"]}, f, indent=2)


def _remote():
    state = json.load(open(STATE_FILE))
    client = _client()
    mgr = _manager(client)
    return mgr.get(name=state["resource_name"])


def smoke(args):
    remote = _remote()

    async def run():
        async for event in remote.async_stream_query(user_id="smoke-test", message=args.message):
            print(json.dumps(event, default=str)[:500])
    asyncio.run(run())


def delete(args):
    _remote().delete(force=True)
    print("Deleted.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build").set_defaults(fn=build)
    d = sub.add_parser("deploy")
    d.add_argument("--method", choices=["container", "sdk"], default="container")
    d.add_argument("--staging-bucket")
    d.add_argument("--image", help="override the image URI")
    d.set_defaults(fn=deploy)
    s = sub.add_parser("smoke")
    s.add_argument("message")
    s.set_defaults(fn=smoke)
    sub.add_parser("delete").set_defaults(fn=delete)
    a = p.parse_args()
    a.fn(a)
'''
