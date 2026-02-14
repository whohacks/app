# Alert Relay Server (24/7 Alerts)

This server keeps running independently from your phone, checks prices every second, and sends Telegram messages when alerts are triggered.

## Run locally

```bash
cd relay-server
npm install
npm start
```

Health check:

```bash
curl http://localhost:8787/health
```

## Deploy

Deploy this `relay-server` folder on any always-on host (Render, Railway, VPS, etc.).

Set env vars optionally:

- `PORT` default `8787`
- `POLL_MS` default `1000`

## Mobile app setup

In app Settings:

1. Set Telegram token/chat id.
2. Set `Alert Server URL` to your deployed URL (example: `https://your-domain.com`).
3. Keep alerts active in Alerts tab.

The app auto-syncs alerts to server whenever alerts/settings change.

