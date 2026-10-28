"use client";
import { LogOut, Moon, Search, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";

/** Floating glass top bar shared by the workspace and the gallery pages. */
export function Topbar({ left, actions }: { left: React.ReactNode; actions?: React.ReactNode }) {
  const s = useStudio();
  const logout = async () => { await api("/auth/logout", { method: "POST" }); window.location.href = "/login"; };
  return (
    <div className="top">
      {left}
      <span className="sp" />
      <button className="btn kbtn" aria-label="Search and commands" title="Search and commands (⌘K / Ctrl+K)" onClick={() => s.setPalette(true)}>
        <Search size={14} /><span className="khint">Search</span><kbd>⌘K</kbd>
      </button>
      {actions}
      <button className="btn icon" aria-label={s.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme" onClick={() => s.setTheme(s.theme === "dark" ? "light" : "dark")}>
        {s.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <span className="badge" title={s.user?.email}>{s.user?.email} · {s.user?.role}</span>
      <button className="btn ghost icon" aria-label="Sign out" onClick={logout}><LogOut size={15} /></button>
    </div>
  );
}
