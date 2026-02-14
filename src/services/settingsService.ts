import * as SecureStore from 'expo-secure-store';
import { Settings } from '../models/types';

const KEYS = {
  exchange: 'settings.exchange',
  exchangeApiKey: 'settings.exchangeApiKey',
  exchangeApiSecret: 'settings.exchangeApiSecret',
  telegramBotToken: 'settings.telegramBotToken',
  telegramChatId: 'settings.telegramChatId',
  alertServerUrl: 'settings.alertServerUrl'
} as const;

export const saveSettingsSecure = async (settings: Settings): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.exchange, settings.exchange),
    SecureStore.setItemAsync(KEYS.exchangeApiKey, settings.exchangeApiKey),
    SecureStore.setItemAsync(KEYS.exchangeApiSecret, settings.exchangeApiSecret),
    SecureStore.setItemAsync(KEYS.telegramBotToken, settings.telegramBotToken),
    SecureStore.setItemAsync(KEYS.telegramChatId, settings.telegramChatId),
    SecureStore.setItemAsync(KEYS.alertServerUrl, settings.alertServerUrl)
  ]);
};

export const loadSettingsSecure = async (): Promise<Settings> => {
  const [exchange, exchangeApiKey, exchangeApiSecret, telegramBotToken, telegramChatId, alertServerUrl] = await Promise.all([
    SecureStore.getItemAsync(KEYS.exchange),
    SecureStore.getItemAsync(KEYS.exchangeApiKey),
    SecureStore.getItemAsync(KEYS.exchangeApiSecret),
    SecureStore.getItemAsync(KEYS.telegramBotToken),
    SecureStore.getItemAsync(KEYS.telegramChatId),
    SecureStore.getItemAsync(KEYS.alertServerUrl)
  ]);

  return {
    exchange: exchange === 'binance_us' || exchange === 'bybit' ? exchange : 'binance',
    exchangeApiKey: exchangeApiKey ?? '',
    exchangeApiSecret: exchangeApiSecret ?? '',
    telegramBotToken: telegramBotToken ?? '',
    telegramChatId: telegramChatId ?? '',
    alertServerUrl: alertServerUrl ?? ''
  };
};

export const clearSettingsSecure = async (): Promise<void> => {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
};
