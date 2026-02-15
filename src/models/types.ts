export type TradeSource = 'API' | 'manual';

export type Trade = {
  id: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  timestamp: string;
  pnl: number;
  category: string;
  notes?: string;
  imageUri?: string;
  source: TradeSource;
};

export type Exchange = 'binance' | 'binance_us' | 'bybit';

export type Settings = {
  exchange: Exchange;
  exchangeApiKey: string;
  exchangeApiSecret: string;
};

export type RunningTrade = {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  positionSize: number;
};

export type DashboardData = {
  accountBalance: number;
  spotBalance: number;
  futuresBalance: number;
  totalBalance: number;
  futuresAvailable: boolean;
  runningTrades: RunningTrade[];
};
