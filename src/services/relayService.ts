import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
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
  const apiKey = settings.alertServerApiKey.trim();

  const payload = {
    deviceId,
    exchange: settings.exchange,
    telegramBotToken: settings.telegramBotToken,
    telegramChatId: settings.telegramChatId,
    alerts
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = `${Date.now()}`;
  const signature = CryptoJS.HmacSHA256(`${timestamp}.${rawBody}`, apiKey).toString(CryptoJS.enc.Hex);

  const res = await fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Relay-Api-Key': apiKey,
      'X-Relay-Timestamp': timestamp,
      'X-Relay-Signature': signature
    },
    body: rawBody
  });

  if (!res.ok) {
    throw new Error(`Relay sync failed: HTTP ${res.status}`);
  }
};
