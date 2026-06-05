# CaptiClient

CaptiClient is a custom Pybricks coding client for LEGO Powered Up and SPIKE
Prime hubs. It builds on Pybricks Code and adds a CaptiClient-styled workspace,
co-op editing, hub telemetry, themeable code editor palettes, and a built-in AI
assistant for Pybricks MicroPython.

![CaptiClient screenshot](.README/screenshot.png)

## Highlights

- Pybricks MicroPython editor for LEGO smart hubs.
- CaptiClient UI with custom toolbar, dark styling, and editor palettes.
- Co-op rooms for sharing program edits across devices.
- Optional hub telemetry for motor angles and IMU values.
- AI assistant with Pybricks documentation context.
- Cloudflare Worker support for hosted co-op WebSocket rooms.
- Alternate SPIKE Prime-inspired shell available with `?shell=spike-prime`.

## Getting Started

Install dependencies:

```powershell
node .yarn\releases\yarn-3.3.0.cjs install
```

Start the local app:

```powershell
node .yarn\releases\yarn-3.3.0.cjs start
```

Then open:

```text
http://127.0.0.1:3000/
```

## Co-op Server

For local co-op testing, run:

```powershell
node .yarn\releases\yarn-3.3.0.cjs coop:server
```

For hosted co-op, set `REACT_APP_COOP_WEBSOCKET_URL` to your Cloudflare Worker
WebSocket URL before building or deploying the app.

## Build

Create a production build:

```powershell
node .yarn\releases\yarn-3.3.0.cjs build
```

Run type checks and lint:

```powershell
node .yarn\releases\yarn-3.3.0.cjs tsc --noEmit
node .yarn\releases\yarn-3.3.0.cjs eslint "*/**/*.{js,ts,tsx}" --quiet
```

## Cloudflare

If this repo is connected to Cloudflare Pages, pushing to GitHub is enough to
trigger a new Pages deployment.

The co-op Worker is deployed separately with Wrangler:

```powershell
node .yarn\releases\yarn-3.3.0.cjs coop:cloudflare:deploy
```

Wrangler must be logged in or configured with a valid Cloudflare API token.

## Credits

CaptiClient is based on Pybricks Code. Pybricks and the Pybricks ecosystem make
LEGO hub programming with MicroPython possible.

LEGO is a trademark of the LEGO Group of companies, which does not sponsor,
authorize, or endorse this project.
