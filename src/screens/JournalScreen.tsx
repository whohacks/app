import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Divider, Menu, Text, TextInput } from 'react-native-paper';
import { ScreenContainer } from '../components/ScreenContainer';
import { PriceText } from '../components/PriceText';
import { useAppContext } from '../context/AppContext';
import { fetchFuturesPositionHistory } from '../services/binanceService';
import { byCategoryAnalytics } from '../utils/math';

export const JournalScreen = () => {
  const { state, dispatch } = useAppContext();
  const exchangeLabel =
    state.settings.exchange === 'bybit'
      ? 'Bybit Futures'
      : state.settings.exchange === 'binance_us'
        ? 'Binance US'
        : 'Binance Futures';

  const [customCategory, setCustomCategory] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  const filteredTrades = useMemo(() => state.trades, [state.trades]);

  const analytics = useMemo(() => byCategoryAnalytics(filteredTrades), [filteredTrades]);

  const parseDate = (value: string, boundary: 'start' | 'end'): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error('Use date format YYYY-MM-DD');
    }

    const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
    const ts = Date.parse(`${trimmed}${suffix}`);
    if (!Number.isFinite(ts)) {
      throw new Error('Invalid date value');
    }
    return ts;
  };

  const stopActiveSync = () => {
    if (syncAbortRef.current) {
      syncAbortRef.current.abort();
      syncAbortRef.current = null;
    }
  };

  const isAbortLikeError = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    return e.name === 'AbortError' || /cancel/i.test(e.message);
  };

  const onImportTrades = async () => {
    stopActiveSync();

    if (!state.settings.exchangeApiKey || !state.settings.exchangeApiSecret) {
      setError('Add API key and secret in Settings first.');
      return;
    }

    if (!fromDate.trim()) {
      setError('From Date is required (YYYY-MM-DD).');
      return;
    }

    let startTime: number | undefined;
    let endTime: number | undefined;
    try {
      startTime = parseDate(fromDate, 'start') ?? undefined;
      endTime = parseDate(toDate, 'end') ?? undefined;
      if (startTime && endTime && startTime > endTime) {
        setError('From Date must be earlier than or equal to To Date.');
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid date range';
      setError(msg);
      return;
    }

    setLoading(true);
    setError(null);
    setSyncInfo(null);
    const controller = new AbortController();
    syncAbortRef.current = controller;
    try {
      const allImported = await fetchFuturesPositionHistory(state.settings, { startTime, endTime }, controller.signal);
      if (controller.signal.aborted) {
        setSyncInfo('Previous sync cancelled.');
        return;
      }

      if (allImported.length) {
        dispatch({ type: 'IMPORT_TRADES', payload: allImported });
      }

      setLastSyncedAt(new Date().toISOString());

      if (!allImported.length) {
        setError('No closed trades found for the selected date range.');
      }

      setSyncInfo(`Synced ${allImported.length} trades for selected dates.`);
    } catch (e) {
      if (isAbortLikeError(e)) {
        setSyncInfo('Previous sync cancelled.');
        return;
      }
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Trade import failed: ${msg}`);
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null;
      }
      setLoading(false);
    }
  };

  const onFromDateChange = (value: string) => {
    stopActiveSync();
    setFromDate(value);
  };

  const onToDateChange = (value: string) => {
    stopActiveSync();
    setToDate(value);
  };

  useEffect(() => {
    return () => stopActiveSync();
  }, []);

  const onAddCategory = () => {
    const value = customCategory.trim();
    if (!value) return;
    dispatch({ type: 'UPSERT_CATEGORY', payload: value });
    setCustomCategory('');
  };

  const onDeleteCategory = (category: string) => {
    dispatch({ type: 'DELETE_CATEGORY', payload: category });
  };

  const onSetTradeCategory = (tradeId: string, category: string) => {
    dispatch({ type: 'UPDATE_TRADE_CATEGORY', payload: { id: tradeId, category } });
    setEditingTradeId(null);
  };

  const onDeleteTrade = (tradeId: string) => {
    dispatch({ type: 'DELETE_TRADE', payload: tradeId });
    if (editingTradeId === tradeId) {
      setEditingTradeId(null);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onImportTrades} />}
        contentContainerStyle={styles.content}
      >
        <Card style={styles.panel}>
          <Card.Title
            title={`Import Trades (${exchangeLabel})`}
            subtitle="Imports futures position history for selected dates"
          />
          <Card.Content>
            <View style={styles.splitRow}>
              <TextInput
                mode="outlined"
                label="From Date"
                value={fromDate}
                onChangeText={onFromDateChange}
                placeholder="YYYY-MM-DD"
                style={styles.flex}
              />
              <TextInput
                mode="outlined"
                label="To Date"
                value={toDate}
                onChangeText={onToDateChange}
                placeholder="YYYY-MM-DD"
                style={styles.flex}
              />
            </View>
            <Button mode="contained" onPress={onImportTrades} loading={loading} style={styles.button} buttonColor="#8b7cf6">
              Sync Journal
            </Button>
            {lastSyncedAt ? (
              <Text style={styles.syncedAt}>Last synced: {new Date(lastSyncedAt).toLocaleString()}</Text>
            ) : null}
            {syncInfo ? <Text style={styles.syncInfo}>{syncInfo}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="Categories" subtitle="Create custom categories and assign them to imported trades" />
          <Card.Content>
            <View style={styles.splitRow}>
              <TextInput
                label="New Category"
                value={customCategory}
                onChangeText={setCustomCategory}
                mode="outlined"
                style={styles.flex}
              />
              <Button mode="contained-tonal" onPress={onAddCategory} style={styles.flexButton} buttonColor="#263149">
                Add
              </Button>
            </View>
            <Button
              mode="outlined"
              onPress={() => setShowCategories((prev) => !prev)}
              style={styles.button}
            >
              {showCategories ? 'Hide Categories' : 'View Categories'}
            </Button>
            {showCategories ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {state.categories.map((c) => (
                  <View key={c} style={styles.categoryItem}>
                    <Chip>{c}</Chip>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title={`Trades (${filteredTrades.length})`} subtitle="Symbol, PnL, Category, Change Category" />
          <Card.Content>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.colTradeSymbol]}>Symbol</Text>
              <Text style={[styles.tableCell, styles.colTradePnl]}>PnL</Text>
              <Text style={[styles.tableCell, styles.colTradeCategory]}>Category</Text>
              <Text style={[styles.tableCell, styles.colTradeAction]}>Action</Text>
            </View>
            {filteredTrades.map((trade) => (
              <View key={trade.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colTradeSymbol]}>{trade.symbol}</Text>
                <View style={styles.colTradePnl}>
                  <PriceText value={trade.pnl} />
                </View>
                <Text style={[styles.tableCell, styles.colTradeCategory]}>{trade.category || 'Uncategorized'}</Text>
                <View style={styles.colTradeAction}>
                  <View style={styles.tradeActionRow}>
                    <Menu
                      visible={editingTradeId === trade.id}
                      onDismiss={() => setEditingTradeId(null)}
                      anchor={
                        <Button compact mode="outlined" onPress={() => setEditingTradeId(trade.id)}>
                          Change
                        </Button>
                      }
                    >
                      {state.categories.map((c) => (
                        <Menu.Item key={`${trade.id}-${c}`} title={c} onPress={() => onSetTradeCategory(trade.id, c)} />
                      ))}
                    </Menu>
                    <Button compact mode="text" textColor="#ef4444" onPress={() => onDeleteTrade(trade.id)}>
                      Delete
                    </Button>
                  </View>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Divider />
        <Card style={styles.panel}>
          <Card.Title title="Category Table" subtitle="All categories with win rate" />
          <Card.Content>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.colCategory]}>Category</Text>
              <Text style={[styles.tableCell, styles.colWin]}>Win%</Text>
              <Text style={[styles.tableCell, styles.colTrades]}>Trades</Text>
              <Text style={[styles.tableCell, styles.colAction]}>Action</Text>
            </View>
            {state.categories.map((category) => {
              const stats = analytics.find((a) => a.category === category);
              return (
                <View key={`row-${category}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.colCategory]}>{category}</Text>
                  <Text style={[styles.tableCell, styles.colWin]}>{(stats?.winRate ?? 0).toFixed(1)}%</Text>
                  <Text style={[styles.tableCell, styles.colTrades]}>{stats?.totalTrades ?? 0}</Text>
                  <View style={styles.colAction}>
                    <Button compact mode="text" textColor="#ef4444" onPress={() => onDeleteCategory(category)}>
                      Delete
                    </Button>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>

      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 24, gap: 12 },
  panel: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#283349' },
  button: { marginTop: 12 },
  splitRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  flex: { flex: 1 },
  flexButton: { flex: 1, justifyContent: 'center', marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  chips: { marginVertical: 10, gap: 8 },
  categoryItem: { alignItems: 'center' },
  tableHeader: { borderBottomWidth: 1, borderBottomColor: '#32415d' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  tableCell: { fontSize: 13, color: '#dbe5f6' },
  colCategory: { flex: 2, paddingRight: 8 },
  colWin: { flex: 1, textAlign: 'right' },
  colTrades: { flex: 1, textAlign: 'right' },
  colAction: { flex: 1.4, alignItems: 'flex-end' },
  colTradeSymbol: { flex: 1.4, paddingRight: 10 },
  colTradePnl: { flex: 1, alignItems: 'flex-end', paddingRight: 14 },
  colTradeCategory: { flex: 1.5, paddingLeft: 8 },
  colTradeAction: { flex: 1.1, alignItems: 'flex-end', paddingLeft: 10 },
  tradeActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncedAt: { marginTop: 8, color: '#94a3b8' },
  syncInfo: { marginTop: 6, color: '#22c55e' },
  error: { color: '#ef4444', marginTop: 8 }
});
