const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const POLL_MS = Number(process.env.POLL_MS || 1000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const SIGNATURE_MAX_AGE_MS = Number(process.env.SIGNATURE_MAX_AGE_MS || 300_000);
const DB_FILE = path.join(__dirname, 'relay-db.json');
const RELAY_API_KEY = process.env.RELAY_API_KEY || '';
const RELAY_DB_SECRET = process.env.RELAY_DB_SECRET || '';

if (!RELAY_API_KEY || !RELAY_DB_SECRET) {
  // eslint-disable-next-line no-console
  console.error('Missing required env vars: RELAY_API_KEY and RELAY_DB_SECRET');
  process.exit(1);
}

const initialDb = { clients: {} };
const ENC_KEY = crypto.createHash('sha256').update(RELAY_DB_SECRET).digest();
const rateBucket = new Map();

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

const encrypt = (value) => {
  const plain = String(value || '');
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
};

const decrypt = (payload) => {
  const value = String(payload || '');
  if (!value) return '';
  const parts = value.split(':');
  if (parts.length !== 3) return value; // backward compatibility with old plaintext entries
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const data = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return data.toString('utf8');
  } catch {
    return '';
  }
};

const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Relay-Api-Key,X-Relay-Timestamp,X-Relay-Signature'
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
        resolve({
          raw: data || '{}',
          parsed: data ? JSON.parse(data) : {}
        });
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
  if (!symbol || !Number.isFinite(targetPrice) || targetPrice <= 0) return null;
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
  const endpoint = exchange === 'binance_us' ? '/api/v3/ticker/price' : '/fapi/v1/ticker/price';
  const res = await fetch(`${base}${endpoint}?symbol=${encodeURIComponent(symbol)}`);
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
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
};

const getClientSecrets = (client) => {
  const token = decrypt(client.telegramBotTokenEnc || client.telegramBotToken || '');
  const chatId = decrypt(client.telegramChatIdEnc || client.telegramChatId || '');
  return { token, chatId };
};

const evaluateClientAlerts = async (deviceId, client) => {
  const active = (client.alerts || []).filter((a) => a.status === 'active');
  if (!active.length) return false;

  let changed = false;
  const priceMap = {};
  const symbols = [...new Set(active.map((a) => a.symbol))];
  const { token, chatId } = getClientSecrets(client);

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
      await sendTelegram(token, chatId, lines.join('\n'));
    } catch {
      // Alert status still updates even if Telegram send fails.
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

const isAuthorized = (req) => {
  const key = String(req.headers['x-relay-api-key'] || '');
  return key && key === RELAY_API_KEY;
};

const toBuffer = (hex) => {
  try {
    return Buffer.from(String(hex || ''), 'hex');
  } catch {
    return Buffer.alloc(0);
  }
};

const verifySignature = (req, rawBody) => {
  const timestamp = String(req.headers['x-relay-timestamp'] || '');
  const signature = String(req.headers['x-relay-signature'] || '').toLowerCase();
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS) return false;

  const expected = crypto
    .createHmac('sha256', RELAY_API_KEY)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
    .toLowerCase();

  const a = toBuffer(signature);
  const b = toBuffer(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const isRateLimited = (req) => {
  const ip = String(req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const bucket = rateBucket.get(ip);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBucket.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    rateBucket.set(ip, bucket);
    return true;
  }
  rateBucket.set(ip, bucket);
  return false;
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 200, { ok: true });
  }

  if (req.url === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      secure: true,
      clients: Object.keys(db.clients || {}).length,
      pollMs: POLL_MS
    });
  }

  if (isRateLimited(req)) {
    return json(res, 429, { ok: false, error: 'Rate limit exceeded' });
  }

  if (req.url === '/api/sync' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      return json(res, 401, { ok: false, error: 'Unauthorized' });
    }

    try {
      const { raw, parsed: body } = await parseBody(req);
      if (!verifySignature(req, raw)) {
        return json(res, 401, { ok: false, error: 'Invalid signature' });
      }
      const deviceId = String(body.deviceId || '').trim();
      if (!deviceId) return json(res, 400, { ok: false, error: 'deviceId is required' });

      const exchange = normalizeExchange(body.exchange);
      const alerts = Array.isArray(body.alerts)
        ? body.alerts.map(normalizeAlert).filter(Boolean)
        : [];
      db.clients[deviceId] = {
        exchange,
        telegramBotTokenEnc: encrypt(String(body.telegramBotToken || '').trim()),
        telegramChatIdEnc: encrypt(String(body.telegramChatId || '').trim()),
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
