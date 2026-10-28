#!/usr/bin/env bash
# Validate the Agent Runtime export against the REAL google-adk + Vertex AI SDK (no Google credentials needed).
#   usage: services/api/tools/validate_all.sh [agent_id]      (run from the repo root; needs python3 and network for pip)
set -euo pipefail
API=services/api; AGENT=${1:-a_orch}; WORK=$(mktemp -d)
python3 -m venv "$WORK/env" && "$WORK/env/bin/pip" install -q "google-adk==2.13.0" "google-cloud-aiplatform[agent_engines,adk]>=1.144" mcp fastapi uvicorn requests ruff
(cd $API && .venv/bin/python tools/write_export.py "$AGENT" "$WORK/pkg")
PY="$WORK/env/bin/python"
(cd $API && "$PY" tools/validate_export.py "$WORK/pkg" && "$PY" tools/validate_deploy_config.py "$WORK/pkg" && "$PY" tools/validate_runtime.py "$WORK/pkg")
"$WORK/env/bin/ruff" check --select E,F,B --ignore E501 "$WORK/pkg"
echo "All export validations passed. Package left in $WORK/pkg"
