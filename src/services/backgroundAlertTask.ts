import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Alert } from '../models/types';
import { loadSettingsSecure } from './settingsService';
import { evaluateAlerts } from './alertService';
import { STORAGE_KEY } from '../utils/constants';

const BACKGROUND_ALERT_TASK = 'trading-journal-background-alert-task';

type PersistedState = {
  trades: unknown[];
  alerts: Alert[];
  categories: string[];
};

const loadPersistedState = async (): Promise<PersistedState | null> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
};

const persistAlerts = async (alerts: Alert[]) => {
  const current = await loadPersistedState();
  if (!current) return;

  const next: PersistedState = {
    trades: current.trades ?? [],
    categories: current.categories ?? [],
    alerts
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

if (!TaskManager.isTaskDefined(BACKGROUND_ALERT_TASK)) {
  TaskManager.defineTask(BACKGROUND_ALERT_TASK, async () => {
    try {
      const persisted = await loadPersistedState();
      if (!persisted?.alerts?.length) return BackgroundFetch.BackgroundFetchResult.NoData;

      const settings = await loadSettingsSecure();
      const hits = await evaluateAlerts(
        persisted.alerts,
        settings.exchange,
        settings.telegramBotToken,
        settings.telegramChatId
      );
      if (!hits.length) return BackgroundFetch.BackgroundFetchResult.NoData;

      const hitMap = new Map(hits.map((h) => [h.id, h.triggeredAt]));
      const updatedAlerts = persisted.alerts.map((a) => {
        const triggeredAt = hitMap.get(a.id);
        if (!triggeredAt) return a;
        return { ...a, status: 'triggered' as const, triggeredAt };
      });

      await persistAlerts(updatedAlerts);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export const registerBackgroundAlertTask = async () => {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_ALERT_TASK);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_ALERT_TASK, {
    minimumInterval: 15 * 60,
    stopOnTerminate: false,
    startOnBoot: true
  });
};

export const unregisterBackgroundAlertTask = async () => {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_ALERT_TASK);
  if (!isRegistered) return;
  await BackgroundFetch.unregisterTaskAsync(BACKGROUND_ALERT_TASK);
};
