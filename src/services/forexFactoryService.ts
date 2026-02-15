export type ForexFactoryEvent = {
  date?: string;
  time?: string;
  datetime?: string;
  timestamp?: string | number;
  title?: string;
  event?: string;
  name?: string;
  country?: string;
  currency?: string;
  impact?: string;
  forecast?: string | number;
  previous?: string | number;
  actual?: string | number;
  isNew?: boolean;
};

export type ForexFactoryEventWithDate = ForexFactoryEvent & { eventDate: Date | null };
export type ForexFactoryFetchResult = {
  events: ForexFactoryEventWithDate[];
  source: 'month' | 'week';
  note?: string;
};

const FOREX_FACTORY_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FOREX_FACTORY_MONTH_JSON_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

const isHighImpact = (impact?: string) => {
  if (!impact) return false;
  return impact.toLowerCase().includes('high');
};

const isUsd = (currency?: string) => {
  if (!currency) return false;
  return currency.toUpperCase() === 'USD';
};

const isTimeValue = (value?: string) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== 'all day' && normalized !== 'tentative';
};

const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, n: number) => {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + 7 * (n - 1);
  return new Date(year, month, day);
};

const isUsEasternDst = (date: Date) => {
  const year = date.getFullYear();
  const dstStart = getNthWeekdayOfMonth(year, 2, 0, 2); // Second Sunday in March
  const dstEnd = getNthWeekdayOfMonth(year, 10, 0, 1); // First Sunday in November
  return date >= dstStart && date < dstEnd;
};

const normalizeTimeString = (time?: string) => {
  if (!time) return { time: null, tz: null };
  const trimmed = time.trim();
  if (!isTimeValue(trimmed)) return { time: null, tz: null };
  const upper = trimmed.toUpperCase();
  if (upper.includes('GMT')) return { time: upper.replace('GMT', '').trim(), tz: 'GMT' };
  if (upper.includes('UTC')) return { time: upper.replace('UTC', '').trim(), tz: 'UTC' };
  if (upper.includes('EDT')) return { time: upper.replace('EDT', '').trim(), tz: 'EDT' };
  if (upper.includes('EST')) return { time: upper.replace('EST', '').trim(), tz: 'EST' };
  if (upper.endsWith('ET')) return { time: upper.replace('ET', '').trim(), tz: 'ET' };
  return { time: trimmed, tz: null };
};

const parseEventDate = (entry: ForexFactoryEvent) => {
  if (entry.timestamp !== undefined && entry.timestamp !== null) {
    const raw = typeof entry.timestamp === 'string' ? Number(entry.timestamp) : entry.timestamp;
    if (!Number.isNaN(raw)) {
      const ms = raw > 1_000_000_000_000 ? raw : raw * 1000;
      const parsed = new Date(ms);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  if (entry.datetime) {
    const parsed = new Date(entry.datetime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (!entry.date) return null;
  const hasYear = /\b\d{4}\b/.test(entry.date);
  const year = new Date().getFullYear();
  const base = hasYear ? entry.date : `${entry.date} ${year}`;
  const { time, tz } = normalizeTimeString(entry.time);

  if (!time) {
    const parsed = new Date(base);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (tz === 'GMT' || tz === 'UTC') {
    const parsed = new Date(`${base} ${time} UTC`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (tz === 'EDT' || tz === 'EST' || tz === 'ET') {
    const baseDate = new Date(base);
    if (Number.isNaN(baseDate.getTime())) return null;
    const offsetHours = tz === 'EDT' ? -4 : tz === 'EST' ? -5 : isUsEasternDst(baseDate) ? -4 : -5;
    const offset = `GMT${offsetHours <= 0 ? '-' : '+'}${String(Math.abs(offsetHours)).padStart(2, '0')}00`;
    const parsed = new Date(`${base} ${time} ${offset}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(`${base} ${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const endOfWeek = (date: Date) => {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export type ForexFactoryRange = 'today' | 'week';

export const fetchHighImpactUsdEvents = async (
  range: ForexFactoryRange = 'today'
): Promise<ForexFactoryEventWithDate[]> => {
  const response = await fetch(FOREX_FACTORY_CALENDAR_URL);
  if (!response.ok) {
    throw new Error(`ForexFactory calendar request failed (${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Unexpected ForexFactory calendar response');
  }

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const events = data as ForexFactoryEvent[];

  return events
    .map((entry) => ({
      ...entry,
      eventDate: parseEventDate(entry)
    }))
    .filter((entry) => {
      const currency = entry.country ?? entry.currency;
      if (!isUsd(currency)) return false;
      if (!isHighImpact(entry.impact)) return false;
      if (!entry.eventDate) return false;
      if (range === 'today') return isSameDay(entry.eventDate, today);
      return entry.eventDate >= weekStart && entry.eventDate <= weekEnd;
    })
    .sort((a, b) => {
      if (a.eventDate && b.eventDate) return a.eventDate.getTime() - b.eventDate.getTime();
      if (a.eventDate) return -1;
      if (b.eventDate) return 1;
      return 0;
    });
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

export const fetchHighImpactUsdEventsForCurrentMonth = async (): Promise<ForexFactoryFetchResult> => {
  const today = new Date();
  const monthEnd = endOfMonth(today);
  const todayStart = startOfDay(today);

  const jsonResponse = await fetch(FOREX_FACTORY_MONTH_JSON_URL);
  if (!jsonResponse.ok) {
    throw new Error(`ForexFactory calendar JSON request failed (${jsonResponse.status})`);
  }

  const data = (await jsonResponse.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Unexpected ForexFactory calendar JSON response.');
  }

  const events = (data as ForexFactoryEvent[])
    .map((entry) => ({
      ...entry,
      eventDate: parseEventDate(entry)
    }))
    .filter((entry) => {
      const currency = (entry.currency ?? entry.country ?? '').toUpperCase();
      if (currency !== 'USD') return false;
      if (!entry.impact) return false;
      const impact = entry.impact.toLowerCase();
      if (!(impact === 'high' || impact.includes('high'))) return false;
      if (!entry.eventDate) return false;
      // Weekly feed only covers the current week; keep only current-month future events if present.
      return entry.eventDate >= todayStart && entry.eventDate <= monthEnd;
    });

  const sorted = events.sort((a, b) => {
    if (a.eventDate && b.eventDate) return a.eventDate.getTime() - b.eventDate.getTime();
    if (a.eventDate) return -1;
    if (b.eventDate) return 1;
    return 0;
  });
  return {
    events: sorted,
    source: 'month',
    note:
      'ForexFactory only provides a weekly JSON export. Showing high-impact USD events from the current week only.'
  };
};
