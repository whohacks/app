import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { PriceText } from '../components/PriceText';
import { useAppContext } from '../context/AppContext';
import { fetchDashboardData } from '../services/binanceService';

export const DashboardScreen = () => {
  const { state } = useAppContext();
  const [accountBalance, setAccountBalance] = useState(0);
  const [spotBalance, setSpotBalance] = useState(0);
  const [futuresBalance, setFuturesBalance] = useState(0);
  const [futuresAvailable, setFuturesAvailable] = useState(false);
  const [runningTrades, setRunningTrades] = useState(state.trades.slice(0, 5).map((t) => ({
    symbol: t.symbol,
    entryPrice: t.entryPrice,
    currentPrice: t.exitPrice,
    pnl: t.pnl,
    positionSize: t.size
  })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const formatUsd = (value: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  const loadDashboard = useCallback(async () => {
    if (!state.settings.exchangeApiKey || !state.settings.exchangeApiSecret) {
      setError('Add API key and secret in Settings first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData(state.settings);
      setAccountBalance(data.accountBalance);
      setSpotBalance(data.spotBalance);
      setFuturesBalance(data.futuresBalance);
      setFuturesAvailable(data.futuresAvailable);
      setRunningTrades(data.runningTrades);
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Unable to refresh dashboard: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [state.settings]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      const timer = setInterval(loadDashboard, 30_000);
      return () => clearInterval(timer);
    }, [loadDashboard])
  );

  useEffect(() => {
    if (state.settings.exchangeApiKey && state.settings.exchangeApiSecret) {
      loadDashboard();
    }
  }, [loadDashboard, state.settings.exchangeApiKey, state.settings.exchangeApiSecret]);

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadDashboard} />}
        contentContainerStyle={styles.content}
      >
        <Card style={styles.heroCard}>
          <Card.Content>
            <View style={styles.totalBlock}>
              <Text style={styles.balanceText}>
                ${formatUsd(accountBalance)}
              </Text>
            </View>
            <View style={styles.walletBlock}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Spot Wallet</Text>
                <Text style={styles.metricValue}>${formatUsd(spotBalance)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Futures Wallet</Text>
                <Text style={styles.metricValue}>
                  {futuresAvailable ? `$${formatUsd(futuresBalance)}` : 'Not available'}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Button
              mode="contained"
              onPress={loadDashboard}
              loading={loading}
              buttonColor="#8b7cf6"
              textColor="#f8f7ff"
            >
              Refresh
            </Button>
            {lastSyncedAt ? (
              <Text style={styles.syncedAt}>Last Updated • {new Date(lastSyncedAt).toLocaleString()}</Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card.Content>
        </Card>

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Running Trades
        </Text>

        {runningTrades.length === 0 ? (
          <Text style={styles.empty}>No open positions.</Text>
        ) : (
          runningTrades.map((trade, index) => (
            <Card key={`${trade.symbol}-${index}`} style={styles.card}>
              <Card.Content>
                <View style={styles.row}>
                  <Text variant="titleMedium">{trade.symbol}</Text>
                  <PriceText value={trade.pnl} />
                </View>
                <View style={styles.row}>
                  <Text>Entry: ${trade.entryPrice.toFixed(4)}</Text>
                  <Text>Current: ${trade.currentPrice.toFixed(4)}</Text>
                </View>
                <Text>Position Size: {trade.positionSize}</Text>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 24, gap: 12 },
  sectionTitle: { marginTop: 12, color: '#c9d4e8', letterSpacing: 0.3 },
  heroCard: {
    backgroundColor: '#111827',
    borderColor: '#283349',
    borderWidth: 1
  },
  card: {
    marginBottom: 8,
    backgroundColor: '#111827',
    borderColor: '#283349',
    borderWidth: 1
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalBlock: { marginBottom: 8 },
  walletBlock: { marginTop: 6, gap: 2 },
  balanceText: {
    marginBottom: 8,
    fontWeight: '800',
    color: '#f5f7ff',
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: 0.2,
    includeFontPadding: false
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  metricLabel: { color: '#9fb2d3', fontSize: 15 },
  metricValue: { color: '#dbe5f6', fontWeight: '700', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#29344a', marginVertical: 10 },
  syncedAt: { marginTop: 10, color: '#7d91b3', fontSize: 13 },
  error: { color: '#ef4444', marginTop: 8 },
  empty: { color: '#94a3b8', marginTop: 6 }
});
