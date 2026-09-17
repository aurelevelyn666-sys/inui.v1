# Manus-Style 3-Column Layout — Design Spec (approved 2026-09-17)

## Goal
Reshape the chat view into a Manus-like 3-column workspace so the live preview
is large, permanent, and first-class — while keeping canvas editing as a
separate view. User-approved approach A (retrofit), not a new unified
workspace.

## Context (current)
- Chat view: icon rail (64px) + `ConvoSidebar` (248px, collapsible to mini) +
  thread (`ChatPane`) + right column that swaps between Files/Diff/Activity
  panel (280px, `showPreview=false`) and `PreviewMini` (`showPreview=true`).
- `PreviewMini` owns `paneW` (320–1400, drag left edge), `device`, `refreshKey`;
  fixed-viewport iframe with inner scroll; hidden below `lg`.
- Canvas view (`PreviewCanvas` + left/right panels) is untouched by this spec.

## Layout (chat view, full height)
- **Col 1 — 248px, collapsible to 56px mini rail.** Adapted nav only:
  primary "New task" button (= today's New Chat), Search (existing), nav rows
  Skills (opens Settings → Skills tab) and Templates (opens templates view),
  history groups Today / Yesterday / Older (existing list UI), account footer
  (existing). No Plugins / Scheduled / Library / Projects / Tasks — no backend.
- **Col 2 — flexible, min 340px.** The thread as-is: messages, streaming,
  composer (Build/Image, attach, tools, voice), Files/MCP tabs kept.
- **Col 3 — flex-1, min 320px.** Big live preview, always mounted once
  `hasBuild`; before the first build it shows the existing PreviewMini empty
  state. The Files/Diff/Activity panel goes away in this layout (files stay
  reachable via the thread's Files tab).

## Preview toolbar (single row, Manus-like)
- Left: device toggles Desktop / Tablet / Phone (existing) + URL/path bar:
  home icon + active entry path (e.g. `App.jsx`); clicking the path opens a
  small dropdown listing project entries (App `entries` + `setEntry`, new UI
  on existing state).
- Right: Reload, Open in new tab, **Edit** (→ `setView('canvas')`, existing
  handoff), **Publish ▾**, Close (existing collapse behavior).
- Preview | Code toggle (approved amendment 2026-09-17): Code mode is a
  read-only viewer — left file tree rendering the FULL project file set
  (reuse `FileTree`, shared `activeFile` state with the Files tab), right code
  pane with line numbers + lightweight JSX/CSS highlighting (dependency-free
  tokenizer: keywords, strings, comments, tags, attributes, numbers) +
  breadcrumb path + per-file copy (`CopyBtn` pattern) and download
  (`downloadBlob`). No editing in Code mode (edits stay in the Files-tab
  textarea and the canvas); no diff/git tabs, no search-in-files.

## Publish menu
Dropdown from Publish ▾ with: Download site.html, Export project ZIP, divider,
Open in new tab. All reuse existing handlers (`downloadHtml`, `exportZip`,
`openTab`) including the popup-blocker fallback. No real deploy backend.

## Resize + sidebar auto-minimize (user requirement)
- Dragging the preview's left edge left widens the preview and squeezes the
  thread, but **never covers it**: thread min width is 340px; the drag clamps
  at `paneW ≤ stageW − sidebarW − 340` (feels like hitting a wall).
- When the thread would drop below 340px with the full 248px sidebar, the
  sidebar **auto-minimizes to the 56px mini rail** (history stays reachable).
- Restoring: dragging back so the thread *with full sidebar* exceeds
  340 + 80 (hysteresis, no flicker) restores the full sidebar — **unless the
  user minimized manually**, which always wins and is never overridden
  (track auto-vs-manual with a ref flag).
- Implementation: lift `paneW` state from `PreviewMini` to `App`; measure the
  chat content area with a ResizeObserver (`stageW`); clamp in the pane-width
  setter; run the minimize/restore rule in an effect on `[paneW, stageW]`.
  First measurement picks a proportional default (~52% of stage) until the
  user touches the width.
- Below 768px the rule is disabled; the sidebar stays an overlay as today.

## States
- No build: col 3 empty state (existing copy). `<lg`: preview hidden with the
  existing floating open control (unchanged responsive behavior).
- Close (toolbar) hides col 3 entirely so the thread takes full width; a
  floating eye-icon "Preview" button at the thread's bottom-right reopens it
  (reuses the existing `showPreview` state, default open on fresh build).
- Loading/error/preview-build-failed states: unchanged from PreviewMini.

## Non-goals (explicitly out)
Real deploy backend; star ratings; follow-up suggestion rows; task cards in
the thread; Projects / Scheduled / Plugins / Library; touching the canvas
view; changing the generation pipeline, prompts, or skills.

## Testing
- `npm run build` passes.
- Headless screenshots: 3-column desktop, sidebar auto-minimized state,
  collapsed preview, empty state; zero console errors.
- Interaction probe: drag preview wider → thread never under 340px, sidebar
  minimizes/restores per rule; Publish menu items download; Edit reaches
  canvas and back.
