import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Settings } from '../models/types';

const RELAY_DEVICE_ID_KEY = 'relay.deviceId';

const normalizeBase = (url: string) => url.trim().replace(/\/+$/, '');

const createDeviceId = () => `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getDeviceId = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(RELAY_DEVICE_ID_KEY);
  if (existing) return existing;
  const next = createDeviceId();
  await AsyncStorage.setItem(RELAY_DEVICE_ID_KEY, next);
  return next;
};

export const syncRelayAlerts = async (settings: Settings, alerts: Alert[]): Promise<void> => {
  if (!settings.alertServerUrl.trim()) return;
  const baseUrl = normalizeBase(settings.alertServerUrl);
  const deviceId = await getDeviceId();

  const res = await fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      exchange: settings.exchange,
      telegramBotToken: settings.telegramBotToken,
      telegramChatId: settings.telegramChatId,
      alerts
    })
  });

  if (!res.ok) {
    throw new Error(`Relay sync failed: HTTP ${res.status}`);
  }
};

