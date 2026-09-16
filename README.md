# Inui — Agent Web Harness

Describe a website in plain language and get live, editable React code: chat with any OpenAI-compatible model, watch the site render live, edit it visually on a Framer-like canvas, and export with one click. No backend — 100% static Vite + React + Tailwind. You bring your own API key.

## Features

- **Chat-to-website** — multi-file React output (`/App.jsx`, `/components/*`, `/index.css`) streamed from any OpenAI-compatible endpoint, with self-healing format recovery and automatic build-error repair passes.
- **Live preview** — sandboxed iframe reloads on every settled build; open in a new tab or keep editing.
- **Visual canvas** — click-select, drag-move, resize handles, double-click text edit, right-click menu (order, duplicate, group, lock, comment), style inspector, and "fold into code" to bake visual edits back into source.
- **MCP tools** — connect remote Streamable-HTTP / legacy-SSE servers, toggle tools, auto or approved execution; built-in `web.search` and local demo tools included.
- **Image mode** — generate images through a connected image MCP tool.
- **Built-in Apple Design skill** — every generation follows distilled HIG rigor + craft rules (token system, anti-template filter, contrast/target minimums). Disable anytime in Settings → Skills; add your own brand skills there too.
- **History & versions** — persisted conversations in the sidebar, per-build snapshots with one-click restore, audit panel with AI fix.
- **Export** — standalone `site.html` download or full-project ZIP (files + runnable `index.html`).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

1. Open the app, click the **gear** icon (top right).
2. Fill **Base URL** (OpenAI-compatible, e.g. `https://api.openai.com/v1`), **API key**, **Model ID**.
3. **Test connection** → green means good.
4. Describe the site ("a dark landing page for a coffee brand") and hit Send.

Keys stay in your browser's `localStorage` and are only ever sent to your configured Base URL.

## Scripts

| Command         | What it does                        |
| --------------- | ----------------------------------- |
| `npm run dev`   | Start the dev server (port 5173)    |
| `npm run build` | Production build into `dist/`       |
| `npm run preview` | Smoke-test the production build   |

## Project layout

```
src/
  App.jsx               # orchestrator: agent loop, convos, versions, canvas state
  main.jsx              # entry + crash boundary
  index.css             # Tailwind v4 + dark theme
  lib/
    llm.js              # OpenAI-compatible client (streaming, retry, budgets)
    files.js            # file parsing, JSX transpile, sandboxed preview builder
    mcp.js              # MCP client (Streamable HTTP + SSE fallback)
    builtin-skills.js   # built-in skills wiring
    attach.js           # image/text attachments
    templates.js        # starter prompts
    zip.js              # zero-dependency ZIP writer + downloads
  components/           # chat, canvas, preview, inspector, panels, modals
skills/
  apple-design.md       # built-in generation skill (distilled HIG + craft)
public/
  babel.min.js          # in-browser JSX transpiler (required at runtime)
```

The full 122-page HIG reference set for the apple-design skill lives outside this
repo (local Claude skill); the web agent uses the distilled rules in `skills/`.

## Deploy

Static hosting only — see [DEPLOY.md](DEPLOY.md) for Netlify / Vercel / Cloudflare Pages / nginx / Docker instructions, cache policy, and the post-deploy smoke test. `npm run build` must include `dist/babel.min.js`; the app cannot transpile previews without it.

## Notes

- Generated previews load React + Tailwind from CDN inside the sandboxed iframe (needs network).
- Clipboard and voice input require a secure context (HTTPS or localhost).
