"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Hand, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { Topbar } from "../Topbar";
import { Crumbs } from "../gallery/shared";
import { StatusPill, timeAgo } from "./shared";
import type { RunItem } from "@/lib/types";

const FILTERS: [string, string][] = [["all", "All"], ["awaiting_approval", "Needs approval"], ["blocked", "Blocked"], ["completed", "Completed"]];

/** Run history across all agents, with an approvals inbox. */
export function RunsPage() {
  const s = useStudio();
  const router = useRouter();
  const [items, setItems] = useState<RunItem[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    try { setItems(await api<RunItem[]>("/runs?limit=200")); s.refreshAwaiting(); } catch (e: any) { s.toast(e.message, { err: true }); setItems([]); }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("status");
    if (f && FILTERS.some(([k]) => k === f)) setFilter(f);
    load();
  }, [load]);

  const list = items ?? [];
  const count = (k: string) => (k === "all" ? list.length : list.filter((r) => r.status === k).length);
  const ql = q.toLowerCase();
  const shown = list.filter((r) => (filter === "all" || r.status === filter) && (!ql || (r.agent_name + r.input + r.user_email).toLowerCase().includes(ql)));
  const agentIcon = (id: string) => s.agents.find((a) => a.id === id)?.icon ?? "bot";
  const waiting = count("awaiting_approval");

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "Runs" }]} />} actions={<button className="btn" onClick={load}><RefreshCw size={14} /> Refresh</button>} />
      <div className="page">
        <div className="pagein">
          <header className="pagehead">
            <div><h1>Runs</h1><p className="muted">Every run across all agents. Open one to see its full trace, or approve steps that are waiting for you.</p></div>
            <div className="pagetools"><label className="searchbox"><Search size={15} /><input className="input" placeholder="Search agent, input or person…" aria-label="Search runs" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          </header>
          {waiting > 0 && filter !== "awaiting_approval" && (
            <div className="banner" role="status"><Hand size={16} /><span><b>{waiting}</b> {waiting === 1 ? "run is" : "runs are"} waiting for approval.</span><button className="btn pri sm" style={{ margin: 0 }} onClick={() => setFilter("awaiting_approval")}>Review now</button></div>
          )}
          <div className="chipbar" role="group" aria-label="Filter runs">
            {FILTERS.map(([k, l]) => <button key={k} className={`fchip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l} <span className="fcount">{count(k)}</span></button>)}
          </div>
          <div className="runlist">
            {shown.map((r) => (
              <div key={r.id} className="runrow" role="link" tabIndex={0} aria-label={`${r.agent_name}: ${STATUS_LABEL_OF(r.status)}`} onClick={() => router.push(`/runs/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/runs/${r.id}`)}>
                <span className="tile sm2"><Icon name={agentIcon(r.agent_id)} size={16} /></span>
                <span className="rmain"><b>{r.agent_name}</b><small>{r.input}</small></span>
                <span className="rmeta"><span>{r.steps_done}/{r.steps_total} steps</span><span>{r.latency_ms} ms · {r.tokens} tokens</span></span>
                <span className="rwho"><span>{timeAgo(r.created_at)}</span><small>{r.user_email}</small></span>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
          {items === null && <p className="muted" style={{ textAlign: "center", padding: 30 }}>Loading runs…</p>}
          {items !== null && shown.length === 0 && (
            <div className="emptystate"><h3>{list.length ? "No runs match" : "No runs yet"}</h3><p className="muted">{list.length ? "Try another filter or search." : "Run an agent from the chat to see it here."}</p></div>
          )}
        </div>
      </div>
    </>
  );
}
const STATUS_LABEL_OF = (s: string) => ({ completed: "completed", blocked: "blocked", awaiting_approval: "needs approval", running: "running" } as Record<string, string>)[s] ?? s;
