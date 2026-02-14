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

Set env vars:

- `RELAY_API_KEY` required: shared secret used by app in `X-Relay-Api-Key`
- `RELAY_DB_SECRET` required: encryption key for sensitive DB fields
- `PORT` optional, default `8787`
- `POLL_MS` optional, default `1000`
- `RATE_LIMIT_WINDOW_MS` optional, default `60000`
- `RATE_LIMIT_MAX` optional, default `120`
- `SIGNATURE_MAX_AGE_MS` optional, default `300000` (5 min)

## Mobile app setup

In app Settings:

1. Set Telegram token/chat id.
2. Set `Alert Server URL` to your deployed URL (example: `https://your-domain.com`).
3. Set `Alert Server API Key` to the same value as `RELAY_API_KEY` on server.
4. Keep alerts active in Alerts tab.

The app auto-syncs alerts to server whenever alerts/settings change.
Sync requests are authenticated with:
- API key header (`X-Relay-Api-Key`)
- HMAC SHA256 signature over `timestamp + raw body` (`X-Relay-Timestamp`, `X-Relay-Signature`)
