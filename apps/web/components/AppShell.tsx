"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { AddToAgentDialog } from "./gallery/AddToAgentDialog";
import { CommandPalette } from "./CommandPalette";
import { ConfirmDelete, Modals } from "./Modals";
import { Picker } from "./Picker";
import { Sidebar } from "./Sidebar";
import { useStudio } from "@/lib/store";

/** Persistent frame: icon rail (+ agent list on the workspace), page content, and global dialogs. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const init = useStudio((s) => s.init);
  const ready = useStudio((s) => s.ready);
  const setTheme = useStudio((s) => s.setTheme);
  const setDetailLevel = useStudio((s) => s.setDetailLevel);
  const setNavigator = useStudio((s) => s.setNavigator);
  const toasts = useStudio((s) => s.toasts);
  const router = useRouter();
  useEffect(() => { setNavigator((p) => router.push(p)); }, [router, setNavigator]);
  useEffect(() => {
    let t: string | null = null, lvl: string | null = null;
    try { t = localStorage.getItem("theme"); lvl = localStorage.getItem("cardLevel2"); } catch {}
    setTheme(t === "light" || t === "dark" ? t : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    if (lvl === "compact" || lvl === "detailed" || lvl === "expanded") setDetailLevel(lvl);
    init().catch(() => {});
  }, [init, setTheme, setDetailLevel]);
  const refreshAwaiting = useStudio((s) => s.refreshAwaiting);
  useEffect(() => {
    if (!ready) return;
    refreshAwaiting();
    const t = setInterval(refreshAwaiting, 20000);
    return () => clearInterval(t);
  }, [ready, refreshAwaiting]);
  if (!ready) return <div className="login"><p className="muted">Loading…</p></div>;
  return (
    <ReactFlowProvider>
      <div className="app">
        <Sidebar />
        <main className="main">{children}</main>
        <Picker />
        <Modals />
        <ConfirmDelete />
        <AddToAgentDialog />
        <CommandPalette />
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.err ? "err" : ""}`}>
              {t.msg}
              {t.action && <button className="toastbtn" onClick={t.action.run}>{t.action.label}</button>}
            </div>
          ))}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
