# Canvas Redesign + New Design System — Spec (approved 2026-09-18)

## Goal
Total visual + UX overhaul of the canvas page only, in a light premium
language distilled from the approved references (3D-app shell, Acme app
frame, floating option cards, shadow/auto-layout/fill cards, align minis,
Framer dark canvas as anti-reference for tone). Chat/home are untouched.

## Design language (locked)
- Light, soft, calm. Surfaces float on gray; nothing is full-bleed harsh.
- Actions are black pills; color appears only for status/info (light-blue
  Draft-style badges, links, success/error dots).
- One typeface everywhere: Inter (UI 11–13px medium labels, 15–18px semibold
  panel titles, tabular-nums for numbers). Mono only for code/paths.

## Token system `cui-*` (canvas scope only)
- `cui-backdrop`: #e9e9ed (app sits on it, not edge-to-edge).
- `cui-surface`: #ffffff (cards, panels, toolbar).
- `cui-inset`: #f4f4f6 (input fields, segmented track, wells).
- `cui-ink`: #131316. `cui-sub`: #6d6d74. `cui-faint`: #a3a3ab.
- `cui-line`: rgba(0,0,0,.08) hairline borders.
- `cui-action`: #101014, hover #000 (primary pills, white text).
- `cui-info`: #2f6bff surfaces as #e8effe bg tint (status badges, links).
- Radius: app frame 20px; cards 16–20px; inputs 12px; pills full.
- Shadow: one soft large token for floating cards
  (`0 12px 40px rgba(0,0,0,.10)`); segmented active segment gets a small
  `0 1px 3px rgba(0,0,0,.12)`.
- All tokens as explicit `cui-` classes in `index.css` (no global overrides),
  so chat/home can never be affected. Verified via diff (canvas files only).

## Concrete shapes (from the reference crop)
1. **Floating app frame**: canvas view root gets gray `cui-backdrop` padding
   (8–12px) + inner app card `radius 20 + hairline border + soft shadow`,
   `overflow-hidden`. Visual-only wrapper; layout columns unchanged.
2. **Light active rail**: `IconRail` gains a `tone="soft"` prop used only by
   canvas — active item becomes light-gray rounded square + dark icon
   (default black-active styling stays for chat/home).
3. **Segmented pill**: `cui-inset` track + white active segment with small
   shadow (breakpoint/mode switchers, Design/Agent tabs stay text tabs —
   out of scope unless trivial).
4. **Buttons**: primary = black full pill, medium weight; secondary = white
   pill, hairline border. Icon buttons 28–32px, `cui-inset` hover.
5. **Dotted stage**: canvas scroll area gets a subtle radial dot pattern
   (`radial-gradient(rgba(0,0,0,.10) 1px, transparent 1px)`, 22px grid) over
   the gray stage. Pure CSS.
6. **Status badge (Draft pattern)**: light-blue pill (`#e8effe` bg,
   `#2f6bff` text) for branch/version indicators.
7. **Empty-state card**: soft white card — short guidance text + black
   primary action + outline secondary — for empty Layers/Audit/Versions/
   Comments states (replaces bare "Nothing yet" lines).
8. **Input rows**: label-left / control-right, `cui-inset` 12px fields
   (inspector, toolbar selects, search).
9. **Coachmark + context menu** keep their structure, restyled to black pill
   + white 16px card to match.

## Application map (canvas files only)
- `index.css`: new `cui-*` block.
- `App.jsx` canvas view only: frame wrapper, topbar restyle, branch pill tint.
  (No IconRail in canvas view — the rail stays a chat/home component, so no
  rail changes were needed after all.)
- `PreviewCanvas.jsx`: toolbar pills, breakpoint bar segmented, dotted stage,
  coachmark (already black pill — verify), `CtxMenu` card.
- `LeftPanel.jsx`: Pages/Layers/Assets cards, layer rows, search field.
- `Inspector.jsx`: field/select/segment/button primitives.
- `AgentPanel.jsx`: pin card, skill chips, feed rows, audit/versions cards.
- `IconRail.jsx`: additive `tone` prop only.

## Dark-mode rule
New system is light-only. `cui-` selectors outrank the existing `html.dark`
overrides so the canvas stays consistently light even with app dark mode on.
No new dark variants (non-goal).

## Non-goals
No column/layout changes, no behavior or prompt changes, no other pages,
no new features, no dark canvas theme, no dependency additions.

## Testing
- `npm run build` passes; `npm test` green.
- Headless screenshots (light, full canvas + panels) reviewed by eye.
- Click sweep of the canvas view with zero failures; generation/selection/
  patch/agent flows untouched (visual-only diff).
