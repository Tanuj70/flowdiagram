# Roadmap and agreed direction (not yet built)

Saved from the product discussion. Status: **Phase A built and tested; Phase B partly built** (see below). Phases C and D not started.

## User requirements (as understood)
1. **MCP / Tools tab** lists MCP *servers* (e.g. "RAN MCP Server", "Core MCP Server"); clicking one shows all its tools and details. **API tab** the same with API collections → endpoints. **Agents tab** lists all agents; click shows details.
2. **Each agent has its own canvas.** Creating an agent opens a fresh canvas to build on (not a node dropped into one shared canvas). Double-click a sub-agent to go inside; breadcrumb to go back.
3. On the canvas, the Tools/MCP "+" shows MCP servers and their tools (select several); Agents "+" shows available agents; Endpoints "+" shows API collections.
4. Canvas nodes show real details like Flowise: model with provider logo, tool icons row, status ticks, hover toolbar, Start / Condition (outputs 0,1,2) / Direct reply nodes, searchable "Add Nodes" panel.
5. **Add and delete** agents, MCP servers and endpoints easily and safely (see "Manage lifecycle" below).

## Build phases
| Phase | Scope |
|---|---|
| A | Per-agent canvases (backend: one graph per agent + migration), MCP server and API collection libraries with detail pages, two-pane pickers, manage lifecycle (add/edit/duplicate/delete with impact warning + undo) |
| B | Flowise-style nodes (provider logos, tool icon rows, hover toolbar), Start/Condition/Direct-reply nodes, Add Nodes panel |
| C | Real MCP discovery + test calls (MCP client), real Claude executor, streaming, chat attachments + stop, saved sessions |
| D | Versions + publish/rollback, publish as API / embeddable widget, templates, AI builder, test sets, secrets vault, user management, approvals inbox, SSO, cost budgets |

## Manage lifecycle (add / edit / delete)
Current state: agents add via "+ New", delete via Settings > General > Delete agent; MCP servers and endpoints add via dialog and delete via the trash icon. Gaps: no edit for MCP/endpoints after creation, no "used by" warning, no undo, delete is a hard delete, no delete from the agent list row, stale approvals stay behind, page reloads after catalog delete.
Target: every list row has a "..." menu (Edit, Duplicate, Delete); delete dialog lists impact ("used by 2 agents, 3 connections will be removed"); delete is soft with a 10-second Undo toast (and a Trash to restore); "Remove from this canvas" is clearly different from "Delete everywhere"; edit dialogs for MCP/endpoints; clean up stale approvals; all changes audited; admin only.

## Open questions
1. Confirm per-agent canvas (double-click to go inside) instead of one shared canvas.
2. Confirm "details like actual" = Flowise-style node details.
3. Real MCP server URLs available to test Phase C? Otherwise a sample MCP server will be built.

## Delivered: Agent Runtime deployment package (phase 1 of the GEAP plan)
Deploy tab per agent: generates ADK code + contract server + Dockerfile + Cloud Build + deploy script, with an exact/approximate/not-exported report and warnings. See docs/DEPLOYMENT_AGENT_RUNTIME.md. **Not yet:** one-click deploy from the app (phase 2), chat with the deployed agent, version history/rollback (phase 3). Needs a real Google Cloud project to verify an actual deployment.

## Delivered: LIVE hanging nodes under sub-agents
The tools/endpoints under a sub-agent are no longer frozen previews: they are a live view of that sub-agent's own canvas, drawn at the positions they have there. **Click** opens details; **hover toolbar** has Details and "Remove from <agent>" (8-second Undo); **drag** moves a node and saves the new place to the sub-agent's canvas; the **+** on each sub-agent card opens the picker for that sub-agent (MCP tools / endpoints) and saves to it; **Auto-layout** spaces cards by how wide their hanging nodes are. New tools added from the parent land in a tidy 3-column grid under their card. Changes appear in the sub-agent's own canvas and vice versa (parent view reloads that canvas when its contents change). Limits: moving/removing here is not part of the parent canvas Undo (removal has its own Undo toast); sub-agents of sub-agents are only summarised ("N sub").

## Delivered: Expanded sub-agent view (now the DEFAULT)
**Update:** Expanded is the default view, so sub-agent tools/endpoints show without clicking; the hanging nodes now look like the root agent's own nodes (60px circle, name, "GET · Shop API" / server name, write badge, approval hand). The remembered choice uses a new storage key (`cardLevel2`), so older saved Compact/Detailed choices do not hide them; Compact and Detailed remain one click away.
Sub-agent cards now have three views: **Compact**, **Detailed** (names inside the card) and **Expanded** (the sub-agent's tools/endpoints hang underneath as read-only round nodes joined by the same dashed colored curves, max 6 then "+N more"). Canvas-wide switch (Compact | Detailed | Expanded, remembered) plus a per-card cycle button. Hanging nodes are derived previews (never saved), follow their card, show run status (tick / cross / approval hand / dots on the line), and open the tool/endpoint details on click ("+N more" opens the sub-agent canvas). Technical note: derived nodes outside the store must feed their measured size back into React Flow, otherwise their connection lines do not draw. Known limits: expanded hanging nodes are not considered by the free-spot placement of newly added nodes (use Auto-layout, which reserves room), and very large teams can crowd.

## Delivered: step 3 (living canvas, undo/redo, run history + approvals inbox)
- **Living canvas:** while a step runs, dots travel along the connection (same curve as before; only added when active), nodes flash on success, a red ripple plays on a guardrail block, the approval hand nudges gently; all disabled for "reduce motion". "Replay on canvas" in the chat trace and on the run detail page.
- **Undo/redo** (Ctrl/⌘ Z, Ctrl/⌘ Shift Z or Ctrl+Y, plus buttons): add/remove nodes, connections, drags, auto-layout, multi-add as one step; saved to the server. Does not cover settings edits, agent create/delete (those have their own Undo toast / confirm).
- **Runs page `/runs` + `/runs/:id`:** all runs across agents with filters (All / Needs approval / Blocked / Completed), search, status pills; banner and amber badge on the rail when runs wait for approval; detail page with full trace, Approve, Open canvas, Replay. New API: `GET /runs?status=&agent_id=&limit=`, `GET /runs/summary`.
Still open: real Claude executor + streaming, live MCP discovery, templates + AI builder, notifications beyond the badge (no email/Slack), run search by output, undo for settings.

## Delivered: step 2 of the design-review plan (lines deliberately unchanged)
Zoom-aware text (far/mid/near: bigger names and trimmed detail when zoomed out), calmer agent list (Teams / Agents groups, collapsible, icon counts, hover-only "..." menu), Cmd/Ctrl+K command palette (jump to agents, servers, tools, endpoints; run actions; keyboard navigable). **Decision:** the canvas lines keep the original curved dashed style (an orthogonal-routing experiment was reverted at the user's request). Still open from the review: living-canvas run animations, undo/redo, run history + approvals inbox.

## Delivered: gallery pages + Compact/Detailed cards (step 1 of the design-review plan)
`/mcp` and `/endpoints` are full pages (search, tag/method filters, grid/list, cards with used-by avatars, read/write bar, health), with detail pages (Overview, Tools, Used by, Settings), "Add to agent..." for any agent without opening its canvas, and real URLs. Sub-agent cards have Compact and Detailed views (per-card toggle plus a canvas-wide switch, remembered). Known trade-off: the drag-from-list of tools/endpoints onto the canvas was removed with the list; use the blue "+" picker or "Add to agent...". Next from the review: zoom-aware text size, cleaner edge routing, calmer agent list, command palette (Cmd+K), living-canvas run animations, undo/redo, run history + approvals inbox.

## Delivered so far (Phase A + part of B)
Built and verified in the browser: per-agent canvases with breadcrumb and double-click drill-in; new agent opens a blank canvas with a "Build" prompt; MCP server cards and API collections with detail panes (used-by, tools, test); multi-select two-pane picker (MCP tools, endpoints, agents) with loop protection; "..." menus (open, settings, edit, duplicate, delete); delete dialog with impact list and 8-second Undo; edit dialogs; sub-agent cards with provider mark, tool-icon row and Open button; hover toolbar; blue Add-nodes button; status ticks/crosses and animated run.
**Not built from Phase B:** Start / Condition (0,1,2 outputs) / Direct-reply nodes (routing needs the real executor, Phase C), per-node "run this node", real provider logos (neutral lettermarks are used). **Still open:** soft-delete Trash (Undo is a client-side 8 s window; closing the tab inside it keeps the item), live MCP discovery, input schemas (field exists, shown when present).
