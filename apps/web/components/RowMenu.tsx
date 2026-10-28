"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export interface MenuItem { label: string; icon?: React.ReactNode; run: () => void; danger?: boolean; hidden?: boolean }

/** "…" menu used on every library row (Edit, Duplicate, Delete …). */
export function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const visible = items.filter((i) => !i.hidden);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!visible.length) return null;
  return (
    <>
      <button ref={btn} className="btn ghost icon rowmenu" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: more actions`}
        onClick={(e) => { e.stopPropagation(); const r = btn.current!.getBoundingClientRect(); setPos({ x: Math.min(r.right - 190, window.innerWidth - 200), y: Math.min(r.bottom + 4, window.innerHeight - 40 - visible.length * 36) }); setOpen(!open); }}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 69 }} onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="pop menu" role="menu" style={{ left: pos.x, top: pos.y, zIndex: 70, width: 190 }}>
            {visible.map((i) => (
              <button key={i.label} role="menuitem" className={`opt ${i.danger ? "danger" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(false); i.run(); }}>
                {i.icon}{i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
