"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Bot, Cable, ChevronRight, Copy, Globe, History, Network, Plus, Settings2, Trash2, Wrench, Zap } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { RowMenu } from "./RowMenu";
import type { Agent } from "@/lib/types";

const drag = (type: string, ref: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData("application/x-studio", JSON.stringify({ type, ref }));
  e.dataTransfer.effectAllowed = "copy";
};

/** Icon rail (Agents · MCP · Endpoints). MCP and Endpoints are full gallery pages; Agents opens the canvas + agent list. */
export function Sidebar() {
  const s = useStudio();
  const path = usePathname();
  const router = useRouter();
  const [panel, setPanel] = useState(true);
  const [q, setQ] = useState("");
  const [flip, setFlip] = useState<Set<string>>(new Set());
  const ql = q.toLowerCase();
  const admin = s.canEdit();
  const section = path.startsWith("/mcp") ? "mcp" : path.startsWith("/endpoints") ? "ep" : path.startsWith("/runs") ? "runs" : "agents";

  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id));
  const counts = { agents: agents.length, mcp: s.mcp.filter((m) => !s.isHidden("mcp", m.id)).length, ep: s.endpoints.filter((e) => !s.isHidden("endpoint", e.id)).length };
  const children = new Set(Object.values(s.overview).flatMap((o) => o.agents));
  const roots = agents.filter((a) => !children.has(a.id));
  const byId = (id: string) => agents.find((a) => a.id === id);

  const go = (a: Agent, crumbs: string[]) => { s.openCanvas(a.id, { crumbs }); };

  const agentRow = (a: Agent, pathIds: string[], depth: number): React.ReactNode => {
    const ov = s.overview[a.id];
    const subs = (ov?.agents ?? []).map(byId).filter(Boolean) as Agent[];
    const here = [...pathIds, a.id];
    const key = here.join("/");
    const onPath = s.crumbs.slice(0, -1).includes(a.id);          // open the branch you are working in
    const open = onPath !== flip.has(key);
    const t = ov?.tools.length ?? 0, e = ov?.endpoints.length ?? 0;
    return (
      <div key={key}>
        <div className={`arow ${s.currentAgentId === a.id ? "sel" : ""}`} draggable onDragStart={drag("agent", a.id)} onClick={() => go(a, here)} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && go(a, here)}>
          {subs.length > 0 && depth < 5
            ? <button className="chev" aria-label={open ? `Collapse ${a.name}` : `Expand ${a.name}`} aria-expanded={open} onClick={(ev) => { ev.stopPropagation(); setFlip((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); }}>
                <ChevronRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
              </button>
            : <span className="chev" />}
          <span className="tile sm2"><Icon name={a.icon} size={16} /></span>
          <span className="ameta"><b>{a.name}</b><small>{a.description}</small></span>
          <span className="acounts" aria-label={`${t} tools, ${e} endpoints, ${subs.length} sub-agents`}>
            {t > 0 && <span title="Tools"><Wrench size={11} />{t}</span>}
            {e > 0 && <span title="Endpoints"><Globe size={11} />{e}</span>}
            {subs.length > 0 && <span title="Sub-agents"><Network size={11} />{subs.length}</span>}
          </span>
          <RowMenu label={a.name} items={[
            { label: "Open canvas", icon: <ArrowUpRight size={14} />, run: () => go(a, here) },
            { label: "Settings", icon: <Settings2 size={14} />, run: async () => { await s.openCanvas(a.id, { crumbs: here }); s.openSettings("General"); } },
            { label: "Duplicate", icon: <Copy size={14} />, run: () => s.duplicateAgent(a.id), hidden: !admin },
            { label: "Delete…", icon: <Trash2 size={14} />, run: () => s.requestDelete("agent", a.id), danger: true, hidden: !admin },
          ]} />
        </div>
        {open && subs.length > 0 && depth < 5 && !here.slice(0, -1).includes(a.id) && <div className="asub">{subs.map((x) => agentRow(x, here, depth + 1))}</div>}
      </div>
    );
  };

  const onAgents = () => { if (section === "agents") setPanel(!panel); else { setPanel(true); router.push("/"); } };
  const create = () => { if (!admin) return s.toast("Only admins can create items", { err: true }); s.createAgent(); };

  return (
    <div className="left">
      <nav className="rail" aria-label="Sections">
        <div className="logo" title="Agent Studio"><Zap size={16} /></div>
        <button className="railbtn" aria-label="Agents" aria-current={section === "agents" ? "page" : undefined} aria-pressed={section === "agents"} title="Agents" onClick={onAgents}>
          <Bot size={24} /><span className="rl">Agents</span><i className="cnt">{counts.agents}</i>
        </button>
        <Link className="railbtn" aria-label="MCP servers" aria-current={section === "mcp" ? "page" : undefined} href="/mcp" title="MCP servers">
          <Cable size={24} /><span className="rl">MCP</span><i className="cnt">{counts.mcp}</i>
        </Link>
        <Link className="railbtn" aria-label="API endpoints" aria-current={section === "ep" ? "page" : undefined} href="/endpoints" title="API endpoints">
          <Globe size={24} /><span className="rl">Endpoints</span><i className="cnt">{counts.ep}</i>
        </Link>
        <Link className="railbtn" aria-label={s.awaiting ? `Runs, ${s.awaiting} waiting for approval` : "Runs"} aria-current={section === "runs" ? "page" : undefined} href="/runs" title="Run history and approvals">
          <History size={24} /><span className="rl">Runs</span>{s.awaiting > 0 && <i className="cnt warnb">{s.awaiting}</i>}
        </Link>
      </nav>
      {section === "agents" && panel && (
        <aside className="side" aria-label="Agents">
          <div className="phead"><b>Agents</b><button className="btn ghost icon" aria-label="Collapse panel" onClick={() => setPanel(false)}>‹</button></div>
          <div className="sbar">
            <input className="input" placeholder="Search…" aria-label="Search agents" value={q} onChange={(e) => setQ(e.target.value)} />
            {admin && <button className="btn pri" onClick={create}><Plus size={14} /> New</button>}
          </div>
          <div className="list">
            {q ? agents.filter((a) => a.name.toLowerCase().includes(ql)).map((a) => agentRow(a, [], 5)) : (
              <>
                {roots.some((a) => (s.overview[a.id]?.agents.length ?? 0) > 0) && <div className="grp">Teams</div>}
                {roots.filter((a) => (s.overview[a.id]?.agents.length ?? 0) > 0).map((a) => agentRow(a, [], 0))}
                {roots.some((a) => (s.overview[a.id]?.agents.length ?? 0) === 0) && <div className="grp">Agents</div>}
                {roots.filter((a) => (s.overview[a.id]?.agents.length ?? 0) === 0).map((a) => agentRow(a, [], 0))}
              </>
            )}
            {agents.length === 0 && <p className="muted">No agents yet. Click “New” to build your first one.</p>}
          </div>
        </aside>
      )}
    </div>
  );
}
