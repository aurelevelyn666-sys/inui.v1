# Deploying Inui

Inui is a fully static Vite + React app. `npm run build` produces a `dist/`
folder you can host anywhere — no backend, no server runtime. Users bring
their own API key (stored in their browser's localStorage); nothing sensitive
is bundled.

## 1. Build

```bash
npm ci
npm run build     # outputs dist/
npm run preview   # optional: smoke-test the production build locally
```

The build checks to pass before shipping:

- `vite build` completes with no errors (watch for "✓ built in …s")
- `dist/index.html` exists and references hashed `/assets/*` files
- `dist/babel.min.js` exists — **required at runtime** (the in-browser
  transpiler; the app throws "Babel failed to load" without it)
- `dist/_headers` exists (copied from `public/`)

## 2. Caching policy (already configured)

| Path             | Header                                            | Why                                   |
| ---------------- | ------------------------------------------------- | ------------------------------------- |
| `/assets/*`      | `public, max-age=31536000, immutable`             | Hashed filenames — cache forever      |
| `/index.html`    | `public, max-age=0, must-revalidate`              | Must revalidate so deploys go live    |
| `/babel.min.js`  | `public, max-age=86400, stale-while-revalidate`   | Large (3 MB) and stable               |

These live in `public/_headers` (Netlify/Cloudflare Pages) and
`vercel.json` (Vercel). On nginx, add the equivalent config (below).

## 3. Host-specific instructions

### Netlify

1. Connect the repo (or use `npx netlify-cli deploy --prod --dir=dist`).
2. Build command `npm run build`, publish directory `dist`.
3. `public/_headers` is copied into `dist/` automatically — no extra config.

### Vercel

1. Import the repo; framework preset **Vite** is auto-detected.
2. `vercel.json` at the repo root already sets rewrites + cache headers.
3. Or CLI: `npx vercel --prod`.

### Cloudflare Pages

1. Connect repo; build command `npm run build`, output `dist`.
2. `public/_headers` ships with the build. SPA fallback is automatic for a
   static site with a single `index.html`.

### nginx

```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /var/www/inui/dist;
  index index.html;

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }
  location = /babel.min.js {
    add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800";
  }
  location / {
    add_header Cache-Control "public, max-age=0, must-revalidate";
    try_files $uri /index.html;
  }

  # gzip saves ~65% on the JS bundle
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
}
```

### Docker / any static container

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## 4. HTTPS is required, not optional

Two features silently break on plain HTTP (non-localhost):

- **Clipboard** (copy buttons, export) — `navigator.clipboard` is undefined
- **Voice input** — `SpeechRecognition` needs a secure context

Deploy behind HTTPS from day one (all hosts above do this automatically).

## 5. Smoke test after deploy

1. Open the site — check the favicon + "What are we building?" loads.
2. Settings → paste Base URL / API key / Model ID → **Test connection** → green.
3. Generate a template (e.g. Pricing modal) — preview should render.
4. Click **Export ZIP** (folder icon in preview header) — the archive must
   contain the project files **plus a runnable `index.html`**.
5. Reload the page — the conversation must still be in the sidebar.

## 6. Notes

- There is no server-side state; wiping the host cannot lose user data.
- API keys stay in each user's browser localStorage — they are never sent
  anywhere except the user's configured Base URL.
- The external CDNs used by generated sites (Tailwind CDN, unpkg React)
  are loaded inside the user's browser preview iframe, not by your host.
