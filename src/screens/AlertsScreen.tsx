import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { AlertType } from '../models/types';
import { fetchLivePrices } from '../services/alertService';

export const AlertsScreen = () => {
  const { state, dispatch } = useAppContext();

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [targetPrice, setTargetPrice] = useState('');
  const [type, setType] = useState<AlertType>('above');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastPriceSyncAt, setLastPriceSyncAt] = useState<string | null>(null);
  const [btcLivePrice, setBtcLivePrice] = useState<number | null>(null);

  const loadPrices = async () => {
    const symbols = Array.from(new Set(['BTCUSDT', ...state.alerts.map((a) => a.symbol)]));
    const live = await fetchLivePrices(symbols, state.settings.exchange);
    setBtcLivePrice(Number.isFinite(live.BTCUSDT) ? live.BTCUSDT : null);
    setLastPriceSyncAt(symbols.length > 1 ? new Date().toISOString() : null);
  };

  useEffect(() => {
    loadPrices();
    const timer = setInterval(loadPrices, 1_000);
    return () => clearInterval(timer);
  }, [state.alerts, state.settings.exchange]);

  const onAddAlert = () => {
    setError(null);
    const price = Number(targetPrice);

    if (!symbol.trim() || !Number.isFinite(price) || price <= 0) {
      setError('Enter valid symbol and target price.');
      return;
    }

    dispatch({
      type: 'ADD_ALERT',
      payload: {
        symbol: symbol.trim().toUpperCase(),
        targetPrice: price,
        type,
        message: message.trim()
      }
    });

    setTargetPrice('');
    setMessage('');
  };

  const onRemoveAlert = (id: string) => {
    dispatch({ type: 'DELETE_ALERT', payload: id });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title="Add New Alert" />
          <Card.Content>
            <View style={styles.btcLiveRow}>
              <Text style={styles.btcLiveLabel}>BTCUSDT Live</Text>
              <Text style={styles.btcLiveValue}>
                {typeof btcLivePrice === 'number' ? Math.round(btcLivePrice) : '--'}
              </Text>
            </View>
            <TextInput
              label="Symbol / Pair"
              value={symbol}
              onChangeText={setSymbol}
              mode="outlined"
            />
            <TextInput
              label="Price Target"
              value={targetPrice}
              onChangeText={setTargetPrice}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.input}
            />

            <SegmentedButtons
              value={type}
              onValueChange={(v) => setType(v as AlertType)}
              buttons={[
                { value: 'above', label: 'Above Price' },
                { value: 'below', label: 'Below Price' }
              ]}
              style={styles.segmented}
            />

            <TextInput
              label="Custom Message"
              value={message}
              onChangeText={setMessage}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button mode="contained" onPress={onAddAlert} style={styles.button} buttonColor="#8b7cf6">
              Add Alert
            </Button>
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={styles.sectionTitle}>Active & Triggered Alerts</Text>
        {lastPriceSyncAt ? (
          <View style={styles.row}>
            <Text style={styles.meta}>Updated: {new Date(lastPriceSyncAt).toLocaleTimeString()}</Text>
          </View>
        ) : null}

        {state.alerts.length === 0 ? (
          <Text style={styles.empty}>No alerts added yet.</Text>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.colSymbol]}>Symbol</Text>
                  <Text style={[styles.tableCell, styles.colType]}>Type</Text>
                  <Text style={[styles.tableCell, styles.colAlert]}>Alert</Text>
                  <Text style={[styles.tableCell, styles.colStatus]}>Status</Text>
                </View>

                {state.alerts.map((alert) => {
                  return (
                    <View key={alert.id} style={styles.tableGroup}>
                      <View style={styles.tableRow}>
                        <Text style={[styles.tableCell, styles.colSymbol]} numberOfLines={1}>{alert.symbol}</Text>
                        <Text style={[styles.tableCell, styles.colType]} numberOfLines={1}>{alert.type}</Text>
                        <Text style={[styles.tableCell, styles.colAlert]} numberOfLines={1}>{Math.round(alert.targetPrice)}</Text>
                        <Text
                          style={[styles.tableCell, styles.colStatus, alert.status === 'active' ? styles.active : styles.triggered]}
                          numberOfLines={1}
                        >
                          {alert.status}
                        </Text>
                      </View>
                      <View style={styles.messageRow}>
                        <Text style={styles.messageLine} numberOfLines={1}>
                          Message: {alert.message || '-'}
                        </Text>
                        <Button
                          mode="text"
                          compact
                          textColor="#ef4444"
                          onPress={() => onRemoveAlert(alert.id)}
                          style={styles.deleteBtn}
                        >
                          Remove
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 24, gap: 12 },
  panel: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#283349' },
  input: { marginTop: 12 },
  button: { marginTop: 14, borderRadius: 14 },
  segmented: { marginTop: 14 },
  sectionTitle: { color: '#c9d4e8', marginTop: 10 },
  card: { marginTop: 8, backgroundColor: '#111827', borderWidth: 1, borderColor: '#283349' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  meta: { color: '#94a3b8', alignSelf: 'center' },
  btcLiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2
  },
  btcLiveLabel: { color: '#9fb2d3', fontSize: 13 },
  btcLiveValue: { color: '#dbe5f6', fontSize: 16, fontWeight: '700' },
  table: { width: '100%' },
  tableHeader: { borderBottomWidth: 1, borderBottomColor: '#32415d', paddingBottom: 2 },
  tableGroup: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1f2a3d' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  tableCell: { color: '#dbe5f6', fontSize: 14, flex: 1, textAlign: 'center' },
  colSymbol: { flex: 1, textAlign: 'center' },
  colType: { flex: 1, textTransform: 'capitalize', textAlign: 'center' },
  colAlert: { flex: 1, textAlign: 'center' },
  colStatus: { flex: 1, textTransform: 'capitalize', textAlign: 'center' },
  messageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
  deleteBtn: { minWidth: 0, marginLeft: 8 },
  messageLine: { color: '#9fb2d3', fontSize: 12, flex: 1, paddingLeft: 1 },
  error: { color: '#ef4444', marginTop: 8 },
  active: { color: '#22c55e', textTransform: 'capitalize' },
  triggered: { color: '#eab308', textTransform: 'capitalize' },
  empty: { color: '#94a3b8' }
});
