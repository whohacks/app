import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { fetchDashboardData } from '../services/binanceService';
import { fetchHighImpactUsdEventsForCurrentMonth, ForexFactoryEventWithDate } from '../services/forexFactoryService';

export const DashboardScreen = () => {
  const { state } = useAppContext();
  const [accountBalance, setAccountBalance] = useState(0);
  const [spotBalance, setSpotBalance] = useState(0);
  const [futuresBalance, setFuturesBalance] = useState(0);
  const [futuresAvailable, setFuturesAvailable] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [forexEventsAll, setForexEventsAll] = useState<ForexFactoryEventWithDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forexError, setForexError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const formatUsd = (value: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForexError(null);

    if (!state.settings.exchangeApiKey || !state.settings.exchangeApiSecret) {
      setError('Add API key and secret in Settings first.');
    } else {
      try {
        const data = await fetchDashboardData(state.settings);
        setAccountBalance(data.accountBalance);
        setSpotBalance(data.spotBalance);
        setFuturesBalance(data.futuresBalance);
        setFuturesAvailable(data.futuresAvailable);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(`Unable to refresh dashboard: ${msg}`);
      }
    }

    try {
      const result = await fetchHighImpactUsdEventsForCurrentMonth();
      setForexEventsAll(result.events);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setForexError(`Unable to load ForexFactory calendar: ${msg}`);
      setForexEventsAll([]);
    } finally {
      setLastSyncedAt(new Date().toISOString());
      setLoading(false);
    }
  }, [state.settings]);

  const eventTitle = (event: ForexFactoryEventWithDate) =>
    event.title ?? event.event ?? event.name ?? 'Untitled event';

  const eventTime = (event: ForexFactoryEventWithDate) => {
    if (event.time && /[0-9]/.test(event.time)) {
      return event.time;
    }
    if (event.eventDate) {
      return event.eventDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return 'Time TBD';
  };

  const formatField = (value?: string | number) => {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  };

  const forexEvents = forexEventsAll;

  const isToday = (eventDate: Date | null | undefined) => {
    if (!eventDate) return false;
    const now = new Date();
    return (
      eventDate.getFullYear() === now.getFullYear() &&
      eventDate.getMonth() === now.getMonth() &&
      eventDate.getDate() === now.getDate()
    );
  };

  const eventCurrency = (event: ForexFactoryEventWithDate) =>
    (event.currency ?? event.country ?? 'USD').toUpperCase();

  const formatDayLabel = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const groupedEvents = forexEvents.reduce<Record<string, ForexFactoryEventWithDate[]>>((acc, event) => {
    if (!event.eventDate) return acc;
    const key = event.eventDate.toDateString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  const groupedKeys = Object.keys(groupedEvents).sort((a, b) => {
    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();
    return dateA - dateB;
  });

  // Manual refresh only.

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.heroCard}>
          <Card.Content>
            <View style={styles.totalBlock}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceText}>
                  {showBalance ? `$${formatUsd(accountBalance)}` : '•••••'}
                </Text>
                <Pressable onPress={() => setShowBalance((prev) => !prev)} style={styles.eyeButton}>
                  <MaterialCommunityIcons
                    name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                    size={22}
                    color="#94A3B8"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.walletBlock}>
              <View style={styles.metricRow}>
                <View style={styles.metricLabelWrap}>
                  <MaterialCommunityIcons name="wallet-outline" size={16} color="#9fb2d3" />
                  <Text style={styles.metricLabel}>Spot Wallet</Text>
                </View>
                <Text style={styles.metricValue}>
                  {showBalance ? `$${formatUsd(spotBalance)}` : '•••••'}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <View style={styles.metricLabelWrap}>
                  <MaterialCommunityIcons name="chart-line" size={16} color="#9fb2d3" />
                  <Text style={styles.metricLabel}>Futures Wallet</Text>
                </View>
                <Text style={styles.metricValue}>
                  {futuresAvailable ? (showBalance ? `$${formatUsd(futuresBalance)}` : '•••••') : 'Not available'}
                </Text>
              </View>
            </View>

            <Button
              mode="contained"
              onPress={loadDashboard}
              loading={loading}
              buttonColor="#7C3AED"
              textColor="#F8FAFC"
              style={styles.refreshBtn}
              contentStyle={styles.btnContent}
            >
              Refresh
            </Button>

            {lastSyncedAt ? <Text style={styles.syncedAt}>Last updated • {new Date(lastSyncedAt).toLocaleString()}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card.Content>
        </Card>

        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            ForexFactory Red Folder
          </Text>
        </View>

        {forexEvents.length === 0 ? (
          <Text style={styles.empty}>No high-impact USD events available.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.colDate]}>Date</Text>
                <Text style={[styles.tableCell, styles.colTime]}>Time</Text>
                <Text style={[styles.tableCell, styles.colCurrency]}>Currency</Text>
                <Text style={[styles.tableCell, styles.colImpact]}>Impact</Text>
                <Text style={[styles.tableCell, styles.colNew]}>New</Text>
                <Text style={[styles.tableCell, styles.colDetail]}>Detail</Text>
                <Text style={[styles.tableCell, styles.colActual]}>Actual</Text>
                <Text style={[styles.tableCell, styles.colForecast]}>Forecast</Text>
                <Text style={[styles.tableCell, styles.colPrevious]}>Previous</Text>
              </View>

              {groupedKeys.map((key) => {
                const eventsForDay = groupedEvents[key];
                const dayLabel = eventsForDay?.[0]?.eventDate ? formatDayLabel(eventsForDay[0].eventDate) : key;
                return eventsForDay.map((event, index) => (
                  <View
                    key={`${eventTitle(event)}-${index}`}
                    style={[styles.tableRow, isToday(event.eventDate) ? styles.tableRowToday : null]}
                  >
                    <Text style={[styles.tableCell, styles.colDate]}>
                      {index === 0 ? dayLabel : ''}
                    </Text>
                    <Text style={[styles.tableCell, styles.colTime]}>{eventTime(event)}</Text>
                    <Text style={[styles.tableCell, styles.colCurrency]}>{eventCurrency(event)}</Text>
                    <View style={[styles.tableCell, styles.colImpact]}>
                      <View style={styles.impactIcon} />
                    </View>
                    <View style={[styles.tableCell, styles.colNew]}>
                      {event.isNew ? <Text style={styles.newBadge}>NEW</Text> : null}
                    </View>
                    <Text style={[styles.tableCell, styles.colDetail]}>{eventTitle(event)}</Text>
                    <Text style={[styles.tableCell, styles.colActual]}>{formatField(event.actual)}</Text>
                    <Text style={[styles.tableCell, styles.colForecast]}>{formatField(event.forecast)}</Text>
                    <Text style={[styles.tableCell, styles.colPrevious]}>{formatField(event.previous)}</Text>
                  </View>
                ));
              })}
            </View>
          </ScrollView>
        )}

        {forexError ? <Text style={styles.error}>{forexError}</Text> : null}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 24 },
  sectionTitle: { color: '#E2E8F0', letterSpacing: 0.3, fontSize: 20, fontWeight: '700' },
  sectionHeader: { gap: 12 },
  table: { backgroundColor: '#0B1220', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B' },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  tableRowToday: { backgroundColor: '#1B0E12' },
  tableHeader: { backgroundColor: '#1F2A44' },
  tableCell: { color: '#E2E8F0', paddingVertical: 10, paddingHorizontal: 10, fontSize: 12 },
  colDate: { width: 110 },
  colTime: { width: 90 },
  colCurrency: { width: 80 },
  colImpact: { width: 70, alignItems: 'center' },
  colNew: { width: 70, alignItems: 'center' },
  colDetail: { width: 320 },
  colActual: { width: 90 },
  colForecast: { width: 90 },
  colPrevious: { width: 90 },
  impactIcon: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#EF4444' },
  newBadge: {
    color: '#F8FAFC',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden'
  },
  heroCard: {
    backgroundColor: '#111827',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  card: {
    backgroundColor: '#111827',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  totalBlock: { marginBottom: 24 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyeButton: { paddingLeft: 12, paddingVertical: 6 },
  walletBlock: { marginTop: 0 },
  balanceText: {
    fontWeight: '800',
    color: '#F8FAFC',
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: 0.2,
    includeFontPadding: false
  },
  metricLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  metricLabel: { color: '#9FB2D3', fontSize: 15 },
  metricValue: { color: '#E2E8F0', fontWeight: '700', fontSize: 16, fontVariant: ['tabular-nums'] },
  refreshBtn: { marginTop: 8, borderRadius: 14 },
  btnContent: { height: 48 },
  syncedAt: { marginTop: 12, color: '#64748B', fontSize: 12 },
  error: { color: '#ef4444', marginTop: 8 },
  empty: { color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  tradeSymbol: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  metaText: { color: '#94A3B8' },
  badge: {
    color: '#F8FAFC',
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden'
  }
});
