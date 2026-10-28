"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Plug, Plus, Search, Trash2 } from "lucide-react";
import { useStudio } from "@/lib/store";
import { RowMenu } from "../RowMenu";
import { Topbar } from "../Topbar";
import { Avatars, Crumbs, HealthDot, usersOfEndpoint } from "./shared";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Full-page gallery of API endpoints grouped by collection (replaces the canvas). */
export function EndpointGallery() {
  const s = useStudio();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const admin = s.canEdit();
  const eps = s.endpoints.filter((e) => !s.isHidden("endpoint", e.id));
  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id));
  const ql = q.toLowerCase();
  const list = eps.filter((e) => (!method || e.method === method) && (!ql || (e.name + e.url + e.collection).toLowerCase().includes(ql)));
  const collections = [...new Set(list.map((e) => e.collection))];
  const present = METHODS.filter((m) => eps.some((e) => e.method === m));

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "API endpoints" }]} />} actions={admin && <button className="btn pri" onClick={() => s.setModal({ kind: "endpoint" })}><Plus size={14} /> Add endpoint</button>} />
      <div className="page">
        <div className="pagein">
          <header className="pagehead">
            <div><h1>API endpoints</h1><p className="muted">{eps.length} endpoints in {new Set(eps.map((e) => e.collection)).size} collections. Click one for details, usage and settings.</p></div>
            <div className="pagetools"><label className="searchbox"><Search size={15} /><input className="input" placeholder="Search endpoints…" aria-label="Search endpoints" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          </header>
          {present.length > 0 && (
            <div className="chipbar" role="group" aria-label="Filter by method">
              <button className={`fchip ${!method ? "on" : ""}`} onClick={() => setMethod(null)}>All</button>
              {present.map((m) => <button key={m} className={`fchip ${method === m ? "on" : ""}`} onClick={() => setMethod(method === m ? null : m)}>{m}</button>)}
            </div>
          )}
          {collections.map((c) => (
            <section key={c} className="collection" aria-label={c}>
              <h2 className="coltitle">{c} <span className="badge">{list.filter((e) => e.collection === c).length}</span></h2>
              <div className="gallery grid">
                {list.filter((e) => e.collection === c).map((e) => (
                  <div key={e.id} className="gcard" role="link" tabIndex={0} aria-label={`${e.method} ${e.name}`} onClick={() => router.push(`/endpoints/${e.id}`)} onKeyDown={(ev) => ev.key === "Enter" && router.push(`/endpoints/${e.id}`)}>
                    <div className="ghead">
                      <span className={`mth big ${e.method}`}>{e.method}</span>
                      <div className="gtitle"><b>{e.name}</b><HealthDot id={`endpoints:${e.id}`} /></div>
                      <RowMenu label={e.name} items={[
                        { label: "Open", icon: <ArrowUpRight size={14} />, run: () => router.push(`/endpoints/${e.id}`) },
                        { label: "Test reachability", icon: <Plug size={14} />, run: () => s.runTest("endpoints", e.id), hidden: !s.canRun() },
                        { label: "Edit…", icon: <Pencil size={14} />, run: () => s.setModal({ kind: "endpoint", editId: e.id }), hidden: !admin },
                        { label: "Delete…", icon: <Trash2 size={14} />, run: () => s.requestDelete("endpoint", e.id), danger: true, hidden: !admin },
                      ]} />
                    </div>
                    <code className="gurl" title={e.url}>{e.url}</code>
                    <div className="chips"><span className="badge">{e.auth}</span><span className={`badge ${e.mode === "write" ? "w" : ""}`}>{e.mode}</span></div>
                    <div className="gfoot"><Avatars agents={usersOfEndpoint(agents, s.overview, e.id)} /></div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {list.length === 0 && (
            <div className="emptystate">
              <h3>{eps.length ? "No endpoints match" : "No API endpoints yet"}</h3>
              <p className="muted">{eps.length ? "Try a different search or method." : "Add an endpoint so agents can call your APIs."}</p>
              {!eps.length && admin && <button className="btn pri" onClick={() => s.setModal({ kind: "endpoint" })}><Plus size={14} /> Add endpoint</button>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
