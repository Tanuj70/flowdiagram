"use client";
import { useReactFlow } from "@xyflow/react";
import { ChevronRight, LayoutGrid, MessageSquare } from "lucide-react";
import { Canvas } from "./Canvas";
import { ChatPanel } from "./ChatPanel";
import { DetailPane } from "./DetailPane";
import { Drawer } from "./Drawer";
import { Topbar } from "./Topbar";
import { useStudio } from "@/lib/store";

/** The agent canvas workspace (route "/"). */
export function Workspace() {
  const s = useStudio();
  const rf = useReactFlow();
  const label = { idle: "", saving: "Saving…", saved: "All changes saved", error: "Save failed" }[s.saving];
  return (
    <>
      <Topbar
        left={
          <>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span className="muted">Agents</span>
              {s.crumbs.map((id, i) => {
                const a = s.agents.find((x) => x.id === id);
                if (!a) return null;
                const last = i === s.crumbs.length - 1;
                return (
                  <span key={id + i} className="crumb">
                    <ChevronRight size={14} className="muted" />
                    {last ? <b aria-current="page">{a.name}</b> : <button className="linkbtn" onClick={() => s.openCanvas(id, { crumbs: s.crumbs.slice(0, i + 1) })}>{a.name}</button>}
                  </span>
                );
              })}
            </nav>
            <span className="muted" role="status" style={{ fontSize: 12 }}>{label}</span>
          </>
        }
        actions={
          <>
            {s.canEdit() && s.currentAgentId && <button className="btn" onClick={() => { s.autoLayout(); setTimeout(() => rf.fitView({ duration: 300, maxZoom: 1 }), 50); }}><LayoutGrid size={14} /> Auto-layout</button>}
            <button className="btn pri" onClick={() => s.setPane(s.pane === "chat" ? null : "chat")} aria-pressed={s.pane === "chat"}><MessageSquare size={14} /> Chat</button>
          </>
        }
      />
      <div className="stage">
        <Canvas />
        {s.pane === null && <button className="fab" aria-label="Open chat" title="Chat with an agent" onClick={() => s.setPane("chat")}><MessageSquare size={22} /></button>}
        {s.pane === "chat" && <ChatPanel />}
        {s.pane === "settings" && <Drawer />}
        {s.pane === "detail" && <DetailPane />}
      </div>
    </>
  );
}
