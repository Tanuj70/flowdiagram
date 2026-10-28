"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { Topbar } from "../Topbar";
import { Crumbs, HealthDot, Tabs, usersOfEndpoint } from "./shared";

const TABS = ["Overview", "Used by", "Settings"] as const;

export function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const s = useStudio();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [busy, setBusy] = useState(false);
  const e = s.endpoints.find((x) => x.id === id);
  const gone = !e || s.isHidden("endpoint", id);
  useEffect(() => { if (gone) router.replace("/endpoints"); }, [gone, router]);
  if (gone || !e) return null;
  const admin = s.canEdit();
  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id));
  const users = usersOfEndpoint(agents, s.overview, e.id);
  const test = async () => { setBusy(true); await s.runTest("endpoints", e.id); setBusy(false); };
  const health = s.health[`endpoints:${e.id}`];

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "API endpoints", href: "/endpoints" }, { label: e.collection }, { label: e.name }]} />}
        actions={admin && <button className="btn pri" onClick={() => s.setAddTo({ type: "endpoint", refs: [e.id] })}><Plus size={14} /> Add to agent…</button>} />
      <div className="page">
        <div className="pagein">
          <section className="dhero">
            <span className={`mth huge ${e.method}`}>{e.method}</span>
            <div className="dhero-t">
              <h1>{e.name}</h1>
              <code className="gurl" style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{e.url}</code>
              <div className="chips"><span className="chip">{e.collection}</span><span className="badge">{e.auth}</span><span className={`badge ${e.mode === "write" ? "w" : ""}`}>{e.mode}</span><HealthDot id={`endpoints:${e.id}`} /></div>
            </div>
            <div className="dactions" style={{ margin: 0 }}>
              {s.canRun() && <button className="btn" disabled={busy} onClick={test}><Plug size={14} /> {busy ? "Testing…" : "Test reachability"}</button>}
              {admin && <button className="btn" onClick={() => s.setModal({ kind: "endpoint", editId: e.id })}><Pencil size={14} /> Edit</button>}
            </div>
          </section>
          <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />
          {tab === "Overview" && (
            <div className="dgrid">
              <div className="gcard static"><h4 className="sec">Request</h4>
                <dl className="kv"><dt>Method</dt><dd>{e.method}</dd><dt>URL</dt><dd style={{ wordBreak: "break-all" }}>{e.url}</dd><dt>Auth</dt><dd>{e.auth}</dd><dt>Access</dt><dd>{e.mode === "write" ? "Write (changes data). Consider requiring approval." : "Read only"}</dd><dt>Collection</dt><dd>{e.collection}</dd></dl>
              </div>
              <div className="gcard static"><h4 className="sec">Health</h4>
                <p style={{ margin: "0 0 8px" }}>{health ? health.msg : "Not checked yet."}</p>
                <p className="muted" style={{ fontSize: 12.5 }}>Reachability is a HEAD request to public hosts only; it never sends write requests. A “try this request” console with real calls is not built yet.</p>
              </div>
            </div>
          )}
          {tab === "Used by" && (
            <div className="tooltable">
              {users.length === 0 && <div className="emptystate"><p className="muted">No agent uses this endpoint yet. Use “Add to agent…”.</p></div>}
              {users.map((a) => (
                <div key={a.id} className="toolrow"><div className="toolhead2">
                  <span className="tile sm"><Icon name={a.icon} size={12} /></span><b style={{ flex: 1 }}>{a.name}{a.approvals.includes(e.id) && <span className="badge" style={{ marginLeft: 8 }}>approval required</span>}</b>
                  <button className="btn" onClick={() => s.openCanvasPage(a.id)}>Open canvas <ArrowUpRight size={13} /></button>
                </div></div>
              ))}
            </div>
          )}
          {tab === "Settings" && (
            <div className="gcard static" style={{ maxWidth: 560 }}>
              {admin ? (
                <>
                  <h4 className="sec">Manage</h4>
                  <div className="dactions"><button className="btn" onClick={() => s.setModal({ kind: "endpoint", editId: e.id })}><Pencil size={14} /> Edit endpoint</button><button className="btn danger" onClick={() => s.requestDelete("endpoint", e.id)}><Trash2 size={14} /> Delete…</button></div>
                  <p className="muted" style={{ fontSize: 12.5 }}>Deleting removes it from {users.length} agent canvas{users.length === 1 ? "" : "es"} and clears related approvals. You get 8 seconds to undo.</p>
                </>
              ) : <p className="muted">Only admins can change or delete endpoints.</p>}
            </div>
          )}
          <p style={{ marginTop: 18 }}><Link className="linkbtn" href="/endpoints">← All endpoints</Link></p>
        </div>
      </div>
    </>
  );
}
