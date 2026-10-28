"use client";
import { useState } from "react";
import { Bot, Check, Globe, Hand, ShieldAlert, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import type { Run, Step } from "@/lib/types";

export const STATUS_LABEL: Record<string, string> = { completed: "Completed", blocked: "Blocked", awaiting_approval: "Needs approval", running: "Running" };

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z").getTime();
  const sec = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

export function StatusPill({ status }: { status: string }) {
  const icon = status === "completed" ? <Check size={12} strokeWidth={3} /> : status === "blocked" ? <X size={12} strokeWidth={3} /> : status === "awaiting_approval" ? <Hand size={12} /> : null;
  return <span className={`spill ${status}`}>{icon}{STATUS_LABEL[status] ?? status}</span>;
}

const kindIcon = (k: string) => (k === "agent" ? <Bot size={14} /> : k === "tool" ? <Wrench size={14} /> : <Globe size={14} />);
function stepIcon(st: Step) {
  if (st.status === "done" || st.status === "approved") return <Check size={14} color="var(--ok)" strokeWidth={3} aria-label="succeeded" />;
  if (st.status === "blocked") return <X size={14} color="var(--danger)" strokeWidth={3} aria-label="blocked" />;
  if (st.status === "awaiting_approval") return <Hand size={14} color="var(--warn)" aria-label="awaiting approval" />;
  return <span className="idle" aria-label="not run" />;
}

/** Static step-by-step trace for a stored run, with Approve for paused steps. */
export function RunTrace({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const s = useStudio();
  const [exp, setExp] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (i: number) => setExp((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const approve = async (i: number) => {
    setBusy(true);
    try { onChange(await api<Run>(`/runs/${run.id}/steps/${i}/approve`, { method: "POST" })); s.refreshAwaiting(); s.toast("Approved. The run continued."); }
    catch (e: any) { s.toast(e.message, { err: true }); } finally { setBusy(false); }
  };
  return (
    <div className="rtrace">
      {run.steps.map((st, i) => {
        const open = exp.has(i);
        return (
          <div key={i} className="tstep" style={{ marginLeft: st.depth * 16 }}>
            <div className="trow" role="button" tabIndex={0} aria-expanded={open} onClick={() => toggle(i)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(i))}>
              {stepIcon(st)}{kindIcon(st.kind)}<b>{st.label}</b>
              {st.findings?.map((f, j) => <span key={j} className="badge warn" title={f.detail}><ShieldAlert size={10} /> {f.rule}:{f.mode}</span>)}
              {st.ms != null && <span className="ms">{st.ms} ms</span>}
            </div>
            {st.status === "awaiting_approval" && s.canRun() && (
              <button className="btn pri sm" disabled={busy} onClick={() => approve(i)}><Hand size={13} /> Approve and continue</button>
            )}
            {st.status === "awaiting_approval" && !s.canRun() && <span className="muted" style={{ fontSize: 12, marginLeft: 20 }}>Waiting for an executor or admin to approve.</span>}
            {open && (
              <dl className="tdetail">
                <dt>Status</dt><dd>{st.status.replace("_", " ")}</dd>
                {st.tokens != null && <><dt>Tokens</dt><dd>{st.tokens}</dd></>}
                {(st as any).output && <><dt>Output</dt><dd>{(st as any).output}</dd></>}
                {st.findings?.length ? <><dt>Guardrails</dt><dd>{st.findings.map((f) => `${f.rule}:${f.mode} — ${f.detail}`).join("; ")}</dd></> : null}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
