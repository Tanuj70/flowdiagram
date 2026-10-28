"use client";
import { useState } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { ArrowUpRight, Brain, Check, ChevronDown, Globe, Hand, Info, Loader2, Plus, Settings2, Trash2, Wrench, X } from "lucide-react";
import { Icon } from "@/lib/icons";
import { ProviderMark } from "@/lib/providers";
import { NEXT_LEVEL, ROOT, useStudio, type DetailLevel } from "@/lib/store";
import type { Socket } from "@/lib/types";

/** Run-state badge: shape + colour (tick / cross / hand / spinner) so it never relies on colour alone. */
export function RunBadge({ state }: { state?: string }) {
  if (!state || state === "pending") return null;
  const m: Record<string, { cls: string; label: string; el: React.ReactNode }> = {
    running: { cls: "running", label: "Running", el: <Loader2 size={13} className="spin" /> },
    done: { cls: "done", label: "Succeeded", el: <Check size={14} strokeWidth={3} /> },
    blocked: { cls: "failed", label: "Blocked by guardrail", el: <X size={14} strokeWidth={3} /> },
    failed: { cls: "failed", label: "Failed", el: <X size={14} strokeWidth={3} /> },
    awaiting_approval: { cls: "awaiting", label: "Waiting for approval", el: <Hand size={12} /> },
  };
  const b = m[state] ?? m.failed;
  return <span className={`runbadge ${b.cls}`} role="img" aria-label={b.label} title={b.label}>{b.el}</span>;
}

type TB = { label: string; icon: React.ReactNode; run: () => void; danger?: boolean };
/** Hover toolbar (like Flowise): quick actions on a node. */
function Toolbar({ show, items }: { show: boolean; items: TB[] }) {
  if (!items.length) return null;
  return (
    <NodeToolbar isVisible={show} position={Position.Top} offset={10} className="ntb">
      {items.map((t) => (
        <button key={t.label} className={`nodrag ${t.danger ? "danger" : ""}`} aria-label={t.label} title={t.label} onClick={(e) => { e.stopPropagation(); t.run(); }}>{t.icon}</button>
      ))}
    </NodeToolbar>
  );
}

const SOCKETS: { id: Socket; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "endpoints", label: "Endpoints" },
  { id: "agents", label: "Agents" },
];

function RootNode({ id, data, selected }: NodeProps) {
  const ref = (data as any).ref as string;
  const agent = useStudio((s) => s.agents.find((a) => a.id === ref));
  const edges = useStudio((s) => s.edges);
  const nodes = useStudio((s) => s.nodes);
  const hidden = useStudio((s) => s.hidden);
  const state = useStudio((s) => s.runStates[`agent:${ref}`]);
  const canEdit = useStudio((s) => s.canEdit());
  const setPicker = useStudio((s) => s.setPicker);
  const openSettings = useStudio((s) => s.openSettings);
  const select = useStudio((s) => s.setSelectedAgent);
  const [hover, setHover] = useState(false);
  if (!agent) return null;
  const count = (k: Socket) => edges.filter((e) => e.source === id && (e.data as any).socket === k && nodes.some((n) => n.id === e.target && !hidden.includes(`${n.type === "tool" ? "mcp" : n.type}:${n.type === "tool" ? String((n.data as any).ref).split(".")[0] : (n.data as any).ref}`))).length;
  return (
    <div className={`node agent ${selected ? "sel" : ""}`} data-run={state} role="group" aria-label={`Agent ${agent.name}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Toolbar show={hover || !!selected} items={[{ label: "Settings", icon: <Settings2 size={14} />, run: () => { select(ref); openSettings(); } }]} />
      <RunBadge state={state} />
      <div className="hd">
        <span className="tile big"><Icon name={agent.icon} size={24} /></span>
        <div className="t">
          <b>{agent.name}</b>
          <small>{agent.description || `${agent.framework} · ${agent.pattern}`}</small>
        </div>
        <span className={`dot ${agent.status}`} title={agent.status} />
      </div>
      <div className="chiprow">
        <button className="chipbtn nodrag" aria-label={`Model: ${agent.model}. Open model settings`} onClick={(e) => { e.stopPropagation(); select(ref); openSettings("Model"); }}>
          <ProviderMark model={agent.model} size={14} /> {agent.model.replace("claude-", "")}
        </button>
        <button className="chipbtn nodrag" aria-label="Open memory settings" onClick={(e) => { e.stopPropagation(); select(ref); openSettings("Memory"); }}>
          <Brain size={12} /> {agent.memory.long ? "Long-term" : agent.memory.short ? "Session" : "No memory"}
        </button>
        <span className="chipbtn static">{agent.pattern}</span>
      </div>
      <div className="sockets">
        {SOCKETS.map((s) => (
          <div key={s.id} className={`sock ${s.id}`}>
            <span className="sl">{s.label} · {count(s.id)}</span>
            {canEdit && (
              <button className="add nodrag" aria-label={`Add ${s.label.toLowerCase()} to ${agent.name}`}
                onClick={(e) => { e.stopPropagation(); setPicker({ tab: s.id, x: e.clientX, y: e.clientY }); }}>
                <Plus size={12} />
              </button>
            )}
            <Handle id={s.id} type="source" position={Position.Bottom} className={`dia h-${s.id}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact card for a sub-agent: model, tool icons and a way into its own canvas. */
function SubAgentNode({ id, data, selected }: NodeProps) {
  const ref = (data as any).ref as string;
  const agent = useStudio((s) => s.agents.find((a) => a.id === ref));
  const ov = useStudio((s) => s.overview[ref]);
  const mcp = useStudio((s) => s.mcp);
  const state = useStudio((s) => s.runStates[`agent:${ref}`]);
  const canEdit = useStudio((s) => s.canEdit());
  const openCanvas = useStudio((s) => s.openCanvas);
  const crumbs = useStudio((s) => s.crumbs);
  const remove = useStudio((s) => s.removeNode);
  const setPicker = useStudio((s) => s.setPicker);
  const select = useStudio((s) => s.setSelectedAgent);
  const openSettings = useStudio((s) => s.openSettings);
  const endpoints = useStudio((s) => s.endpoints);
  const agentsAll = useStudio((s) => s.agents);
  const level = useStudio((s) => s.detailLevel);
  const override = useStudio((s) => s.expanded[id]);
  const cycleCard = useStudio((s) => s.cycleCard);
  const [hover, setHover] = useState(false);
  if (!agent) return null;
  const lvl: DetailLevel = override ?? level;
  const expanded = lvl === "detailed";      // names listed inside the card
  const hanging = lvl === "expanded";       // tools hang underneath as read-only nodes
  const rows = [
    ...(ov?.tools ?? []).map((t) => { const [sid, ...r] = t.split("."); const m = mcp.find((x) => x.id === sid); const tool = m?.tools.find((x) => x.name === r.join(".")); return { k: t, kind: "Tool", icon: m?.icon ?? "wrench", name: r.join("."), sub: m?.name, write: tool?.mode === "write", appr: agent.approvals.includes(t) }; }),
    ...(ov?.endpoints ?? []).map((e) => { const ep = endpoints.find((x) => x.id === e); return { k: e, kind: "Endpoint", icon: "globe", name: ep?.name ?? e, sub: ep ? `${ep.method} · ${ep.collection}` : "", write: ep?.mode === "write", appr: agent.approvals.includes(e) }; }),
    ...(ov?.agents ?? []).map((a) => { const x = agentsAll.find((y) => y.id === a); return { k: a, kind: "Sub-agent", icon: x?.icon ?? "bot", name: x?.name ?? a, sub: "", write: false, appr: false }; }),
  ];
  const LIMIT = 6;
  const icons = [
    ...(ov?.tools ?? []).map((t) => ({ k: t, icon: mcp.find((m) => m.id === t.split(".")[0])?.icon ?? "wrench" })),
    ...(ov?.endpoints ?? []).map((e) => ({ k: e, icon: "globe" })),
  ];
  const open = () => openCanvas(ref, { crumbs: [...crumbs, ref] });
  const items: TB[] = [
    { label: "Open canvas", icon: <ArrowUpRight size={14} />, run: open },
    { label: "Settings", icon: <Info size={14} />, run: () => { select(ref); openSettings(); } },
    ...(canEdit ? [{ label: "Remove from this canvas", icon: <Trash2 size={14} />, run: () => remove(id), danger: true }] : []),
  ];
  return (
    <div className={`node sub ${selected ? "sel" : ""}`} data-run={state} role="group" aria-label={`Sub-agent ${agent.name}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onDoubleClick={open}>
      <Toolbar show={hover || !!selected} items={items} />
      <RunBadge state={state} />
      <Handle id="in" type="target" position={Position.Top} className="dia h-in" />
      <Handle id="ghosts" type="source" position={Position.Bottom} isConnectable={false} className="ghosth" />
      <div className="hd">
        <span className="tile"><Icon name={agent.icon} size={20} /></span>
        <div className="t"><b>{agent.name}</b><small>{agent.description}</small></div>
      </div>
      <div className="chiprow">
        <span className="chipbtn static"><ProviderMark model={agent.model} size={14} /> {agent.model.replace("claude-", "")}</span>
        <span className="chipbtn static"><Brain size={12} /> {agent.memory.long ? "Long-term" : agent.memory.short ? "Session" : "No memory"}</span>
      </div>
      {expanded && (
        <div className="subdetail" aria-label={`${agent.name} connections`}>
          {rows.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Nothing connected yet. Open its canvas to build.</p>}
          {rows.slice(0, LIMIT).map((r) => (
            <div key={r.kind + r.k} className="sdrow">
              <span className="mt"><Icon name={r.icon} size={12} /></span>
              <span className="sdname"><b>{r.name}</b>{r.sub && <small>{r.sub}</small>}</span>
              {r.write && <i className="badge w">write</i>}
              {r.appr && <span title="Requires human approval" aria-label="Requires human approval"><Hand size={12} /></span>}
              <span className="sdkind">{r.kind}</span>
            </div>
          ))}
          {rows.length > LIMIT && <button className="linkbtn nodrag" onClick={(e) => { e.stopPropagation(); open(); }}>+{rows.length - LIMIT} more · open canvas</button>}
        </div>
      )}
      <div className="subfoot">
        {expanded || hanging ? <span className="muted" style={{ fontSize: 11.5, flex: 1 }}>{rows.length} connection{rows.length === 1 ? "" : "s"}</span> : (
          <span className="iconrow" aria-label={`${icons.length} connections`}>
            {icons.slice(0, 4).map((i) => <span key={i.k} className="mt"><Icon name={i.icon} size={12} /></span>)}
            {icons.length > 4 && <span className="mt more">+{icons.length - 4}</span>}
            {icons.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No tools yet</span>}
            {(ov?.agents?.length ?? 0) > 0 && <span className="mt more" title="Sub-agents">{ov.agents.length} sub</span>}
          </span>
        )}
        {canEdit && <button className="addbtn nodrag" aria-label={`Add tools or endpoints to ${agent.name}`} title={`Add tools or endpoints to ${agent.name}`} onClick={(e) => { e.stopPropagation(); setPicker({ tab: "tools", x: 0, y: 0, target: ref }); }}><Plus size={13} /></button>}
        <button className="detbtn nodrag" aria-label={`Change view. Now ${lvl}; next: ${NEXT_LEVEL[lvl]}`} title={`View: ${lvl}. Click for ${NEXT_LEVEL[lvl]}`} onClick={(e) => { e.stopPropagation(); cycleCard(id, lvl); }}>
          {({ compact: "Details", detailed: "Expand", expanded: "Compact" } as Record<DetailLevel, string>)[lvl]} <ChevronDown size={12} style={{ transform: lvl === "expanded" ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>
        <button className="openbtn nodrag" onClick={(e) => { e.stopPropagation(); open(); }} aria-label={`Open canvas of ${agent.name}`}>Open <ArrowUpRight size={12} /></button>
      </div>
    </div>
  );
}

export function AgentNode(p: NodeProps) {
  return p.id === ROOT ? <RootNode {...p} /> : <SubAgentNode {...p} />;
}

/** Round hanging node for a tool or endpoint: icon circle, label underneath. */
function Round({ id, state, tone, icon, title, sub, badges, items }: { id: string; state?: string; tone: "tool" | "ep"; icon: React.ReactNode; title: string; sub?: string; badges?: React.ReactNode; items: TB[] }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="round" data-run={state} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Toolbar show={hover} items={items} />
      <Handle id="in" type="target" position={Position.Top} className="dia h-in" />
      <div className={`circ ${tone}`} data-run={state}>
        <RunBadge state={state} />
        {icon}
      </div>
      <b title={title}>{title}</b>
      {sub && <span className="muted" title={sub}>{sub}</span>}
      {badges}
    </div>
  );
}

function useLeafItems(id: string, kind: "mcp" | "endpoint", detailId: string, tool?: string): TB[] {
  const canEdit = useStudio((s) => s.canEdit());
  const remove = useStudio((s) => s.removeNode);
  const openDetail = useStudio((s) => s.openDetail);
  return [
    { label: "Details", icon: <Info size={14} />, run: () => openDetail({ kind, id: detailId, tool }) },
    ...(canEdit ? [{ label: "Remove from this canvas", icon: <Trash2 size={14} />, run: () => remove(id), danger: true }] : []),
  ];
}

export function ToolNode({ id, data }: NodeProps) {
  const ref = (data as any).ref as string;
  const [sid, ...rest] = ref.split(".");
  const name = rest.join(".");
  const server = useStudio((s) => s.mcp.find((m) => m.id === sid));
  const tool = server?.tools.find((t) => t.name === name);
  const needs = useStudio((s) => s.agents.some((a) => a.approvals.includes(ref)));
  const state = useStudio((s) => s.runStates[`tool:${ref}`]);
  const items = useLeafItems(id, "mcp", sid, name);
  return (
    <Round id={id} state={state} tone="tool" title={name} sub={server?.name ?? sid} items={items}
      icon={server ? <Icon name={server.icon} size={26} /> : <Wrench size={26} />}
      badges={<span className="mini">{tool?.mode === "write" && <i className="badge w">write</i>}{needs && <i title="Requires human approval" aria-label="Requires human approval"><Hand size={12} /></i>}</span>} />
  );
}

export function EndpointNode({ id, data }: NodeProps) {
  const ref = (data as any).ref as string;
  const ep = useStudio((s) => s.endpoints.find((e) => e.id === ref));
  const needs = useStudio((s) => s.agents.some((a) => a.approvals.includes(ref)));
  const state = useStudio((s) => s.runStates[`endpoint:${ref}`]);
  const items = useLeafItems(id, "endpoint", ref);
  return (
    <Round id={id} state={state} tone="ep" title={ep?.name ?? ref} sub={`${ep?.method ?? ""} · ${ep?.collection ?? ""}`} items={items}
      icon={<Globe size={26} />}
      badges={<span className="mini">{ep?.mode === "write" && <i className="badge w">write</i>}{needs && <i title="Requires human approval" aria-label="Requires human approval"><Hand size={12} /></i>}</span>} />
  );
}

/** A sub-agent's tool/endpoint shown under its card. It is a live view of that agent's own canvas: click, drag, remove. */
export function GhostNode({ data }: NodeProps) {
  const d = data as { kind: "tool" | "endpoint"; ref: string; parentRef: string; leafId: string };
  const server = useStudio((s) => (d.kind === "tool" ? s.mcp.find((m) => m.id === d.ref.split(".")[0]) : undefined));
  const ep = useStudio((s) => (d.kind === "endpoint" ? s.endpoints.find((e) => e.id === d.ref) : undefined));
  const state = useStudio((s) => s.runStates[`${d.kind}:${d.ref}`]);
  const needs = useStudio((s) => s.agents.some((a) => a.approvals.includes(d.ref)));
  const owner = useStudio((s) => s.agents.find((a) => a.id === d.parentRef)?.name ?? "agent");
  const canEdit = useStudio((s) => s.canEdit());
  const openDetail = useStudio((s) => s.openDetail);
  const remove = useStudio((s) => s.removeFromSub);
  const [hover, setHover] = useState(false);
  const toolName = d.kind === "tool" ? d.ref.split(".").slice(1).join(".") : "";
  const name = d.kind === "tool" ? toolName : ep?.name ?? d.ref;
  const sub = d.kind === "tool" ? server?.name ?? "" : `${ep?.method ?? ""} · ${ep?.collection ?? ""}`;
  const write = d.kind === "tool" ? server?.tools.find((t) => t.name === toolName)?.mode === "write" : ep?.mode === "write";
  const detail = () => openDetail({ kind: d.kind === "tool" ? "mcp" : "endpoint", id: d.kind === "tool" ? d.ref.split(".")[0] : d.ref, tool: d.kind === "tool" ? toolName : undefined });
  const items: TB[] = [
    { label: "Details", icon: <Info size={14} />, run: detail },
    ...(canEdit ? [{ label: `Remove from ${owner}`, icon: <Trash2 size={14} />, run: () => remove(d.parentRef, d.leafId), danger: true }] : []),
  ];
  return (
    <div className="round ghost" data-run={state} title={`${name} · ${sub}. Part of ${owner}'s canvas: click for details${canEdit ? ", drag to move" : ""}.`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Toolbar show={hover} items={items} />
      <Handle id="in" type="target" position={Position.Top} className="dia h-in" />
      <div className={`circ ghost ${d.kind === "tool" ? "tool" : "ep"}`} data-run={state}>
        <RunBadge state={state} />
        {d.kind === "tool" ? <Icon name={server?.icon ?? "wrench"} size={22} /> : <Globe size={22} />}
      </div>
      <b title={name}>{name}</b>
      {sub && <span className="muted" title={sub}>{sub}</span>}
      <span className="mini">{write && <i className="badge w">write</i>}{needs && <i title="Requires human approval" aria-label="Requires human approval"><Hand size={12} /></i>}</span>
    </div>
  );
}
