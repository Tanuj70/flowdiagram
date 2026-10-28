"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Play } from "lucide-react";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { useStudio } from "@/lib/store";
import { Topbar } from "../Topbar";
import { Crumbs } from "../gallery/shared";
import { RunTrace, StatusPill, timeAgo } from "./shared";
import type { Run } from "@/lib/types";

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const s = useStudio();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api<Run>(`/runs/${id}`).then(setRun).catch(() => setMissing(true)); }, [id]);
  const agent = s.agents.find((a) => a.id === run?.agent_id);

  const replay = async () => {
    if (!run) return;
    await s.openCanvas(run.agent_id, { crumbs: [run.agent_id] });
    s.navigate("/");
    setTimeout(() => s.playRun(run), 400);
  };

  if (missing) return (<><Topbar left={<Crumbs items={[{ label: "Runs", href: "/runs" }, { label: "Not found" }]} />} /><div className="page"><div className="emptystate"><h3>Run not found</h3><button className="btn" onClick={() => router.push("/runs")}>Back to runs</button></div></div></>);
  if (!run) return (<><Topbar left={<Crumbs items={[{ label: "Runs", href: "/runs" }]} />} /><div className="page"><p className="muted" style={{ padding: 30, textAlign: "center" }}>Loading…</p></div></>);

  return (
    <>
      <Topbar left={<Crumbs items={[{ label: "Runs", href: "/runs" }, { label: agent?.name ?? "Run" }]} />} />
      <div className="page">
        <div className="pagein">
          <section className="dhero">
            <span className="tile huge"><Icon name={agent?.icon ?? "bot"} size={32} /></span>
            <div className="dhero-t">
              <h1>{agent?.name ?? "(deleted agent)"}</h1>
              <p style={{ whiteSpace: "pre-wrap" }}>“{run.input}”</p>
              <div className="chips"><StatusPill status={run.status} /><span className="badge">{run.tokens} tokens</span><span className="badge">{run.latency_ms} ms</span><span className="badge">{timeAgo(run.created_at)}{run.user_email ? ` · ${run.user_email}` : ""}</span></div>
            </div>
            <div className="dactions" style={{ margin: 0 }}>
              {agent && <button className="btn" onClick={() => s.openCanvasPage(agent.id)}>Open canvas <ArrowUpRight size={13} /></button>}
              {agent && <button className="btn" onClick={replay}><Play size={13} /> Replay on canvas</button>}
            </div>
          </section>
          <div className="gcard static">
            <h4 className="sec">Trace</h4>
            <RunTrace run={run} onChange={setRun} />
            {run.output && <><h4 className="sec">Result</h4><p style={{ margin: 0 }}>{run.output}</p></>}
          </div>
        </div>
      </div>
    </>
  );
}
