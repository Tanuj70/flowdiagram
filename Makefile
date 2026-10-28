.PHONY: api web test build validate-export
api:  ; cd services/api && .venv/bin/uvicorn app.main:app --reload --port 8010
web:  ; cd apps/web && API_URL=http://localhost:8010 npm run dev
test: ; cd services/api && .venv/bin/python -m pytest -q && cd ../../apps/web && npx tsc --noEmit
build:; cd apps/web && API_URL=http://localhost:8010 npm run build
validate-export: ; services/api/tools/validate_all.sh
