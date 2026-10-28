# UI / UX design (as built)

## Update 4: glass / liquid look
Floating translucent cards (rail, list, top bar, settings/chat) over a soft ambient gradient; rounded 20-24px panels; gradient squircle icon tiles; gradient primary actions; spring-eased pane/popover motion; both themes. Details and caveats: docs/UI_REFRESH_PROPOSAL.md.

## Update 3: chat, chips, theme
- **Chat (Flowise-style):** chat button in the top bar and a floating chat button on the canvas. The right pane has a **Settings | Chat** switch. Pick an agent, send a message; each reply has a **Trace** (status per step, time, tokens, guardrail findings, expandable output) and inline **Approve and continue** for protected steps. The canvas animates in sync; clicking a node highlights its step in the trace. Suggested prompts demo refund, PII and prompt-injection. Replies are simulated (no real LLM); history is in-memory per agent.
- **Model / Memory:** no longer separate canvas nodes (they added clutter and just mirrored settings). They are two small chips inside the agent box that open the matching settings tab. Sockets are now Tools · Endpoints · Agents.
- **Theme:** light/dark toggle in the top bar, remembered in the browser, defaults to the OS setting; the canvas follows it.

## Layout (updated)
**Vertical icon rail** (Agents · MCP · Endpoints, with count badges; click to open/collapse its list) → list panel → canvas → settings drawer. Agent box (n8n-style) has five labelled sockets: **Model, Memory** (round dashed nodes derived from the agent's settings; click to open that settings tab), **Tools, Endpoints, Agents** (**+** picker; typed links). Tools/endpoints are round icon nodes with the name underneath; capability links are dashed, agent delegation is solid.

**Run animation:** the active node pulses and the edge into it animates; then a badge appears: spinner (running), green tick (success), red cross (failed/blocked), amber hand (waiting for approval). Edges turn green/red. Click any node or trace row to inspect that step (status, time, tokens, output, guardrail findings). *Clear status* resets. Reduced-motion users get the final states without animation. The steps are replayed in the browser from a completed API response; true live streaming needs an executor that streams (not built).

## Layout (original description)
`Left library (3 tabs)  |  Canvas (React Flow)  |  Agent drawer (7 tabs)` with a Run/Trace panel under the canvas.
- **Left tabs**: *Agents* (tree: parent → sub-agents, badges for tools/endpoints, "not on canvas" group), *MCP / Tools* (grouped by server, read/write badges), *URL Endpoints* (method, URL, auth, Test button). Search per tab; **+ New** creates an agent or opens the MCP/Endpoint dialog. Items are draggable.
- **Canvas** (n8n-style): icon tiles; agent node = card with three **typed sockets** (Agents / Tools / Endpoints) each with a **+**. Click **+** or drag a socket into empty space → typed picker. Drop a sidebar item on an agent to connect it. Edge colours: indigo agents, green tools, amber endpoints; dashed = parallel pattern; click an edge + Delete to disconnect. Invalid links are refused with a toast (wrong socket type, duplicate, circular delegation). Controls: zoom, fit, minimap, auto-layout. Empty state offers "Create your first agent".
- **Drawer** (docks beside the canvas ≥1200 px, overlays below): General (name, description, prompt, icon, skills, publish, delete) · Model (framework incl. ADK 2.0, pattern, model, max tokens/temperature/Top-P/Top-K with presets) · Tools (checkboxes synced with canvas + per-tool approval) · Guardrails (off/log/warn/block) · Access (Admin/Executor/Viewer) · Memory · Observe (sessions, tokens, latency, cost, daily tokens, tool-call table).
- **Run panel**: pick agent → input → trace tree with statuses, guardrail findings, latency, tokens, **Approve** buttons for paused steps; nodes on the canvas get status rings.
- **Save model**: autosave with status text ("Saving… / All changes saved / Save failed"); optimistic updates; on failure the UI re-syncs from the server.

## Visual system
OS light/dark themes via CSS tokens; indigo accent; lucide icons everywhere; 8 px grid; visible `:focus-visible` rings; reduced-motion respected; buttons carry `aria-label`s; tabs use `role=tablist`; read-only users get a disabled form and a "read-only" badge.

## UX flows verified in the running app
Login → canvas → add tool via **+** picker (saved to DB) → drag sidebar item onto agent → run Billing Agent → pauses at "Create refund" → Approve → completed → viewer is read-only / gets 403.

## Not yet designed/built (honest list)
Undo/redo, multi-select & copy/paste, canvas search, version history & diff, agent templates, mobile editing (desktop-first; sidebar hidden <760 px), i18n, screen-reader walk-through (basic semantics only), real streaming trace.
