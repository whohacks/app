import { Alert, Exchange } from '../models/types';
import { pushLocalNotification } from './notificationService';
import { sendTelegramMessage } from './telegramService';

type AlertTriggerResult = {
  id: string;
  triggeredAt: string;
};

const getBaseUrl = (exchange: Exchange) => {
  if (exchange === 'bybit') return 'https://api.bybit.com';
  // Use Futures price feed for Binance alerts.
  if (exchange === 'binance') return 'https://fapi.binance.com';
  // Binance US has no Futures API; fall back to spot.
  return 'https://api.binance.us';
};

const fetchCurrentPrice = async (symbol: string, exchange: Exchange): Promise<number> => {
  if (exchange === 'bybit') {
    const bybitQuery = new URLSearchParams({ category: 'linear', symbol }).toString();
    const bybitRes = await fetch(`${getBaseUrl(exchange)}/v5/market/tickers?${bybitQuery}`);
    if (!bybitRes.ok) {
      throw new Error(`HTTP ${bybitRes.status}`);
    }
    const bybitPayload = (await bybitRes.json()) as {
      result?: { list?: Array<{ symbol: string; lastPrice: string }> };
    };
    const first = bybitPayload.result?.list?.[0];
    const price = Number(first?.lastPrice);
    if (!Number.isFinite(price)) {
      throw new Error('Invalid price response');
    }
    return price;
  }

  const query = new URLSearchParams({ symbol }).toString();
  const path = exchange === 'binance' ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';
  const res = await fetch(`${getBaseUrl(exchange)}${path}?${query}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const payload = (await res.json()) as { symbol: string; price: string };
  return Number(payload.price);
};

export const fetchLivePrices = async (
  symbols: string[],
  exchange: Exchange
): Promise<Record<string, number>> => {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const prices: Record<string, number> = {};

  if (!unique.length) return prices;
  if (exchange === 'bybit') {
    await Promise.all(
      unique.map(async (symbol) => {
        prices[symbol] = await fetchCurrentPrice(symbol, exchange);
      })
    );
    return prices;
  }

  if (unique.length === 1) {
    prices[unique[0]] = await fetchCurrentPrice(unique[0], exchange);
    return prices;
  }

  const query = new URLSearchParams({ symbols: JSON.stringify(unique) }).toString();
  // Futures supports batch query with symbols too.
  const path = exchange === 'binance' ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';
  const res = await fetch(`${getBaseUrl(exchange)}${path}?${query}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const payload = (await res.json()) as Array<{ symbol: string; price: string }>;
  payload.forEach((item) => {
    prices[item.symbol] = Number(item.price);
  });
  return prices;

};

export const evaluateAlerts = async (
  alerts: Alert[],
  exchange: Exchange,
  telegramBotToken: string,
  telegramChatId: string
): Promise<AlertTriggerResult[]> => {
  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const results: AlertTriggerResult[] = [];
  if (!activeAlerts.length) return results;

  let priceMap: Record<string, number> = {};
  try {
    priceMap = await fetchLivePrices(
      activeAlerts.map((a) => a.symbol),
      exchange
    );
  } catch {
    return results;
  }

  for (const alert of activeAlerts) {
    try {
      const currentPrice = priceMap[alert.symbol];
      if (!Number.isFinite(currentPrice)) continue;
      const isTriggered =
        (alert.type === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.type === 'below' && currentPrice <= alert.targetPrice);

      if (!isTriggered) continue;

      const triggeredAt = new Date().toISOString();
      const message = [
        'Trading Alert Triggered',
        `Symbol: ${alert.symbol}`,
        `Current Price: ${currentPrice}`,
        `Target Price: ${alert.targetPrice}`,
        `Type: ${alert.type}`,
        `Message: ${alert.message || 'No custom message'}`,
        `Time: ${new Date(triggeredAt).toLocaleString()}`
      ].join('\n');

      if (telegramBotToken && telegramChatId) {
        try {
          await sendTelegramMessage(telegramBotToken, telegramChatId, message);
        } catch {
          // Do not block alert triggering if Telegram fails (e.g. invalid token/chat ID).
        }
      }

      await pushLocalNotification('Trading Alert Triggered', `${alert.symbol} hit ${alert.targetPrice} (${alert.type})`);
      results.push({ id: alert.id, triggeredAt });
    } catch {
      // Continue checking remaining alerts if one request fails.
    }
  }

  return results;
};
