# Inui Web Harness — Design Spec (approved 2026-09-14)

## Goal
Browser-based harness to chat with any OpenAI-compatible agent (BYO Base URL + API Key + Model ID),
with Codex-like live preview of multi-file React output, remote MCP tool connections (e.g. Higgsfield),
and a Framer-like editable canvas (click-select, drag-move, resize, style inspector).

## Decision
Option A: 100% frontend Vite + React + Tailwind. No backend. Keys in localStorage only.

## Architecture
- `src/lib/llm.js` — OpenAI-compatible `/chat/completions` with SSE streaming + non-stream fallback.
  System prompt forces `FILES_JSON` output + optional `TOOL_CALL` blocks.
- `src/lib/files.js` — parses files from assistant markdown; transpiles JSX in-browser
  (@babel/standalone, classic runtime); builds sandboxed `srcDoc` preview (opaque origin,
  `allow-scripts` only) with React UMD + Tailwind CDN + injected editor script.
- `src/lib/mcp.js` — Streamable-HTTP MCP client with legacy SSE fallback; local demo tools.
- Preview/editing bridge is `postMessage` only (generated code can never touch keys).

## Screens
- Home (Grok Business dark ref): icon rail, centered brand + `What do you want to build?` pill,
  template shortcuts, Private badge, settings gear.
- Editor (Framer ref): left rail (56px) + chat pane with Chat/Files/MCP tabs (380px)
  + preview canvas center + inspector right (300px). Canvas opens automatically after generation.

## Live preview (Codex-like)
Agent returns `FILES_JSON: {"/App.jsx": "..."}` → merged into project → debounced rebuild (~500ms)
→ sandboxed iframe reload. Follow-ups resend current files for incremental edits. Errors shown
inline (parent-side transpile errors + in-iframe runtime error overlay via postMessage).

## Canvas editing (Framer-like, scoped v1)
Modes: Select (click = blue outline + breadcrumb) / Drag (move via transform, resize via handles,
double-click text edit). Every change posts a patch to the parent, stored as overrides:
`styles: {selector: css}` (also injected as CSS so they survive reloads) and
`texts: {selector: string}` (re-applied at runtime). Inspector edits text/color/size/spacing.
"Fold into code" sends overrides to the agent to bake into source. Full vector drawing excluded v1.

## MCP
Settings/MCP tab: add remote HTTP/SSE URLs, connect, toggle tools. Tools injected into system
prompt; agent emits `TOOL_CALL`; harness executes (auto or confirm) and feeds results back (max 3 hops).
Failures are inline and never break chat.

## Error handling / testing
Bad key/URL, CORS blocks, bad file JSON, MCP timeouts → inline messages with retry.
Smoke test: set key → generate landing page → preview renders → drag + edit → re-prompt keeps edits.
