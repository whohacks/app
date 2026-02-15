import CryptoJS from 'crypto-js';
import { DashboardData, RunningTrade, Settings, Trade } from '../models/types';

type SignedParams = Record<string, string | number>;

const getBaseUrl = (exchange: Settings['exchange']) => {
  if (exchange === 'bybit') return 'https://api.bybit.com';
  return exchange === 'binance_us' ? 'https://api.binance.us' : 'https://api.binance.com';
};

const getFuturesBaseUrl = (exchange: Settings['exchange']) => {
  return exchange === 'binance' ? 'https://fapi.binance.com' : null;
};

const buildQuery = (params: SignedParams): string => {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
};

const signQuery = (query: string, secret: string): string => {
  return CryptoJS.HmacSHA256(query, secret).toString(CryptoJS.enc.Hex);
};

const signBybitGet = (timestamp: string, apiKey: string, recvWindow: string, query: string, secret: string): string => {
  const payload = `${timestamp}${apiKey}${recvWindow}${query}`;
  return CryptoJS.HmacSHA256(payload, secret).toString(CryptoJS.enc.Hex);
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const payload = (await res.json()) as { msg?: string; message?: string };
        message = payload.msg ?? payload.message ?? message;
      } catch {
        // Keep generic HTTP error.
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network request failed';
    throw new Error(msg);
  }
};

const signedGet = async <T>(path: string, settings: Settings, params: SignedParams = {}, signal?: AbortSignal): Promise<T> => {
  if (settings.exchange === 'bybit') {
    const baseUrl = getBaseUrl(settings.exchange);
    const query = buildQuery(params);
    const timestamp = `${Date.now()}`;
    const recvWindow = '10000';
    const signature = signBybitGet(timestamp, settings.exchangeApiKey, recvWindow, query, settings.exchangeApiSecret);
    return fetchJson<T>(`${baseUrl}${path}${query ? `?${query}` : ''}`, {
      headers: {
        'X-BAPI-API-KEY': settings.exchangeApiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature
      },
      signal
    });
  }
  const baseUrl = getBaseUrl(settings.exchange);
  return signedGetFromBase<T>(baseUrl, path, settings, params, signal);
};

const signedGetFromBase = async <T>(
  baseUrl: string,
  path: string,
  settings: Settings,
  params: SignedParams = {},
  signal?: AbortSignal
): Promise<T> => {
  if (settings.exchange === 'bybit') {
    const query = buildQuery(params);
    const timestamp = `${Date.now()}`;
    const recvWindow = '10000';
    const signature = signBybitGet(timestamp, settings.exchangeApiKey, recvWindow, query, settings.exchangeApiSecret);
    return fetchJson<T>(`${baseUrl}${path}${query ? `?${query}` : ''}`, {
      headers: {
        'X-BAPI-API-KEY': settings.exchangeApiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature
      },
      signal
    });
  }

  const timestamp = Date.now();
  const recvWindow = 10000;
  const query = buildQuery({ ...params, timestamp, recvWindow });
  const signature = signQuery(query, settings.exchangeApiSecret);
  const finalQuery = `${query}&signature=${signature}`;
  return fetchJson<T>(`${baseUrl}${path}?${finalQuery}`, {
    headers: {
      'X-MBX-APIKEY': settings.exchangeApiKey
    },
    signal
  });
};

type BinanceAccountResponse = {
  balances: Array<{ asset: string; free: string; locked: string }>;
};

type BinanceOpenOrder = {
  symbol: string;
  price: string;
  origQty: string;
  side: 'BUY' | 'SELL';
};

type BinanceTicker = {
  symbol: string;
  price: string;
};

type BinanceTrade = {
  symbol: string;
  qty: string;
  price: string;
  time: number;
  isBuyer: boolean;
  commission?: string;
  commissionAsset?: string;
};

type TradeHistoryRange = {
  startTime?: number;
  endTime?: number;
};

type BinanceExchangeInfoResponse = {
  symbols: Array<{ symbol: string; status: string; baseAsset: string; quoteAsset: string }>;
};

type BinanceFuturesAccountResponse = {
  totalWalletBalance: string;
};

type BinanceFuturesPositionRisk = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
};

type BinanceFuturesIncome = {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  info: string;
  time: number;
  tranId: number;
};

type BinanceFuturesUserTrade = {
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  price: string;
  qty: string;
  realizedPnl: string;
  time: number;
};

type BybitWalletResponse = {
  result?: {
    list?: Array<{
      totalWalletBalance?: string;
      coin?: Array<{
        coin: string;
        walletBalance?: string;
        usdValue?: string;
      }>;
    }>;
  };
};

type BybitPositionListResponse = {
  result?: {
    list?: Array<{
      symbol: string;
      size: string;
      avgPrice: string;
      markPrice: string;
      unrealisedPnl?: string;
      side?: 'Buy' | 'Sell' | 'None';
    }>;
  };
};

type BybitClosedPnlResponse = {
  result?: {
    list?: Array<{
      symbol: string;
      avgEntryPrice: string;
      avgExitPrice: string;
      closedPnl: string;
      qty: string;
      updatedTime: string;
      side?: string;
    }>;
    nextPageCursor?: string;
  };
};

const FUTURES_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const buildTimeWindows = (startTime: number, endTime: number): Array<{ startTime: number; endTime: number }> => {
  const windows: Array<{ startTime: number; endTime: number }> = [];
  let cursor = startTime;
  while (cursor <= endTime) {
    const windowEnd = Math.min(cursor + FUTURES_MAX_WINDOW_MS - 1, endTime);
    windows.push({ startTime: cursor, endTime: windowEnd });
    cursor = windowEnd + 1;
  }
  return windows;
};

export const fetchDashboardData = async (settings: Settings): Promise<DashboardData> => {
  if (settings.exchange === 'bybit') {
    const [wallet, positions] = await Promise.all([
      signedGet<BybitWalletResponse>('/v5/account/wallet-balance', settings, { accountType: 'UNIFIED' }),
      signedGet<BybitPositionListResponse>('/v5/position/list', settings, { category: 'linear', settleCoin: 'USDT' })
    ]);

    const account = wallet.result?.list?.[0];
    const coins = account?.coin ?? [];
    const spotBalance = coins.reduce((sum, c) => sum + Number(c.usdValue ?? 0), 0);
    const futuresBalance = Number(account?.totalWalletBalance ?? spotBalance);
    const totalBalance = Number.isFinite(futuresBalance) ? futuresBalance : spotBalance;
    const accountBalance = totalBalance;

    const runningTrades: RunningTrade[] = (positions.result?.list ?? [])
      .map((p) => {
        const size = Number(p.size);
        const entryPrice = Number(p.avgPrice);
        const currentPrice = Number(p.markPrice || p.avgPrice);
        const side = p.side === 'Sell' ? -1 : 1;
        const fallbackPnl = (currentPrice - entryPrice) * size * side;
        const pnl = Number.isFinite(Number(p.unrealisedPnl)) ? Number(p.unrealisedPnl) : fallbackPnl;
        return {
          symbol: p.symbol,
          entryPrice,
          currentPrice,
          pnl,
          positionSize: size
        };
      })
      .filter((t) => Number.isFinite(t.positionSize) && t.positionSize > 0);

    return {
      accountBalance,
      spotBalance,
      futuresBalance: totalBalance,
      totalBalance,
      futuresAvailable: true,
      runningTrades
    };
  }

  const baseUrl = getBaseUrl(settings.exchange);
  const futuresBaseUrl = getFuturesBaseUrl(settings.exchange);
  const [account, openOrders, tickers] = await Promise.all([
    signedGet<BinanceAccountResponse>('/api/v3/account', settings),
    signedGet<BinanceOpenOrder[]>('/api/v3/openOrders', settings),
    fetchJson<BinanceTicker[]>(`${baseUrl}/api/v3/ticker/price`)
  ]);

  const tickerMap = new Map(tickers.map((t) => [t.symbol, Number(t.price)]));

  const stableCoins = new Set(['USD', 'USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD']);
  const preferredQuote = settings.exchange === 'binance_us' ? 'USD' : 'USDT';

  const toQuoteValue = (asset: string, amount: number): number => {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (stableCoins.has(asset)) return amount;
    if (asset === preferredQuote) return amount;

    const direct = tickerMap.get(`${asset}${preferredQuote}`);
    if (direct) return amount * direct;

    const inverse = tickerMap.get(`${preferredQuote}${asset}`);
    if (inverse) return amount / inverse;

    const usdtDirect = tickerMap.get(`${asset}USDT`);
    if (usdtDirect) return amount * usdtDirect;

    const usdtInverse = tickerMap.get(`USDT${asset}`);
    if (usdtInverse) return amount / usdtInverse;

    return 0;
  };

  const spotBalance = account.balances.reduce((sum, b) => {
    const total = Number(b.free) + Number(b.locked);
    return sum + toQuoteValue(b.asset, total);
  }, 0);

  let futuresBalance = 0;
  let futuresAvailable = false;
  if (futuresBaseUrl) {
    try {
      const futuresAccount = await signedGetFromBase<BinanceFuturesAccountResponse>(
        futuresBaseUrl,
        '/fapi/v2/account',
        settings
      );
      futuresBalance = Number(futuresAccount.totalWalletBalance ?? 0);
      futuresAvailable = true;
    } catch {
      // Futures API may be unavailable or key may lack futures permissions.
      futuresBalance = 0;
      futuresAvailable = false;
    }
  }
  const totalBalance = spotBalance + futuresBalance;
  const accountBalance = totalBalance;

  let runningTrades: RunningTrade[] = [];

  if (settings.exchange === 'binance' && futuresBaseUrl) {
    try {
      const positions = await signedGetFromBase<BinanceFuturesPositionRisk[]>(
        futuresBaseUrl,
        '/fapi/v2/positionRisk',
        settings
      );
      runningTrades = positions
        .map((p) => {
          const rawAmt = Number(p.positionAmt);
          const positionSize = Math.abs(rawAmt);
          const entryPrice = Number(p.entryPrice);
          const currentPrice = Number(p.markPrice || p.entryPrice);
          const direction = rawAmt >= 0 ? 1 : -1;
          const fallbackPnl = (currentPrice - entryPrice) * positionSize * direction;
          const pnl = Number.isFinite(Number(p.unRealizedProfit)) ? Number(p.unRealizedProfit) : fallbackPnl;

          return {
            symbol: p.symbol,
            entryPrice,
            currentPrice,
            pnl,
            positionSize
          };
        })
        .filter((t) => Number.isFinite(t.positionSize) && t.positionSize > 0);
    } catch {
      // If futures positions fail, we fall back to spot open orders below.
      runningTrades = [];
    }
  }

  if (!runningTrades.length) {
    runningTrades = openOrders
      .map((order) => {
        const entryPrice = Number(order.price);
        const positionSize = Number(order.origQty);
        const currentPrice = tickerMap.get(order.symbol) ?? entryPrice;
        const direction = order.side === 'BUY' ? 1 : -1;
        const pnl = (currentPrice - entryPrice) * positionSize * direction;

        return {
          symbol: order.symbol,
          entryPrice,
          currentPrice,
          pnl,
          positionSize
        };
      })
      .filter((t) => Number.isFinite(t.positionSize) && t.positionSize > 0);
  }

  return { accountBalance, spotBalance, futuresBalance, totalBalance, futuresAvailable, runningTrades };
};

type PositionState = {
  qty: number;
  avgPrice: number;
};

const toRealizedTrades = (rawTrades: BinanceTrade[]): Trade[] => {
  const sorted = [...rawTrades].sort((a, b) => a.time - b.time);
  const position: PositionState = { qty: 0, avgPrice: 0 };
  const realized: Trade[] = [];

  sorted.forEach((t, idx) => {
    const price = Number(t.price);
    const qty = Number(t.qty);
    const fee = Number(t.commission ?? 0);
    const side = t.isBuyer ? 'BUY' : 'SELL';

    let closedQty = 0;
    let entryPrice = price;
    let pnl = 0;

    if (t.isBuyer) {
      if (position.qty < 0) {
        closedQty = Math.min(qty, Math.abs(position.qty));
        entryPrice = position.avgPrice;
        pnl = (entryPrice - price) * closedQty;
        position.qty += closedQty;
      }

      const openingQty = qty - closedQty;
      if (openingQty > 0) {
        if (position.qty > 0) {
          const totalNotional = position.avgPrice * position.qty + price * openingQty;
          const totalQty = position.qty + openingQty;
          position.avgPrice = totalNotional / totalQty;
          position.qty = totalQty;
        } else {
          position.qty = openingQty;
          position.avgPrice = price;
        }
      } else if (position.qty === 0) {
        position.avgPrice = 0;
      }
    } else {
      if (position.qty > 0) {
        closedQty = Math.min(qty, position.qty);
        entryPrice = position.avgPrice;
        pnl = (price - entryPrice) * closedQty;
        position.qty -= closedQty;
      }

      const openingQty = qty - closedQty;
      if (openingQty > 0) {
        if (position.qty < 0) {
          const totalAbsQty = Math.abs(position.qty) + openingQty;
          const weighted = position.avgPrice * Math.abs(position.qty) + price * openingQty;
          position.avgPrice = weighted / totalAbsQty;
          position.qty -= openingQty;
        } else {
          position.qty = -openingQty;
          position.avgPrice = price;
        }
      } else if (position.qty === 0) {
        position.avgPrice = 0;
      }
    }

    if (closedQty <= 0) return;

    realized.push({
      id: `${t.symbol}-${t.time}-${idx}`,
      symbol: t.symbol,
      entryPrice,
      exitPrice: price,
      size: closedQty,
      timestamp: new Date(t.time).toISOString(),
      pnl: pnl - fee,
      category: 'Uncategorized',
      notes: `Imported from Binance (${side})`,
      source: 'API'
    });
  });

  return realized.reverse();
};

export const fetchTradeHistory = async (
  settings: Settings,
  symbol: string,
  range?: TradeHistoryRange,
  signal?: AbortSignal
): Promise<Trade[]> => {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) {
    throw new Error('Symbol is required for Binance /api/v3/myTrades');
  }

  const params: SignedParams = { symbol: cleanSymbol };
  if (typeof range?.startTime === 'number') params.startTime = range.startTime;
  if (typeof range?.endTime === 'number') params.endTime = range.endTime;

  const baseUrl = getBaseUrl(settings.exchange);
  const trades = await signedGetFromBase<BinanceTrade[]>(baseUrl, '/api/v3/myTrades', settings, params, signal);
  return toRealizedTrades(trades);
};

export const fetchAllTradeHistory = async (
  settings: Settings,
  range?: TradeHistoryRange,
  signal?: AbortSignal
): Promise<Trade[]> => {
  const baseUrl = getBaseUrl(settings.exchange);
  const [exchangeInfo, account, openOrders] = await Promise.all([
    fetchJson<BinanceExchangeInfoResponse>(`${baseUrl}/api/v3/exchangeInfo`, { signal }),
    signedGet<BinanceAccountResponse>('/api/v3/account', settings),
    signedGet<BinanceOpenOrder[]>('/api/v3/openOrders', settings)
  ]);

  const tradingSymbols = exchangeInfo.symbols.filter((s) => s.status === 'TRADING');
  const tradingSet = new Set(tradingSymbols.map((s) => s.symbol));
  const nonZeroAssets = new Set(
    account.balances
      .filter((b) => Number(b.free) + Number(b.locked) > 0)
      .map((b) => b.asset)
  );
  const quotePriority =
    settings.exchange === 'binance_us'
      ? ['USD', 'USDT', 'USDC', 'BTC', 'ETH', 'BNB']
      : ['USDT', 'FDUSD', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB'];

  const candidates = new Set<string>(openOrders.map((o) => o.symbol));

  nonZeroAssets.forEach((asset) => {
    quotePriority.forEach((quote) => {
      if (asset === quote) return;
      const direct = `${asset}${quote}`;
      if (tradingSet.has(direct)) candidates.add(direct);
      const inverse = `${quote}${asset}`;
      if (tradingSet.has(inverse)) candidates.add(inverse);
    });
  });

  // Keep request weight bounded to avoid bans.
  const symbols = Array.from(candidates).slice(0, 60);
  if (!symbols.length) {
    return [];
  }

  const allTrades: Trade[] = [];

  for (const symbol of symbols) {
    if (signal?.aborted) {
      throw new Error('Sync cancelled');
    }
    try {
      const trades = await fetchTradeHistory(settings, symbol, range, signal);
      if (trades.length) {
        allTrades.push(...trades);
      }
    } catch {
      // Continue through symbol list; some symbols may fail due to permissions/delistings.
    }
  }

  if (settings.exchange === 'binance') {
    try {
      const futuresIncome = await signedGetFromBase<BinanceFuturesIncome[]>(
        'https://fapi.binance.com',
        '/fapi/v1/income',
        settings,
        {
          ...(typeof range?.startTime === 'number' ? { startTime: range.startTime } : {}),
          ...(typeof range?.endTime === 'number' ? { endTime: range.endTime } : {}),
          incomeType: 'REALIZED_PNL',
          limit: 1000
        },
        signal
      );

      futuresIncome.forEach((row) => {
        const pnl = Number(row.income);
        if (!Number.isFinite(pnl) || pnl === 0) return;
        allTrades.push({
          id: `FUT-${row.tranId}-${row.time}`,
          symbol: row.symbol || 'FUTURES',
          entryPrice: 0,
          exitPrice: 0,
          size: 0,
          timestamp: new Date(row.time).toISOString(),
          pnl,
          category: 'Uncategorized',
          notes: `Futures ${row.incomeType}${row.info ? ` (${row.info})` : ''}`,
          source: 'API'
        });
      });
    } catch {
      // If futures income fetch fails, keep spot-imported trades.
    }
  }

  return allTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const fetchFuturesPositionHistory = async (
  settings: Settings,
  range?: TradeHistoryRange,
  signal?: AbortSignal
): Promise<Trade[]> => {
  if (settings.exchange === 'bybit') {
    const end = typeof range?.endTime === 'number' ? range.endTime : Date.now();
    const start = typeof range?.startTime === 'number' ? range.startTime : end - FUTURES_MAX_WINDOW_MS + 1;
    if (start > end) {
      throw new Error('From Date must be earlier than or equal to To Date.');
    }

    let cursor = '';
    const rows: NonNullable<BybitClosedPnlResponse['result']>['list'] = [];

    while (true) {
      const payload = await signedGet<BybitClosedPnlResponse>(
        '/v5/position/closed-pnl',
        settings,
        {
          category: 'linear',
          startTime: start,
          endTime: end,
          limit: 100,
          ...(cursor ? { cursor } : {})
        }
      );

      const list = payload.result?.list ?? [];
      rows.push(...list);
      const next = payload.result?.nextPageCursor ?? '';
      if (!next || list.length === 0 || next === cursor) break;
      cursor = next;
      if (signal?.aborted) throw new Error('Sync cancelled');
    }

    return rows
      .map((row, idx) => {
        const entryPrice = Number(row.avgEntryPrice);
        const exitPrice = Number(row.avgExitPrice);
        const size = Number(row.qty);
        const pnl = Number(row.closedPnl);
        const updatedAt = Number(row.updatedTime);
        return {
          id: `BYBIT-POS-${row.symbol}-${updatedAt}-${idx}`,
          symbol: row.symbol,
          entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
          exitPrice: Number.isFinite(exitPrice) ? exitPrice : 0,
          size: Number.isFinite(size) ? size : 0,
          timestamp: new Date(Number.isFinite(updatedAt) ? updatedAt : Date.now()).toISOString(),
          pnl: Number.isFinite(pnl) ? pnl : 0,
          category: 'Uncategorized',
          notes: `Futures Position History (${row.side ?? 'N/A'})`,
          source: 'API' as const
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  if (settings.exchange !== 'binance') {
    throw new Error('Futures position history is available for Binance and Bybit only.');
  }

  const end = typeof range?.endTime === 'number' ? range.endTime : Date.now();
  const start = typeof range?.startTime === 'number' ? range.startTime : end - FUTURES_MAX_WINDOW_MS + 1;
  if (start > end) {
    throw new Error('From Date must be earlier than or equal to To Date.');
  }

  const windows = buildTimeWindows(start, end);

  const futuresIncomeChunks = await Promise.all(
    windows.map((w) =>
      signedGetFromBase<BinanceFuturesIncome[]>(
        'https://fapi.binance.com',
        '/fapi/v1/income',
        settings,
        {
          startTime: w.startTime,
          endTime: w.endTime,
          incomeType: 'REALIZED_PNL',
          limit: 1000
        },
        signal
      )
    )
  );
  const futuresIncome = futuresIncomeChunks.flat();

  const symbols = Array.from(
    new Set(
      futuresIncome
        .filter((row) => Number(row.income) !== 0 && !!row.symbol)
        .map((row) => row.symbol.toUpperCase())
    )
  );
  if (!symbols.length) return [];

  const userTradesBySymbol = await Promise.all(
    symbols.map(async (symbol) => {
      const chunks = await Promise.all(
        windows.map((w) =>
          signedGetFromBase<BinanceFuturesUserTrade[]>(
            'https://fapi.binance.com',
            '/fapi/v1/userTrades',
            settings,
            {
              symbol,
              startTime: w.startTime,
              endTime: w.endTime,
              limit: 1000
            },
            signal
          )
        )
      );
      return chunks.flat();
    })
  );

  const allUserTrades = userTradesBySymbol
    .flat()
    .sort((a, b) => a.time - b.time);

  type PosState = {
    qty: number;
    avgEntry: number;
    closeQty: number;
    closeNotional: number;
    realizedPnl: number;
    lastTime: number;
  };

  const states = new Map<string, PosState>();
  const closedPositions: Trade[] = [];

  const openLong = (state: PosState, qty: number, price: number) => {
    const totalNotional = state.avgEntry * state.qty + price * qty;
    state.qty += qty;
    state.avgEntry = state.qty > 0 ? totalNotional / state.qty : 0;
  };

  const openShort = (state: PosState, qty: number, price: number) => {
    const totalNotional = state.avgEntry * state.qty + price * qty;
    state.qty += qty;
    state.avgEntry = state.qty > 0 ? totalNotional / state.qty : 0;
  };

  allUserTrades.forEach((t, idx) => {
    const side = t.side;
    const positionSide = t.positionSide === 'BOTH' ? 'LONG' : t.positionSide;
    const key = `${t.symbol}:${positionSide}`;
    const price = Number(t.price);
    const qty = Number(t.qty);
    const realized = Number(t.realizedPnl);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return;

    const state = states.get(key) ?? {
      qty: 0,
      avgEntry: 0,
      closeQty: 0,
      closeNotional: 0,
      realizedPnl: 0,
      lastTime: t.time
    };

    const isLong = positionSide === 'LONG';
    const opens = (isLong && side === 'BUY') || (!isLong && side === 'SELL');
    const closes = (isLong && side === 'SELL') || (!isLong && side === 'BUY');

    if (opens) {
      if (isLong) openLong(state, qty, price);
      else openShort(state, qty, price);
    } else if (closes) {
      const closeQty = Math.min(qty, state.qty);
      if (closeQty > 0) {
        state.qty -= closeQty;
        state.closeQty += closeQty;
        state.closeNotional += closeQty * price;
        state.realizedPnl += Number.isFinite(realized) ? realized : 0;
        state.lastTime = t.time;
      }
    }

    if (state.qty === 0 && state.closeQty > 0) {
      const exitPrice = state.closeNotional / state.closeQty;
      closedPositions.push({
        id: `FUTPOS-${t.symbol}-${positionSide}-${state.lastTime}-${idx}`,
        symbol: t.symbol,
        entryPrice: state.avgEntry,
        exitPrice: Number.isFinite(exitPrice) ? exitPrice : 0,
        size: state.closeQty,
        timestamp: new Date(state.lastTime).toISOString(),
        pnl: state.realizedPnl,
        category: 'Uncategorized',
        notes: `Futures Position History (${positionSide})`,
        source: 'API'
      });

      states.set(key, {
        qty: 0,
        avgEntry: 0,
        closeQty: 0,
        closeNotional: 0,
        realizedPnl: 0,
        lastTime: t.time
      });
      return;
    }

    states.set(key, state);
  });

  return closedPositions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const testBinanceConnection = async (settings: Settings): Promise<void> => {
  if (settings.exchange === 'bybit') {
    await signedGet('/v5/account/wallet-balance', settings, { accountType: 'UNIFIED' });
    return;
  }
  await signedGet('/api/v3/account', settings);
};
