"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Pencil, Plug, Plus, Trash2, Wrench, X, Check, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";

type Test = { reachable: boolean; status?: number; error?: string } | null;

/** Details for an MCP server (with its tools) or an API endpoint. */
export function DetailPane() {
  const s = useStudio();
  const d = s.detail;
  const [test, setTest] = useState<Test>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setTest(null); setOpen(d?.tool ?? null); }, [d?.id, d?.tool]);
  if (s.pane !== "detail" || !d) return null;

  const onCanvas = (type: string, ref: string) => s.nodes.some((n) => n.type === type && (n.data as any).ref === ref);
  const agentsUsing = (match: (ref: string) => boolean) =>
    s.agents.filter((a) => (s.overview[a.id]?.[d.kind === "mcp" ? "tools" : "endpoints"] ?? []).some(match));
  const runTest = async (path: string) => {
    setBusy(true); setTest(null);
    try { setTest(await api(path, { method: "POST" })); } catch (e: any) { s.toast(e.message, { err: true }); } finally { setBusy(false); }
  };
  const canvasName = s.agents.find((a) => a.id === s.currentAgentId)?.name;

  const Header = ({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: React.ReactNode }) => (
    <header>
      <span className="tile big">{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>{sub}</div>
      <Link className="btn ghost" href={d.kind === "mcp" ? `/mcp/${d.id}` : `/endpoints/${d.id}`} title="Open the full page">Full page <ArrowUpRight size={13} /></Link>
      <button className="btn ghost icon" aria-label="Close details" onClick={() => s.openDetail(null)}><X size={16} /></button>
    </header>
  );
  const Actions = ({ kind, id, testPath, canTest }: { kind: "mcp" | "endpoint"; id: string; testPath: string; canTest: boolean }) => (
    <div className="dactions">
      {canTest && <button className="btn" disabled={busy} onClick={() => runTest(testPath)}><Plug size={14} /> {busy ? "Testing…" : "Test connection"}</button>}
      {s.canEdit() && <button className="btn" onClick={() => s.setModal({ kind, editId: id })}><Pencil size={14} /> Edit</button>}
      {s.canEdit() && <button className="btn danger" onClick={() => s.requestDelete(kind, id)}><Trash2 size={14} /> Delete…</button>}
    </div>
  );
  const TestResult = () => test && (
    <p className={`testres ${test.reachable ? "ok" : "bad"}`} role="status">{test.reachable ? `Reachable (HTTP ${test.status})` : `Unreachable: ${test.error}`}</p>
  );

  if (d.kind === "mcp") {
    const m = s.mcp.find((x) => x.id === d.id);
    if (!m) return null;
    const usedBy = agentsUsing((r) => r.split(".")[0] === m.id);
    return (
      <aside className="drawer detail" aria-label={`${m.name} details`}>
        <Header icon={<Icon name={m.icon} size={24} />} title={m.name} sub={<div className="chips" style={{ marginTop: 4 }}>{m.tags.map((t) => <span key={t} className="chip">{t}</span>)}<span className="badge">{m.tools.length} tools</span></div>} />
        <div className="dbody">
          {m.description && <p>{m.description}</p>}
          <dl className="kv"><dt>URL</dt><dd>{m.url || "—"}</dd><dt>Used by</dt><dd>{usedBy.length ? usedBy.map((a) => a.name).join(", ") : "No agent yet"}</dd></dl>
          <Actions kind="mcp" id={m.id} testPath={`/mcp/${m.id}/test`} canTest={s.canRun() && !!m.url} />
          <TestResult />
          <h4 className="sec">Tools ({m.tools.length})</h4>
          {m.tools.map((t) => {
            const ref = `${m.id}.${t.name}`;
            const users = s.agents.filter((a) => (s.overview[a.id]?.tools ?? []).includes(ref));
            const exp = open === t.name;
            const here = onCanvas("tool", ref);
            return (
              <div key={t.name} className={`toolrow ${exp ? "on" : ""}`}>
                <button className="toolhead" onClick={() => setOpen(exp ? null : t.name)} aria-expanded={exp}>
                  <Wrench size={14} /><b>{t.name}</b><span className={`badge ${t.mode === "write" ? "w" : ""}`}>{t.mode}</span>
                  {users.length > 0 && <span className="badge">{users.length} agent{users.length > 1 ? "s" : ""}</span>}
                </button>
                {exp && (
                  <div className="toolbody">
                    <p style={{ margin: "0 0 6px" }}>{t.description || <span className="muted">No description.</span>}</p>
                    {t.input_schema ? <pre className="schema">{JSON.stringify(t.input_schema, null, 2)}</pre> : <p className="muted" style={{ fontSize: 12 }}>No input schema recorded (appears after live discovery).</p>}
                    <p className="muted" style={{ fontSize: 12 }}>Used by: {users.length ? users.map((a) => a.name).join(", ") : "nobody"}</p>
                    {s.canEdit() && s.currentAgentId && (
                      here
                        ? <span className="badge ok"><Check size={11} /> On the {canvasName} canvas</span>
                        : <button className="btn" onClick={() => s.addMany("tools", "tool", [ref])}><Plus size={14} /> Add to {canvasName}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  const e = s.endpoints.find((x) => x.id === d.id);
  if (!e) return null;
  const users = agentsUsing((r) => r === e.id);
  const here = onCanvas("endpoint", e.id);
  return (
    <aside className="drawer detail" aria-label={`${e.name} details`}>
      <Header icon={<Globe size={24} />} title={e.name} sub={<div className="chips" style={{ marginTop: 4 }}><span className={`mth ${e.method}`}>{e.method}</span><span className="chip">{e.collection}</span>{e.mode === "write" && <span className="badge w">write</span>}</div>} />
      <div className="dbody">
        <dl className="kv"><dt>URL</dt><dd style={{ wordBreak: "break-all" }}>{e.url}</dd><dt>Auth</dt><dd>{e.auth}</dd><dt>Access</dt><dd>{e.mode}</dd><dt>Used by</dt><dd>{users.length ? users.map((a) => a.name).join(", ") : "No agent yet"}</dd></dl>
        <Actions kind="endpoint" id={e.id} testPath={`/endpoints/${e.id}/test`} canTest={s.canRun()} />
        <TestResult />
        <p className="muted" style={{ fontSize: 12 }}>Reachability uses a HEAD request to public hosts only; it never sends write requests.</p>
        {s.canEdit() && s.currentAgentId && (
          here ? <span className="badge ok"><Check size={11} /> On the {canvasName} canvas</span>
               : <button className="btn pri" onClick={() => s.addMany("endpoints", "endpoint", [e.id])}><Plus size={14} /> Add to {canvasName}</button>
        )}
      </div>
    </aside>
  );
}
