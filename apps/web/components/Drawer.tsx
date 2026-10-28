"use client";
import { useEffect, useState } from "react";
import { Activity, Brain, Copy, FileText, RefreshCw, Rocket, ShieldCheck, Sparkles, Trash2, Users, Wrench, X } from "lucide-react";
import { DeployTab } from "./DeployTab";
import { api } from "@/lib/api";
import { PaneSwitch } from "./PaneSwitch";
import { AGENT_ICON_CHOICES, Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import type { Agent, GuardMode, Stats } from "@/lib/types";

const TABS = ["General", "Model", "Tools", "Guardrails", "Access", "Memory", "Deploy", "Observe"] as const;
type TabName = typeof TABS[number];
const TAB_ICON: Record<TabName, React.ReactNode> = {
  General: <FileText size={16} />, Model: <Sparkles size={16} />, Tools: <Wrench size={16} />, Guardrails: <ShieldCheck size={16} />,
  Access: <Users size={16} />, Memory: <Brain size={16} />, Deploy: <Rocket size={16} />, Observe: <Activity size={16} />,
};

const Slider = ({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) => (
  <div className="row">
    <label style={{ width: 96 }} className="muted">{label}</label>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    <input className="input v" style={{ width: 76 }} type="number" aria-label={`${label} value`} min={min} max={max} step={step} value={value}
      onChange={(e) => { const n = +e.target.value; if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }} />
  </div>
);

export function Drawer() {
  const s = useStudio();
  const agent = s.agents.find((a) => a.id === s.selectedAgentId);
  const tab = useStudio((x) => x.drawerTab) as TabName;
  const setTab = useStudio((x) => x.setDrawerTab);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select")) s.setPane(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [s]);
  if (s.pane !== "settings" || !agent) return null;
  const set = (patch: Partial<Agent>) => s.updateAgent(agent.id, patch);
  const ro = !s.canEdit();

  return (
    <aside className="drawer" aria-label={`${agent.name} settings`}>
      <header>
        <PaneSwitch />
        <span className="sp" />
        <span className="badge">v{agent.version}</span>
        {ro && <span className="badge warn">read-only</span>}
        <button className="btn ghost icon" aria-label="Close settings" onClick={() => s.setPane(null)}><X size={16} /></button>
      </header>
      <div className="agenthead"><span className="tile"><Icon name={agent.icon} /></span><h2>{agent.name}</h2></div>
      <div className="dsplit">
      <nav className="vtabs" role="tablist" aria-orientation="vertical" aria-label="Agent settings sections"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const i = TABS.indexOf(tab) + (e.key === "ArrowDown" ? 1 : -1);
          setTab(TABS[(i + TABS.length) % TABS.length]);
          requestAnimationFrame(() => (document.querySelector('.vtabs [aria-selected="true"]') as HTMLElement | null)?.focus());
        }}>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} title={t}>
            {TAB_ICON[t]}<span>{t}</span>
          </button>
        ))}
      </nav>
      <div className="dbody" role="tabpanel">
        <fieldset disabled={ro && tab !== "Observe"}>
          {tab === "General" && <General agent={agent} set={set} />}
          {tab === "Model" && <Model agent={agent} set={set} />}
          {tab === "Tools" && <ToolsTab agent={agent} set={set} />}
          {tab === "Guardrails" && <Guardrails agent={agent} set={set} />}
          {tab === "Access" && <Access agent={agent} set={set} />}
          {tab === "Memory" && <Memory agent={agent} set={set} />}
          {tab === "Deploy" && <DeployTab agent={agent} />}
        </fieldset>
        {tab === "Observe" && <Observe agent={agent} />}
      </div>
      </div>
    </aside>
  );
}

type P = { agent: Agent; set: (p: Partial<Agent>) => void };

function General({ agent, set }: P) {
  const s = useStudio();
  const [skill, setSkill] = useState("");
  return (
    <>
      <label className="f">Name<input className="input" maxLength={80} value={agent.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="f">Description<input className="input" maxLength={300} value={agent.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <label className="f">Prompt (system instructions)<textarea className="textarea" value={agent.prompt} onChange={(e) => set({ prompt: e.target.value })} /></label>
      <h4 className="sec">Icon</h4>
      <div className="icons">{AGENT_ICON_CHOICES.map((i) => <button key={i} type="button" aria-label={`Icon ${i}`} aria-pressed={agent.icon === i} onClick={() => set({ icon: i })}><Icon name={i} /></button>)}</div>
      <h4 className="sec">Skills</h4>
      <div className="chips">{agent.skills.map((k) => <span className="chip" key={k}>{k}<button type="button" aria-label={`Remove ${k}`} onClick={() => set({ skills: agent.skills.filter((x) => x !== k) })}>×</button></span>)}</div>
      <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); const v = skill.trim(); if (v && !agent.skills.includes(v)) set({ skills: [...agent.skills, v] }); setSkill(""); }}>
        <input className="input" placeholder="Add skill…" aria-label="New skill" value={skill} onChange={(e) => setSkill(e.target.value)} /><button className="btn">Add</button>
      </form>
      <h4 className="sec">Publishing</h4>
      <div className="chk"><div><div>Published</div><small>Marks this version as live for executors</small></div><span className="sp" />
        <input type="checkbox" aria-label="Published" checked={agent.status === "published"} onChange={(e) => set({ status: e.target.checked ? "published" : "draft" })} /></div>
      <h4 className="sec">Manage</h4>
      <div className="dactions">
        {s.currentAgentId !== agent.id && <button type="button" className="btn" onClick={() => s.openCanvas(agent.id, { crumbs: [agent.id] })}>Open canvas</button>}
        <button type="button" className="btn" onClick={() => s.duplicateAgent(agent.id)}><Copy size={14} /> Duplicate</button>
        <button type="button" className="btn danger" onClick={() => s.requestDelete("agent", agent.id)}><Trash2 size={14} /> Delete…</button>
      </div>
    </>
  );
}

function Model({ agent, set }: P) {
  const sel = (k: keyof Agent, opts: string[], label: string) => (
    <label className="f">{label}<select className="select" value={String(agent[k])} onChange={(e) => set({ [k]: e.target.value } as any)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  const presets: Record<string, Partial<Agent>> = { Precise: { temperature: 0.1, top_p: 0.8 }, Balanced: { temperature: 0.4, top_p: 0.9 }, Creative: { temperature: 0.9, top_p: 1 } };
  return (
    <>
      {sel("framework", ["ADK 2.0", "LangGraph", "CrewAI", "Custom"], "Agent framework")}
      {sel("pattern", ["sequential", "parallel", "loop", "router"], "Orchestration pattern")}
      {sel("model", ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], "Model")}
      <h4 className="sec">Generation</h4>
      <div className="chips" style={{ marginBottom: 10 }}>{Object.entries(presets).map(([k, v]) => <button key={k} type="button" className="btn" onClick={() => set(v)}>{k}</button>)}</div>
      <Slider label="Max tokens" min={64} max={8192} step={64} value={agent.max_tokens} onChange={(v) => set({ max_tokens: v })} />
      <Slider label="Temperature" min={0} max={1} step={0.05} value={agent.temperature} onChange={(v) => set({ temperature: v })} />
      <Slider label="Top-P" min={0} max={1} step={0.05} value={agent.top_p} onChange={(v) => set({ top_p: v })} />
      <Slider label="Top-K" min={1} max={100} step={1} value={agent.top_k} onChange={(v) => set({ top_k: v })} />
    </>
  );
}

function ToolsTab({ agent, set }: P) {
  const s = useStudio();
  if (s.currentAgentId !== agent.id) return <p className="muted">Open this agent’s canvas to connect tools. Each agent has its own canvas.<br /><button className="btn" style={{ marginTop: 8 }} onClick={() => s.openCanvas(agent.id, { crumbs: [agent.id] })}>Open canvas</button></p>;
  const linked = (type: string, ref: string) => s.nodes.some((n) => n.type === type && (n.data as any).ref === ref);
  const appr = (ref: string) => (
    <label title="Require human approval before this runs"><small>approve</small>{" "}
      <input type="checkbox" aria-label={`Require approval for ${ref}`} checked={agent.approvals.includes(ref)}
        onChange={(e) => set({ approvals: e.target.checked ? [...agent.approvals, ref] : agent.approvals.filter((x) => x !== ref) })} /></label>
  );
  return (
    <>
      {s.mcp.filter((m) => !s.isHidden("mcp", m.id)).map((m) => (
        <div key={m.id}>
          <h4 className="sec">{m.name}</h4>
          {m.tools.map((t) => {
            const ref = `${m.id}.${t.name}`;
            return (
              <div className="chk" key={ref}>
                <input type="checkbox" aria-label={`Use ${t.name}`} checked={linked("tool", ref)} onChange={(e) => s.toggleLink("tools", ref, e.target.checked)} />
                <span>{t.name}</span><span className={`badge ${t.mode === "write" ? "w" : ""}`}>{t.mode}</span><span className="sp" />{appr(ref)}
              </div>
            );
          })}
        </div>
      ))}
      {Object.entries(s.endpoints.filter((e) => !s.isHidden("endpoint", e.id)).reduce<Record<string, typeof s.endpoints>>((acc, e) => { (acc[e.collection] ||= []).push(e); return acc; }, {})).map(([c, list]) => (
        <div key={c}>
          <h4 className="sec">{c}</h4>
          {list.map((e) => (
            <div className="chk" key={e.id}>
              <input type="checkbox" aria-label={`Use ${e.name}`} checked={linked("endpoint", e.id)} onChange={(ev) => s.toggleLink("endpoints", e.id, ev.target.checked)} />
              <span>{e.name}</span><span className={`badge ${e.mode === "write" ? "w" : ""}`}>{e.method}</span><span className="sp" />{appr(e.id)}
            </div>
          ))}
        </div>
      ))}
      <p className="muted" style={{ fontSize: 12 }}>Checking a box adds the connection on this agent’s canvas; write tools should usually require approval.</p>
    </>
  );
}

const GUARDS: [string, string, string][] = [
  ["pii", "PII redaction", "Masks emails, phone and card numbers in inputs and outputs"],
  ["injection", "Prompt-injection defense", "Stops instructions that try to override the agent"],
  ["toxicity", "Toxicity filter", "Flags abusive language"],
  ["topics", "Topic restrictions", "Keep the agent on allowed topics (engine pending)"],
  ["schema", "Output schema validation", "Reject malformed responses (engine pending)"],
];
function Guardrails({ agent, set }: P) {
  return (
    <>
      {GUARDS.map(([k, l, d]) => (
        <div className="chk" key={k}>
          <div><div>{l}</div><small>{d}</small></div><span className="sp" />
          <select className="select" style={{ width: 90 }} aria-label={`${l} mode`} value={agent.guardrails[k] ?? "off"} onChange={(e) => set({ guardrails: { ...agent.guardrails, [k]: e.target.value as GuardMode } })}>
            {["off", "log", "warn", "block"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
      ))}
    </>
  );
}

function Access({ agent, set }: P) {
  const [who, setWho] = useState("");
  return (
    <>
      <p className="muted" style={{ fontSize: 12 }}><b>Admin</b> edits, deletes and manages access · <b>Executor</b> runs and approves · <b>Viewer</b> read-only. Enforced by the API.</p>
      <table>
        <thead><tr><th>User / group</th><th>Role</th><th /></tr></thead>
        <tbody>{agent.roles.map((r, i) => (
          <tr key={i}><td>{r.who}</td>
            <td><select className="select" aria-label={`Role for ${r.who}`} value={r.role} onChange={(e) => set({ roles: agent.roles.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })}>{["Admin", "Executor", "Viewer"].map((o) => <option key={o}>{o}</option>)}</select></td>
            <td><button type="button" className="btn ghost danger" onClick={() => set({ roles: agent.roles.filter((_, j) => j !== i) })}>Remove</button></td></tr>
        ))}</tbody>
      </table>
      <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const v = who.trim(); if (v) set({ roles: [...agent.roles, { who: v, role: "Executor" }] }); setWho(""); }}>
        <input className="input" placeholder="email or group" aria-label="Add user or group" value={who} onChange={(e) => setWho(e.target.value)} /><button className="btn">Add</button>
      </form>
    </>
  );
}

function Memory({ agent, set }: P) {
  const m = agent.memory;
  const up = (p: Partial<Agent["memory"]>) => set({ memory: { ...m, ...p } });
  return (
    <>
      <div className="chk"><div>Short-term (session)</div><span className="sp" /><input type="checkbox" aria-label="Short-term memory" checked={m.short} onChange={(e) => up({ short: e.target.checked })} /></div>
      <div className="chk"><div>Long-term (persistent)</div><span className="sp" /><input type="checkbox" aria-label="Long-term memory" checked={m.long} onChange={(e) => up({ long: e.target.checked })} /></div>
      <h4 className="sec">Storage</h4>
      <label className="f">Backend<select className="select" value={m.backend} onChange={(e) => up({ backend: e.target.value })}>{["Vector DB", "Key-value", "SQL"].map((o) => <option key={o}>{o}</option>)}</select></label>
      <label className="f">Retention (days)<input className="input" type="number" min={1} max={3650} value={m.retention} onChange={(e) => up({ retention: Math.max(1, +e.target.value || 1) })} /></label>
      <label className="f">Max entries<input className="input" type="number" min={1} value={m.max} onChange={(e) => up({ max: Math.max(1, +e.target.value || 1) })} /></label>
      <p className="muted" style={{ fontSize: 12 }}>These settings are stored; memory backends are applied by the runtime executor (pending).</p>
    </>
  );
}

function Observe({ agent }: { agent: Agent }) {
  const [st, setSt] = useState<Stats | null>(null);
  const load = () => api<Stats>(`/agents/${agent.id}/stats`).then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, [agent.id]);
  if (!st) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...st.tokens_by_day.map((d) => d.tokens));
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn ghost" onClick={load}><RefreshCw size={13} /> Refresh</button></div>
      <div className="stat">
        <div className="card"><b>{st.sessions}</b><small>Sessions</small></div>
        <div className="card"><b>{st.tokens.toLocaleString()}</b><small>Tokens</small></div>
        <div className="card"><b>{st.avg_latency_ms} ms</b><small>Avg latency</small></div>
        <div className="card"><b>${st.est_cost_usd}</b><small>Est. cost (illustrative)</small></div>
      </div>
      <h4 className="sec">Tokens per day</h4>
      {st.tokens_by_day.length ? <div className="bars" role="img" aria-label="Tokens per day">{st.tokens_by_day.map((d) => <i key={d.day} title={`${d.day}: ${d.tokens}`} style={{ height: `${(d.tokens / max) * 100}%` }} />)}</div> : <p className="muted">No runs yet. Use Run to generate data.</p>}
      <h4 className="sec">Tool calls</h4>
      <table><tbody>{st.tools.map((t) => <tr key={t.name}><td>{t.name}</td><td>{t.calls} calls</td><td>{Math.round((t.ok / t.calls) * 100)}% ok</td></tr>)}
        {!st.tools.length && <tr><td className="muted">No tool calls yet</td></tr>}</tbody></table>
      <p className="muted" style={{ fontSize: 12 }}>Blocked runs: {st.blocked}</p>
    </>
  );
}
