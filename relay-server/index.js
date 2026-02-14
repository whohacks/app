const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const POLL_MS = Number(process.env.POLL_MS || 1000);
const DB_FILE = path.join(__dirname, 'relay-db.json');

const initialDb = { clients: {} };

const readDb = () => {
  try {
    if (!fs.existsSync(DB_FILE)) return initialDb;
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return initialDb;
  }
};

const writeDb = (db) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
};

let db = readDb();

const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });

const normalizeExchange = (exchange) => {
  if (exchange === 'binance' || exchange === 'binance_us' || exchange === 'bybit') return exchange;
  return 'binance';
};

const normalizeAlert = (raw) => {
  const symbol = String(raw.symbol || '').trim().toUpperCase();
  const targetPrice = Number(raw.targetPrice);
  const type = raw.type === 'below' ? 'below' : 'above';
  const status = raw.status === 'triggered' ? 'triggered' : 'active';
  return {
    id: String(raw.id || ''),
    symbol,
    targetPrice,
    type,
    message: String(raw.message || ''),
    status,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    triggeredAt: raw.triggeredAt ? String(raw.triggeredAt) : undefined
  };
};

const fetchPrice = async (exchange, symbol) => {
  if (exchange === 'bybit') {
    const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
    const payload = await res.json();
    const price = Number(payload?.result?.list?.[0]?.lastPrice);
    if (!Number.isFinite(price)) throw new Error('Bybit invalid price');
    return price;
  }

  const base = exchange === 'binance_us' ? 'https://api.binance.us' : 'https://fapi.binance.com';
  const path = exchange === 'binance_us' ? '/api/v3/ticker/price' : '/fapi/v1/ticker/price';
  const res = await fetch(`${base}${path}?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const payload = await res.json();
  const price = Number(payload?.price);
  if (!Number.isFinite(price)) throw new Error('Binance invalid price');
  return price;
};

const sendTelegram = async (token, chatId, text) => {
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
  if (!res.ok) {
    throw new Error(`Telegram HTTP ${res.status}`);
  }
};

const evaluateClientAlerts = async (deviceId, client) => {
  const active = client.alerts.filter((a) => a.status === 'active');
  if (!active.length) return false;

  let changed = false;
  const priceMap = {};
  const symbols = [...new Set(active.map((a) => a.symbol))];

  for (const symbol of symbols) {
    try {
      priceMap[symbol] = await fetchPrice(client.exchange, symbol);
    } catch {
      // Keep evaluating other symbols.
    }
  }

  for (const alert of active) {
    const live = priceMap[alert.symbol];
    if (!Number.isFinite(live)) continue;
    const hit = (alert.type === 'above' && live >= alert.targetPrice) || (alert.type === 'below' && live <= alert.targetPrice);
    if (!hit) continue;

    alert.status = 'triggered';
    alert.triggeredAt = new Date().toISOString();
    changed = true;

    const lines = [
      'Trading Alert Triggered',
      `Symbol: ${alert.symbol}`,
      `Live Price: ${Math.round(live)}`,
      `Alert Price: ${Math.round(alert.targetPrice)}`,
      `Type: ${alert.type}`,
      `Message: ${alert.message || '-'}`,
      `Device: ${deviceId}`
    ];
    try {
      await sendTelegram(client.telegramBotToken, client.telegramChatId, lines.join('\n'));
    } catch {
      // Alert status still updates even if Telegram fails.
    }
  }

  return changed;
};

const poll = async () => {
  let changed = false;
  const entries = Object.entries(db.clients || {});
  for (const [deviceId, client] of entries) {
    try {
      const didChange = await evaluateClientAlerts(deviceId, client);
      if (didChange) changed = true;
    } catch {
      // Skip failures per client.
    }
  }
  if (changed) writeDb(db);
};

setInterval(() => {
  poll().catch(() => {});
}, POLL_MS);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 200, { ok: true });
  }

  if (req.url === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      clients: Object.keys(db.clients || {}).length,
      pollMs: POLL_MS
    });
  }

  if (req.url === '/api/sync' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const deviceId = String(body.deviceId || '').trim();
      if (!deviceId) return json(res, 400, { ok: false, error: 'deviceId is required' });

      const exchange = normalizeExchange(body.exchange);
      const alerts = Array.isArray(body.alerts) ? body.alerts.map(normalizeAlert) : [];
      db.clients[deviceId] = {
        exchange,
        telegramBotToken: String(body.telegramBotToken || '').trim(),
        telegramChatId: String(body.telegramChatId || '').trim(),
        alerts,
        updatedAt: new Date().toISOString()
      };
      writeDb(db);
      return json(res, 200, { ok: true, activeAlerts: alerts.filter((a) => a.status === 'active').length });
    } catch (e) {
      return json(res, 400, { ok: false, error: e instanceof Error ? e.message : 'Invalid request' });
    }
  }

  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Alert relay running on http://0.0.0.0:${PORT}`);
});

