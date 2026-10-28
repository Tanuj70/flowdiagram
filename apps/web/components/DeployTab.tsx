"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Download, Info, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import type { Agent, ExportOptions, ExportResult } from "@/lib/types";

const DEFAULTS: ExportOptions = { project: "", location: "us-central1", repository: "agent-studio", model: "gemini-2.5-flash", min_instances: 1, max_instances: 10, cpu: "2", memory: "2Gi" };
const KEY = "deployOptions";

/** Generate a ready-to-deploy Agent Runtime package (ADK code + Dockerfile + Cloud Build + deploy script). Nothing is sent to Google Cloud. */
export function DeployTab({ agent }: { agent: Agent }) {
  const s = useStudio();
  const [o, setO] = useState<ExportOptions>(DEFAULTS);
  const [res, setRes] = useState<ExportResult | null>(null);
  const [file, setFile] = useState("agent.py");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v) setO({ ...DEFAULTS, ...v }); } catch {} }, []);
  useEffect(() => { setRes(null); setErr(""); }, [agent.id]);
  const set = (k: keyof ExportOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setO((p) => ({ ...p, [k]: ["min_instances", "max_instances"].includes(k) ? Number(e.target.value) : e.target.value }));
  const body = () => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} return JSON.stringify({ ...o, project: o.project || "your-project-id" }); };

  const generate = async () => {
    setBusy(true); setErr("");
    try { const r = await api<ExportResult>(`/agents/${agent.id}/export`, { method: "POST", body: body() }); setRes(r); setFile("agent.py"); }
    catch (e: any) { setErr(e.message); setRes(null); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/agents/${agent.id}/export.zip`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.detail === "string" ? j.detail : "Could not build the package"); }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-agent-runtime.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch { s.toast("Copy failed. Select the text manually.", { err: true }); }
  };
  const current = res?.files.find((f) => f.path === file);
  const worst = res?.mapping.filter((m) => m.status !== "exact").length ?? 0;

  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Generates the code, container and scripts to run <b>{agent.name}</b> (and its whole team) on <b>Agent Platform Runtime</b> with Cloud Build.
        Nothing is sent to Google Cloud from here; you run the deploy script yourself.
      </p>
      <div className="row"><label className="f" style={{ flex: 2 }}>Google Cloud project ID<input className="input" placeholder="my-gcp-project" value={o.project} onChange={set("project")} /></label>
        <label className="f" style={{ flex: 1 }}>Region<input className="input" value={o.location} onChange={set("location")} /></label></div>
      <div className="row"><label className="f" style={{ flex: 1 }}>Artifact Registry repo<input className="input" value={o.repository} onChange={set("repository")} /></label>
        <label className="f" style={{ flex: 1 }}>Model for non-Gemini agents<input className="input" value={o.model} onChange={set("model")} /></label></div>
      <div className="row">
        <label className="f" style={{ flex: 1 }}>Min instances<input className="input" type="number" min={0} max={75} value={o.min_instances} onChange={set("min_instances")} /></label>
        <label className="f" style={{ flex: 1 }}>Max instances<input className="input" type="number" min={1} max={1000} value={o.max_instances} onChange={set("max_instances")} /></label>
        <label className="f" style={{ flex: 1 }}>CPU<select className="select" value={o.cpu} onChange={set("cpu")}>{["1", "2", "4", "6", "8"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f" style={{ flex: 1 }}>Memory<input className="input" value={o.memory} onChange={set("memory")} /></label>
      </div>
      {!s.canEdit() && <p className="muted" style={{ fontSize: 12.5 }}>Only admins can generate deployment packages (they contain prompts and server URLs).</p>}
      <div className="dactions">
        <button type="button" className="btn pri" disabled={busy} onClick={generate}><Rocket size={14} /> {busy ? "Working…" : "Generate package"}</button>
        <button type="button" className="btn" disabled={busy} onClick={download}><Download size={14} /> Download .zip</button>
      </div>
      {err && <p role="alert" className="testres bad">{err}</p>}

      {res && (
        <>
          <div className="chips" style={{ margin: "6px 0 10px" }}>
            <span className="badge">{res.summary.agents} agents</span><span className="badge">{res.summary.mcp_servers} MCP servers · {res.summary.tools} tools</span>
            <span className="badge">{res.summary.endpoints} endpoints</span><span className="badge">ADK {res.summary.adk_version}</span>
          </div>

          <h4 className="sec">Check before you deploy ({res.warnings.filter((w) => w.level === "warn").length} warnings)</h4>
          <ul className="warnlist">
            {res.warnings.map((w, i) => (
              <li key={i} className={w.level}>{w.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}<span><b>{w.area}.</b> {w.text}</span></li>
            ))}
          </ul>

          <h4 className="sec">What maps exactly ({res.mapping.length - worst} of {res.mapping.length})</h4>
          <table className="maptable"><tbody>
            {res.mapping.map((m) => (
              <tr key={m.area}><td>{m.area}</td><td><span className={`mstat ${m.status.replace(" ", "")}`}>{m.status}</span></td><td className="muted">{m.note}</td></tr>
            ))}
          </tbody></table>

          <h4 className="sec">Commands</h4>
          <div className="codebox cmds">
            {res.commands.map((c) => <div key={c}><code>{c}</code></div>)}
            <button type="button" className="btn sm" style={{ margin: "8px 0 0" }} onClick={() => copy(res.commands.join("\n"), "cmds")}>{copied === "cmds" ? <Check size={13} /> : <Copy size={13} />} Copy all</button>
          </div>

          <h4 className="sec">Files</h4>
          <div className="filechips" role="tablist" aria-label="Generated files">
            {res.files.map((f) => <button key={f.path} role="tab" aria-selected={file === f.path} onClick={() => setFile(f.path)}>{f.path}</button>)}
          </div>
          {current && (
            <div className="codewrap">
              <div className="codebar"><code>{current.path}</code><span className="muted">{(current.size / 1024).toFixed(1)} KB</span>
                <button type="button" className="btn sm" style={{ margin: 0 }} onClick={() => copy(current.content, current.path)} aria-label={`Copy ${current.path}`}>{copied === current.path ? <Check size={13} /> : <Copy size={13} />} Copy</button>
              </div>
              <div className="codebox"><pre tabIndex={0} aria-label={`Contents of ${current.path}`}>{current.content}</pre></div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>This package has <b>not</b> been deployed by Agent Studio. Read the generated code first, and never commit a <code>.env</code> file.</p>
        </>
      )}
    </>
  );
}
