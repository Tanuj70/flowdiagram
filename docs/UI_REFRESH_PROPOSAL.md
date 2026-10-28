# UI refresh: Apple-style glass / liquid look (APPLIED, both themes)

**Status:** implemented in `apps/web/app/globals.css` (tokens `--glass*`, `--ambient`, `--grad`, block "Glass / liquid refresh"). Verified in the browser in dark and light; text/accent/status contrast measured >= 4.5:1 on glass in both themes (primary-button gradient deepened after a 3.2:1 failure). **Not tested:** the `@supports` no-blur fallback, low-end GPU performance, Safari/Firefox, high-contrast mode.


## Review of the current UI (honest)
Works and is consistent, but looks like a developer tool: flat opaque panels, hard 1px borders everywhere, small dense type in nodes, many equal-weight outlined buttons, and a lot of dark-grey-on-dark-grey.

## Proposed direction
1. **Glass surfaces** for floating things only (top bar, chat pane, settings pane, pickers, rail): translucent fill + `backdrop-filter: blur(24px) saturate(160%)`, 1px inner highlight (top edge brighter), soft layered shadows. Keep the canvas itself calm and opaque so nodes stay legible.
2. **Depth & colour**: a subtle ambient gradient behind the canvas (two soft blurred colour blobs, very low contrast) so the glass has something to refract; accent as a gradient (indigo→violet) for primary actions and the chat bubble.
3. **Shape language**: larger radii (16-20px panels, 12px controls, fully round pills), continuous-corner feel, fewer borders (use shadow + fill contrast instead).
4. **Typography**: system SF stack with tighter tracking for headings, 13-14px body, 600 weight for titles, bigger agent names in nodes; tabular numbers for metrics.
5. **Icons**: keep one family (lucide, 1.75px stroke) but render in rounded "squircle" tiles with soft gradients (like app icons); colour per type (agent indigo, tool green, endpoint amber).
6. **Motion**: spring-like easing (cubic-bezier .2,.8,.2,1) for panel slide/open, tiny scale on press, tick/cross badge pop; all disabled for reduced-motion.
7. **Light/dark**: both get glass; light uses white 60-70% fill with a faint tint, dark uses 6-10% white fill on near-black.
8. **Performance & accessibility guardrails**: blur only on a few large surfaces, `@supports not (backdrop-filter)` fallback to opaque, keep text contrast >= 4.5:1 on the glass, never rely on colour alone.

## Layout tweaks
Collapse the left list by default (rail only), make the canvas full-bleed under floating glass bars, dock chat as a floating card with margin rather than a full-height column, group top-bar actions into one pill.

## Effort / risk
CSS-only for 1-3 and 7 (about half a day incl. testing both themes); icon tiles and layout tweaks another half day. Risk: blur cost on low-end GPUs and reduced legibility on busy canvases, so apply to chrome only.
