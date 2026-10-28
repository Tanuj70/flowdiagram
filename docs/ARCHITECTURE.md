# Architecture

```
Browser ── HTTPS ──► Next.js (web) ──/api/* rewrite──► FastAPI (api) ──► Postgres (SQLite in dev)
                      │ React Flow canvas                  │ auth, RBAC, validation
                      │ Zustand store                      │ run engine (plan → guardrails → steps → approvals)
                      └ httpOnly cookie (same-origin)      └ audit log, stats
```

## Key decisions
- **Same-origin proxy**: the browser only talks to Next.js; `/api/*` is rewritten to FastAPI. The auth cookie is `httpOnly` + `SameSite=Lax`, so there is no token in JS and no CORS surface. `API_URL` is baked at *build* time.
- **One canvas per agent** (`agent_graphs`): `{nodes, edges}` with a fixed `root` node (the agent) and children (sub-agents, MCP tools, endpoints) linked through typed sockets. The server re-validates every save: root present, references exist, sockets match node types, edges start at the root, no duplicate refs, and **no delegation cycles across all canvases**. Sub-agents are references; their own tools live on *their* canvas. The run engine expands sub-agents from their own canvases.
- **Roles**: global `admin|executor|viewer`; an agent's `roles` list (matched by email) can grant/limit per agent. Admin = write, Executor = run + approve, Viewer = read. The UI hides controls, but **the API is the enforcement point**.
- **Run engine** (`runtime.py`): `plan_run` flattens the graph under an agent into steps; `advance` executes them, applying guardrails, pausing at tools listed in the agent's `approvals`, and is resumable (`POST /runs/{id}/steps/{i}/approve`). Executors are pluggable (`Executor` interface); only `SimulatedExecutor` ships.
- **Persistence**: SQLAlchemy models; JSON columns for flexible config. `create_all` on boot (add Alembic before the first schema change in production).
- **Safety defaults**: production boot is refused with default secrets; `/docs` is hidden in production; endpoint tests use `HEAD` only and block private/loopback/link-local IPs; login throttling (per process).

## API surface (all under `/api`)
`POST /auth/login|logout`, `GET /auth/me` · `GET/POST /agents`, `GET/PATCH/DELETE /agents/{id}`, `GET /agents/{id}/stats` · `GET/POST /mcp`, `DELETE /mcp/{id}` · `GET/POST /endpoints`, `DELETE /endpoints/{id}`, `POST /endpoints/{id}/test` · `GET/PUT /agents/{id}/graph` · `GET /overview` · `GET /agents/{id}|mcp/{id}|endpoints/{id}/usage` · `POST /agents/{id}/duplicate` · `PATCH /mcp/{id}`, `/endpoints/{id}` · `POST /mcp/{id}/test` · `POST /agents/{id}/runs`, `GET /agents/{id}/runs`, `GET /runs/{id}`, `POST /runs/{id}/steps/{i}/approve` · `GET /audit` (admin) · `GET /healthz`, `/readyz`. Interactive docs at `/docs` in development.

## Known limits
Login throttle and nothing else is in-process state → run one API replica or move throttling to Redis. Runs are executed synchronously inside the request (fine for the simulator; real LLM runs need a worker/queue and streaming). Single shared canvas for all users (no multi-project/multi-tenant model yet).
