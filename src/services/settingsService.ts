import * as SecureStore from 'expo-secure-store';
import { Settings } from '../models/types';

const KEYS = {
  exchange: 'settings.exchange',
  exchangeApiKey: 'settings.exchangeApiKey',
  exchangeApiSecret: 'settings.exchangeApiSecret'
} as const;

export const saveSettingsSecure = async (settings: Settings): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.exchange, settings.exchange),
    SecureStore.setItemAsync(KEYS.exchangeApiKey, settings.exchangeApiKey),
    SecureStore.setItemAsync(KEYS.exchangeApiSecret, settings.exchangeApiSecret)
  ]);
};

export const loadSettingsSecure = async (): Promise<Settings> => {
  const [exchange, exchangeApiKey, exchangeApiSecret] = await Promise.all([
    SecureStore.getItemAsync(KEYS.exchange),
    SecureStore.getItemAsync(KEYS.exchangeApiKey),
    SecureStore.getItemAsync(KEYS.exchangeApiSecret)
  ]);

  return {
    exchange: exchange === 'binance_us' || exchange === 'bybit' ? exchange : 'binance',
    exchangeApiKey: exchangeApiKey ?? '',
    exchangeApiSecret: exchangeApiSecret ?? ''
  };
};

export const clearSettingsSecure = async (): Promise<void> => {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
};
