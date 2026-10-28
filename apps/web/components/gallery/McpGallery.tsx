"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Pencil, Plug, Plus, Search, Trash2, ArrowUpRight } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { RowMenu } from "../RowMenu";
import { Topbar } from "../Topbar";
import { Avatars, Crumbs, HealthDot, MixBar, usersOfServer } from "./shared";

/** Full-page gallery of MCP servers (replaces the canvas). */
export function McpGallery() {
  const s = useStudio();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const admin = s.canEdit();
  const servers = s.mcp.filter((m) => !s.isHidden("mcp", m.id));
  const tags = useMemo(() => [...new Set(servers.flatMap((m) => m.tags))].sort(), [servers]);
  const ql = q.toLowerCase();
  const list = servers.filter((m) => (!tag || m.tags.includes(tag)) && (!ql || (m.name + m.description + m.tags.join(" ") + m.tools.map((t) => t.name).join(" ")).toLowerCase().includes(ql)));
  const totalTools = servers.reduce((n, m) => n + m.tools.length, 0);
  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id));

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "MCP servers" }]} />} actions={admin && <button className="btn pri" onClick={() => s.setModal({ kind: "mcp" })}><Plus size={14} /> Add server</button>} />
      <div className="page">
        <div className="pagein">
          <header className="pagehead">
            <div><h1>MCP servers</h1><p className="muted">{servers.length} servers · {totalTools} tools. Click a server to see its tools, usage and settings.</p></div>
            <div className="pagetools">
              <label className="searchbox"><Search size={15} /><input className="input" placeholder="Search servers and tools…" aria-label="Search MCP servers" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <div className="seg" role="group" aria-label="View">
                <button aria-pressed={view === "grid"} aria-selected={view === "grid"} onClick={() => setView("grid")} title="Grid"><LayoutGrid size={14} /></button>
                <button aria-pressed={view === "list"} aria-selected={view === "list"} onClick={() => setView("list")} title="List"><List size={14} /></button>
              </div>
            </div>
          </header>
          {tags.length > 0 && (
            <div className="chipbar" role="group" aria-label="Filter by tag">
              <button className={`fchip ${!tag ? "on" : ""}`} onClick={() => setTag(null)}>All</button>
              {tags.map((t) => <button key={t} className={`fchip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
            </div>
          )}
          <div className={`gallery ${view}`}>
            {list.map((m) => (
              <div key={m.id} className="gcard" role="link" tabIndex={0} aria-label={`${m.name}, ${m.tools.length} tools`} onClick={() => router.push(`/mcp/${m.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/mcp/${m.id}`)}>
                <div className="ghead">
                  <span className="tile big tool"><Icon name={m.icon} size={24} /></span>
                  <div className="gtitle"><b>{m.name}</b><HealthDot id={`mcp:${m.id}`} /></div>
                  <RowMenu label={m.name} items={[
                    { label: "Open", icon: <ArrowUpRight size={14} />, run: () => router.push(`/mcp/${m.id}`) },
                    { label: "Test connection", icon: <Plug size={14} />, run: () => s.runTest("mcp", m.id), hidden: !s.canRun() || !m.url },
                    { label: "Edit…", icon: <Pencil size={14} />, run: () => s.setModal({ kind: "mcp", editId: m.id }), hidden: !admin },
                    { label: "Delete…", icon: <Trash2 size={14} />, run: () => s.requestDelete("mcp", m.id), danger: true, hidden: !admin },
                  ]} />
                </div>
                <p className="gdesc">{m.description || m.url || "No description"}</p>
                <div className="chips">{m.tags.map((t) => <span key={t} className="chip">{t}</span>)}<span className="badge">{m.tools.length} tools</span></div>
                <MixBar server={m} />
                <div className="gfoot"><Avatars agents={usersOfServer(agents, s.overview, m.id)} /></div>
              </div>
            ))}
          </div>
          {list.length === 0 && (
            <div className="emptystate">
              <h3>{servers.length ? "No servers match your search" : "No MCP servers yet"}</h3>
              <p className="muted">{servers.length ? "Try a different search or tag." : "Add your first MCP server to give agents tools."}</p>
              {!servers.length && admin && <button className="btn pri" onClick={() => s.setModal({ kind: "mcp" })}><Plus size={14} /> Add server</button>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
