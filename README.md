# Trading Journal App (Expo + React Native)

A cross-platform trading journal with Dashboard, Alerts, Journal analytics, and Settings.

## Setup

1. Install dependencies:
```bash
npm install
```
2. Start Expo:
```bash
npm run start
```

## Features

- Dashboard: account balance + running trades
- Alerts: above/below price alerts + Telegram + local notifications
- Journal: import Binance trades, manual entries, tags/categories, filters, analytics, CSV export
- Settings: secure API/Telegram credentials with test buttons

## Security

Sensitive settings are persisted with `expo-secure-store`.
Use read-only exchange API keys only.

## Notes

- Binance endpoints are signed via HMAC SHA256.
- Binance trade import requires a symbol (example: `BTCUSDT`) and computes realized P&L from fills.
- Alert checks run periodically while app is active and via background fetch (OS-scheduled cadence).
