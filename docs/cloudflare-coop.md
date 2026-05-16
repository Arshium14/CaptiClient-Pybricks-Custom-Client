# Cloudflare Co-op Hosting

This repo keeps the local Node co-op server for development and adds a Cloudflare Worker/Durable Object backend for hosted co-op.

## Deploy Shape

- React app: Cloudflare Pages, built from this repo's normal `build` output.
- Co-op backend: `cloudflare/coop-worker.ts`, deployed with Wrangler.
- Durable Object: `CoopRoom`, one object per room code.
- Room programs: persisted in Durable Object SQLite-backed storage.
- Program text: persisted as Yjs document updates in Durable Object storage.

## Commands

Install Wrangler outside the app dependency graph or use `npx`:

```powershell
npx wrangler deploy
```

For local Worker testing:

```powershell
npx wrangler dev
```

After deploying, set the React app environment variable before building/deploying the frontend:

```text
REACT_APP_COOP_WEBSOCKET_URL=wss://<your-worker>.<your-subdomain>.workers.dev
```

The app derives the HTTP room-program API from the same URL, so this one variable covers both WebSocket sync and `GET/POST /api/rooms/<room>/programs`.

## Why This Is Separate From `scripts/coop-server.js`

The local server is still useful because it is fast and easy to run on your machine:

```powershell
node .yarn\releases\yarn-3.3.0.cjs coop:server
```

The Cloudflare Worker is the hosted version. It avoids Render-style spin-down and persists room metadata/program docs in Durable Object storage.
