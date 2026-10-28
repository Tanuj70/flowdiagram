"use client";
import { create } from "zustand";
import { applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import { api } from "./api";
import type { Agent, ApiEdge, ApiNode, Endpoint, Mcp, Overview, Run, Socket, Usage, User } from "./types";

export type NodeKind = "agent" | "tool" | "endpoint";
export const SOCKET_TARGET: Record<Socket, NodeKind> = { agents: "agent", tools: "tool", endpoints: "endpoint" };
export const ROOT = "root";
/** Layout footprint per node, used to avoid overlaps. */
export const sizeOf = (id: string, type?: string) => (type === "agent" ? (id === ROOT ? { w: 360, h: 172 } : { w: 280, h: 170 }) : { w: 120, h: 100 });
const rid = () => Math.random().toString(36).slice(2, 10);

export interface ChatMsg { id: string; role: "user" | "assistant"; text: string; run?: Run; pending?: boolean; error?: string }
export type ThemeMode = "light" | "dark";
export type Pane = null | "settings" | "chat" | "detail";
export type DeleteKind = "agent" | "mcp" | "endpoint";
interface Toast { id: string; msg: string; err?: boolean; action?: { label: string; run: () => void } }
export interface PickerState { tab: "agents" | "tools" | "endpoints"; x: number; y: number; target?: string }
export interface SubGraph { nodes: ApiNode[]; edges: ApiEdge[] }
export interface ConfirmState { kind: DeleteKind; id: string; name: string; used_by: Usage[] }
export interface DetailState { kind: "mcp" | "endpoint"; id: string; tool?: string }
export interface ModalState { kind: "mcp" | "endpoint"; editId?: string }
export interface AddToState { type: "tool" | "endpoint"; refs: string[] }
export type DetailLevel = "compact" | "detailed" | "expanded";
export const NEXT_LEVEL: Record<DetailLevel, DetailLevel> = { compact: "detailed", detailed: "expanded", expanded: "compact" };
export interface Health { ok: boolean; msg: string }

interface State {
  ready: boolean;
  user: User | null;
  agents: Agent[];
  mcp: Mcp[];
  endpoints: Endpoint[];
  overview: Record<string, Overview>;
  currentAgentId: string | null;
  crumbs: string[];
  nodes: Node[];
  edges: Edge[];
  selectedAgentId: string | null;
  pane: Pane;
  drawerTab: string;
  picker: PickerState | null;
  modal: ModalState | null;
  detail: DetailState | null;
  confirm: ConfirmState | null;
  hidden: string[];
  subGraphs: Record<string, SubGraph>;
  subSig: Record<string, string>;
  detailLevel: DetailLevel;
  expanded: Record<string, DetailLevel>;
  addTo: AddToState | null;
  health: Record<string, Health>;
  paletteOpen: boolean;
  awaiting: number;
  hist: { u: number; r: number };
  setPalette: (b: boolean) => void;
  refreshAwaiting: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  addAndConnect: (type: NodeKind, ref: string, pos: { x: number; y: number }) => string | null;
  _addChild: (socket: Socket, type: NodeKind, ref: string) => string | null;
  navigate: (path: string) => void;
  runStates: Record<string, string>;
  run: Run | null;
  activeKey: string | null;
  inspectKey: string | null;
  chats: Record<string, ChatMsg[]>;
  theme: ThemeMode;
  saving: "idle" | "saving" | "saved" | "error";
  toasts: Toast[];
  init: () => Promise<void>;
  canEdit: () => boolean;
  canRun: () => boolean;
  toast: (msg: string, opts?: { err?: boolean; action?: Toast["action"]; ms?: number }) => void;
  isHidden: (kind: DeleteKind, id: string) => boolean;
  refreshAll: () => Promise<void>;
  openCanvas: (id: string, opts?: { crumbs?: string[]; settings?: boolean }) => Promise<void>;
  flushSave: () => Promise<void>;
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  addNode: (type: NodeKind, ref: string, pos?: { x: number; y: number }) => string;
  connect: (source: string, target: string, socket: Socket) => string | null;
  addChild: (socket: Socket, type: NodeKind, ref: string) => string | null;
  addMany: (socket: Socket, type: NodeKind, refs: string[]) => void;
  wouldLoop: (agentId: string) => boolean;
  removeNode: (id: string) => void;
  toggleLink: (socket: Socket, ref: string, on: boolean) => void;
  clickNode: (n: Node) => void;
  setSelectedAgent: (id: string | null) => void;
  setPane: (p: Pane) => void;
  openSettings: (tab?: string) => void;
  setDrawerTab: (t: string) => void;
  openDetail: (d: DetailState | null) => void;
  setPicker: (p: PickerState | null) => void;
  setModal: (m: ModalState | null) => void;
  createAgent: (opts?: { sub?: boolean }) => Promise<void>;
  duplicateAgent: (id: string) => Promise<void>;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  requestDelete: (kind: DeleteKind, id: string) => Promise<void>;
  confirmDelete: () => void;
  cancelConfirm: () => void;
  playRun: (r: Run, opts?: { from?: number }) => void;
  clearRun: () => void;
  setInspect: (k: string | null) => void;
  addChat: (agentId: string, m: ChatMsg) => void;
  updateChat: (agentId: string, id: string, patch: Partial<ChatMsg>) => void;
  clearChat: (agentId: string) => void;
  setTheme: (t: ThemeMode) => void;
  setDetailLevel: (l: DetailLevel) => void;
  cycleCard: (nodeId: string, current: DetailLevel) => void;
  loadSubGraph: (agentId: string) => Promise<void>;
  moveSubNode: (agentId: string, nodeId: string, x: number, y: number) => void;
  removeFromSub: (agentId: string, nodeId: string) => void;
  setAddTo: (a: AddToState | null) => void;
  addToAgent: (agentId: string, type: "tool" | "endpoint", refs: string[]) => Promise<void>;
  runTest: (kind: "mcp" | "endpoints", id: string) => Promise<Health | null>;
  setNavigator: (fn: (p: string) => void) => void;
  openCanvasPage: (id: string) => Promise<void>;
  autoLayout: () => void;
}

/** Canvas undo/redo (nodes, positions, connections). Settings edits are not part of it. */
type Snap = { nodes: Node[]; edges: Edge[] };
let past: Snap[] = [];
let future: Snap[] = [];
let dragSnap: Snap | null = null;
let batching = 0;
const sig = (s: Snap) => JSON.stringify([s.nodes.map((n) => [n.id, Math.round(n.position.x), Math.round(n.position.y)]), s.edges.map((e) => e.id)]);
const subTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let playTimer: ReturnType<typeof setTimeout> | undefined;
let graphTimer: ReturnType<typeof setTimeout> | undefined;
let pendingAid: string | null = null;
const patchTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const patchBuf: Record<string, Partial<Agent>> = {};
const deleteTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const toRf = (n: ApiNode): Node => ({ id: n.id, type: n.type, position: { x: n.x, y: n.y }, data: { ref: n.ref }, deletable: n.id !== ROOT });
const toRfEdge = (e: ApiEdge): Edge => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.socket, targetHandle: "in", data: { socket: e.socket } });
const refOf = (n?: Node) => ((n?.data as any)?.ref as string) ?? "";
const usagePath = (k: DeleteKind, id: string) => (k === "agent" ? `/agents/${id}/usage` : k === "mcp" ? `/mcp/${id}/usage` : `/endpoints/${id}/usage`);
const deletePath = (k: DeleteKind, id: string) => (k === "agent" ? `/agents/${id}` : k === "mcp" ? `/mcp/${id}` : `/endpoints/${id}`);

export const useStudio = create<State>()((set, get) => {
  const saveNow = async () => {
    clearTimeout(graphTimer); graphTimer = undefined;
    const aid = pendingAid; pendingAid = null;
    if (!aid || aid !== get().currentAgentId) return;
    const { nodes, edges } = get();
    try {
      await api(`/agents/${aid}/graph`, {
        method: "PUT",
        body: JSON.stringify({
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, ref: refOf(n), x: Math.round(n.position.x), y: Math.round(n.position.y) })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, socket: (e.data as any).socket })),
        }),
      });
      set({ saving: "saved" });
      api<Record<string, Overview>>("/overview").then((overview) => set({ overview })).catch(() => {});
    } catch (err: any) {
      set({ saving: "error" });
      get().toast("Could not save canvas: " + err.message, { err: true });
    }
  };
  const scheduleGraphSave = () => {
    if (!get().canEdit() || !get().currentAgentId) return;
    clearTimeout(graphTimer);
    pendingAid = get().currentAgentId;
    set({ saving: "saving" });
    graphTimer = setTimeout(saveNow, 500);
  };

  /** Save a sub-agent's own canvas after it was edited from the parent canvas. */
  const scheduleSubSave = (agentId: string) => {
    clearTimeout(subTimers[agentId]);
    set({ saving: "saving" });
    subTimers[agentId] = setTimeout(async () => {
      const g = get().subGraphs[agentId];
      if (!g) return;
      try {
        await api(`/agents/${agentId}/graph`, { method: "PUT", body: JSON.stringify(g) });
        set({ saving: "saved" });
        api<Record<string, Overview>>("/overview").then((overview) => set({ overview })).catch(() => {});
      } catch (err: any) {
        set({ saving: "error" });
        get().toast("Could not save: " + err.message, { err: true });
        get().loadSubGraph(agentId);   // resync with the server
      }
    }, 500);
  };

  const freeSpot = (type: string, x: number, y: number) => {
    const z = sizeOf("new", type);
    const others = get().nodes;
    const hit = (px: number, py: number) => others.some((o) => {
      const q = sizeOf(o.id, o.type);
      return px < o.position.x + q.w + 20 && o.position.x < px + z.w + 20 && py < o.position.y + q.h + 20 && o.position.y < py + z.h + 20;
    });
    let i = 0;
    while (hit(x, y) && i++ < 80) { x += z.w + 30; if (x > 1800) { x = 20; y += z.h + 40; } }
    return { x, y };
  };

  const hiddenKey = (k: DeleteKind, id: string) => `${k}:${id}`;

  const snap = (): Snap => ({ nodes: get().nodes.map((n) => ({ ...n, position: { ...n.position } })), edges: get().edges.map((e) => ({ ...e })) });
  const pushPast = (s0: Snap) => { past.push(s0); if (past.length > 60) past.shift(); future = []; set({ hist: { u: past.length, r: 0 } }); };
  /** Record the state before a single mutation (no-op inside a batch). */
  const record = () => { if (batching === 0) pushPast(snap()); };
  /** Group several mutations into one undo step; nothing is recorded if nothing changed. */
  const batched = <T,>(fn: () => T): T => {
    const before = batching === 0 ? snap() : null;
    batching++;
    try { return fn(); } finally { batching--; if (before && sig(before) !== sig(snap())) pushPast(before); }
  };

  return {
    ready: false, user: null, agents: [], mcp: [], endpoints: [], overview: {}, currentAgentId: null, crumbs: [], nodes: [], edges: [],
    selectedAgentId: null, pane: null, drawerTab: "General", picker: null, modal: null, detail: null, confirm: null, hidden: [], subGraphs: {}, subSig: {}, detailLevel: "expanded", expanded: {}, addTo: null, health: {}, paletteOpen: false, setPalette: (paletteOpen) => set({ paletteOpen }), awaiting: 0, hist: { u: 0, r: 0 }, navigate: () => {},
    runStates: {}, run: null, activeKey: null, inspectKey: null, chats: {}, theme: "dark", saving: "idle", toasts: [],

    async init() {
      const [user, agents, mcp, endpoints, overview] = await Promise.all([
        api<User>("/auth/me"), api<Agent[]>("/agents"), api<Mcp[]>("/mcp"), api<Endpoint[]>("/endpoints"), api<Record<string, Overview>>("/overview"),
      ]);
      set({ user, agents, mcp, endpoints, overview, ready: true });
      const children = new Set(Object.values(overview).flatMap((o) => o.agents));
      const first = agents.find((a) => !children.has(a.id)) ?? agents[0];
      if (first) await get().openCanvas(first.id);
    },
    canEdit: () => get().user?.role === "admin",
    canRun: () => get().user?.role !== "viewer",
    toast(msg, opts) {
      const id = rid();
      set((s) => ({ toasts: [...s.toasts, { id, msg, err: opts?.err, action: opts?.action }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts?.ms ?? 3500);
    },
    isHidden: (kind, id) => get().hidden.includes(hiddenKey(kind, id)),
    async refreshAll() {
      const [agents, mcp, endpoints, overview] = await Promise.all([api<Agent[]>("/agents"), api<Mcp[]>("/mcp"), api<Endpoint[]>("/endpoints"), api<Record<string, Overview>>("/overview")]);
      set({ agents, mcp, endpoints, overview });
    },

    async flushSave() { if (graphTimer !== undefined || pendingAid) await saveNow(); },
    async openCanvas(id, opts) {
      await get().flushSave();
      try {
        const g = await api<{ nodes: ApiNode[]; edges: ApiEdge[] }>(`/agents/${id}/graph`);
        clearTimeout(playTimer);
        past = []; future = []; dragSnap = null;
        set((s) => ({
          hist: { u: 0, r: 0 }, subGraphs: {}, subSig: {}, currentAgentId: id, selectedAgentId: id, nodes: g.nodes.map(toRf), edges: g.edges.map(toRfEdge), crumbs: opts?.crumbs ?? [id],
          picker: null, runStates: {}, run: null, activeKey: null, inspectKey: null, saving: "idle",
          pane: opts?.settings ? "settings" : s.pane === "detail" ? null : s.pane, drawerTab: opts?.settings ? "General" : s.drawerTab,
        }));
      } catch (e: any) { get().toast(e.message, { err: true }); }
    },

    onNodesChange(changes) {
      if (!get().canEdit()) changes = changes.filter((c) => c.type === "select" || c.type === "dimensions");
      changes = changes.filter((c) => !(c.type === "remove" && (c as any).id === ROOT));
      if (changes.some((c) => c.type === "remove")) record();
      if (!dragSnap && changes.some((c: any) => c.type === "position" && c.dragging)) dragSnap = snap();
      set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
      if (dragSnap && changes.some((c: any) => c.type === "position" && c.dragging === false)) {
        if (sig(dragSnap) !== sig(snap())) pushPast(dragSnap);
        dragSnap = null;
      }
      const removed = changes.filter((c) => c.type === "remove").map((c: any) => c.id);
      if (removed.length) {
        const gone = new Set(removed);
        set((s) => ({ edges: s.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) }));
      }
      if (removed.length || changes.some((c: any) => c.type === "position" && c.dragging === false)) scheduleGraphSave();
    },
    onEdgesChange(changes) {
      if (!get().canEdit()) return;
      if (changes.some((c) => c.type === "remove")) record();
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
      if (changes.some((c) => c.type === "remove")) scheduleGraphSave();
    },

    addNode(type, ref, pos) {
      const existing = get().nodes.find((n) => n.type === type && refOf(n) === ref);
      if (existing) return existing.id;
      record();
      const p = freeSpot(type, pos?.x ?? 80, pos?.y ?? 80);
      const id = "n_" + rid();
      set((s) => ({ nodes: [...s.nodes, { id, type, position: p, data: { ref } }] }));
      scheduleGraphSave();
      return id;
    },
    wouldLoop(agentId) {
      const cur = get().currentAgentId;
      if (!cur) return false;
      const ov = get().overview;
      const seen = new Set<string>();
      const go = (a: string): boolean => {
        if (a === cur) return true;
        if (seen.has(a)) return false;
        seen.add(a);
        return (ov[a]?.agents ?? []).some(go);
      };
      return go(agentId);
    },
    connect(source, target, socket) {
      const { nodes, edges } = get();
      const s = nodes.find((n) => n.id === source), t = nodes.find((n) => n.id === target);
      if (!s || !t || s.id !== ROOT) return "Only the agent itself can connect outward";
      if (t.type !== SOCKET_TARGET[socket]) return `The ${socket} socket only accepts ${SOCKET_TARGET[socket]}s`;
      if (edges.some((e) => e.source === source && e.target === target)) return "Already connected";
      if (t.type === "agent" && get().wouldLoop(refOf(t))) return "Circular delegation is not allowed";
      record();
      set((st) => ({ edges: [...st.edges, toRfEdge({ id: "e_" + rid(), source, target, socket })] }));
      scheduleGraphSave();
      return null;
    },
    addChild(socket, type, ref) { return batched(() => get()._addChild(socket, type, ref)); },
    _addChild(socket, type, ref) {
      if (type === "agent" && get().wouldLoop(ref)) { get().toast("Circular delegation is not allowed", { err: true }); return "loop"; }
      const root = get().nodes.find((n) => n.id === ROOT);
      if (!root) return "No canvas";
      const kids = get().edges.map((e) => get().nodes.find((n) => n.id === e.target));
      const subs = kids.filter((n) => n?.type === "agent").length, leaves = kids.length - subs;
      const pos = type === "agent" ? { x: root.position.x - 280 + subs * 290, y: root.position.y + 290 } : { x: root.position.x + 60 + leaves * 140, y: root.position.y + 260 };
      const id = get().addNode(type, ref, pos);
      const err = get().connect(ROOT, id, socket);
      if (err) get().toast(err, { err: true });
      return err;
    },
    addMany(socket, type, refs) {
      batched(() => refs.forEach((r) => get().addChild(socket, type, r)));
      if (refs.length) get().toast(`Added ${refs.length} ${refs.length === 1 ? "item" : "items"}`);
    },
    removeNode(id) { get().onNodesChange([{ type: "remove", id }]); },
    toggleLink(socket, ref, on) {
      const type = SOCKET_TARGET[socket];
      if (on) { get().addChild(socket, type, ref); return; }
      const t = get().nodes.find((n) => n.type === type && refOf(n) === ref);
      if (!t) return;
      record();
      set((s) => ({ edges: s.edges.filter((e) => !(e.source === ROOT && e.target === t.id)) }));
      scheduleGraphSave();
    },
    clickNode(n) {
      const ref = refOf(n);
      const key = `${n.type}:${ref}`;
      if (get().run) get().setInspect(key);
      if (n.type === "agent") {
        set((s) => ({ selectedAgentId: ref, pane: s.pane === "chat" ? "chat" : "settings" }));
      } else if (get().pane !== "chat" || !get().run) {
        const tool = n.type === "tool" ? ref.split(".").slice(1).join(".") : undefined;
        get().openDetail({ kind: n.type === "tool" ? "mcp" : "endpoint", id: n.type === "tool" ? ref.split(".")[0] : ref, tool });
      }
    },
    setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),
    setPane: (pane) => set({ pane }),
    openSettings: (tab) => set((s) => ({ pane: "settings", drawerTab: tab ?? s.drawerTab })),
    setDrawerTab: (drawerTab) => set({ drawerTab }),
    openDetail: (detail) => set({ detail, pane: detail ? "detail" : null }),
    setPicker: (picker) => set({ picker }),
    setModal: (modal) => set({ modal }),

    async createAgent(opts) {
      try {
        const a = await api<Agent>("/agents", { method: "POST", body: JSON.stringify({ name: "New agent", description: "Describe what this agent does", prompt: "You are a helpful agent." }) });
        set((s) => ({ agents: [...s.agents, a], overview: { ...s.overview, [a.id]: { tools: [], endpoints: [], agents: [] } } }));
        if (opts?.sub && get().currentAgentId) {
          get().addChild("agents", "agent", a.id);
          set({ selectedAgentId: a.id, pane: "settings", drawerTab: "General" });
        } else {
          await get().openCanvas(a.id, { settings: true });
        }
      } catch (e: any) { get().toast(e.message, { err: true }); }
    },
    async duplicateAgent(id) {
      try {
        const a = await api<Agent>(`/agents/${id}/duplicate`, { method: "POST" });
        await get().refreshAll();
        get().toast(`Duplicated as “${a.name}”`);
        await get().openCanvas(a.id, { settings: true });
      } catch (e: any) { get().toast(e.message, { err: true }); }
    },
    updateAgent(id, patch) {
      set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)), saving: "saving" }));
      patchBuf[id] = { ...(patchBuf[id] || {}), ...patch };
      clearTimeout(patchTimers[id]);
      patchTimers[id] = setTimeout(async () => {
        const body = patchBuf[id]; delete patchBuf[id];
        try {
          const a = await api<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
          set((s) => ({ agents: s.agents.map((x) => (x.id === id ? { ...x, version: a.version } : x)), saving: "saved" }));
        } catch (e: any) {
          set({ saving: "error" });
          get().toast("Save failed: " + e.message, { err: true });
          api<Agent[]>("/agents").then((agents) => set({ agents }));
        }
      }, 600);
    },

    async requestDelete(kind, id) {
      const name = kind === "agent" ? get().agents.find((a) => a.id === id)?.name : kind === "mcp" ? get().mcp.find((m) => m.id === id)?.name : get().endpoints.find((e) => e.id === id)?.name;
      try {
        const u = await api<{ used_by: Usage[] }>(usagePath(kind, id));
        set({ confirm: { kind, id, name: name ?? id, used_by: u.used_by } });
      } catch (e: any) { get().toast(e.message, { err: true }); }
    },
    cancelConfirm: () => set({ confirm: null }),
    confirmDelete() {
      const c = get().confirm;
      if (!c) return;
      const key = hiddenKey(c.kind, c.id);
      set((s) => ({ confirm: null, hidden: [...s.hidden, key], detail: s.detail?.id === c.id ? null : s.detail, pane: s.detail?.id === c.id ? null : s.pane }));
      if (c.kind === "agent" && get().currentAgentId === c.id) {
        const next = get().agents.find((a) => a.id !== c.id && !get().hidden.includes(hiddenKey("agent", a.id)));
        if (next) get().openCanvas(next.id);
        else set({ currentAgentId: null, nodes: [], edges: [], selectedAgentId: null, pane: null });
      }
      const undo = () => {
        clearTimeout(deleteTimers[key]); delete deleteTimers[key];
        set((s) => ({ hidden: s.hidden.filter((h) => h !== key) }));
      };
      deleteTimers[key] = setTimeout(async () => {
        delete deleteTimers[key];
        try {
          await api(deletePath(c.kind, c.id), { method: "DELETE" });
          set((s) => ({ hidden: s.hidden.filter((h) => h !== key) }));
          await get().refreshAll();
          const cur = get().currentAgentId;
          if (cur && get().agents.some((a) => a.id === cur)) await get().openCanvas(cur, { crumbs: get().crumbs });
        } catch (e: any) {
          set((s) => ({ hidden: s.hidden.filter((h) => h !== key) }));
          get().toast("Delete failed: " + e.message, { err: true });
        }
      }, 8000);
      get().toast(`Deleted “${c.name}”`, { action: { label: "Undo", run: undo }, ms: 8000 });
    },

    clearRun() { clearTimeout(playTimer); set({ run: null, runStates: {}, activeKey: null, inspectKey: null }); },
    setInspect: (inspectKey) => set({ inspectKey }),
    playRun(run, opts) {
      clearTimeout(playTimer);
      const from = opts?.from ?? 0;
      const quick = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const keyOf = (st: Run["steps"][number]) => `${st.kind}:${st.ref}`;
      const final = (st: Run["steps"][number]) => (st.status === "approved" ? "done" : st.status);
      const states: Record<string, string> = {};
      run.steps.slice(0, from).forEach((st) => { if (st.status !== "pending") states[keyOf(st)] = final(st); });
      set({ run, runStates: states, activeKey: null });
      let i = from;
      const next = () => {
        if (i >= run.steps.length) return set({ activeKey: null });
        const st = run.steps[i];
        if (st.status === "pending") return set({ activeKey: null });
        const k = keyOf(st);
        set((x) => ({ activeKey: k, runStates: { ...x.runStates, [k]: "running" } }));
        playTimer = setTimeout(() => {
          set((x) => ({ runStates: { ...x.runStates, [k]: final(st) }, activeKey: null }));
          if (st.status === "blocked" || st.status === "awaiting_approval") return;
          i++;
          playTimer = setTimeout(next, quick ? 0 : 200);
        }, quick ? 0 : 650);
      };
      next();
    },
    addChat: (agentId, m) => set((s) => ({ chats: { ...s.chats, [agentId]: [...(s.chats[agentId] || []), m] } })),
    updateChat: (agentId, id, patch) => set((s) => ({ chats: { ...s.chats, [agentId]: (s.chats[agentId] || []).map((m) => (m.id === id ? { ...m, ...patch } : m)) } })),
    clearChat: (agentId) => { get().clearRun(); set((s) => ({ chats: { ...s.chats, [agentId]: [] } })); },
    setTheme: (theme) => { set({ theme }); try { localStorage.setItem("theme", theme); } catch {} document.documentElement.dataset.theme = theme; },

    async refreshAwaiting() { try { const r = await api<{ awaiting: number }>("/runs/summary"); set({ awaiting: r.awaiting }); } catch {} },
    undo() {
      const prev = past.pop();
      if (!prev || !get().canEdit()) return;
      future.push(snap());
      set({ nodes: prev.nodes, edges: prev.edges, hist: { u: past.length, r: future.length } });
      scheduleGraphSave();
    },
    redo() {
      const next = future.pop();
      if (!next || !get().canEdit()) return;
      past.push(snap());
      set({ nodes: next.nodes, edges: next.edges, hist: { u: past.length, r: future.length } });
      scheduleGraphSave();
    },
    addAndConnect(type, ref, pos) {
      return batched(() => {
        const id = get().addNode(type, ref, pos);
        return get().connect(ROOT, id, type === "agent" ? "agents" : type === "tool" ? "tools" : "endpoints");
      });
    },
    setDetailLevel(l) { set({ detailLevel: l, expanded: {} }); try { localStorage.setItem("cardLevel2", l); } catch {} },
    async loadSubGraph(agentId) {
      try {
        const g = await api<SubGraph>(`/agents/${agentId}/graph`);
        set((s) => ({ subGraphs: { ...s.subGraphs, [agentId]: g }, subSig: { ...s.subSig, [agentId]: JSON.stringify(s.overview[agentId] ?? null) } }));
      } catch { /* sub-agent may have been deleted; the preview simply stays empty */ }
    },
    moveSubNode(agentId, nodeId, x, y) {
      const g = get().subGraphs[agentId];
      if (!g || !get().canEdit()) return;
      set((s) => ({ subGraphs: { ...s.subGraphs, [agentId]: { ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) } } }));
      scheduleSubSave(agentId);
    },
    removeFromSub(agentId, nodeId) {
      const g = get().subGraphs[agentId];
      if (!g || !get().canEdit()) return;
      const node = g.nodes.find((n) => n.id === nodeId);
      const name = get().agents.find((a) => a.id === agentId)?.name ?? "agent";
      set((s) => ({ subGraphs: { ...s.subGraphs, [agentId]: { nodes: g.nodes.filter((n) => n.id !== nodeId), edges: g.edges.filter((e) => e.source !== nodeId && e.target !== nodeId) } } }));
      scheduleSubSave(agentId);
      get().toast(`Removed ${node ? (node.type === "tool" ? node.ref.split(".").slice(1).join(".") : get().endpoints.find((e) => e.id === node.ref)?.name ?? node.ref) : "item"} from “${name}”`, {
        action: { label: "Undo", run: () => { set((s) => ({ subGraphs: { ...s.subGraphs, [agentId]: g } })); scheduleSubSave(agentId); } }, ms: 8000,
      });
    },
    cycleCard(nodeId, cur) { set((s) => ({ expanded: { ...s.expanded, [nodeId]: NEXT_LEVEL[cur] } })); },
    setAddTo: (addTo) => set({ addTo }),
    setNavigator: (navigate) => set({ navigate }),
    async openCanvasPage(id) { await get().openCanvas(id, { crumbs: [id] }); get().navigate("/"); },
    async runTest(kind, id) {
      try {
        const r = await api<{ reachable: boolean; status?: number; error?: string }>(`/${kind}/${id}/test`, { method: "POST" });
        const h = { ok: r.reachable, msg: r.reachable ? `Reachable (HTTP ${r.status})` : `Unreachable: ${r.error}` };
        set((s) => ({ health: { ...s.health, [`${kind}:${id}`]: h } }));
        return h;
      } catch (e: any) { get().toast(e.message, { err: true }); return null; }
    },
    async addToAgent(agentId, type, refs) {
      const socket: Socket = type === "tool" ? "tools" : "endpoints";
      if (agentId === get().currentAgentId) { get().addMany(socket, type, refs); return; }
      try {
        const g = await api<{ nodes: ApiNode[]; edges: ApiEdge[] }>(`/agents/${agentId}/graph`);
        const root = g.nodes.find((n) => n.id === ROOT);
        if (!root) throw new Error("This agent has no canvas yet");
        const nodes = [...g.nodes], edges = [...g.edges];
        let added = 0;
        for (const ref of refs) {
          if (nodes.some((n) => n.type === type && n.ref === ref)) continue;
          // first free slot of a 3-column grid centred under the agent, so it also looks tidy beneath its card on the parent canvas
          let x = root.x - 4, y = root.y + 260;
          for (let i = 0; i < 60; i++) {
            x = root.x - 4 + (i % 3) * 124; y = root.y + 260 + Math.floor(i / 3) * 160;
            if (!nodes.some((n) => n.id !== ROOT && Math.abs(n.x - x) < 110 && Math.abs(n.y - y) < 125)) break;
          }
          const id = "n_" + rid();
          nodes.push({ id, type, ref, x, y });
          edges.push({ id: "e_" + rid(), source: ROOT, target: id, socket });
          added++;
        }
        if (!added) return get().toast("Already on that canvas");
        await api(`/agents/${agentId}/graph`, { method: "PUT", body: JSON.stringify({ nodes, edges }) });
        api<Record<string, Overview>>("/overview").then((overview) => set({ overview })).catch(() => {});
        const name = get().agents.find((a) => a.id === agentId)?.name ?? "agent";
        get().toast(`Added ${added} to “${name}”`, { action: { label: "Open canvas", run: () => { get().openCanvasPage(agentId); } }, ms: 6000 });
      } catch (e: any) { get().toast(e.message, { err: true }); }
    },
    autoLayout() {
      const { nodes, edges } = get();
      const root = nodes.find((n) => n.id === ROOT);
      if (!root) return;
      record();
      const kids = edges.map((e) => nodes.find((n) => n.id === e.target)).filter(Boolean) as Node[];
      const subs = kids.filter((n) => n.type === "agent"), leaves = kids.filter((n) => n.type !== "agent");
      const cx = 300 + 180;  // root centre
      const pos: Record<string, { x: number; y: number }> = { [ROOT]: { x: 300, y: 40 } };
      const leavesOf = (n: Node) => {
        if ((get().expanded[n.id] ?? get().detailLevel) !== "expanded") return [];
        const sg = get().subGraphs[(n.data as any).ref];
        const sroot = sg?.nodes.find((x) => x.id === ROOT);
        return sg && sroot ? sg.nodes.filter((x) => x.id !== ROOT && (x.type === "tool" || x.type === "endpoint")).map((x) => ({ dx: x.x - sroot.x - 30, dy: x.y - sroot.y - 260 })) : [];
      };
      const widthOf = (n: Node) => { const l = leavesOf(n); return l.length ? Math.max(280, Math.max(...l.map((v) => v.dx)) + 100 - Math.min(0, ...l.map((v) => v.dx))) : 280; };
      const widths = subs.map(widthOf);
      const gap = 40, total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, subs.length - 1);
      let cursor = cx - total / 2;
      subs.forEach((n, i) => { pos[n.id] = { x: cursor + (widths[i] - 280) / 2, y: 320 }; cursor += widths[i] + gap; });
      const lows = subs.flatMap(leavesOf);
      const extra = lows.length ? 140 + Math.max(0, ...lows.map((v) => v.dy)) : 0;
      leaves.forEach((n, i) => (pos[n.id] = { x: cx - (leaves.length * 140) / 2 + i * 140 + 10, y: subs.length ? 560 + extra : 320 }));
      set((s) => ({ nodes: s.nodes.map((n) => ({ ...n, position: pos[n.id] || n.position })) }));
      scheduleGraphSave();
    },
  };
});
