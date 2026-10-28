"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import type { Agent, Mcp } from "@/lib/types";

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={i} className="crumb">
          {i > 0 && <ChevronRight size={14} className="muted" />}
          {c.href ? <Link className="linkbtn" href={c.href}>{c.label}</Link> : <b aria-current="page">{c.label}</b>}
        </span>
      ))}
    </nav>
  );
}

export function usersOfServer(agents: Agent[], overview: ReturnType<typeof useStudio.getState>["overview"], id: string) {
  return agents.filter((a) => (overview[a.id]?.tools ?? []).some((t) => t.split(".")[0] === id));
}
export function usersOfEndpoint(agents: Agent[], overview: ReturnType<typeof useStudio.getState>["overview"], id: string) {
  return agents.filter((a) => (overview[a.id]?.endpoints ?? []).includes(id));
}

export function Avatars({ agents }: { agents: Agent[] }) {
  if (!agents.length) return <span className="muted" style={{ fontSize: 12 }}>No agent uses this yet</span>;
  return (
    <span className="avatars" aria-label={`Used by ${agents.map((a) => a.name).join(", ")}`}>
      {agents.slice(0, 3).map((a) => <span key={a.id} className="tile sm" title={a.name}><Icon name={a.icon} size={12} /></span>)}
      {agents.length > 3 && <span className="av-more">+{agents.length - 3}</span>}
      <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{agents.length} agent{agents.length > 1 ? "s" : ""}</span>
    </span>
  );
}

export function MixBar({ server }: { server: Mcp }) {
  const w = server.tools.filter((t) => t.mode === "write").length;
  const r = server.tools.length - w;
  const total = Math.max(1, server.tools.length);
  return (
    <div>
      <div className="mixbar" role="img" aria-label={`${r} read tools, ${w} write tools`}>
        <i style={{ width: `${(r / total) * 100}%`, background: "var(--tool)" }} />
        <i style={{ width: `${(w / total) * 100}%`, background: "var(--danger)" }} />
      </div>
      <small className="muted">{r} read · {w} write</small>
    </div>
  );
}

export function HealthDot({ id }: { id: string }) {
  const h = useStudio((s) => s.health[id]);
  const cls = !h ? "unk" : h.ok ? "ok" : "bad";
  return <span className={`health ${cls}`} title={h?.msg ?? "Not checked yet"}><i />{!h ? "Not checked" : h.ok ? "Reachable" : "Unreachable"}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs2" role="tablist">
      {tabs.map((t) => <button key={t} role="tab" aria-selected={value === t} onClick={() => onChange(t)}>{t}</button>)}
    </div>
  );
}
