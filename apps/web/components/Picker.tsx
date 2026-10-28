"use client";
import { useEffect, useMemo, useState } from "react";
import { Bot, Globe, Search, Wrench, X } from "lucide-react";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";

type Tab = "agents" | "tools" | "endpoints";

function PRow({ checked, disabled, note, onToggle, children }: { checked: boolean; disabled?: boolean; note?: string; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className={`prow ${disabled ? "off" : ""}`}>
      <input type="checkbox" disabled={disabled} checked={checked} onChange={onToggle} />
      <span className="pbody">{children}</span>
      {note && <span className="badge">{note}</span>}
    </label>
  );
}
const TABS: [Tab, string][] = [["tools", "MCP tools"], ["endpoints", "API endpoints"], ["agents", "Agents"]];

/** One picker for everything you can add to a canvas: MCP servers → tools, API collections → endpoints, agents. */
export function Picker() {
  const s = useStudio();
  const p = s.picker;
  const [tab, setTab] = useState<Tab>("tools");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [server, setServer] = useState<string>("");
  useEffect(() => { if (p) { setTab(p.tab); setQ(""); setSel(new Set()); setServer(""); } }, [p]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && s.setPicker(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [s]);

  const target = p?.target;
  const targetAgent = target ? s.agents.find((a) => a.id === target) : undefined;
  const linked = useMemo(() => {
    if (target) { const ov = s.overview[target]; return new Set([...(ov?.tools ?? []).map((t) => `tool:${t}`), ...(ov?.endpoints ?? []).map((e) => `endpoint:${e}`), ...(ov?.agents ?? []).map((a) => `agent:${a}`)]); }
    return new Set(s.nodes.map((n) => `${n.type}:${(n.data as any).ref}`));
  }, [s.nodes, s.overview, target]);
  const ql = q.toLowerCase();
  const servers = s.mcp.filter((m) => !s.isHidden("mcp", m.id));
  const eps = s.endpoints.filter((e) => !s.isHidden("endpoint", e.id));
  const agents = s.agents.filter((a) => !s.isHidden("agent", a.id) && a.id !== s.currentAgentId);
  const mServers = servers.filter((m) => !ql || m.name.toLowerCase().includes(ql) || m.tools.some((t) => t.name.toLowerCase().includes(ql)));
  const active = mServers.find((m) => m.id === server) ?? mServers[0];

  if (!p) return null;
  const toggle = (k: string) => setSel((x) => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const add = () => {
    const by = (pre: string) => [...sel].filter((k) => k.startsWith(pre + ":")).map((k) => k.slice(pre.length + 1));
    if (target) {
      const t = by("tool"), e = by("endpoint");
      if (t.length) s.addToAgent(target, "tool", t);
      if (e.length) setTimeout(() => s.addToAgent(target, "endpoint", e), t.length ? 400 : 0);
    } else {
      s.addMany("tools", "tool", by("tool"));
      s.addMany("endpoints", "endpoint", by("endpoint"));
      s.addMany("agents", "agent", by("agent"));
    }
    s.setPicker(null);
  };
  const collections = [...new Set(eps.map((e) => e.collection))];

  return (
    <div className="modal-bg" onClick={() => s.setPicker(null)} role="presentation">
      <div className="modal picker" role="dialog" aria-modal="true" aria-label={targetAgent ? `Add to ${targetAgent.name}` : "Add to canvas"} onClick={(e) => e.stopPropagation()}>
        <div className="phd">
          <div className="seg" role="tablist">
            {TABS.filter(([k]) => !target || k !== "agents").map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <button className="btn ghost icon" aria-label="Close" onClick={() => s.setPicker(null)}><X size={16} /></button>
        </div>
        <div className="psearch"><Search size={15} /><input className="input" autoFocus placeholder={`Search ${tab === "tools" ? "servers and tools" : tab === "endpoints" ? "endpoints" : "agents"}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>

        <div className="pcontent">
          {tab === "tools" && (
            <div className="two">
              <div className="plist" role="listbox" aria-label="MCP servers">
                {mServers.map((m) => {
                  const n = m.tools.filter((t) => sel.has(`tool:${m.id}.${t.name}`)).length;
                  return (
                    <button key={m.id} className={`srv ${active?.id === m.id ? "on" : ""}`} onClick={() => setServer(m.id)}>
                      <span className="tile tool"><Icon name={m.icon} size={15} /></span>
                      <span className="pbody"><b>{m.name}</b><small>{m.tools.length} tools{m.tags.length ? ` · ${m.tags.join(", ")}` : ""}</small></span>
                      {n > 0 && <span className="cnt2">{n}</span>}
                    </button>
                  );
                })}
                {mServers.length === 0 && <p className="muted pad">No MCP servers match.</p>}
              </div>
              <div className="plist">
                {active && (
                  <>
                    <p className="muted pad" style={{ margin: 0 }}>{active.description || active.url}</p>
                    {active.tools.filter((t) => !ql || t.name.toLowerCase().includes(ql) || active.name.toLowerCase().includes(ql)).map((t) => {
                      const k = `tool:${active.id}.${t.name}`;
                      return <PRow key={k} checked={(linked.has(k)) ? linked.has(k) : sel.has(k)} disabled={linked.has(k)} note={linked.has(k) ? "added" : undefined} onToggle={() => toggle(k)}><b>{t.name}</b> <i className={`badge ${t.mode === "write" ? "w" : ""}`}>{t.mode}</i><small>{t.description}</small></PRow>;
                    })}
                  </>
                )}
              </div>
            </div>
          )}
          {tab === "endpoints" && (
            <div className="plist">
              {collections.map((c) => {
                const list = eps.filter((e) => e.collection === c && (!ql || e.name.toLowerCase().includes(ql) || c.toLowerCase().includes(ql)));
                if (!list.length) return null;
                return (
                  <div key={c}>
                    <div className="grp">{c}</div>
                    {list.map((e) => { const k = `endpoint:${e.id}`; return <PRow key={k} checked={(linked.has(k)) ? linked.has(k) : sel.has(k)} disabled={linked.has(k)} note={linked.has(k) ? "added" : undefined} onToggle={() => toggle(k)}><b><span className={`mth ${e.method}`}>{e.method}</span> {e.name}</b><small>{e.url}</small></PRow>; })}
                  </div>
                );
              })}
              {eps.length === 0 && <p className="muted pad">No endpoints yet. Add one from the Endpoints tab.</p>}
            </div>
          )}
          {tab === "agents" && (
            <div className="plist">
              {s.canEdit() && <button className="btn" style={{ margin: "4px 0 8px" }} onClick={() => { s.setPicker(null); s.createAgent({ sub: true }); }}>＋ Create new sub-agent</button>}
              {agents.filter((a) => !ql || a.name.toLowerCase().includes(ql)).map((a) => {
                const k = `agent:${a.id}`;
                const loop = !linked.has(k) && s.wouldLoop(a.id);
                return <PRow key={k} checked={(linked.has(k) || loop) ? linked.has(k) : sel.has(k)} disabled={linked.has(k) || loop} note={linked.has(k) ? "added" : loop ? "would loop" : undefined} onToggle={() => toggle(k)}><b>{a.name}</b><small>{a.description}</small></PRow>;
              })}
              {agents.length === 0 && <p className="muted pad">No other agents available.</p>}
            </div>
          )}
        </div>
        <div className="pfoot">
          <span className="muted">{sel.size} selected</span>
          <span className="sp" />
          <button className="btn" onClick={() => s.setPicker(null)}>Cancel</button>
          <button className="btn pri" disabled={!sel.size} onClick={add}>Add {sel.size || ""} to {targetAgent ? targetAgent.name : "canvas"}</button>
        </div>
      </div>
    </div>
  );
}
