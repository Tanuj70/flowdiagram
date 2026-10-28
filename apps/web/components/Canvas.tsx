"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, type Connection, type Edge, type Node, type OnConnectEnd } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Plus, Redo2, Sparkles, Undo2 } from "lucide-react";
import { AgentNode, EndpointNode, GhostNode, ToolNode } from "./Nodes";
import { PulseEdge } from "./PulseEdge";
import { ROOT, SOCKET_TARGET, useStudio } from "@/lib/store";
import type { Socket } from "@/lib/types";

const nodeTypes = { agent: AgentNode, tool: ToolNode, endpoint: EndpointNode, ghost: GhostNode };
const edgeTypes = { pulse: PulseEdge };
/** Semantic zoom: far = big names only, mid = trimmed detail, near = everything. */
const bucketOf = (z: number) => (z < 0.55 ? "far" : z < 0.8 ? "mid" : "near");

const keyOfNode = (n?: Node) => (n ? `${n.type}:${(n.data as any).ref}` : "");

export function Canvas() {
  const s = useStudio();
  const rf = useReactFlow();
  const [zb, setZb] = useState("near");
  // Derived (non-store) nodes must carry their own measured size back into React Flow, or their handles never register.
  const [gdims, setGdims] = useState<Record<string, { width: number; height: number }>>({});

  const isGone = useCallback((n: Node) => {
    const ref = (n.data as any).ref as string;
    if (n.type === "agent") return s.hidden.includes(`agent:${ref}`);
    if (n.type === "tool") return s.hidden.includes(`mcp:${ref.split(".")[0]}`);
    return s.hidden.includes(`endpoint:${ref}`);
  }, [s.hidden]);

  const nodes = useMemo(() => s.nodes.filter((n) => !isGone(n)), [s.nodes, isGone]);
  const edges = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return s.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => {
      const sock = (e.data as any).socket as Socket;
      const tgtKey = keyOfNode(s.nodes.find((n) => n.id === e.target));
      const tgtState = s.runStates[tgtKey];
      const cls = [`sock-${sock}`, sock !== "agents" ? "cap" : "", tgtState === "done" ? "ok" : tgtState === "blocked" || tgtState === "failed" ? "bad" : ""].join(" ");
      const active = !!s.activeKey && tgtKey === s.activeKey;
      return { ...e, type: "pulse", className: cls, animated: active, data: { ...(e.data as any), active } } as Edge;
    });
  }, [nodes, s.edges, s.nodes, s.runStates, s.activeKey]);

  // Expanded view: each sub-agent's own tools/endpoints are shown under its card, at the positions they have on ITS canvas.
  // They are live: drag to move, hover toolbar to inspect/remove, and every change is saved to that sub-agent.
  const [gpos, setGpos] = useState<Record<string, { x: number; y: number }>>({});
  const gposRef = useRef<Record<string, { x: number; y: number }>>({});
  const expandedRefs = useMemo(
    () => nodes.filter((n) => n.type === "agent" && n.id !== ROOT && (s.expanded[n.id] ?? s.detailLevel) === "expanded").map((n) => (n.data as any).ref as string),
    [nodes, s.expanded, s.detailLevel],
  );
  useEffect(() => {
    expandedRefs.forEach((ref) => {
      if (s.overview[ref] && (!s.subGraphs[ref] || s.subSig[ref] !== JSON.stringify(s.overview[ref]))) s.loadSubGraph(ref);
    });
  }, [expandedRefs, s.overview, s.subGraphs, s.subSig]);  // eslint-disable-line react-hooks/exhaustive-deps

  const ghosts = useMemo(() => {
    const gn: Node[] = [], ge: Edge[] = [];
    nodes.filter((n) => n.type === "agent" && n.id !== ROOT).forEach((n) => {
      if ((s.expanded[n.id] ?? s.detailLevel) !== "expanded") return;
      const ref = (n.data as any).ref as string;
      const sg = s.subGraphs[ref];
      const sroot = sg?.nodes.find((x) => x.id === ROOT);
      if (!sg || !sroot) return;
      const cardH = n.measured?.height ?? 130;
      sg.nodes.filter((l) => l.id !== ROOT && (l.type === "tool" || l.type === "endpoint")).forEach((l) => {
        if (l.type === "tool" ? s.hidden.includes(`mcp:${l.ref.split(".")[0]}`) : s.hidden.includes(`endpoint:${l.ref}`)) return;
        const id = `g_${n.id}_${l.id}`;
        const pos = gpos[id] ?? { x: n.position.x + (l.x - sroot.x) - 30, y: n.position.y + cardH + 46 + (l.y - sroot.y - 260) };
        gn.push({ id, type: "ghost", position: pos, draggable: s.canEdit(), selectable: false, deletable: false, initialWidth: 100, initialHeight: 128, measured: gdims[id],
          data: { kind: l.type, ref: l.ref, parentRef: ref, parentNode: n.id, leafId: l.id } });
        const key = `${l.type}:${l.ref}`;
        const active = !!s.activeKey && key === s.activeKey;
        const st = s.runStates[key];
        ge.push({ id: `ve_${id}`, source: n.id, sourceHandle: "ghosts", target: id, targetHandle: "in", type: "pulse", animated: active, selectable: false, focusable: false, deletable: false,
          className: `sock-${l.type === "endpoint" ? "endpoints" : "tools"} cap ${st === "done" ? "ok" : st === "blocked" ? "bad" : ""}`, data: { socket: "tools", active } } as Edge);
      });
    });
    return { gn, ge };
  }, [nodes, s.expanded, s.detailLevel, s.subGraphs, s.hidden, s.runStates, s.activeKey, s.canEdit, gdims, gpos]);  // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle) return;
    const err = s.connect(c.source, c.target, c.sourceHandle as Socket);
    if (err) s.toast(err, { err: true });
  }, [s]);

  const isValid = useCallback((c: any) => {
    const t = useStudio.getState().nodes.find((n) => n.id === c.target);
    return c.source === ROOT && !!t && !!c.sourceHandle && t.type === SOCKET_TARGET[c.sourceHandle as Socket];
  }, []);

  // n8n-style: drag from a socket into empty space to pick something to add
  const onConnectEnd: OnConnectEnd = useCallback((ev, st) => {
    const h = st.fromHandle?.id;
    if (st.isValid || !h || !(h in SOCKET_TARGET)) return;
    const p = "changedTouches" in ev ? ev.changedTouches[0] : (ev as MouseEvent);
    s.setPicker({ tab: h as "agents" | "tools" | "endpoints", x: p.clientX, y: p.clientY });
  }, [s]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!s.canEdit() || !s.currentAgentId) return;
    const raw = e.dataTransfer.getData("application/x-studio");
    if (!raw) return;
    const { type, ref } = JSON.parse(raw) as { type: "agent" | "tool" | "endpoint"; ref: string };
    if (type === "agent" && ref === s.currentAgentId) return s.toast("An agent cannot be its own sub-agent", { err: true });
    if (type === "agent" && s.wouldLoop(ref)) return s.toast("Circular delegation is not allowed", { err: true });
    const pos = rf.screenToFlowPosition({ x: e.clientX - 60, y: e.clientY - 30 });
    const err = s.addAndConnect(type, ref, pos);
    if (err && err !== "Already connected") s.toast(err, { err: true });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const key = e.key.toLowerCase();
      if (key === "z") { e.preventDefault(); e.shiftKey ? useStudio.getState().redo() : useStudio.getState().undo(); }
      else if (key === "y") { e.preventDefault(); useStudio.getState().redo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const blank = nodes.length <= 1;
  const agent = s.agents.find((a) => a.id === s.currentAgentId);
  const open = (tab: "agents" | "tools" | "endpoints") => s.setPicker({ tab, x: 0, y: 0 });

  return (
    <div className={`canvas z-${zb}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {s.currentAgentId && (
        <ReactFlow
          key={s.currentAgentId}
          nodes={[...nodes, ...ghosts.gn]} edges={[...edges, ...ghosts.ge]} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onInit={(i) => setZb(bucketOf(i.getZoom()))} onMove={(_, vp) => setZb(bucketOf(vp.zoom))}
          onNodesChange={(changes) => {
            const isG = (c: any) => String(c.id).startsWith("g_");
            const dims = changes.filter((c: any) => c.type === "dimensions" && isG(c) && c.dimensions);
            if (dims.length) setGdims((prev) => {
              let next = prev;
              dims.forEach((c: any) => { const d = prev[c.id]; if (!d || d.width !== c.dimensions.width || d.height !== c.dimensions.height) next = { ...next, [c.id]: { width: c.dimensions.width, height: c.dimensions.height } }; });
              return next;
            });
            changes.filter((c: any) => c.type === "position" && isG(c)).forEach((c: any) => {
              if (c.position) { gposRef.current = { ...gposRef.current, [c.id]: c.position }; setGpos(gposRef.current); }
              if (c.dragging === false) {                       // drop: write the new place back to the sub-agent's own canvas
                const g = ghosts.gn.find((x) => x.id === c.id);
                const final = gposRef.current[c.id];
                if (g && final) {
                  const d = g.data as any;
                  const parent = s.nodes.find((x) => x.id === d.parentNode);
                  const sroot = s.subGraphs[d.parentRef]?.nodes.find((x) => x.id === ROOT);
                  if (parent && sroot) s.moveSubNode(d.parentRef, d.leafId, final.x - parent.position.x + sroot.x + 30, final.y - (parent.position.y + (parent.measured?.height ?? 130) + 46) + 260 + sroot.y);
                }
                const { [c.id]: _gone, ...rest } = gposRef.current;
                gposRef.current = rest; setGpos(rest);
              }
            });
            s.onNodesChange(changes.filter((c: any) => !isG(c)));
          }}
          onEdgesChange={s.onEdgesChange}
          onConnect={onConnect} onConnectEnd={onConnectEnd} isValidConnection={isValid}
          onNodeClick={(_, n) => {
            if (n.type === "ghost") {
              const d = n.data as { kind: string; ref: string };
              s.openDetail({ kind: d.kind === "tool" ? "mcp" : "endpoint", id: d.kind === "tool" ? d.ref.split(".")[0] : d.ref, tool: d.kind === "tool" ? d.ref.split(".").slice(1).join(".") : undefined });
              return;
            }
            s.clickNode(n);
          }} onPaneClick={() => s.setPicker(null)}
          nodesDraggable={s.canEdit()} nodesConnectable={s.canEdit()} deleteKeyCode={s.canEdit() ? ["Backspace", "Delete"] : null}
          fitView fitViewOptions={{ maxZoom: 1, padding: 0.2 }} minZoom={0.3} maxZoom={1.6}
          proOptions={{ hideAttribution: true }} colorMode={s.theme} zoomOnDoubleClick={false}
        >
          <Background gap={22} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable ariaLabel="Canvas minimap" />
        </ReactFlow>
      )}
      {s.currentAgentId && s.canEdit() && (
        <div className="canvasbar">
          <button className="roundbtn blue" aria-label="Add nodes" title="Add agents, tools or endpoints" onClick={() => open("tools")}><Plus size={20} /></button>
          <div className="seg" role="group" aria-label="History">
            <button aria-label="Undo (Ctrl/⌘ Z)" title="Undo (Ctrl/⌘ Z)" disabled={s.hist.u === 0} onClick={s.undo}><Undo2 size={15} /></button>
            <button aria-label="Redo (Ctrl/⌘ Shift Z)" title="Redo (Ctrl/⌘ Shift Z)" disabled={s.hist.r === 0} onClick={s.redo}><Redo2 size={15} /></button>
          </div>
          {nodes.some((n) => n.type === "agent" && n.id !== ROOT) && (
            <div className="seg lvl" role="group" aria-label="Sub-agent detail level">
              <button aria-pressed={s.detailLevel === "compact"} aria-selected={s.detailLevel === "compact"} onClick={() => s.setDetailLevel("compact")}>Compact</button>
              <button aria-pressed={s.detailLevel === "detailed"} aria-selected={s.detailLevel === "detailed"} onClick={() => s.setDetailLevel("detailed")}>Detailed</button>
              <button aria-pressed={s.detailLevel === "expanded"} aria-selected={s.detailLevel === "expanded"} onClick={() => s.setDetailLevel("expanded")} title="Show each sub-agent's tools hanging underneath">Expanded</button>
            </div>
          )}
        </div>
      )}
      {!s.currentAgentId && (
        <div className="empty">
          <div>
            <Bot size={34} />
            <h3>Create your first agent</h3>
            <p className="muted">Each agent gets its own canvas for sub-agents, MCP tools and endpoints.</p>
            {s.canEdit() && <button className="btn pri" onClick={() => s.createAgent()}>+ New agent</button>}
          </div>
        </div>
      )}
      {s.currentAgentId && blank && s.canEdit() && (
        <div className="buildhint" role="region" aria-label="Build this agent">
          <Sparkles size={18} />
          <div>
            <b>Build {agent?.name ?? "this agent"}</b>
            <p className="muted">Give it capabilities. Everything you add appears on this canvas.</p>
            <div className="hintbtns">
              <button className="btn" onClick={() => open("tools")}>＋ MCP tools</button>
              <button className="btn" onClick={() => open("endpoints")}>＋ API endpoints</button>
              <button className="btn" onClick={() => open("agents")}>＋ Sub-agents</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
