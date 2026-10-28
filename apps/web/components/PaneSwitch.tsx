"use client";
import { MessageSquare, SlidersHorizontal } from "lucide-react";
import { useStudio } from "@/lib/store";

/** Segmented control that switches the right-hand pane between Settings and Chat. */
export function PaneSwitch() {
  const chat = useStudio((s) => s.pane === "chat");
  const openSettings = useStudio((s) => s.openSettings);
  const setPane = useStudio((s) => s.setPane);
  return (
    <div className="seg" role="tablist" aria-label="Right pane">
      <button role="tab" aria-selected={!chat} onClick={() => openSettings()}><SlidersHorizontal size={13} /> Settings</button>
      <button role="tab" aria-selected={chat} onClick={() => setPane("chat")}><MessageSquare size={13} /> Chat</button>
    </div>
  );
}
