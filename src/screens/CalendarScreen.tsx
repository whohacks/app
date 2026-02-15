import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LineChart } from 'react-native-chart-kit';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { RootStackParamList } from '../navigation/AppNavigator';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const CalendarScreen = () => {
  const { state } = useAppContext();
  const [month, setMonth] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const rawLeading = monthStart.getDay();
  const leading = (rawLeading + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const columns = 7;
  const totalCells = Math.max(28, Math.ceil((leading + daysInMonth) / columns) * columns);

  const dayStats = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; trades: number; pnl: number }>();
    state.trades.forEach((trade) => {
      const dt = new Date(trade.timestamp);
      if (!Number.isFinite(dt.getTime())) return;
      const key = toDateKey(dt);
      const current = map.get(key) ?? { wins: 0, losses: 0, trades: 0, pnl: 0 };
      current.trades += 1;
      current.pnl += trade.pnl;
      if (trade.pnl > 0) current.wins += 1;
      else if (trade.pnl < 0) current.losses += 1;
      map.set(key, current);
    });
    return map;
  }, [state.trades]);

  const monthSummary = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    let totalTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    state.trades.forEach((trade) => {
      const dt = new Date(trade.timestamp);
      if (!Number.isFinite(dt.getTime())) return;
      if (dt.getFullYear() !== year || dt.getMonth() !== monthIndex) return;
      totalTrades += 1;
      if (trade.pnl > 0) totalWins += 1;
      else if (trade.pnl < 0) totalLosses += 1;
    });
    const winRate = totalTrades ? (totalWins / totalTrades) * 100 : 0;
    return { totalTrades, totalWins, totalLosses, winRate };
  }, [state.trades, month]);

  const pnlCurve = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const days = new Date(year, monthIndex + 1, 0).getDate();
    const daily = Array.from({ length: days }, () => 0);

    state.trades.forEach((trade) => {
      const dt = new Date(trade.timestamp);
      if (!Number.isFinite(dt.getTime())) return;
      if (dt.getFullYear() !== year || dt.getMonth() !== monthIndex) return;
      const dayIndex = dt.getDate() - 1;
      if (dayIndex < 0 || dayIndex >= days) return;
      daily[dayIndex] += trade.pnl;
    });

    const cumulative: number[] = [];
    let total = 0;
    daily.forEach((value) => {
      total += value;
      cumulative.push(Number(total.toFixed(2)));
    });

    const labels = Array.from({ length: days }, (_, i) => String(i + 1));

    return { labels, cumulative };
  }, [state.trades, month]);

  const baseChartWidth = Dimensions.get('window').width - 48;
  const chartWidth = Math.max(baseChartWidth, pnlCurve.labels.length * 16);

  const chartConfig = {
    backgroundGradientFrom: '#0F1419',
    backgroundGradientTo: '#0F1419',
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForLabels: { fontSize: 8 },
    propsForDots: {
      r: '2',
      strokeWidth: '1',
      stroke: '#3b82f6'
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title="Calendar" />
          <Card.Content>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.navBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <Text style={styles.navText}>Prev</Text>
              </Pressable>
              <Pressable onPress={() => { setShowMonthPicker((v) => !v); setShowYearPicker(false); }}>
                <Text style={styles.monthTitle}>
                  {month.toLocaleString('en-US', { month: 'long' })}
                </Text>
              </Pressable>
              <Pressable onPress={() => { setShowYearPicker((v) => !v); setShowMonthPicker(false); }}>
                <Text style={styles.yearTitle}>
                  {month.getFullYear()}
                </Text>
              </Pressable>
              <Pressable style={styles.navBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <Text style={styles.navText}>Next</Text>
              </Pressable>
            </View>

            {showMonthPicker ? (
              <View style={styles.pickerGrid}>
                {Array.from({ length: 12 }, (_, i) => {
                  const label = new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' });
                  const active = month.getMonth() === i;
                  return (
                    <Pressable
                      key={label}
                      style={[styles.pickerCell, active ? styles.pickerCellActive : null]}
                      onPress={() => {
                        setMonth(new Date(month.getFullYear(), i, 1));
                        setShowMonthPicker(false);
                      }}
                    >
                      <Text style={styles.pickerText}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {showYearPicker ? (
              <View style={styles.pickerGrid}>
                {Array.from({ length: 9 }, (_, i) => {
                  const year = month.getFullYear() - 4 + i;
                  const active = month.getFullYear() === year;
                  return (
                    <Pressable
                      key={year}
                      style={[styles.pickerCell, active ? styles.pickerCellActive : null]}
                      onPress={() => {
                        setMonth(new Date(year, month.getMonth(), 1));
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={styles.pickerText}>{year}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.weekRow}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.weekCell}>{d}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: totalCells }, (_, i) => {
                const day = i - leading + 1;
                const isValid = day >= 1 && day <= daysInMonth;
                const dt = new Date(month.getFullYear(), month.getMonth(), day);
                const key = isValid ? toDateKey(dt) : '';
                const stats = key ? dayStats.get(key) : undefined;
                const tradeText =
                  stats && stats.trades
                    ? `${stats.trades} ${stats.trades === 1 ? 'trade' : 'trades'}`
                    : '';
                const pnlText =
                  stats && stats.trades
                    ? `${stats.pnl >= 0 ? '+' : '-'}$${Math.abs(stats.pnl).toFixed(2)}`
                    : '';
                const pnlStyle =
                  stats && stats.trades
                    ? stats.pnl > 0
                      ? styles.pnlTextWin
                      : stats.pnl < 0
                        ? styles.pnlTextLoss
                        : styles.pnlTextFlat
                    : styles.pnlText;
                const cellStyle =
                  stats && stats.trades
                    ? stats.pnl > 0
                      ? styles.dayCellWin
                      : stats.pnl < 0
                        ? styles.dayCellLoss
                        : styles.dayCellFlat
                    : null;

                return (
                  <Pressable
                    key={`d-${i}`}
                    style={[
                      styles.dayCell,
                      isValid ? styles.dayCellActive : styles.dayCellInactive,
                      cellStyle
                    ]}
                    onPress={() => {
                      if (!isValid) return;
                      const key = toDateKey(dt);
                      navigation.navigate('CalendarDay', { date: key });
                    }}
                  >
                    <Text style={isValid ? styles.dayText : styles.dayTextMuted}>{isValid ? day : ''}</Text>
                    {pnlText ? <Text style={pnlStyle}>{pnlText}</Text> : null}
                    {tradeText ? <Text style={styles.tradeText}>{tradeText}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryItem, styles.summaryTrades]}>
                <Text style={styles.summaryLabel}>Trades</Text>
                <Text style={styles.summaryValue}>{monthSummary.totalTrades}</Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryWins]}>
                <Text style={styles.summaryLabel}>Wins</Text>
                <Text style={styles.summaryValue}>{monthSummary.totalWins}</Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryLosses]}>
                <Text style={styles.summaryLabel}>Losses</Text>
                <Text style={styles.summaryValue}>{monthSummary.totalLosses}</Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryWinRate]}>
                <Text style={styles.summaryLabel}>Win%</Text>
                <Text style={styles.summaryValue}>{monthSummary.winRate.toFixed(1)}%</Text>
              </View>
            </View>

            <View style={styles.pnlChartWrap}>
              <Text style={styles.pnlChartTitle}>Monthly PnL Curve</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={{
                    labels: pnlCurve.labels,
                    datasets: [
                      {
                        data: pnlCurve.cumulative.length ? pnlCurve.cumulative : [0],
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                        strokeWidth: 2
                      }
                    ]
                  }}
                  width={chartWidth}
                  height={180}
                  withDots={false}
                  withInnerLines={false}
                  withOuterLines={false}
                  withShadow={false}
                  fromZero
                  chartConfig={chartConfig}
                  style={styles.pnlChart}
                />
              </ScrollView>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 24, flexGrow: 1 },
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
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1
  },
  summaryTrades: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.5)' },
  summaryWins: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.5)' },
  summaryLosses: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.5)' },
  summaryWinRate: { backgroundColor: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.5)' },
  summaryLabel: { color: '#cbd5f5', fontSize: 11, fontWeight: '600' },
  summaryValue: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  navBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#0F1419' },
  navText: { color: '#94A3B8', fontWeight: '600' },
  monthTitle: { color: '#E2E8F0', fontSize: 16, fontWeight: '700' },
  yearTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 10 },
  weekCell: { flex: 1, textAlign: 'center', color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  pnlChartWrap: { marginTop: 16, marginBottom: 16 },
  pnlChartTitle: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  pnlChart: { borderRadius: 12 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    minHeight: 70,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 4,
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F1419'
  },
  dayCellActive: { backgroundColor: '#0F1419' },
  dayCellInactive: { backgroundColor: '#0F1419', borderColor: '#1E293B', opacity: 0.5 },
  dayText: { color: '#E2E8F0', fontWeight: '600', fontSize: 12 },
  dayTextMuted: { color: '#475569' },
  pnlText: { color: '#E2E8F0', fontWeight: '700', fontSize: 10 },
  pnlTextWin: { color: '#3b82f6', fontWeight: '700', fontSize: 10 },
  pnlTextLoss: { color: '#ef4444', fontWeight: '700', fontSize: 10 },
  pnlTextFlat: { color: '#94A3B8', fontWeight: '700', fontSize: 10 },
  tradeText: { color: '#94A3B8', fontWeight: '600', fontSize: 9 },
  dayCellWin: { backgroundColor: 'rgba(59,130,246,0.18)', borderColor: 'rgba(59,130,246,0.7)' },
  dayCellLoss: { backgroundColor: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.7)' },
  dayCellFlat: { backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.4)' },
  tradePnlWin: { color: '#22c55e' },
  tradePnlLoss: { color: '#ef4444' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pickerCell: {
    width: '22%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center'
  },
  pickerCellActive: { backgroundColor: 'rgba(124,58,237,0.16)', borderColor: 'rgba(124,58,237,0.5)' },
  pickerText: { color: '#E2E8F0', fontWeight: '600' }
});
