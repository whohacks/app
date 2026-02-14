import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppContext } from '../context/AppContext';
import { evaluateAlerts } from '../services/alertService';
import { ALERT_POLL_MS } from '../utils/constants';
import { pushLocalNotification } from '../services/notificationService';
import { sendTelegramMessage } from '../services/telegramService';
import { syncRelayAlerts } from '../services/relayService';

export const useAlertMonitor = () => {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let ws: WebSocket | null = null;
    const triggering = new Set<string>();
    const isBybit = state.settings.exchange === 'bybit';
    const getWsBase = () =>
      state.settings.exchange === 'binance'
        ? 'wss://fstream.binance.com/stream?streams='
        : 'wss://stream.binance.us:9443/stream?streams=';

    const checkAlerts = async () => {
      try {
        const hits = await evaluateAlerts(
          state.alerts,
          state.settings.exchange,
          state.settings.telegramBotToken,
          state.settings.telegramChatId
        );

        hits.forEach((hit) => {
          dispatch({ type: 'MARK_ALERT_TRIGGERED', payload: hit });
        });
      } catch {
        // Keep monitor alive if one cycle fails.
      }
    };

    const triggerAlert = async (alertId: string, symbol: string, currentPrice: number, targetPrice: number, type: 'above' | 'below', message: string) => {
      if (triggering.has(alertId)) return;
      triggering.add(alertId);
      try {
        const triggeredAt = new Date().toISOString();
        const body = [
          'Trading Alert Triggered',
          `Symbol: ${symbol}`,
          `Current Price: ${currentPrice}`,
          `Target Price: ${targetPrice}`,
          `Type: ${type}`,
          `Message: ${message || 'No custom message'}`,
          `Time: ${new Date(triggeredAt).toLocaleString()}`
        ].join('\n');

        if (state.settings.telegramBotToken && state.settings.telegramChatId) {
          try {
            await sendTelegramMessage(state.settings.telegramBotToken, state.settings.telegramChatId, body);
          } catch {
            // Alert should still be marked triggered even if Telegram send fails.
          }
        }
        await pushLocalNotification('Trading Alert Triggered', `${symbol} hit ${targetPrice} (${type})`);
        dispatch({ type: 'MARK_ALERT_TRIGGERED', payload: { id: alertId, triggeredAt } });
      } finally {
        triggering.delete(alertId);
      }
    };

    const connectStream = () => {
      const activeAlerts = state.alerts.filter((a) => a.status === 'active');
      const symbols = Array.from(new Set(activeAlerts.map((a) => a.symbol.toLowerCase())));
      if (!symbols.length) return;

      if (isBybit) {
        ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
        ws.onopen = () => {
          const args = symbols.map((s) => `tickers.${s.toUpperCase()}`);
          ws?.send(JSON.stringify({ op: 'subscribe', args }));
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as {
              topic?: string;
              data?: { symbol?: string; lastPrice?: string };
            };
            if (!payload.topic?.startsWith('tickers.')) return;
            const symbol = payload.data?.symbol?.toUpperCase();
            const currentPrice = Number(payload.data?.lastPrice);
            if (!symbol || !Number.isFinite(currentPrice)) return;

            state.alerts
              .filter((a) => a.status === 'active' && a.symbol === symbol)
              .forEach((a) => {
                const isTriggered =
                  (a.type === 'above' && currentPrice >= a.targetPrice) ||
                  (a.type === 'below' && currentPrice <= a.targetPrice);
                if (!isTriggered) return;
                void triggerAlert(a.id, a.symbol, currentPrice, a.targetPrice, a.type, a.message);
              });
          } catch {
            // Ignore malformed stream payloads.
          }
        };

        ws.onclose = () => {
          ws = null;
        };
        return;
      }

      const streams = symbols.map((s) => `${s}@ticker`).join('/');
      ws = new WebSocket(`${getWsBase()}${streams}`);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { data?: { s?: string; c?: string } };
          const data = payload.data;
          if (!data?.s || !data?.c) return;
          const symbol = data.s.toUpperCase();
          const currentPrice = Number(data.c);
          if (!Number.isFinite(currentPrice)) return;

          state.alerts
            .filter((a) => a.status === 'active' && a.symbol === symbol)
            .forEach((a) => {
              const isTriggered =
                (a.type === 'above' && currentPrice >= a.targetPrice) ||
                (a.type === 'below' && currentPrice <= a.targetPrice);
              if (!isTriggered) return;
              void triggerAlert(a.id, a.symbol, currentPrice, a.targetPrice, a.type, a.message);
            });
        } catch {
          // Ignore malformed stream payloads.
        }
      };

      ws.onclose = () => {
        ws = null;
      };
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => {
        void checkAlerts();
      }, ALERT_POLL_MS);
    };

    const stopPolling = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const closeStream = () => {
      if (!ws) return;
      ws.close();
      ws = null;
    };

    void checkAlerts();
    startPolling();
    connectStream();

    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void checkAlerts();
        startPolling();
        if (!ws) connectStream();
      } else {
        stopPolling();
        closeStream();
      }
    });

    return () => {
      stopPolling();
      closeStream();
      sub.remove();
    };
  }, [dispatch, state.alerts, state.settings.exchange, state.settings.telegramBotToken, state.settings.telegramChatId]);

  useEffect(() => {
    const sync = async () => {
      try {
        await syncRelayAlerts(state.settings, state.alerts);
      } catch {
        // Keep app usable if relay is unavailable.
      }
    };
    void sync();
  }, [
    state.alerts,
    state.settings.alertServerUrl,
    state.settings.exchange,
    state.settings.telegramBotToken,
    state.settings.telegramChatId
  ]);
};
