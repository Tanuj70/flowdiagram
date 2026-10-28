/** Neutral provider marks (coloured lettermarks, not trademarked logos) shown next to a model name. */
export function providerOf(model: string): { name: string; letter: string; color: string } {
  const m = model.toLowerCase();
  if (m.includes("claude")) return { name: "Anthropic", letter: "A", color: "#d97757" };
  if (m.includes("gpt") || m.startsWith("o1") || m.startsWith("o3")) return { name: "OpenAI", letter: "O", color: "#10a37f" };
  if (m.includes("gemini")) return { name: "Google", letter: "G", color: "#4285f4" };
  return { name: "Custom", letter: model.slice(0, 1).toUpperCase() || "?", color: "#7b8294" };
}
export function ProviderMark({ model, size = 16 }: { model: string; size?: number }) {
  const p = providerOf(model);
  return (
    <span title={p.name} aria-label={p.name} style={{ width: size, height: size, borderRadius: "50%", background: p.color, color: "#fff", fontSize: size * 0.62, fontWeight: 700, display: "inline-grid", placeItems: "center", flex: "none" }}>
      {p.letter}
    </span>
  );
}
