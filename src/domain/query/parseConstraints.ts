const DATE_PATTERNS = [
  /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/,
  /(20\d{2})年(\d{1,2})月(\d{1,2})日/,
];

const MONTH_DAY_PATTERN = /(?:^|\D)(\d{1,2})月(\d{1,2})日/;

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export type ParsedQueryConstraints = {
  exactDate: string | null;
  dateRange: { start: string; end: string } | null;
};

export const parseQueryConstraints = (
  query: string,
  now = new Date(),
): ParsedQueryConstraints => {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(query);
    if (match) {
      const exactDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      return { exactDate, dateRange: null };
    }
  }
  const monthDay = MONTH_DAY_PATTERN.exec(query);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const candidate = new Date(now.getFullYear(), month - 1, day, 12);
    if (
      candidate.getMonth() !== month - 1 || candidate.getDate() !== day
    ) return { exactDate: null, dateRange: null };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    if (candidate > today) candidate.setFullYear(candidate.getFullYear() - 1);
    return { exactDate: localDate(candidate), dateRange: null };
  }
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (/今天|today|오늘/i.test(query)) {
    const exactDate = localDate(end);
    return { exactDate, dateRange: null };
  }
  if (/前天|day\s+before\s+yesterday|그저께/i.test(query)) {
    end.setDate(end.getDate() - 2);
    return { exactDate: localDate(end), dateRange: null };
  }
  if (/昨天|yesterday|어제/i.test(query)) {
    end.setDate(end.getDate() - 1);
    const exactDate = localDate(end);
    return { exactDate, dateRange: null };
  }
  const days = /最近\s*7\s*天|last\s*7\s*days|최근\s*7일/i.test(query)
    ? 7
    : /最近\s*30\s*天|last\s*30\s*days|최근\s*30일/i.test(query)
      ? 30
      : null;
  if (days) {
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return {
      exactDate: null,
      dateRange: { start: localDate(start), end: localDate(end) },
    };
  }
  const range = (start: Date, rangeEnd: Date) => ({
    exactDate: null,
    dateRange: { start: localDate(start), end: localDate(rangeEnd) },
  });
  if (/本周|this\s+week|이번\s*주/i.test(query)) {
    const start = new Date(end);
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
    return range(start, end);
  }
  if (/上周|last\s+week|지난\s*주/i.test(query)) {
    const rangeEnd = new Date(end);
    const weekday = (rangeEnd.getDay() + 6) % 7;
    rangeEnd.setDate(rangeEnd.getDate() - weekday - 1);
    const start = new Date(rangeEnd);
    start.setDate(start.getDate() - 6);
    return range(start, rangeEnd);
  }
  if (/本月|this\s+month|이번\s*달/i.test(query)) {
    return range(new Date(end.getFullYear(), end.getMonth(), 1, 12), end);
  }
  if (/上月|last\s+month|지난\s*달/i.test(query)) {
    const rangeEnd = new Date(end.getFullYear(), end.getMonth(), 0, 12);
    return range(
      new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1, 12),
      rangeEnd,
    );
  }
  return { exactDate: null, dateRange: null };
};
