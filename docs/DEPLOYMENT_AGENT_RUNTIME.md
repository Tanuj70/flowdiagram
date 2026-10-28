# Deploying agents to Agent Platform Runtime (GEAP)

Agent Studio can generate a **deployment package** for any agent (and its whole team): ADK code, a runtime-contract
server, a Dockerfile, a Cloud Build config and a deploy script. Open an agent → **Deploy** tab → *Generate package* →
*Download .zip*. **Agent Studio never contacts Google Cloud and never stores Google credentials**; you run the script.

## Flow (container method, recommended)
1. `gcloud auth application-default login`, enable `aiplatform`, `cloudbuild`, `artifactregistry` APIs, create a Docker
   repository in Artifact Registry (the Deploy tab prints the exact commands for your project/region).
2. `pip install -r requirements.txt`
3. `python deploy.py build` → Cloud Build builds the image, smoke-tests `import agent`, pushes to Artifact Registry.
4. `python deploy.py deploy --method container` → creates the runtime resource with `container_spec.image_uri`.
5. `python deploy.py smoke "Hello"` / `python deploy.py delete`.
Quick try without Cloud Build: `python deploy.py deploy --method sdk --staging-bucket gs://BUCKET`.

## What is generated
`agent.py` (ADK agent tree), `server.py` (POST `/api/reasoning_engine`, `/api/stream_reasoning_engine`, port 8080),
`guardrails.py`, `tools_api.py` (when used), `Dockerfile`, `cloudbuild.yaml`, `deploy.py`, `requirements.txt`, `.env.example`, `README.md`.

## Mapping Studio → ADK (shown in the Deploy tab as exact / approximate / not exported)
Exact: prompt, description, temperature/top-p/top-k/max tokens, MCP tool selection (`tool_filter`), approvals
(`require_confirmation`). Approximate: non-Gemini models (mapped to a model you choose), sequential/parallel/loop
patterns (workflow agents), API endpoints (generic HTTP tools), PII/injection/toxicity guardrails (regex callbacks).
Not exported: topics/schema guardrails, long-term memory, Studio roles (use IAM), skills.

## What was verified (and how)
Run `services/api/tools/validate_all.sh` (installs the real `google-adk==2.13.0` + Vertex AI SDK 2.6 in a scratch env):
- generated code compiles, **loads in the real ADK** and builds the agent tree (all patterns, SSE and streamable MCP,
  approvals, name-clash prefixes, a shared sub-agent used twice); lint clean (ruff E,F,B);
- every prompt resolves through ADK's own instruction processing (found and fixed: `{braces}` in a prompt would crash
  at run time as an ADK state variable; now emitted as a callable instruction);
- the configs `deploy.py` builds are accepted by the SDK's own `AgentEngineConfig` schema (unknown keys are rejected);
- `server.py` follows the contract against a real `AdkApp` with a stub agent (sessions, streaming NDJSON, unary `query`,
  method allow-list, bad input -> 400); `guardrails.py` and `tools_api.py` (URL-encoding, no redirects, env secrets);
- 31 backend tests incl. hostile names/prompts/URLs cannot inject code, strict option validation, admin-only, audit log,
  size cap (60 agent instances).
Found while verifying: ADK 2.x does **not** install `mcp`; it is now in the generated requirements.

## NOT verified (needs a real Google Cloud project)
No deployment was performed. Unverified: the runtime accepting the container and `class_methods` shape, in-container
authentication/health checks/timeouts (not specified in the docs used), Artifact Registry permissions for the runtime's
service agent ("Bring your own container" setup page), model availability (`gemini-2.5-flash` is the default mapping),
Claude on Vertex AI, MCP servers being reachable from the runtime, `client.agent_engines` vs `client.runtimes` naming
(the installed SDK 2.6 uses `agent_engines`; `deploy.py` tries `runtimes` first). Expect small edits on the first deploy.

## Security notes
The export endpoint is admin-only per agent and audited. Secrets are never written to files: MCP/API credentials are
read from environment variables (`MCP_<SERVER>_TOKEN`, `API_<ENDPOINT>_TOKEN|KEY|USER/PASSWORD`) listed in `.env.example`.
The container has no authentication of its own; never expose the image publicly.
