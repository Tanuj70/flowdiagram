"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Cable, CornerDownLeft, Globe, Hand, History, LogOut, MessageSquare, Moon, Plus, Search, Sun, Wrench, Layers } from "lucide-react";
import { Icon } from "@/lib/icons";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";

interface Cmd { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void; keywords?: string }

/** ⌘K / Ctrl+K: jump to any agent, MCP server, tool or endpoint, or run an action. */
export function CommandPalette() {
  const s = useStudio();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const open = s.paletteOpen;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); useStudio.getState().setPalette(!useStudio.getState().paletteOpen); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    const admin = s.canEdit();
    const go = (p: string) => () => router.push(p);
    out.push(
      { id: "nav-agents", group: "Go to", label: "Agents (canvas)", icon: <Bot size={16} />, run: go("/"), keywords: "canvas workspace" },
      { id: "nav-mcp", group: "Go to", label: "MCP servers", icon: <Cable size={16} />, run: go("/mcp"), keywords: "tools gallery" },
      { id: "nav-ep", group: "Go to", label: "API endpoints", icon: <Globe size={16} />, run: go("/endpoints"), keywords: "api gallery" },
      { id: "nav-runs", group: "Go to", label: "Runs (history)", icon: <History size={16} />, run: go("/runs"), keywords: "history traces" },
      { id: "nav-appr", group: "Go to", label: "Approvals inbox", hint: s.awaiting ? `${s.awaiting} waiting` : undefined, icon: <Hand size={16} />, run: go("/runs?status=awaiting_approval"), keywords: "approve review pending" },
      ...(s.currentAgentId && admin ? [
        { id: "undo", group: "This canvas", label: "Undo", hint: "Ctrl/⌘ Z", icon: <Layers size={16} />, run: () => { router.push("/"); s.undo(); } },
        { id: "redo", group: "This canvas", label: "Redo", hint: "Ctrl/⌘ Shift Z", icon: <Layers size={16} />, run: () => { router.push("/"); s.redo(); } },
      ] : []),
    );
    s.agents.filter((a) => !s.isHidden("agent", a.id)).forEach((a) => {
      out.push({ id: "a-" + a.id, group: "Agents", label: a.name, hint: "Open canvas", icon: <Icon name={a.icon} size={16} />, keywords: a.description, run: () => s.openCanvasPage(a.id) });
      out.push({ id: "as-" + a.id, group: "Agents", label: `${a.name} settings`, hint: "Settings", icon: <Icon name={a.icon} size={16} />, keywords: "model guardrails memory access", run: async () => { await s.openCanvasPage(a.id); s.openSettings("General"); } });
    });
    s.mcp.filter((m) => !s.isHidden("mcp", m.id)).forEach((m) => {
      out.push({ id: "m-" + m.id, group: "MCP servers", label: m.name, hint: `${m.tools.length} tools`, icon: <Icon name={m.icon} size={16} />, keywords: m.tags.join(" ") + " " + m.description, run: go(`/mcp/${m.id}`) });
      m.tools.forEach((t) => out.push({ id: `t-${m.id}-${t.name}`, group: "Tools", label: t.name, hint: m.name, icon: <Wrench size={16} />, keywords: t.description + " " + t.mode, run: go(`/mcp/${m.id}`) }));
    });
    s.endpoints.filter((e) => !s.isHidden("endpoint", e.id)).forEach((e) => out.push({ id: "e-" + e.id, group: "Endpoints", label: e.name, hint: `${e.method} · ${e.collection}`, icon: <Globe size={16} />, keywords: e.url + " " + e.method, run: go(`/endpoints/${e.id}`) }));
    if (admin) {
      out.push(
        { id: "new-agent", group: "Actions", label: "New agent", icon: <Plus size={16} />, run: () => { router.push("/"); s.createAgent(); }, keywords: "create build" },
        { id: "new-mcp", group: "Actions", label: "Add MCP server", icon: <Plus size={16} />, run: () => s.setModal({ kind: "mcp" }), keywords: "create connect" },
        { id: "new-ep", group: "Actions", label: "Add API endpoint", icon: <Plus size={16} />, run: () => s.setModal({ kind: "endpoint" }), keywords: "create" },
      );
      if (s.currentAgentId) out.push(
        { id: "add-tools", group: "This canvas", label: "Add MCP tools to this canvas", icon: <Layers size={16} />, run: () => { router.push("/"); s.setPicker({ tab: "tools", x: 0, y: 0 }); } },
        { id: "add-eps", group: "This canvas", label: "Add API endpoints to this canvas", icon: <Layers size={16} />, run: () => { router.push("/"); s.setPicker({ tab: "endpoints", x: 0, y: 0 }); } },
        { id: "add-agents", group: "This canvas", label: "Add sub-agents to this canvas", icon: <Layers size={16} />, run: () => { router.push("/"); s.setPicker({ tab: "agents", x: 0, y: 0 }); } },
      );
    }
    out.push(
      { id: "chat", group: "Actions", label: "Toggle chat", icon: <MessageSquare size={16} />, run: () => { router.push("/"); s.setPane(s.pane === "chat" ? null : "chat"); } },
      { id: "theme", group: "Actions", label: s.theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: s.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, run: () => s.setTheme(s.theme === "dark" ? "light" : "dark"), keywords: "appearance" },
      { id: "level", group: "Actions", label: `Sub-agent cards: ${s.detailLevel === "compact" ? "show details" : s.detailLevel === "detailed" ? "expand with tools" : "make compact"}`, icon: <Layers size={16} />, run: () => s.setDetailLevel(s.detailLevel === "compact" ? "detailed" : s.detailLevel === "detailed" ? "expanded" : "compact") },
      { id: "logout", group: "Actions", label: "Sign out", icon: <LogOut size={16} />, run: async () => { await api("/auth/logout", { method: "POST" }); window.location.href = "/login"; } },
    );
    return out;
  }, [s.agents, s.mcp, s.endpoints, s.hidden, s.theme, s.detailLevel, s.currentAgentId, s.pane, s.user, s.awaiting]);  // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return cmds.filter((c) => ["Go to", "Actions", "This canvas", "Agents"].includes(c.group) && !c.id.startsWith("as-")).slice(0, 14);
    const score = (c: Cmd) => {
      const l = c.label.toLowerCase(), hay = `${l} ${(c.hint ?? "").toLowerCase()} ${(c.keywords ?? "").toLowerCase()} ${c.group.toLowerCase()}`;
      if (!toks.every((t) => hay.includes(t))) return -1;
      return toks.reduce((n, t) => n + (l.startsWith(t) ? 3 : l.includes(t) ? 2 : 1), 0);
    };
    return cmds.map((c) => [c, score(c)] as const).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 30);
  }, [cmds, q]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" }); }, [i]);
  if (!open) return null;
  const close = () => s.setPalette(false);
  const run = (c?: Cmd) => { if (!c) return; close(); setTimeout(c.run, 0); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(shown.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(shown[i]); }
    else if (e.key === "Escape") close();
  };
  let last = "";
  return (
    <div className="modal-bg pal-bg" onClick={close} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="pal-in"><Search size={17} />
          <input autoFocus role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={shown[i] ? `pal-${shown[i].id}` : undefined} placeholder="Search agents, servers, tools, endpoints, or type a command…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={list}>
          {shown.map((c, n) => {
            const head = c.group !== last; last = c.group;
            return (
              <div key={c.id}>
                {head && <div className="pal-grp">{c.group}</div>}
                <div id={`pal-${c.id}`} data-i={n} role="option" aria-selected={n === i} className={`pal-item ${n === i ? "on" : ""}`} onMouseMove={() => setI(n)} onClick={() => run(c)}>
                  <span className="pal-ic">{c.icon}</span><span className="pal-lb">{c.label}</span>{c.hint && <span className="pal-hint">{c.hint}</span>}
                  {n === i && <CornerDownLeft size={13} className="muted" />}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted" style={{ padding: 20, textAlign: "center" }}>No results for “{q}”.</p>}
        </div>
        <div className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>⌘K</kbd> toggle</span></div>
      </div>
    </div>
  );
}
