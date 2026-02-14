import { Trade } from '../models/types';

export const calculatePnl = (entryPrice: number, exitPrice: number, size: number): number => {
  return (exitPrice - entryPrice) * size;
};

export const byCategoryAnalytics = (trades: Trade[]) => {
  const grouped = trades.reduce<Record<string, Trade[]>>((acc, trade) => {
    const key = trade.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(trade);
    return acc;
  }, {});

  return Object.entries(grouped).map(([category, list]) => {
    const wins = list.filter((t) => t.pnl > 0).length;
    const totalPnl = list.reduce((sum, t) => sum + t.pnl, 0);
    const bestTrade = Math.max(...list.map((t) => t.pnl));
    const worstTrade = Math.min(...list.map((t) => t.pnl));

    return {
      category,
      totalTrades: list.length,
      winRate: list.length ? (wins / list.length) * 100 : 0,
      averagePnl: list.length ? totalPnl / list.length : 0,
      totalPnl,
      bestTrade,
      worstTrade
    };
  });
};
