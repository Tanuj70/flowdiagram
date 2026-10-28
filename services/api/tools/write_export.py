"""Write an agent's export package to a directory:  python tools/write_export.py <agent_id> <out_dir>"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.db import SessionLocal
from app.exporter import generate
from app.schemas import ExportOptions

agent_id, out = sys.argv[1], pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
with SessionLocal() as db:
    r = generate(db, agent_id, ExportOptions())
for name, content in r.files.items():
    (out / name).write_text(content)
print("wrote", len(r.files), "files to", out)
