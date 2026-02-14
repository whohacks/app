import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { testBinanceConnection } from '../services/binanceService';
import { clearSettingsSecure } from '../services/settingsService';
import { testTelegramConnection } from '../services/telegramService';
import { STORAGE_KEY } from '../utils/constants';

export const SettingsScreen = () => {
  const { state, dispatch } = useAppContext();
  const { hasPasscode, lockApp, changePasscode, removePasscode } = useAuth();

  const [exchangeMenuVisible, setExchangeMenuVisible] = useState(false);
  const [loading, setLoading] = useState<'exchange' | 'telegram' | null>(null);
  const [exchangeConnection, setExchangeConnection] = useState<{
    status: 'idle' | 'success' | 'error';
  }>({ status: 'idle' });
  const [telegramConnection, setTelegramConnection] = useState<{
    status: 'idle' | 'success' | 'error';
  }>({ status: 'idle' });
  const [showChangePin, setShowChangePin] = useState(false);
  const [showRemovePin, setShowRemovePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [removePinCurrent, setRemovePinCurrent] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const securityWarning = useMemo(
    () => 'Use read-only exchange API keys only. Never enable withdrawal permissions.',
    []
  );
  const hasExchangeCreds = !!state.settings.exchangeApiKey && !!state.settings.exchangeApiSecret;
  const hasTelegramCreds = !!state.settings.telegramBotToken && !!state.settings.telegramChatId;

  const getStatusMeta = (status: 'idle' | 'success' | 'error', hasCreds: boolean) => {
    if (status === 'error') {
      return { label: 'Failed', textStyle: styles.bad, bgStyle: styles.statusBadBg };
    }
    if (hasCreds || status === 'success') {
      return { label: 'Connected', textStyle: styles.ok, bgStyle: styles.statusOkBg };
    }
    return { label: 'Disconnected', textStyle: styles.neutral, bgStyle: styles.statusNeutralBg };
  };

  const exchangeStatus = getStatusMeta(exchangeConnection.status, hasExchangeCreds);
  const telegramStatus = getStatusMeta(telegramConnection.status, hasTelegramCreds);

  const updateSetting = (
    key:
      | 'exchangeApiKey'
      | 'exchangeApiSecret'
      | 'telegramBotToken'
      | 'telegramChatId',
    value: string
  ) => {
    dispatch({ type: 'UPSERT_SETTINGS', payload: { [key]: value } });
  };

  const onTestExchange = async () => {
    setLoading('exchange');
    try {
      await testBinanceConnection(state.settings);
      setExchangeConnection({
        status: 'success'
      });
    } catch (e) {
      setExchangeConnection({
        status: 'error'
      });
    } finally {
      setLoading(null);
    }
  };

  const onTestTelegram = async () => {
    setLoading('telegram');
    try {
      await testTelegramConnection(state.settings.telegramBotToken, state.settings.telegramChatId);
      setTelegramConnection({
        status: 'success'
      });
    } catch (e) {
      setTelegramConnection({
        status: 'error'
      });
    } finally {
      setLoading(null);
    }
  };

  const onDisconnectExchange = () => {
    dispatch({
      type: 'UPSERT_SETTINGS',
      payload: { exchangeApiKey: '', exchangeApiSecret: '' }
    });
    setExchangeConnection({
      status: 'idle'
    });
  };

  const onDisconnectTelegram = () => {
    dispatch({
      type: 'UPSERT_SETTINGS',
      payload: { telegramBotToken: '', telegramChatId: '' }
    });
    setTelegramConnection({
      status: 'idle'
    });
  };

  const onClearAll = () => {
    Alert.alert('Clear all data?', 'This removes all trades, alerts, categories, and saved keys.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await Promise.all([AsyncStorage.removeItem(STORAGE_KEY), clearSettingsSecure()]);
          dispatch({ type: 'CLEAR_ALL' });
        }
      }
    ]);
  };

  const onChangePin = async () => {
    setPinError(null);
    if (newPin.trim().length < 4) {
      setPinError('New PIN must be at least 4 characters.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }

    const ok = await changePasscode(currentPin, newPin);
    if (!ok) {
      setPinError('Current PIN is incorrect.');
      return;
    }

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setShowChangePin(false);
  };

  const onRemovePin = async () => {
    setPinError(null);
    const ok = await removePasscode(removePinCurrent);
    if (!ok) {
      setPinError('Current PIN is incorrect.');
      return;
    }

    setRemovePinCurrent('');
    setShowRemovePin(false);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title="Connect Exchange" subtitle="Select exchange matching your API keys" />
          <Card.Content>
            <Menu
              visible={exchangeMenuVisible}
              onDismiss={() => setExchangeMenuVisible(false)}
              anchor={<Button mode="outlined" onPress={() => setExchangeMenuVisible(true)}>{`Exchange: ${state.settings.exchange}`}</Button>}
            >
              <Menu.Item
                title="Binance"
                onPress={() => {
                  dispatch({ type: 'UPSERT_SETTINGS', payload: { exchange: 'binance' } });
                  setExchangeMenuVisible(false);
                }}
              />
              <Menu.Item
                title="Binance US"
                onPress={() => {
                  dispatch({ type: 'UPSERT_SETTINGS', payload: { exchange: 'binance_us' } });
                  setExchangeMenuVisible(false);
                }}
              />
              <Menu.Item
                title="Bybit"
                onPress={() => {
                  dispatch({ type: 'UPSERT_SETTINGS', payload: { exchange: 'bybit' } });
                  setExchangeMenuVisible(false);
                }}
              />
            </Menu>

            <TextInput
              label="API Key"
              value={state.settings.exchangeApiKey}
              onChangeText={(v) => updateSetting('exchangeApiKey', v.trim())}
              mode="outlined"
              autoCapitalize="none"
              style={styles.input}
            />
            <TextInput
              label="Secret Key"
              value={state.settings.exchangeApiSecret}
              onChangeText={(v) => updateSetting('exchangeApiSecret', v.trim())}
              mode="outlined"
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            <HelperText type="info">{securityWarning}</HelperText>
            <View style={styles.actionRow}>
              <Button
                mode="contained"
                loading={loading === 'exchange'}
                onPress={onTestExchange}
                buttonColor="#8b7cf6"
                compact
                style={styles.actionButton}
              >
                Connect
              </Button>
              <Button mode="outlined" onPress={onDisconnectExchange} compact style={styles.actionButton}>
                Disconnect
              </Button>
              <View
                style={[
                  styles.statusChip,
                  exchangeStatus.bgStyle
                ]}
              >
                <Text style={exchangeStatus.textStyle}>{exchangeStatus.label}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="Connect Telegram" />
          <Card.Content>
            <TextInput
              label="Bot Token"
              value={state.settings.telegramBotToken}
              onChangeText={(v) => updateSetting('telegramBotToken', v.trim())}
              mode="outlined"
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              label="Chat ID"
              value={state.settings.telegramChatId}
              onChangeText={(v) => updateSetting('telegramChatId', v.trim())}
              mode="outlined"
              autoCapitalize="none"
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <Button
                mode="contained"
                loading={loading === 'telegram'}
                onPress={onTestTelegram}
                buttonColor="#8b7cf6"
                compact
                style={styles.actionButton}
              >
                Connect
              </Button>
              <Button mode="outlined" onPress={onDisconnectTelegram} compact style={styles.actionButton}>
                Disconnect
              </Button>
              <View
                style={[
                  styles.statusChip,
                  telegramStatus.bgStyle
                ]}
              >
                <Text style={telegramStatus.textStyle}>{telegramStatus.label}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="App" />
          <Card.Content>
            <View style={styles.pinActionRow}>
              <Button mode="outlined" onPress={lockApp} style={styles.pinActionButton}>
                Lock App
              </Button>
              <Button mode="outlined" textColor="#ef4444" onPress={onClearAll} style={styles.pinActionButton}>
                Clear Data
              </Button>
            </View>
            {hasPasscode ? (
              <>
                <View style={styles.pinActionRow}>
                  <Button mode="outlined" onPress={() => {
                    setPinError(null);
                    setShowRemovePin(false);
                    setShowChangePin((v) => !v);
                  }} style={styles.pinActionButton}>
                    Change PIN
                  </Button>
                  <Button mode="outlined" textColor="#ef4444" onPress={() => {
                    setPinError(null);
                    setShowChangePin(false);
                    setShowRemovePin((v) => !v);
                  }} style={styles.pinActionButton}>
                    Remove PIN
                  </Button>
                </View>

                {showChangePin ? (
                  <View style={styles.pinBox}>
                    <TextInput
                      label="Current PIN"
                      value={currentPin}
                      onChangeText={setCurrentPin}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <TextInput
                      label="New PIN"
                      value={newPin}
                      onChangeText={setNewPin}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                    />
                    <TextInput
                      label="Confirm New PIN"
                      value={confirmPin}
                      onChangeText={setConfirmPin}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                    />
                    <Button mode="contained" onPress={onChangePin} style={styles.appButton} buttonColor="#8b7cf6">
                      Save New PIN
                    </Button>
                  </View>
                ) : null}

                {showRemovePin ? (
                  <View style={styles.pinBox}>
                    <TextInput
                      label="Current PIN"
                      value={removePinCurrent}
                      onChangeText={setRemovePinCurrent}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <Button mode="outlined" textColor="#ef4444" onPress={onRemovePin} style={styles.appButton}>
                      Confirm Remove PIN
                    </Button>
                  </View>
                ) : null}

                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
              </>
            ) : null}
            <Text style={styles.version}>Version: {Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 24, gap: 12 },
  panel: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#283349' },
  input: { marginTop: 10 },
  actionRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionButton: { flex: 1 },
  statusChip: {
    borderWidth: 1,
    borderColor: '#2a3448',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusOkBg: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusBadBg: { backgroundColor: 'rgba(239,68,68,0.1)' },
  statusNeutralBg: { backgroundColor: 'rgba(148,163,184,0.1)' },
  appButton: { marginTop: 10 },
  pinActionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pinActionButton: { flex: 1 },
  pinBox: { marginTop: 8 },
  pinError: { color: '#ef4444', marginTop: 8 },
  ok: { color: '#22c55e' },
  bad: { color: '#ef4444' },
  neutral: { color: '#94a3b8' },
  version: { marginTop: 14, color: '#94a3b8', textAlign: 'center' }
});
