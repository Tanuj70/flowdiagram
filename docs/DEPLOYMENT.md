# Deployment

## Option A: Docker Compose (VM or any container host)
```bash
cp .env.example .env     # set POSTGRES_PASSWORD, SECRET_KEY (32+ chars), ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL
docker compose up --build -d
# put a TLS reverse proxy (Caddy/nginx/Traefik/cloud LB) in front of web:3000
```
- Production mode is enforced: the API refuses to start with default secrets, demo data on, or `COOKIE_SECURE=false`.
- Production mode requires HTTPS (secure cookie). To try the app over plain http://localhost use the dev quick start in the README, not compose.
- Data lives in the `pgdata` volume — back it up (`pg_dump`) and test restores.
- First login: the admin from `.env`. **There is no user-management UI or CLI yet**: only that admin exists; adding executors/viewers needs a DB insert until one is built (top backlog item).

## Option B: Managed (Cloud Run / ECS / Fly / Render)
Build two images (`services/api`, `apps/web`; pass `--build-arg API_URL=<internal api URL>` to web), a managed Postgres, set the same env vars on `api`. Web must reach `api` over a private URL; only `web` is public.

## Health & ops
`/healthz` (liveness), `/readyz` (DB check) on the API. Logs to stdout. Run **one** API replica until login throttling moves to Redis.

## Release checklist
1. CI green (`.github/workflows/ci.yml`: API tests, tsc, Next build).
2. Strong `SECRET_KEY`/`ADMIN_PASSWORD`; HTTPS in front; `COOKIE_SECURE=true`.
3. Add Alembic migrations before changing the schema in production.
4. Replace `SimulatedExecutor` with a real executor, then add a worker/queue for long runs.
5. Verify backups and rollback (previous image tag + DB snapshot).

## Status
**Not verified in this environment:** Docker image builds and `docker compose up` (Docker was not installed here), Postgres runtime (tests use SQLite), HTTPS/cookie behaviour behind a real proxy. The compose YAML parses and the API production-mode boot was verified manually with SQLite.
