import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Settings, Trade } from '../models/types';
import { loadSettingsSecure, saveSettingsSecure } from '../services/settingsService';
import { DEFAULT_CATEGORIES, STORAGE_KEY } from '../utils/constants';

type AppState = {
  trades: Trade[];
  alerts: Alert[];
  categories: string[];
  settings: Settings;
  hydrated: boolean;
};

type AddTradeInput = Omit<Trade, 'id' | 'pnl'> & { pnl?: number };
type AddAlertInput = Omit<Alert, 'id' | 'status' | 'createdAt'>;

type AppAction =
  | { type: 'HYDRATE'; payload: AppState }
  | { type: 'SET_HYDRATED'; payload: boolean }
  | { type: 'ADD_TRADE'; payload: AddTradeInput }
  | { type: 'IMPORT_TRADES'; payload: Trade[] }
  | { type: 'UPDATE_TRADE_CATEGORY'; payload: { id: string; category: string } }
  | { type: 'DELETE_TRADE'; payload: string }
  | { type: 'ADD_ALERT'; payload: AddAlertInput }
  | { type: 'DELETE_ALERT'; payload: string }
  | { type: 'MARK_ALERT_TRIGGERED'; payload: { id: string; triggeredAt: string } }
  | { type: 'UPSERT_CATEGORY'; payload: string }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'UPSERT_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CLEAR_ALL' };

const defaultSettings: Settings = {
  exchange: 'binance',
  exchangeApiKey: '',
  exchangeApiSecret: '',
  telegramBotToken: '',
  telegramChatId: '',
  alertServerUrl: ''
};

const initialState: AppState = {
  trades: [],
  alerts: [],
  categories: DEFAULT_CATEGORIES,
  settings: defaultSettings,
  hydrated: false
};

type PersistedState = {
  trades: Trade[];
  alerts: Alert[];
  categories: string[];
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_HYDRATED':
      return { ...state, hydrated: action.payload };
    case 'ADD_TRADE': {
      const pnl =
        typeof action.payload.pnl === 'number'
          ? action.payload.pnl
          : (action.payload.exitPrice - action.payload.entryPrice) * action.payload.size;
      const trade: Trade = { ...action.payload, id: createId(), pnl };
      return { ...state, trades: [trade, ...state.trades] };
    }
    case 'IMPORT_TRADES':
      {
        const merged = new Map(state.trades.map((t) => [t.id, t]));
        action.payload.forEach((trade) => {
          const existing = merged.get(trade.id);
          merged.set(trade.id, existing ? { ...existing, ...trade, category: existing.category } : trade);
        });
        const trades = Array.from(merged.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        return { ...state, trades };
      }
    case 'UPDATE_TRADE_CATEGORY':
      return {
        ...state,
        trades: state.trades.map((t) =>
          t.id === action.payload.id ? { ...t, category: action.payload.category } : t
        )
      };
    case 'DELETE_TRADE':
      return { ...state, trades: state.trades.filter((t) => t.id !== action.payload) };
    case 'ADD_ALERT': {
      const alert: Alert = {
        ...action.payload,
        id: createId(),
        status: 'active',
        createdAt: new Date().toISOString()
      };
      return { ...state, alerts: [alert, ...state.alerts] };
    }
    case 'DELETE_ALERT':
      return { ...state, alerts: state.alerts.filter((a) => a.id !== action.payload) };
    case 'MARK_ALERT_TRIGGERED':
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.payload.id ? { ...a, status: 'triggered', triggeredAt: action.payload.triggeredAt } : a
        )
      };
    case 'UPSERT_CATEGORY':
      return state.categories.includes(action.payload)
        ? state
        : { ...state, categories: [...state.categories, action.payload] };
    case 'DELETE_CATEGORY': {
      const category = action.payload;
      if (!state.categories.includes(category)) return state;
      const categories = state.categories.filter((c) => c !== category);
      const trades = state.trades.map((t) =>
        t.category === category ? { ...t, category: '' } : t
      );
      return { ...state, categories, trades };
    }
    case 'UPSERT_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'CLEAR_ALL':
      return { ...initialState, hydrated: true };
    default:
      return state;
  }
};

type AppContextValue = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const [raw, secureSettings] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          loadSettingsSecure()
        ]);

        const parsed = raw ? (JSON.parse(raw) as PersistedState) : null;
        dispatch({
          type: 'HYDRATE',
          payload: {
            ...initialState,
            hydrated: true,
            trades: parsed?.trades ?? [],
            alerts: parsed?.alerts ?? [],
            categories: parsed?.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
            settings: { ...defaultSettings, ...secureSettings }
          }
        });
        return;
      } catch {
        dispatch({ type: 'SET_HYDRATED', payload: true });
      }
    };

    hydrate();
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;

    const persist = async () => {
      try {
        const persisted: PersistedState = {
          trades: state.trades,
          alerts: state.alerts,
          categories: state.categories
        };
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)),
          saveSettingsSecure(state.settings)
        ]);
      } catch {
        // Ignore transient write failures.
      }
    };

    persist();
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return ctx;
};
