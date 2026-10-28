# Agent Studio

Visual builder for multi-agent systems. **Every agent has its own canvas** where it connects to **sub-agents**, **MCP tools** and **API endpoints** through typed sockets (double-click a sub-agent to go inside). **MCP servers and API endpoints are full gallery pages** (`/mcp`, `/endpoints`, with detail pages `/mcp/:id`, `/endpoints/:id`; no canvas shown there),  a multi-select picker, safe delete with impact warning + Undo, per-agent settings (model, guardrails, RBAC, memory, approvals), Flowise-style chat with traces, light/dark glass UI, **canvas undo/redo (Ctrl/⌘ Z)**, **run history + approvals inbox (`/runs`)**, ⌘K command palette.

```
apps/web         Next.js 15 (App Router) + React Flow + Zustand   → UI
services/api     FastAPI + SQLAlchemy (SQLite dev / Postgres prod) → REST API, auth, RBAC, run engine
prototype/       Original single-file HTML prototype (reference only)
docs/            ARCHITECTURE · DESIGN · DEPLOYMENT · TESTING
```

## Quick start (local, ~2 min)
Requires Python 3.11+ and Node 20+.

```bash
# 1. API  (port 8010 to avoid clashing with other local apps on 8000)
cd services/api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8010

# 2. Web (new terminal)
cd apps/web
npm install
API_URL=http://localhost:8010 npm run dev      # http://localhost:3000
```
Demo logins (development only, seeded automatically): `admin@example.com / admin123` (admin), `executor@example.com / executor123`, `viewer@example.com / viewer123`.

Tests: `make test` (71 API tests + TypeScript check). Deploy to Agent Platform Runtime: see [docs/DEPLOYMENT_AGENT_RUNTIME.md](docs/DEPLOYMENT_AGENT_RUNTIME.md) (Deploy tab per agent).

## What is real vs simulated
| Real | Simulated / not built yet |
|---|---|
| Per-agent canvases, MCP/API libraries, edit / duplicate / delete with usage impact, auth (httpOnly cookie JWT), server-enforced RBAC, audit log | **Run execution**: the LLM and tool calls are simulated (deterministic, no network). Plug in ADK/MCP/HTTP via `Executor` in `services/api/app/runtime.py` |
| Agent/graph/catalog CRUD with validation, cycle & socket checks | MCP tool auto-discovery (tools are entered manually); Start / Condition / Direct-reply nodes, AI builder, versions, publish-as-API |
| Guardrails: PII redaction, injection & toxicity detection (regex-based) | Topic restriction & schema validation engines, memory backends |
| Human-approval pause/resume of tool steps | Real token/cost accounting (uses a ~4 chars/token estimate) |
| Endpoint reachability test with SSRF protection | Secrets vault for endpoint credentials, SSO, versions history UI |
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to deploy.
