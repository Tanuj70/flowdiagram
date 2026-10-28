"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Plug, Plus, Trash2, Wrench } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { Topbar } from "../Topbar";
import { Avatars, Crumbs, HealthDot, MixBar, Tabs, usersOfServer } from "./shared";

const TABS = ["Overview", "Tools", "Used by", "Settings"] as const;

export function McpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const s = useStudio();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const m = s.mcp.find((x) => x.id === id);
  const gone = !m || s.isHidden("mcp", id);
  useEffect(() => { if (gone) router.replace("/mcp"); }, [gone, router]);
  if (gone || !m) return null;
  const admin = s.canEdit();
  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id));
  const users = usersOfServer(agents, s.overview, m.id);
  const test = async () => { setBusy(true); await s.runTest("mcp", m.id); setBusy(false); };
  const health = s.health[`mcp:${m.id}`];
  const writes = m.tools.filter((t) => t.mode === "write").length;

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "MCP servers", href: "/mcp" }, { label: m.name }]} />}
        actions={admin && <button className="btn pri" onClick={() => s.setAddTo({ type: "tool", refs: m.tools.map((t) => `${m.id}.${t.name}`) })}><Plus size={14} /> Add to agent…</button>} />
      <div className="page">
        <div className="pagein">
          <section className="dhero">
            <span className="tile huge tool"><Icon name={m.icon} size={32} /></span>
            <div className="dhero-t">
              <h1>{m.name}</h1>
              <p className="muted">{m.description || "No description."}</p>
              <div className="chips">{m.tags.map((t) => <span key={t} className="chip">{t}</span>)}<span className="badge">{m.tools.length} tools</span><HealthDot id={`mcp:${m.id}`} /></div>
            </div>
            <div className="dactions" style={{ margin: 0 }}>
              {s.canRun() && m.url && <button className="btn" disabled={busy} onClick={test}><Plug size={14} /> {busy ? "Testing…" : "Test connection"}</button>}
              {admin && <button className="btn" onClick={() => s.setModal({ kind: "mcp", editId: m.id })}><Pencil size={14} /> Edit</button>}
            </div>
          </section>
          <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />

          {tab === "Overview" && (
            <div className="dgrid">
              <div className="gcard static"><h4 className="sec">At a glance</h4>
                <div className="stat"><div className="card"><b>{m.tools.length}</b><small>Tools</small></div><div className="card"><b>{writes}</b><small>Write tools</small></div><div className="card"><b>{users.length}</b><small>Agents using it</small></div><div className="card"><b>{health ? (health.ok ? "Up" : "Down") : "—"}</b><small>Last test</small></div></div>
                <div style={{ marginTop: 12 }}><MixBar server={m} /></div>
              </div>
              <div className="gcard static"><h4 className="sec">Connection</h4>
                <dl className="kv"><dt>URL</dt><dd style={{ wordBreak: "break-all" }}>{m.url || "—"}</dd><dt>Tags</dt><dd>{m.tags.join(", ") || "—"}</dd><dt>Status</dt><dd>{health ? health.msg : "Not checked. Use “Test connection”."}</dd></dl>
                <p className="muted" style={{ fontSize: 12 }}>Reachability is a HEAD request to public hosts only. Live tool discovery is planned.</p>
              </div>
            </div>
          )}

          {tab === "Tools" && (
            <div className="tooltable">
              {m.tools.map((t) => {
                const ref = `${m.id}.${t.name}`;
                const tu = agents.filter((a) => (s.overview[a.id]?.tools ?? []).includes(ref));
                const exp = open === t.name;
                return (
                  <div key={t.name} className={`toolrow ${exp ? "on" : ""}`}>
                    <div className="toolhead2">
                      <button className="toolhead" onClick={() => setOpen(exp ? null : t.name)} aria-expanded={exp}>
                        <Wrench size={14} /><b>{t.name}</b><span className={`badge ${t.mode === "write" ? "w" : ""}`}>{t.mode}</span>
                        <span className="muted" style={{ flex: 1, textAlign: "left", fontSize: 12.5 }}>{t.description}</span>
                        {tu.length > 0 && <span className="badge">{tu.length} agent{tu.length > 1 ? "s" : ""}</span>}
                      </button>
                      {admin && <button className="btn" onClick={() => s.setAddTo({ type: "tool", refs: [ref] })}><Plus size={13} /> Add</button>}
                    </div>
                    {exp && (
                      <div className="toolbody">
                        {t.input_schema ? <pre className="schema">{JSON.stringify(t.input_schema, null, 2)}</pre> : <p className="muted" style={{ fontSize: 12.5 }}>No input schema recorded. It will appear here after live discovery.</p>}
                        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Used by: {tu.length ? tu.map((a) => a.name).join(", ") : "nobody yet"}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {m.tools.length === 0 && <div className="emptystate"><p className="muted">This server has no tools listed. Edit it to add some.</p></div>}
            </div>
          )}

          {tab === "Used by" && (
            <div className="tooltable">
              {users.length === 0 && <div className="emptystate"><p className="muted">No agent uses this server yet. Use “Add to agent…”.</p></div>}
              {users.map((a) => (
                <div key={a.id} className="toolrow"><div className="toolhead2">
                  <span className="tile sm"><Icon name={a.icon} size={12} /></span>
                  <b style={{ flex: 1 }}>{a.name} <span className="muted" style={{ fontWeight: 400 }}>— {(s.overview[a.id]?.tools ?? []).filter((t) => t.split(".")[0] === m.id).map((t) => t.split(".").slice(1).join(".")).join(", ")}</span></b>
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
                  <div className="dactions"><button className="btn" onClick={() => s.setModal({ kind: "mcp", editId: m.id })}><Pencil size={14} /> Edit server</button><button className="btn danger" onClick={() => s.requestDelete("mcp", m.id)}><Trash2 size={14} /> Delete…</button></div>
                  <p className="muted" style={{ fontSize: 12.5 }}>Deleting removes this server’s tools from {users.length} agent canvas{users.length === 1 ? "" : "es"}. You get 8 seconds to undo.</p>
                </>
              ) : <p className="muted">Only admins can change or delete servers.</p>}
            </div>
          )}
          <p style={{ marginTop: 18 }}><Link className="linkbtn" href="/mcp">← All MCP servers</Link></p>
        </div>
      </div>
    </>
  );
}
