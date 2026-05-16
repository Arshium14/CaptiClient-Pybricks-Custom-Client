# CaptiClient / Pybricks Code Restyle Roadmap

This file is a handoff note for future Codex threads. It summarizes the local Pybricks Code customization work, where the important files live, how to run/check the app, and what still needs attention.

## Project Location

- Repo: `C:\Users\mahbo\Documents\New project\pybricks-code`
- Upstream source: `https://github.com/pybricks/pybricks-code`
- Local dev URL: `http://localhost:3000/`
- LAN URL used earlier: `http://192.168.0.93:3000`

## Running The App

Use the bundled Yarn release in the repo:

```powershell
node .yarn\releases\yarn-3.3.0.cjs start
```

The dev server was previously started in the background with:

```powershell
$env:BROWSER='none'; $env:HOST='0.0.0.0'; $env:PORT='3000'; node .yarn\releases\yarn-3.3.0.cjs start *> dev-server.log
```

Start the local co-op WebSocket server in a second terminal with:

```powershell
node .yarn\releases\yarn-3.3.0.cjs coop:server
```

It defaults to `0.0.0.0:1234`, which matches the local client default `ws://localhost:1234` for same-machine testing. For another device on the LAN, start/restart the React app with `REACT_APP_COOP_WEBSOCKET_URL` pointing at this computer's LAN address, for example `ws://192.168.0.93:1234`.

Cloudflare hosted co-op backend:

- Worker/Durable Object entry: `cloudflare/coop-worker.ts`
- Wrangler config: `wrangler.toml`
- Deployment notes: `docs/cloudflare-coop.md`
- Typecheck:
  ```powershell
  node .yarn\releases\yarn-3.3.0.cjs coop:cloudflare:check
  ```
- Deploy after installing/authenticating Wrangler:
  ```powershell
  node .yarn\releases\yarn-3.3.0.cjs coop:cloudflare:deploy
  ```
- Set the frontend build env to the deployed Worker URL, for example:
  ```text
  REACT_APP_COOP_WEBSOCKET_URL=wss://capticlient-coop.<account>.workers.dev
  ```

Checks:

```powershell
node .yarn\releases\yarn-3.3.0.cjs tsc --noEmit
node .yarn\releases\yarn-3.3.0.cjs eslint "*/**/*.{js,ts,tsx}" --quiet
```

These non-mutating checks currently pass. The repo's `lint` script also passes, but it runs ESLint with `--fix`, so prefer the commands above when reviewing without changing files. `dev-server.log` is generated output and is untracked.

## Important Build Note

`config/webpack.config.js` was patched so `LicensePlugin` only runs in production:

```js
isEnvProduction && new LicensePlugin(require('./licenses')),
```

This was needed because the dev server was failing locally on the license plugin. Production still uses it.

## Visual Style Direction

The whole app is being restyled into a soft Material Design 3 inspired green/white theme:

- Main green: `#338e7f`
- Secondary green: `#4aa28f`
- Mint: `#acebc9`
- Light background: `#f3efe8`
- Light panel: `#ffffff`
- Dark background: `#101918`
- Dark panel: `#172523`
- Dark secondary panel: `#1f302d`

Theme tokens are in:

- `src/variables.scss`

Global Blueprint overrides are in:

- `src/index.scss`

## Major Changes Made

### General Theme

Restyled app chrome, panels, dialogs, popovers, buttons, hover states, scrollbars, tree selection, tabs, tooltips, inputs, and dark mode.

Key files:

- `src/variables.scss`
- `src/index.scss`
- `src/app/app.scss`
- `src/status-bar/status-bar.scss`
- `src/settings/settings.scss`
- `src/terminal/terminal.scss`
- `src/components/external-link.scss`
- `src/tour/Tour.tsx`

Dark mode was specifically fixed so side panels, settings, explorer, editor, toolbar, dialogs, and tutorial bubbles use readable dark surfaces.

### Activity Rail

The left activity rail now has:

- Home
- File Explorer
- Settings & Help

Icons were replaced with inline MD3-style rounded SVGs.

Key files:

- `src/activities/Activities.tsx`
- `src/activities/activities.scss`
- `src/activities/hooks.ts`
- `src/activities/translations/en.json`

Home enum:

```ts
Activity.Home = 'activity.home'
```

### Home Area

Added a Home panel above File Explorer. It shows:

- Recent programs from currently/recently opened editor tabs
- Saved programs from IndexedDB file metadata
- New button that opens the existing new file wizard
- Co-op Room section for creating temporary room codes, joining by code, copying invite links, and preserving a local display name
- Room programs that are listed by the local co-op server and shared across browsers/devices in the same room
- Selecting or creating a room program opens a local mirror editor tab named like `Co-op <room> - <program> [<id>].py`, so the room program behaves like a file in the UI
- When a room program mirror tab is active, Monaco binds to that room program's Yjs shared document for live co-op editing and remote cursor awareness.

Key files:

- `src/home/Home.tsx`
- `src/home/home.scss`
- `src/coop/events.ts`
- `src/coop/collaboration.ts`
- `src/editor/Editor.tsx`
- `src/editor/editor.scss`

It uses:

- `useFileStorageMetadata()` from `src/fileStorage/hooks.ts`
- `editor.openFileUuids` from Redux
- `explorerUserActivateFile`
- `explorerCreateNewFile`
- `NewFileWizard`
- `yjs`, `y-websocket`, and `y-monaco` for live editor collaboration.

Co-op server note:

- The client defaults to `ws://localhost:1234`.
- The repo now includes a local co-op server script: `node .yarn\releases\yarn-3.3.0.cjs coop:server`.
- The repo also includes a Cloudflare Worker/Durable Object backend for hosted co-op without Render-style spin-down.
- Set `REACT_APP_COOP_WEBSOCKET_URL` before starting/building the React app to point at a hosted/private Yjs WebSocket server for real teammates on different devices. Restart the dev server after changing it.
- Same-browser tabs can still share some updates through the provider's local broadcast channel, but real co-op needs the WebSocket server.
- Co-op editing uses one shared document per room program (`capticlient:<room>:program:<program>`). Browser B can select the same room program in Home to open a local mirror tab that binds to the shared room program.
- Room programs are exposed by `GET/POST /api/rooms/<room>/programs`. The local server stores them in memory; the Cloudflare backend stores room metadata and Yjs document updates in Durable Object storage.
- The editor's normal same-file lock is still in place. Opening the same saved IndexedDB file in two tabs can still show the existing file-in-use warning until a cleaner shared-file ownership flow is designed.

### Editor

Changes:

- Removed the `BETA` watermark from the editor area.
- Set Monaco/code editor font to Google Sans Code.
- Loaded Google Sans Code in `public/index.html`.
- Restyled editor tab list and empty welcome surface.

Key files:

- `public/index.html`
- `src/editor/Editor.tsx`
- `src/editor/editor.scss`
- `src/editor/Welcome.tsx`

Monaco option:

```ts
fontFamily: '"Google Sans Code", Consolas, monospace'
```

### Toolbar

Changes:

- USB, Bluetooth, Run, Stop, and REPL icons replaced with softer rounded MD3-ish SVGs.
- Buttons kept in original connected groups, with only slightly smoothed outer corners.
- Added `CAPTICLIENT` wordmark to the right of Run/Stop/REPL group.
- Wordmark uses local Pro Pixie font from user-provided zip.
- Added AI button next to the wordmark.
- Added CaptiClient info button beside Sponsor. It explains that CaptiClient is a customized interface built from MIT-licensed Pybricks Code, is not an official Pybricks product, and keeps required Pybricks copyright/license notices.

Key files:

- `src/toolbar/Toolbar.tsx`
- `src/toolbar/toolbar.scss`
- `src/capticlient/CaptiClientDialog.tsx`
- `src/toolbar/buttons/capticlient/`
- `src/toolbar/fonts/pro-pixie.ttf`
- `src/toolbar/buttons/usb/connected.svg`
- `src/toolbar/buttons/usb/disconnected.svg`
- `src/toolbar/buttons/bluetooth/connected.svg`
- `src/toolbar/buttons/bluetooth/disconnected.svg`
- `src/toolbar/buttons/run/icon.svg`
- `src/toolbar/buttons/stop/icon.svg`
- `src/toolbar/buttons/repl/icon.svg`

The Pro Pixie font came from:

- `C:\Users\mahbo\Downloads\pro-pixie-font.zip`

### Jerry AI

Added an AI coding helper dialog, now named `Jerry AI`.

Capabilities:

- Toolbar `AI` button opens the dialog.
- `Use Current Code` attaches the currently open editor contents to the next Jerry AI request.
- Jerry replies include an `Insert in editor` action that inserts the returned code block, or whole answer if no fenced block exists, into the current editor selection/cursor.
- The terminal context menu includes `Ask Jerry`, using selected terminal text or recent terminal output to prefill a debugging prompt.
- User can add/remove many Gemini API keys.
- User can manually choose active key.
- Gemini requests include Google Search grounding, so Jerry can use internet context for non-Pybricks information.
- Pybricks API/code guidance is still instructed to use the local Pybricks v3.6.1 PDF excerpts as the main source of truth.
- On `429` / `RESOURCE_EXHAUSTED`, the key is put on cooldown.
- Jerry automatically tries the next available key.
- If Gemini provides `RetryInfo.retryDelay`, it uses that cooldown; otherwise defaults to 60 seconds.
- Keys are stored in `localStorage`.
- Old single-key storage can migrate into the new key list.

Important caveat:

- Google Gemini rate limits are applied per project, not per API key. Multiple keys from the same Google project may share quota. This rotation is most useful with keys from different projects.

Key files:

- `src/ai/AiAssistant.tsx`
- `src/ai/ai.scss`
- `src/toolbar/Toolbar.tsx`

Storage keys:

- `capticlient.ai.geminiApiKey` legacy single key
- `capticlient.ai.geminiApiKeys` new multi-key list
- `capticlient.ai.activeGeminiApiKey` active key id

Model:

```ts
const model = 'gemini-3-flash-preview';
```

### Pybricks PDF Knowledge Source

Jerry AI now uses local excerpts from the official Pybricks v3.6.1 PDF documentation.

Files:

- `src/ai/docs/pybricks-v3.6.1.pdf`
- `src/ai/docs/pybricks-v3.6.1.txt`

Source PDF URL:

- `https://docs.pybricks.com/_/downloads/en/stable/pdf/`
- This is a moving `stable` URL. The bundled local files should be treated as the pinned v3.6.1 source for this branch unless a future thread intentionally refreshes them.

Extraction:

- Downloaded PDF to `src/ai/docs/pybricks-v3.6.1.pdf`
- Extracted text with bundled Python and `pypdf`
- Result: 207 pages, about 313k characters
- Local file sizes at handoff: PDF 4,485,585 bytes; extracted text 323,201 bytes

The app imports the `.txt` as an asset URL and fetches it at runtime:

```ts
import pybricksDocsUrl from './docs/pybricks-v3.6.1.txt';
```

TypeScript declaration for `.txt` assets added in:

- `src/react-app-env.d.ts`

Retrieval behavior:

- `getDocsContext(query)` tokenizes the user query.
- It chunks the extracted PDF text.
- It scores chunks by matching query terms.
- It sends the top matching excerpts to Gemini.
- The system prompt tells Jerry AI to answer only from the provided Pybricks v3.6.1 documentation excerpts and say when the excerpts are insufficient.

Recent follow-up:

- Docs chunks are now cached after the first PDF text load so each Jerry AI send does not rechunk the full extracted documentation.
- Gemini API key cooldowns now schedule a dialog refresh when the next cooldown expires, so disabled send state and `retry in ...s` labels update without requiring extra user interaction.
- Jerry AI now enables Gemini Google Search grounding for outside context, while the prompt keeps Pybricks coding grounded in the bundled PDF excerpts.
- Jerry AI can now pull in the current editor code, insert generated code into the current editor, and open from terminal output via the terminal context menu.
- Home now has a Co-op Room setup surface. It creates and joins room codes, stores them in the URL as `?coop=<room>`, creates/selects room programs stored by the co-op server, stores active room programs in the URL as `?program=<program>`, and opens local mirror files that bind to that room program's Yjs/WebSocket shared document.

## External API Notes

Gemini endpoint used:

```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent
```

Header:

```text
x-goog-api-key: <key>
```

The app is browser-only, so API keys are stored locally in the browser and requests are made directly from the frontend. This is OK for private/local use, but for public sharing, use a backend proxy so keys are not exposed.

## Current Git Status Summary

Modified existing areas:

- `config/webpack.config.js`
- `package.json`
- `public/index.html`
- `src/about/icon.svg`
- `src/activities/*`
- `src/app/*`
- `src/components/external-link.scss`
- `src/editor/*`
- `src/explorer/explorer.scss`
- `src/index.scss`
- `src/react-app-env.d.ts`
- `src/settings/settings.scss`
- `src/status-bar/status-bar.scss`
- `src/terminal/*`
- `src/toolbar/*`
- `src/tour/Tour.tsx`
- `src/variables.scss`
- `yarn.lock`

New areas:

- `cloudflare/`
- `docs/cloudflare-coop.md`
- `src/ai/`
- `src/coop/`
- `src/home/`
- `scripts/coop-server.js`
- `src/toolbar/fonts/`
- `wrangler.toml`
- `roadmap.md`

Untracked/generated:

- `dev-server.log`
- `coop-server.log`

## Known Caveats / Things To Recheck

- Browser screenshot capture has timed out a few times in the in-app browser, even when the dev server compiles cleanly.
- The AI request path has not been tested with a real Gemini API key in this thread.
- Multiple Gemini API keys only help when limits are not shared by the same Google project.
- The docs retrieval is simple keyword scoring, not embeddings. It works as a lightweight local RAG layer but may miss semantically related docs if keywords differ.
- The extracted Pybricks text is bundled from the PDF and may increase app bundle/media size.
- The user prefers the new rounded icons but does not want toolbar buttons as separate pills; keep connected button groups.

## Recent User Preferences

- Keep the soft green/white/dark green theme.
- Use MD3-style rounded icons.
- Do not make hover states bright blue or overly bright green.
- In light mode, side rail hover should be subtle.
- Toolbar buttons should look connected/grouped, not separate pill buttons.
- AI assistant name is `Jerry AI`.
- Toolbar wordmark should say `CAPTICLIENT`.
- Code editor font should be `Google Sans Code`.
- Welcome tour should introduce `PyBricks CaptiClient` and cover Home, room co-op programs, Jerry AI, and the CaptiClient attribution/info button.

## Quick Resume Checklist For Future Thread

1. Open `roadmap.md`.
2. Check `git status --short`.
3. Run non-mutating checks:
   ```powershell
   node .yarn\releases\yarn-3.3.0.cjs tsc --noEmit
   node .yarn\releases\yarn-3.3.0.cjs eslint "*/**/*.{js,ts,tsx}" --quiet
   ```
4. Use `node .yarn\releases\yarn-3.3.0.cjs lint` only when it is OK for ESLint to auto-fix files.
5. Check `dev-server.log` tail for compile status.
6. If visual work is requested, use `http://localhost:3000/`.
7. Do not delete or revert unrelated local edits.
