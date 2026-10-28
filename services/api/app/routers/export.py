"""Export an agent as an Agent Runtime deployment package (code only; nothing is sent to Google Cloud)."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..exporter import generate, slug, to_zip
from ..models import User
from ..schemas import ExportOptions
from ..security import RANK, audit, effective_role, require
from .agents import get_agent_or_404

router = APIRouter(tags=["export"])


def _run(agent_id: str, opts: ExportOptions, db: Session, user: User):
    a = get_agent_or_404(db, agent_id)
    if RANK[effective_role(user, a)] < RANK["admin"]:   # the package contains prompts and server URLs
        raise HTTPException(403, "Requires admin role on this agent")
    try:
        result = generate(db, agent_id, opts)
    except ValueError as e:               # e.g. the team is too large to export
        raise HTTPException(422, str(e))
    audit(db, user.email, "agent.export", agent_id)
    db.commit()
    return a, result


@router.post("/agents/{agent_id}/export")
def export_agent(agent_id: str, opts: ExportOptions, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    _, r = _run(agent_id, opts, db, user)
    return {
        "files": [{"path": p, "content": c, "size": len(c)} for p, c in sorted(r.files.items())],
        "warnings": r.warnings, "mapping": r.mapping, "summary": r.summary, "commands": r.commands,
    }


@router.post("/agents/{agent_id}/export.zip")
def export_zip(agent_id: str, opts: ExportOptions, db: Session = Depends(get_db), user: User = Depends(require("viewer"))):
    a, r = _run(agent_id, opts, db, user)
    return Response(to_zip(r.files), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{slug(a.name)}-agent-runtime.zip"'})
