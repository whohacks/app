import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Divider, Menu, Text, TextInput } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '../components/ScreenContainer';
import { PriceText } from '../components/PriceText';
import { ZoomableImage } from '../components/ZoomableImage';
import { useAppContext } from '../context/AppContext';
import { fetchFuturesPositionHistory } from '../services/binanceService';
import { byCategoryAnalytics } from '../utils/math';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateString = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(dt.getTime()) ? dt : null;
};

const formatTradeDate = (timestamp: string): string => {
  const dt = new Date(timestamp);
  if (!Number.isFinite(dt.getTime())) return 'Unknown date';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const JournalScreen = () => {
  const { state, dispatch } = useAppContext();

  const [customCategory, setCustomCategory] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [colorPickerCategory, setColorPickerCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const [detailTradeId, setDetailTradeId] = useState<string | null>(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualEntryPrice, setManualEntryPrice] = useState('');
  const [manualExitPrice, setManualExitPrice] = useState('');
  const [manualPnl, setManualPnl] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualImageUri, setManualImageUri] = useState<string | null>(null);
  const [manualCategoryMenuVisible, setManualCategoryMenuVisible] = useState(false);

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'from' | 'to' | 'manual'>('from');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const filteredTrades = useMemo(() => state.trades, [state.trades]);
  const analytics = useMemo(() => byCategoryAnalytics(filteredTrades), [filteredTrades]);
  const detailTrade = useMemo(
    () => (detailTradeId ? state.trades.find((t) => t.id === detailTradeId) ?? null : null),
    [detailTradeId, state.trades]
  );
  const groupedTrades = useMemo(() => {
    const groups = new Map<string, typeof filteredTrades>();
    filteredTrades.forEach((trade) => {
      const key = formatTradeDate(trade.timestamp);
      const list = groups.get(key);
      if (list) list.push(trade);
      else groups.set(key, [trade]);
    });
    return Array.from(groups.entries()).map(([date, trades]) => ({ date, trades }));
  }, [filteredTrades]);

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

  const parseDate = (value: string, boundary: 'start' | 'end'): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error('Please select a valid date.');
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

  const openCalendar = (target: 'from' | 'to' | 'manual') => {
    const existing = target === 'from' ? fromDate : toDate;
    const base = parseDateString(existing) ?? new Date();
    setCalendarTarget(target);
    setCalendarMonth(new Date(base.getUTCFullYear(), base.getUTCMonth(), 1));
    setShowMonthPicker(false);
    setShowYearPicker(false);
    setCalendarVisible(true);
  };

  const onPickDate = (day: number) => {
    const picked = new Date(Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
    const formatted = formatDate(picked);
    stopActiveSync();
    if (calendarTarget === 'from') setFromDate(formatted);
    else if (calendarTarget === 'to') setToDate(formatted);
    else setManualDate(formatted);
    setCalendarVisible(false);
  };

  const onPickMonth = (monthIndex: number) => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), monthIndex, 1));
    setShowMonthPicker(false);
  };

  const onPickYear = (year: number) => {
    setCalendarMonth(new Date(year, calendarMonth.getMonth(), 1));
    setShowYearPicker(false);
  };

  const onImportTrades = async () => {
    stopActiveSync();

    if (!state.settings.exchangeApiKey || !state.settings.exchangeApiSecret) {
      setError('Add API key and secret in Settings first.');
      return;
    }

    if (!fromDate.trim()) {
      setError('From Date is required.');
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

  const onPickCategoryColor = (category: string) => {
    setColorPickerCategory(category);
  };

  const onApplyCategoryColor = (color: string) => {
    if (!colorPickerCategory) return;
    dispatch({ type: 'UPDATE_CATEGORY_COLOR', payload: { category: colorPickerCategory, color } });
    setColorPickerCategory(null);
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

  const onClearTrades = () => {
    Alert.alert('Remove all imported trades?', 'This will delete all trades from the journal.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch({ type: 'CLEAR_TRADES' }) }
    ]);
  };

  const openTradeDetails = (tradeId: string) => {
    const trade = state.trades.find((t) => t.id === tradeId);
    if (!trade) return;
    setDetailTradeId(tradeId);
    setDetailNotes(trade.notes ?? '');
    setDetailError(null);
  };

  const closeTradeDetails = () => {
    setDetailTradeId(null);
    setDetailNotes('');
    setDetailError(null);
  };

  const onSaveTradeDetails = () => {
    if (!detailTradeId) return;
    const trimmed = detailNotes.trim();
    dispatch({
      type: 'UPDATE_TRADE_DETAILS',
      payload: { id: detailTradeId, notes: trimmed ? trimmed : undefined }
    });
    closeTradeDetails();
  };

  const openManualEntry = () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    const time = `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`;
    setManualSymbol('');
    setManualEntryPrice('');
    setManualExitPrice('');
    setManualPnl('');
    setManualCategory('');
    setManualNotes('');
    setManualImageUri(null);
    setManualCategoryMenuVisible(false);
    setManualDate(date);
    setManualTime(time);
    setManualError(null);
    setManualVisible(true);
  };

  const closeManualEntry = () => {
    setManualVisible(false);
  };

  const onSaveManualEntry = () => {
    const symbol = manualSymbol.trim().toUpperCase();
    const entryPrice = Number(manualEntryPrice);
    const exitPrice = Number(manualExitPrice);
    const pnl = Number(manualPnl);

    if (!symbol) {
      setManualError('Symbol is required.');
      return;
    }
    if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(pnl)) {
      setManualError('Entry price, exit price, and PnL must be valid numbers.');
      return;
    }
    if (!manualDate || !manualTime) {
      setManualError('Date and time are required.');
      return;
    }

    const timestamp = new Date(`${manualDate}T${manualTime}:00`);
    if (!Number.isFinite(timestamp.getTime())) {
      setManualError('Invalid date/time.');
      return;
    }

    dispatch({
      type: 'ADD_TRADE',
      payload: {
        symbol,
        entryPrice,
        exitPrice,
        size: 1,
        pnl,
        timestamp: timestamp.toISOString(),
        category: manualCategory.trim(),
        notes: manualNotes.trim() ? manualNotes.trim() : undefined,
        imageUri: manualImageUri ?? undefined,
        source: 'manual'
      }
    });
    setManualVisible(false);
  };

  const onPickTradeImage = async () => {
    if (!detailTradeId) return;
    setDetailError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    dispatch({ type: 'UPDATE_TRADE_DETAILS', payload: { id: detailTradeId, imageUri: asset.uri } });
  };

  const onRemoveTradeImage = () => {
    if (!detailTradeId) return;
    dispatch({ type: 'UPDATE_TRADE_DETAILS', payload: { id: detailTradeId, imageUri: null } });
  };

  const onPickManualImage = async () => {
    setManualError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setManualImageUri(asset.uri);
  };

  const onRemoveManualImage = () => {
    setManualImageUri(null);
  };

  const openImageViewer = (uri: string) => {
    setImageViewerUri(uri);
  };

  const closeImageViewer = () => {
    setImageViewerUri(null);
  };

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const leading = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const totalCells = Math.max(28, Math.ceil((leading + daysInMonth) / 7) * 7);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title="Import Trades" />
          <Card.Content>
            <View style={styles.splitRow}>
              <Pressable style={styles.dateField} onPress={() => openCalendar('from')}>
                <Text style={styles.dateLabel}>From Date</Text>
                <Text style={styles.dateValue}>{fromDate || 'Select'}</Text>
              </Pressable>
              <Pressable style={styles.dateField} onPress={() => openCalendar('to')}>
                <Text style={styles.dateLabel}>To Date</Text>
                <Text style={styles.dateValue}>{toDate || 'Select'}</Text>
              </Pressable>
            </View>

            <Button mode="contained" onPress={onImportTrades} loading={loading} style={styles.button} contentStyle={styles.btnContent} buttonColor="#7C3AED">
              Sync Journal
            </Button>
            <Button mode="outlined" onPress={openManualEntry} style={styles.button} contentStyle={styles.btnContent}>
              Manual Entry
            </Button>
            {lastSyncedAt ? <Text style={styles.syncedAt}>Last synced: {new Date(lastSyncedAt).toLocaleString()}</Text> : null}
            {syncInfo ? <Text style={styles.syncInfo}>{syncInfo}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="Categories" />
          <Card.Content>
            <View style={styles.splitRow}>
              <TextInput
                label="New Category"
                value={customCategory}
                onChangeText={setCustomCategory}
                mode="outlined"
                style={styles.flex}
                theme={inputTheme}
              />
              <Button mode="contained-tonal" onPress={onAddCategory} style={styles.flexButton} contentStyle={styles.btnContentSmall} buttonColor="#263149">
                Add
              </Button>
            </View>
            <Button mode="outlined" onPress={() => setShowCategories((prev) => !prev)} style={styles.button}>
              {showCategories ? 'Hide Categories' : 'View Categories'}
            </Button>
            {showCategories ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {state.categories.map((c) => {
                  const color = state.categoryColors[c];
                  return (
                    <View key={c} style={styles.categoryItem}>
                      <Chip
                        style={color ? { borderColor: color, borderWidth: 1 } : undefined}
                        textStyle={color ? { color } : undefined}
                      >
                        {c}
                      </Chip>
                      <Pressable
                        style={[styles.colorDot, color ? { backgroundColor: color } : null]}
                        onPress={() => onPickCategoryColor(c)}
                        hitSlop={10}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Content>
            <View style={styles.tradesHeader}>
              <Text variant="titleMedium" style={styles.tradesTitle}>{`Trades (${filteredTrades.length})`}</Text>
              <Button mode="outlined" onPress={onClearTrades} compact>
                Remove All
              </Button>
            </View>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeSymbol]}>SYMBOL</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradePnl]}>PNL</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeCategory]}>CATEGORY</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTradeAction]}>DELETE</Text>
            </View>
            {groupedTrades.map((group, groupIndex) => (
              <View key={`group-${group.date}`}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>{group.date}</Text>
                </View>
                {group.trades.map((trade, index) => (
                  <View
                    key={trade.id}
                    style={[styles.tableRow, (groupIndex + index) % 2 === 1 ? styles.tableAlt : null]}
                  >
                    <Pressable onPress={() => openTradeDetails(trade.id)} style={[styles.colTradeSymbol, styles.symbolPressable]}>
                      <Text style={[styles.tableCell, styles.tradeSymbolText]} numberOfLines={1}>{trade.symbol}</Text>
                    </Pressable>
                    <View style={styles.colTradePnl}>
                      <PriceText value={trade.pnl} />
                    </View>
                    <View style={styles.colTradeCategory}>
                      <Menu
                        visible={editingTradeId === trade.id}
                        onDismiss={() => setEditingTradeId(null)}
                        anchor={
                          <Button
                            compact
                            mode="outlined"
                            onPress={() => setEditingTradeId(trade.id)}
                            textColor={state.categoryColors[trade.category] || undefined}
                            style={[
                              styles.categoryButton,
                              state.categoryColors[trade.category] ? { borderColor: state.categoryColors[trade.category] } : null
                            ]}
                          >
                            {trade.category || 'Set'}
                          </Button>
                        }
                      >
                        {state.categories.map((c) => (
                          <Menu.Item key={`${trade.id}-${c}`} title={c} onPress={() => onSetTradeCategory(trade.id, c)} />
                        ))}
                      </Menu>
                    </View>
                    <View style={styles.colTradeAction}>
                      <Button compact mode="text" textColor="#ef4444" onPress={() => onDeleteTrade(trade.id)}>
                        Delete
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </Card.Content>
        </Card>

        <Divider />
        <Card style={styles.panel}>
          <Card.Title title="Categories" />
          <Card.Content>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colCategory]}>CATEGORY</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colWin]}>WIN%</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colTrades]}>TRADES</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText, styles.colAction]}>ACTION</Text>
            </View>
            {state.categories.map((category, index) => {
              const stats = analytics.find((a) => a.category === category);
              return (
                <View key={`row-${category}`} style={[styles.tableRow, index % 2 === 1 ? styles.tableAlt : null]}>
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

      <Modal transparent visible={!!colorPickerCategory} animationType="fade" onRequestClose={() => setColorPickerCategory(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.colorCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Pick a Color</Text>
              <Button compact onPress={() => setColorPickerCategory(null)}>Close</Button>
            </View>
            <View style={styles.colorGrid}>
              {[
                '#e11d48', '#f97316', '#f59e0b', '#eab308', '#22c55e',
                '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
                '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
                '#f43f5e', '#84cc16', '#16a34a', '#0f766e', '#ea580c'
              ].map((c) => (
                <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }]} onPress={() => onApplyCategoryColor(c)} />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!detailTradeId} animationType="fade" onRequestClose={closeTradeDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Trade Details</Text>
              <Button compact onPress={closeTradeDetails}>Close</Button>
            </View>

            {detailTrade ? (
              <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Symbol</Text>
                  <Text style={styles.detailValue}>{detailTrade.symbol}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>PNL</Text>
                  <PriceText value={detailTrade.pnl} />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Entry</Text>
                  <Text style={styles.detailValue}>${detailTrade.entryPrice.toFixed(4)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Exit</Text>
                  <Text style={styles.detailValue}>${detailTrade.exitPrice.toFixed(4)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Size</Text>
                  <Text style={styles.detailValue}>{detailTrade.size}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{detailTrade.category || 'Uncategorized'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Image</Text>
                  <View style={styles.imageWrap}>
                    {detailTrade.imageUri ? (
                      <Pressable onPress={() => openImageViewer(detailTrade.imageUri)}>
                        <Image source={{ uri: detailTrade.imageUri }} style={styles.tradeImage} resizeMode="contain" />
                      </Pressable>
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Text style={styles.placeholderText}>No image attached</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.detailButtonRow}>
                    <Button mode="outlined" onPress={onPickTradeImage}>Add / Change</Button>
                    {detailTrade.imageUri ? (
                      <Button mode="text" textColor="#ef4444" onPress={onRemoveTradeImage}>Remove</Button>
                    ) : null}
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <TextInput
                    label="Description"
                    value={detailNotes}
                    onChangeText={setDetailNotes}
                    mode="outlined"
                    multiline
                    numberOfLines={4}
                    style={styles.detailInput}
                    theme={inputTheme}
                  />
                </View>
                {detailError ? <Text style={styles.error}>{detailError}</Text> : null}
              </ScrollView>
            ) : null}

            <View style={styles.detailFooter}>
              <Button mode="contained" onPress={onSaveTradeDetails} buttonColor="#7C3AED">
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!imageViewerUri} animationType="fade" onRequestClose={closeImageViewer}>
        <Pressable style={styles.imageViewerBackdrop} onPress={closeImageViewer}>
          <Pressable style={styles.imageViewerCard} onPress={() => null}>
            {imageViewerUri ? (
              <View style={styles.imageViewerScroll}>
                <ZoomableImage source={{ uri: imageViewerUri }} />
              </View>
            ) : null}
            <Button mode="text" onPress={closeImageViewer}>Close</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={calendarVisible} animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Button compact onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>Prev</Button>
              <Pressable
                style={styles.calendarTitleWrap}
                onPress={() => { setShowMonthPicker((v) => !v); setShowYearPicker(false); }}
              >
                <Text style={styles.calendarTitle}>
                  {calendarMonth.toLocaleString('en-US', { month: 'long' })}
                </Text>
              </Pressable>
              <Pressable
                style={styles.calendarYearWrap}
                onPress={() => { setShowYearPicker((v) => !v); setShowMonthPicker(false); }}
              >
                <Text style={styles.calendarYearTitle}>{calendarMonth.getFullYear()}</Text>
              </Pressable>
              <View style={styles.calendarHeaderRight}>
                <Button compact onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>Next</Button>
                <Button compact onPress={() => setCalendarVisible(false)}>Close</Button>
              </View>
            </View>

            {showMonthPicker ? (
              <View style={styles.monthGrid}>
                {MONTHS.map((label, index) => (
                  <Pressable
                    key={label}
                    style={[styles.monthCell, calendarMonth.getMonth() === index ? styles.monthCellActive : null]}
                    onPress={() => onPickMonth(index)}
                  >
                    <Text style={styles.monthText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : showYearPicker ? (
              <View style={styles.monthGrid}>
                {Array.from({ length: 9 }, (_, i) => {
                  const year = calendarMonth.getFullYear() - 4 + i;
                  const active = calendarMonth.getFullYear() === year;
                  return (
                    <Pressable
                      key={year}
                      style={[styles.monthCell, active ? styles.monthCellActive : null]}
                      onPress={() => onPickYear(year)}
                    >
                      <Text style={styles.monthText}>{year}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((d) => (
                    <Text key={d} style={styles.weekCell}>{d}</Text>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {Array.from({ length: totalCells }, (_, i) => {
                    const day = i - leading + 1;
                    const isValid = day >= 1 && day <= daysInMonth;
                    return (
                      <Pressable
                        key={`d-${i}`}
                        style={[styles.dayCell, isValid ? styles.dayCellActive : styles.dayCellInactive]}
                        onPress={() => (isValid ? onPickDate(day) : undefined)}
                      >
                        <Text style={isValid ? styles.dayText : styles.dayTextMuted}>{isValid ? day : ''}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={manualVisible} animationType="fade" onRequestClose={closeManualEntry}>
        <View style={styles.modalBackdrop}>
          <View style={styles.manualCard}>
            <Text variant="titleMedium" style={styles.manualTitle}>Manual Entry</Text>
            <View style={styles.manualGrid}>
              <TextInput
                label="Symbol"
                value={manualSymbol}
                onChangeText={setManualSymbol}
                mode="outlined"
                autoCapitalize="characters"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <TextInput
                label="Entry Price"
                value={manualEntryPrice}
                onChangeText={setManualEntryPrice}
                keyboardType="numeric"
                mode="outlined"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <TextInput
                label="Exit Price"
                value={manualExitPrice}
                onChangeText={setManualExitPrice}
                keyboardType="numeric"
                mode="outlined"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <TextInput
                label="PnL"
                value={manualPnl}
                onChangeText={setManualPnl}
                keyboardType="numeric"
                mode="outlined"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <TextInput
                label="Date (YYYY-MM-DD)"
                value={manualDate}
                onChangeText={setManualDate}
                mode="outlined"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <Button
                mode="outlined"
                onPress={() => openCalendar('manual')}
                style={styles.manualInput}
              >
                Pick Date
              </Button>
              <TextInput
                label="Time (HH:MM)"
                value={manualTime}
                onChangeText={setManualTime}
                mode="outlined"
                style={styles.manualInput}
                theme={inputTheme}
              />
              <Button
                mode="outlined"
                onPress={() => setManualCategoryMenuVisible(true)}
                style={styles.manualInput}
              >
                {manualCategory || 'Pick Category'}
              </Button>
              <TextInput
                label="Notes"
                value={manualNotes}
                onChangeText={setManualNotes}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.manualInput}
                theme={inputTheme}
              />
              <View style={styles.manualImageRow}>
                <Button mode="outlined" onPress={onPickManualImage} style={styles.manualInput}>
                  {manualImageUri ? 'Change Image' : 'Add Image'}
                </Button>
                {manualImageUri ? (
                  <Button mode="text" textColor="#ef4444" onPress={onRemoveManualImage}>
                    Remove
                  </Button>
                ) : null}
              </View>
            </View>
            {manualError ? <Text style={styles.error}>{manualError}</Text> : null}
            <View style={styles.manualActions}>
              <Button mode="text" onPress={closeManualEntry}>Cancel</Button>
              <Button mode="contained" onPress={onSaveManualEntry} buttonColor="#7C3AED">Save</Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={manualCategoryMenuVisible}
        animationType="fade"
        onRequestClose={() => setManualCategoryMenuVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setManualCategoryMenuVisible(false)}>
          <View style={styles.categoryPickerCard}>
            <Text variant="titleMedium" style={styles.manualTitle}>Pick Category</Text>
            <ScrollView>
              {state.categories.map((c) => (
                <Button
                  key={`manual-cat-${c}`}
                  mode="text"
                  onPress={() => {
                    setManualCategory(c);
                    setManualCategoryMenuVisible(false);
                  }}
                  style={styles.categoryPickerItem}
                >
                  {c}
                </Button>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  button: { marginTop: 16, borderRadius: 14 },
  btnContent: { height: 48 },
  btnContentSmall: { height: 48 },
  splitRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  flex: { flex: 1 },
  flexButton: { flex: 1, justifyContent: 'center', marginTop: 0, borderRadius: 14 },
  dateField: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    backgroundColor: '#0F1419',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center'
  },
  dateLabel: { color: '#64748B', fontSize: 12 },
  dateValue: { color: '#E2E8F0', fontSize: 16, fontWeight: '600', marginTop: 2 },
  chips: { marginVertical: 10, gap: 8 },
  categoryItem: { alignItems: 'center', gap: 8 },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1F2937'
  },
  tableHeader: { borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  tableHeaderText: { color: '#7f8fa9', fontSize: 12, letterSpacing: 0.8, fontWeight: '600' },
  tradesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tradesTitle: { color: '#E2E8F0', fontWeight: '700' },
  groupHeader: { paddingTop: 14, paddingBottom: 6 },
  groupHeaderText: { color: '#94A3B8', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  symbolPressable: { justifyContent: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A2332' },
  tableAlt: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8 },
  tableCell: { fontSize: 13, color: '#dbe5f6' },
  colCategory: { flex: 2, paddingRight: 8 },
  colWin: { flex: 1, textAlign: 'right' },
  colTrades: { flex: 1, textAlign: 'right' },
  colAction: { flex: 1.2, alignItems: 'flex-end' },
  colTradeSymbol: { width: '30%', paddingRight: 10, fontWeight: '600', color: '#F8FAFC' },
  tradeSymbolText: { fontWeight: '600', color: '#F8FAFC' },
  colTradePnl: { width: '20%', alignItems: 'flex-end', paddingRight: 14 },
  colTradeCategory: { width: '30%', alignItems: 'center' },
  colTradeAction: { width: '20%', alignItems: 'flex-end' },
  categoryButton: { borderRadius: 6 },
  syncedAt: { marginTop: 12, color: '#64748B', fontSize: 12 },
  syncInfo: { marginTop: 6, color: '#22c55e' },
  error: { color: '#ef4444', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  colorCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B' },
  detailCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    maxHeight: '88%'
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detailTitle: { color: '#E2E8F0', fontSize: 18, fontWeight: '700' },
  detailContent: { gap: 12, paddingBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailValue: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },
  detailSection: { gap: 8, marginTop: 6 },
  detailButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imageWrap: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B' },
  tradeImage: { width: '100%', height: 180, backgroundColor: '#0F1419' },
  imagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center'
  },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  imageViewerCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#0F1419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12
  },
  imageViewerScroll: { width: '100%', height: 420 },
  imageViewerScrollContent: { alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: 420, backgroundColor: '#0F1419' },
  placeholderText: { color: '#64748B', fontSize: 12 },
  detailInput: { backgroundColor: '#0F1419' },
  detailFooter: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  manualCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16
  },
  manualTitle: { color: '#E2E8F0', fontWeight: '700', marginBottom: 12 },
  manualGrid: { gap: 10 },
  manualInput: { backgroundColor: '#0F1419' },
  manualActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  manualImageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryPickerCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
    maxHeight: '70%'
  },
  categoryPickerItem: { alignItems: 'flex-start' },
  calendarCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
    paddingBottom: 6
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calendarHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarTitleWrap: { flex: 1, alignItems: 'center' },
  calendarTitle: { color: '#E2E8F0', fontSize: 16, fontWeight: '700' },
  calendarYearWrap: { paddingHorizontal: 6 },
  calendarYearTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { flex: 1, textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 0 },
  dayCell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayCellActive: { backgroundColor: 'rgba(124,58,237,0.12)' },
  dayCellInactive: { backgroundColor: 'transparent' },
  dayText: { color: '#E2E8F0', fontWeight: '600' },
  dayTextMuted: { color: '#475569' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 },
  monthCell: {
    width: '30.5%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center'
  },
  monthCellActive: { backgroundColor: 'rgba(124,58,237,0.16)', borderColor: 'rgba(124,58,237,0.5)' },
  monthText: { color: '#E2E8F0', fontWeight: '600' }
});
