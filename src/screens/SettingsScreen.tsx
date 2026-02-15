import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import Constants from 'expo-constants';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { testBinanceConnection } from '../services/binanceService';

export const SettingsScreen = () => {
  const { state, dispatch } = useAppContext();
  const { hasPasscode, changePasscode, removePasscode } = useAuth();

  const [exchangeMenuVisible, setExchangeMenuVisible] = useState(false);
  const [loading, setLoading] = useState<'exchange' | null>(null);
  const [exchangeConnection, setExchangeConnection] = useState<{
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
  const inputTheme = {
    colors: {
      background: '#0F1419',
      outline: '#1E293B',
      primary: '#7C3AED',
      onSurface: '#E2E8F0',
      onSurfaceVariant: '#64748B'
    },
    roundness: 12
  };

  const updateSetting = (
    key: 'exchangeApiKey' | 'exchangeApiSecret',
    value: string
  ) => {
    dispatch({ type: 'UPSERT_SETTINGS', payload: { [key]: value } });
  };

  const onTestExchange = async () => {
    setLoading('exchange');
    try {
      await testBinanceConnection(state.settings);
      setExchangeConnection({ status: 'success' });
    } catch {
      setExchangeConnection({ status: 'error' });
    } finally {
      setLoading(null);
    }
  };

  const onDisconnectExchange = () => {
    dispatch({ type: 'UPSERT_SETTINGS', payload: { exchangeApiKey: '', exchangeApiSecret: '' } });
    setExchangeConnection({ status: 'idle' });
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
          <Card.Title title="Connect Exchange" />
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
              theme={inputTheme}
            />
            <TextInput
              label="Secret Key"
              value={state.settings.exchangeApiSecret}
              onChangeText={(v) => updateSetting('exchangeApiSecret', v.trim())}
              mode="outlined"
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
              theme={inputTheme}
            />

            <HelperText type="info">{securityWarning}</HelperText>
            <View style={styles.actionRow}>
              <Button
                mode="contained"
                loading={loading === 'exchange'}
                onPress={onTestExchange}
                buttonColor="#7C3AED"
                compact
                style={styles.actionButton}
                contentStyle={styles.btnContent}
              >
                Connect
              </Button>
              <Button mode="outlined" onPress={onDisconnectExchange} compact style={styles.actionButton} contentStyle={styles.btnContent}>
                Disconnect
              </Button>
              <View style={[styles.statusChip, exchangeStatus.bgStyle]}>
                <Text style={exchangeStatus.textStyle}>{exchangeStatus.label}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="App" />
          <Card.Content>
            <View style={styles.pinActionRow} />

            {hasPasscode ? (
              <>
                <View style={styles.pinActionRow}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setPinError(null);
                      setShowRemovePin(false);
                      setShowChangePin((v) => !v);
                    }}
                    style={styles.pinActionButton}
                    contentStyle={styles.btnContent}
                  >
                    Change PIN
                  </Button>
                  <Button
                    mode="outlined"
                    textColor="#ef4444"
                    onPress={() => {
                      setPinError(null);
                      setShowChangePin(false);
                      setShowRemovePin((v) => !v);
                    }}
                    style={styles.pinActionButton}
                    contentStyle={styles.btnContent}
                  >
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
                      theme={inputTheme}
                    />
                    <TextInput
                      label="New PIN"
                      value={newPin}
                      onChangeText={setNewPin}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      theme={inputTheme}
                    />
                    <TextInput
                      label="Confirm New PIN"
                      value={confirmPin}
                      onChangeText={setConfirmPin}
                      mode="outlined"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      theme={inputTheme}
                    />
                    <Button mode="contained" onPress={onChangePin} style={styles.appButton} contentStyle={styles.btnContent} buttonColor="#7C3AED">
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
                      theme={inputTheme}
                    />
                    <Button mode="outlined" textColor="#ef4444" onPress={onRemovePin} style={styles.appButton} contentStyle={styles.btnContent}>
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
  content: { paddingBottom: 32, gap: 24 },
  panel: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  input: { marginTop: 16, minHeight: 48, backgroundColor: '#0F1419' },
  actionRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionButton: { flex: 1 },
  btnContent: { height: 48 },
  statusChip: {
    borderWidth: 1,
    borderColor: '#2a3448',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  statusOkBg: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusBadBg: { backgroundColor: 'rgba(239,68,68,0.1)' },
  statusNeutralBg: { backgroundColor: 'rgba(148,163,184,0.1)' },
  appButton: { marginTop: 10, borderRadius: 14 },
  pinActionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  pinActionButton: { flex: 1 },
  pinBox: { marginTop: 12 },
  pinError: { color: '#ef4444', marginTop: 8 },
  ok: { color: '#22c55e' },
  bad: { color: '#ef4444' },
  neutral: { color: '#94a3b8' },
  version: { marginTop: 16, color: '#64748B', textAlign: 'center', fontSize: 12 }
});
