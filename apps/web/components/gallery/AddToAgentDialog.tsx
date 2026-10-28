"use client";
import { useEffect, useState } from "react";
import { useStudio } from "@/lib/store";

/** Pick an agent (and which items) to add MCP tools or endpoints to. */
export function AddToAgentDialog() {
  const s = useStudio();
  const a = s.addTo;
  const [agentId, setAgentId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!a) return;
    setChecked(new Set(a.refs));
    const visible = s.agents.filter((x) => !s.isHidden("agent", x.id));
    setAgentId(s.currentAgentId && visible.some((x) => x.id === s.currentAgentId) ? s.currentAgentId : visible[0]?.id ?? "");
  }, [a]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  const label = (ref: string) => a.type === "tool" ? ref.split(".").slice(1).join(".") : s.endpoints.find((e) => e.id === ref)?.name ?? ref;
  const agents = s.agents.filter((x) => !s.isHidden("agent", x.id));
  const toggle = (r: string) => setChecked((p) => { const n = new Set(p); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const close = () => s.setAddTo(null);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); await s.addToAgent(agentId, a.type, [...checked]); close(); };
  return (
    <div className="modal-bg" onClick={close} role="presentation">
      <form className="modal" role="dialog" aria-modal="true" aria-label="Add to agent" onClick={(e) => e.stopPropagation()} onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h3>Add to an agent</h3>
        <label className="f">Agent
          <select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)} autoFocus>
            {agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{a.type === "tool" ? "Tools" : "Endpoints"} to add</p>
        <div className="pchecks">
          {a.refs.map((r) => (
            <label key={r} className="prow"><input type="checkbox" checked={checked.has(r)} onChange={() => toggle(r)} /><span className="pbody"><b>{label(r)}</b></span></label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button className="btn pri" disabled={!agentId || !checked.size}>Add {checked.size || ""}</button>
        </div>
      </form>
    </div>
  );
}
