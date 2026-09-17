# Canvas Agent Upgrades — Design Spec (approved 2026-09-18)

## Goal
Make the canvas-view Agent panel work like the reference (Framer-style agent
interaction): the agent reads the canvas, edits MULTIPLE elements directly per
user request with a live step-by-step activity feed, and every change stays
visible, editable, and undoable. User-approved full package.

## Context (current)
- `AgentPanel.jsx`: viewed pill, pin-selection scope, quick skills (selection
  patches + page actions + translate), audit + fix, versions/rollback, shared
  thread (`threadNode`), model footer.
- `agentSend` (`App.jsx`): selection scope → ONE `{css, text}` patch via a
  fenced ` ```patch ` block (or full-page `run()` for page scope). Strict
  retry once. Writes via `onPatch` + `setLiveApply`.
- Canvas already reports a layer tree (`inui:layers` → `layers` state:
  `{tag, text, selector, kids}`); currently used by Layers panel only.
- Undo exists via `snapshot()` + versions list.

## 1. Multi-patch protocol
- The ` ```patch ` block accepts ONE object OR an ARRAY of
  `{selector?, css?, text?}` (max 12 per turn; extras dropped + reported).
- `parsePatchFromText` returns `{css, text} | {patches: [...] } | null`
  (single-object shape unchanged for old callers).
- `agentSend` applies patches one by one through `onPatch` (+ `setLiveApply`
  per item so the canvas updates live), counts applied/skipped, and posts
  "Edited N layer(s)" (+ per-item failures) to chat and feed.
- Selector matching: each patch selector must resolve against the known
  layer tree (exact selector string from context, or element still present
  via `document.querySelector` at apply time in the child). Unknown
  selectors are skipped + reported, never applied blind. Empty css+text
  skipped. One item failing never aborts the rest.
- The strict-retry path requests the same array format.

## 2. Layer context ("Read N layers")
- `buildPatchSystemPrompt` gains an optional condensed layer tree: up to ~40
  nodes as `tag | "text…" | selector` lines, plus instruction to answer with
  a patch ARRAY addressing listed selectors.
- `agentSend` passes `layers` state in; feed records "Read N layers".
- Prompt budget: tree text capped (~3000 chars); selection detail stays
  first-class (pinned/selected element described fully as today).

## 3. Activity feed (live, real timings)
- `AgentPanel` shows a timeline above the thread (max ~8 rows, auto-scroll):
  rows `{id, label, detail?, secs?, state: running|done|error}` driven by
  `agentSend` milestones: Viewed <page>, Read N layers, Edited N layers,
  Worked Ns total, failures. No fake animations — measured times only.
- Feed state lives in `App` (`agentSteps`) so generation and panel share it;
  cleared per convo switch (ephemera) like `pendingTools`.

## 4. Safety (unchanged architecture)
- One `snapshot()` per agent turn BEFORE applying (undo via existing
  History). Cap 12 patches. Unknown selectors rejected. Failures isolated
  per item and reported. No new state shape for files/overrides.

## Non-goals
Page-scope full regen flow untouched; no CMS/SEO/publish agents; no prompt
attachments in agent panel; no follow-up star ratings; no changes to the
selection/hover mechanics in the canvas child.

## Testing
- Unit (`npm test`): array/single/invalid patch parsing; selector allow/skip;
  12-cap; layer-tree condensing caps; feed row lifecycle (pure helpers where
  possible). Fan-out uses a pure `matchPatches(patches, knownSelectors)`
  helper (partition applicable/skipped) so the matching logic is unit-tested
  without an LLM.
- Headless: seeded layers + canned multi-patch reply through `agentSend`
  path is LLM-dependent — instead verify apply-fan-out by dispatching
  multiple `inui:patch` messages and asserting overrides/feed entries.
- `npm run build` passes; console-error smoke clean.
