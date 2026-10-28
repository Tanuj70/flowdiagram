"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";

const toLines = (tools: { name: string; mode: string; description: string }[]) => tools.map((t) => `${t.name}:${t.mode}${t.description ? ":" + t.description : ""}`).join("\n");

/** Add / edit dialog for MCP servers and API endpoints. */
export function Modals() {
  const s = useStudio();
  const m = s.modal;
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!m) return;
    if (m.kind === "mcp") {
      const x = m.editId ? s.mcp.find((y) => y.id === m.editId) : null;
      setF(x ? { name: x.name, url: x.url, description: x.description, tags: x.tags.join(", "), tools: toLines(x.tools) } : {});
    } else {
      const x = m.editId ? s.endpoints.find((y) => y.id === m.editId) : null;
      setF(x ? { name: x.name, url: x.url, method: x.method, auth: x.auth, mode: x.mode, collection: x.collection } : {});
    }
  }, [m]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  const editing = !!m.editId;
  const close = () => { s.setModal(null); setF({}); };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (m.kind === "mcp") {
        const old = m.editId ? s.mcp.find((x) => x.id === m.editId) : null;
        const tools = String(f.tools || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
          const [name, mode, ...desc] = l.split(":").map((x) => x.trim());
          return { name, mode: mode === "write" ? "write" : "read", description: desc.join(":"), input_schema: old?.tools.find((t) => t.name === name)?.input_schema ?? null };
        });
        const body = { name: f.name, url: f.url || "", description: f.description || "", tags: String(f.tags || "").split(",").map((t) => t.trim()).filter(Boolean), tools };
        await api(editing ? `/mcp/${m.editId}` : "/mcp", { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? body : { ...body, icon: "plug" }) });
      } else {
        const body = { name: f.name, method: f.method || "GET", url: f.url, auth: f.auth || "None", mode: f.mode || "read", collection: (f.collection || "General").trim() };
        await api(editing ? `/endpoints/${m.editId}` : "/endpoints", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      }
      await s.refreshAll();
      if (editing && s.currentAgentId) await s.openCanvas(s.currentAgentId, { crumbs: s.crumbs });
      s.toast(editing ? "Saved" : "Added");
      close();
    } catch (err: any) { s.toast(err.message, { err: true }); } finally { setBusy(false); }
  };

  const collections = [...new Set(s.endpoints.map((x) => x.collection))];
  return (
    <div className="modal-bg" onClick={close} role="presentation">
      <form className="modal" role="dialog" aria-modal="true" aria-label={`${editing ? "Edit" : "Add"} ${m.kind === "mcp" ? "MCP server" : "endpoint"}`} onClick={(e) => e.stopPropagation()} onSubmit={submit}
        onKeyDown={(e) => e.key === "Escape" && close()}>
        <h3>{editing ? "Edit" : "Add"} {m.kind === "mcp" ? "MCP server" : "API endpoint"}</h3>
        <label className="f">Name<input className="input" required autoFocus value={f.name || ""} onChange={set("name")} placeholder={m.kind === "mcp" ? "RAN MCP Server" : "Get order"} /></label>
        {m.kind === "mcp" ? (
          <>
            <label className="f">Server URL<input className="input" placeholder="https://mcp.example.com/sse" value={f.url || ""} onChange={set("url")} /></label>
            <label className="f">Description<input className="input" maxLength={500} value={f.description || ""} onChange={set("description")} /></label>
            <label className="f">Tags (comma separated)<input className="input" placeholder="RAN, Core" value={f.tags || ""} onChange={set("tags")} /></label>
            <label className="f">Tools (one per line: <code>name:read|write:description</code>)
              <textarea className="textarea" placeholder={"get_cell_status:read:Cell health\nrestart_cell:write:Restart a cell"} value={f.tools || ""} onChange={set("tools")} /></label>
            <p className="muted" style={{ fontSize: 12 }}>Automatic tool discovery from a live MCP server is planned; list tools manually for now. Removing a tool here also removes it from every canvas.</p>
          </>
        ) : (
          <>
            <label className="f">Collection<input className="input" list="collections" placeholder="Shop API" value={f.collection || ""} onChange={set("collection")} /><datalist id="collections">{collections.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="f">URL<input className="input" required type="url" placeholder="https://api.example.com/v1/items" value={f.url || ""} onChange={set("url")} /></label>
            <div className="row">
              <label className="f" style={{ flex: 1 }}>Method<select className="select" value={f.method || "GET"} onChange={set("method")}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="f" style={{ flex: 1 }}>Auth<select className="select" value={f.auth || "None"} onChange={set("auth")}>{["None", "Bearer", "API key", "Basic"].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="f" style={{ flex: 1 }}>Access<select className="select" value={f.mode || "read"} onChange={set("mode")}><option>read</option><option>write</option></select></label>
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button className="btn pri" disabled={busy}>{busy ? "Saving…" : editing ? "Save" : "Add"}</button>
        </div>
      </form>
    </div>
  );
}

/** Delete confirmation that shows exactly what will be affected. A deleted item can be undone for 8 seconds. */
export function ConfirmDelete() {
  const s = useStudio();
  const c = s.confirm;
  if (!c) return null;
  const what = c.kind === "agent" ? "agent" : c.kind === "mcp" ? "MCP server" : "endpoint";
  return (
    <div className="modal-bg" onClick={s.cancelConfirm} role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={`Delete ${what}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && s.cancelConfirm()}>
        <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={20} color="var(--warn)" /> Delete “{c.name}”?</h3>
        {c.used_by.length ? (
          <>
            <p>This {what} is used by <b>{c.used_by.length}</b> {c.used_by.length === 1 ? "agent" : "agents"}. It will be removed from their canvases:</p>
            <ul className="impact">{c.used_by.map((u) => <li key={u.id}><b>{u.name}</b><span className="muted"> — {u.refs.map((r) => r.split(".").slice(-1)[0]).join(", ")}</span></li>)}</ul>
          </>
        ) : <p className="muted">Not used on any canvas.</p>}
        {c.kind === "agent" && <p className="muted" style={{ fontSize: 12 }}>Its own canvas and settings are deleted too. Run history is kept.</p>}
        {c.kind !== "agent" && <p className="muted" style={{ fontSize: 12 }}>Approvals that reference it are removed as well.</p>}
        <p className="muted" style={{ fontSize: 12 }}>You will have 8 seconds to undo after deleting.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" autoFocus onClick={s.cancelConfirm}>Cancel</button>
          <button className="btn pri danger-fill" onClick={s.confirmDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}
