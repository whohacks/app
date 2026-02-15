import React, { useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Menu, Text } from 'react-native-paper';
import { BarChart, PieChart } from 'react-native-chart-kit';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { byCategoryAnalytics } from '../utils/math';

const chartConfig = {
  backgroundGradientFrom: '#0F1419',
  backgroundGradientTo: '#0F1419',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(71, 85, 105, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  propsForLabels: {
    fontSize: 8
  },
  barPercentage: 0.6
};

const toRgba = (hex: string, opacity: number) => {
  const safe = hex.replace('#', '');
  if (safe.length !== 6) return `rgba(34, 197, 94, ${opacity})`;
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

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
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
};

export const AnalyticsScreen = () => {
  const { state } = useAppContext();
  const [range, setRange] = useState<'custom'>('custom');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'from' | 'to'>('from');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const analytics = useMemo(() => byCategoryAnalytics(state.trades), [state.trades]);
  const chartWidth = Math.max(Dimensions.get('window').width - 72, 320);
  const chartHeight = Math.max(180, 120 + analytics.length * 18);

  const sortedCategories = useMemo(
    () => [...analytics].sort((a, b) => b.winRate - a.winRate),
    [analytics]
  );

  const categoryOptions = useMemo(() => {
    const uniq = new Set<string>();
    state.trades.forEach((t) => uniq.add(t.category || 'Uncategorized'));
    return Array.from(uniq.values()).sort();
  }, [state.trades]);

  const activeCategory = selectedCategory || categoryOptions[0] || 'Uncategorized';

  const winRatePie = useMemo(() => {
    return sortedCategories.map((a) => {
      const color = state.categoryColors[a.category] ?? '#22c55e';
      return {
        name: a.category.length > 10 ? `${a.category.slice(0, 10)}…` : a.category,
        winRate: Number(a.winRate.toFixed(1)),
        color,
        legendFontColor: '#94A3B8',
        legendFontSize: 11
      };
    });
  }, [sortedCategories, state.categoryColors]);

  const tradesData = useMemo(() => {
    return {
      labels: sortedCategories.map((a) => (a.category.length > 6 ? `${a.category.slice(0, 6)}…` : a.category)),
      datasets: [
        {
          data: sortedCategories.map((a) => a.totalTrades),
          colors: sortedCategories.map((a) => {
            const color = state.categoryColors[a.category] ?? '#3b82f6';
            return (opacity = 1) => toRgba(color, opacity);
          })
        }
      ]
    };
  }, [sortedCategories, state.categoryColors]);

  const tradesPie = useMemo(() => {
    return sortedCategories.map((a) => {
      const color = state.categoryColors[a.category] ?? '#3b82f6';
      return {
        name: a.category.length > 10 ? `${a.category.slice(0, 10)}…` : a.category,
        trades: a.totalTrades,
        color,
        legendFontColor: '#94A3B8',
        legendFontSize: 11
      };
    });
  }, [sortedCategories, state.categoryColors]);

  const timeOfDayData = useMemo(() => {
    const now = new Date();
    const parse = (value: string, boundary: 'start' | 'end'): Date | null => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const suffix = boundary === 'start' ? 'T00:00:00.000' : 'T23:59:59.999';
      const dt = new Date(`${value}${suffix}`);
      return Number.isFinite(dt.getTime()) ? dt : null;
    };

    const start = parse(fromDate, 'start') ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end = parse(toDate, 'end') ?? now;
    start.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const points = state.trades
      .filter((t) => (t.category || 'Uncategorized') === activeCategory)
      .map((t) => {
        const dt = new Date(t.timestamp);
        if (!Number.isFinite(dt.getTime())) return null;
        if (dt < start || dt > end) return null;
        const dayIndex = Math.floor(
          (new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() - start.getTime()) / 86400000
        );
        const minutes = dt.getHours() * 60 + dt.getMinutes();
        const outcome = t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : 'flat';
        return { x: dayIndex, y: minutes, outcome };
      })
      .filter((p): p is { x: number; y: number; outcome: 'win' | 'loss' | 'flat' } => !!p);

    return { days, points };
  }, [state.trades, activeCategory, range, fromDate, toDate]);

  const scatterHeight = 340;
  const padding = { left: 86, right: 10, top: 10, bottom: 44 };
  const minScatterWidth = Math.max(Dimensions.get('window').width - 64, 320);
  const scatterWidth = Math.max(minScatterWidth, padding.left + padding.right + timeOfDayData.days.length * 18);
  const plotWidth = scatterWidth - padding.left - padding.right;
  const plotHeight = scatterHeight - padding.top - padding.bottom;

  const mapMinutesToY = (minutes: number) => {
    const start = 4 * 60;
    const end = 27 * 60; // 3am next day
    const normalized = minutes < start ? minutes + 24 * 60 : minutes;
    const clamped = Math.min(Math.max(normalized, start), end);
    return ((clamped - start) / (end - start)) * plotHeight;
  };

  const timeLabel = (h: number) => {
    const hour = h >= 24 ? h - 24 : h;
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    return hour < 12 ? `${hour}a` : `${hour - 12}p`;
  };

  const xLabelEvery = 1;

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

  const openCalendar = (target: 'from' | 'to') => {
    const existing = target === 'from' ? fromDate : toDate;
    const base = parseDateString(existing) ?? new Date();
    setCalendarTarget(target);
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setShowMonthPicker(false);
    setShowYearPicker(false);
    setCalendarVisible(true);
  };

  const onPickDate = (day: number) => {
    const picked = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const formatted = formatDate(picked);
    if (calendarTarget === 'from') setFromDate(formatted);
    else setToDate(formatted);
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

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.panel}>
          <Card.Title title="Win Rate by Category" />
          <Card.Content>
            {analytics.length === 0 ? (
              <Text style={styles.empty}>No trades yet. Import or add trades to see analytics.</Text>
            ) : (
              <PieChart
                data={winRatePie}
                width={chartWidth}
                height={200}
                accessor="winRate"
                backgroundColor="transparent"
                paddingLeft="8"
                chartConfig={chartConfig}
                center={[0, 0]}
                style={styles.chart}
              />
            )}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="Trades by Category" />
          <Card.Content>
            {analytics.length === 0 ? (
              <Text style={styles.empty}>No trades yet. Import or add trades to see analytics.</Text>
            ) : (
              <PieChart
                data={tradesPie}
                width={chartWidth}
                height={200}
                accessor="trades"
                backgroundColor="transparent"
                paddingLeft="8"
                chartConfig={chartConfig}
                center={[0, 0]}
                absolute
                style={styles.chart}
              />
            )}
          </Card.Content>
        </Card>

        <Card style={styles.panel}>
          <Card.Title title="Trade Time by Day" />
          <Card.Content>
            {categoryOptions.length === 0 ? (
              <Text style={styles.empty}>No categories yet.</Text>
            ) : (
              <>
            <View style={styles.controlRow}>
              <Menu
                visible={categoryMenuOpen}
                onDismiss={() => setCategoryMenuOpen(false)}
                    anchor={
                      <Button mode="outlined" onPress={() => setCategoryMenuOpen(true)}>
                        {activeCategory}
                      </Button>
                    }
                  >
                {categoryOptions.map((c) => (
                  <Menu.Item key={c} title={c} onPress={() => { setSelectedCategory(c); setCategoryMenuOpen(false); }} />
                ))}
              </Menu>
              <View style={styles.rangeInputs}>
                <Pressable style={styles.dateField} onPress={() => openCalendar('from')}>
                  <Text style={styles.dateLabel}>From</Text>
                  <Text style={styles.dateValue}>{fromDate || 'Select'}</Text>
                </Pressable>
                <Pressable style={styles.dateField} onPress={() => openCalendar('to')}>
                  <Text style={styles.dateLabel}>To</Text>
                  <Text style={styles.dateValue}>{toDate || 'Select'}</Text>
                </Pressable>
              </View>
            </View>

                <View style={styles.scatterWrap}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Svg width={scatterWidth} height={scatterHeight}>
                    <G x={padding.left} y={padding.top}>
                      <Line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#1E293B" strokeWidth={1} />
                      <Line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#1E293B" strokeWidth={1} />

                {/* Shaded time bands */}
                <Rect
                  x={0}
                  y={mapMinutesToY(4 * 60)}
                  width={plotWidth}
                  height={mapMinutesToY(10 * 60) - mapMinutesToY(4 * 60)}
                  fill="rgba(203,213,225,0.18)"
                />
                <Rect
                  x={0}
                  y={mapMinutesToY(10 * 60)}
                  width={plotWidth}
                  height={mapMinutesToY(18 * 60) - mapMinutesToY(10 * 60)}
                  fill="rgba(203,213,225,0.12)"
                />
                <Rect
                  x={0}
                  y={mapMinutesToY(18 * 60)}
                  width={plotWidth}
                  height={mapMinutesToY(27 * 60) - mapMinutesToY(18 * 60)}
                  fill="rgba(203,213,225,0.18)"
                />

                {/* Time range labels on Y axis */}
                {[
                  { label: 'Morning', minutes: 4 * 60 },
                  { label: 'Afternoon', minutes: 10 * 60 },
                  { label: 'Evening', minutes: 18 * 60 }
                ].map((row) => (
                  <SvgText
                    key={row.label}
                    x={-82}
                    y={mapMinutesToY(row.minutes) + 4}
                    fill="#E2E8F0"
                    fontSize={11}
                    textAnchor="start"
                  >
                    {row.label}
                  </SvgText>
                ))}

                {[4, 6, 8, 10, 12, 15, 18, 21, 24, 27].map((h, idx, arr) => {
                  const y = (idx / (arr.length - 1)) * plotHeight;
                  return (
                    <G key={`y-${h}`}>
                      <Line x1={0} y1={y} x2={plotWidth} y2={y} stroke="#1A2332" strokeWidth={1} />
                      <SvgText x={-8} y={y + 4} fill="#94A3B8" fontSize={11} textAnchor="end">
                        {timeLabel(h)}
                      </SvgText>
                    </G>
                  );
                })}

                {timeOfDayData.days.map((d, idx) => {
                  if (idx % xLabelEvery !== 0) return null;
                  const x = timeOfDayData.days.length <= 1 ? 0 : (idx / (timeOfDayData.days.length - 1)) * plotWidth;
                  const label = `${d.getDate()}`;
                  return (
                    <G key={`x-${idx}`}>
                      <Line x1={x} y1={plotHeight} x2={x} y2={plotHeight + 6} stroke="#1A2332" strokeWidth={1} />
                      <SvgText
                        x={x}
                        y={plotHeight + 22}
                        fill="#94A3B8"
                        fontSize={8}
                        textAnchor="middle"
                      >
                        {label}
                      </SvgText>
                    </G>
                  );
                })}

                {timeOfDayData.points.map((p, i) => {
                  const x = timeOfDayData.days.length <= 1 ? 0 : (p.x / (timeOfDayData.days.length - 1)) * plotWidth;
                  const y = mapMinutesToY(p.y);
                  const fill = p.outcome === 'win' ? '#3b82f6' : p.outcome === 'loss' ? '#ef4444' : '#94A3B8';
                  return <Circle key={`pt-${i}`} cx={x} cy={y} r={4} fill={fill} />;
                })}
                  </G>
                    </Svg>
                  </ScrollView>
                </View>
                {timeOfDayData.points.length === 0 ? (
                  <Text style={styles.empty}>No trades for this category in the selected range.</Text>
                ) : null}
              </>
            )}
          </Card.Content>
        </Card>

      </ScrollView>

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
                  {Array.from({ length: Math.max(28, Math.ceil((new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()) / 7) * 7) }, (_, i) => {
                    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
                    const leading = monthStart.getDay();
                    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
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
  chart: { marginTop: 6, borderRadius: 14 },
  empty: { color: '#94A3B8', marginTop: 8 },
  controlRow: { flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  rangeInputs: { width: '100%', gap: 10, flexDirection: 'row' },
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
  scatterWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F1419'
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
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
