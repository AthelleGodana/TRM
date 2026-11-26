import { describe, expect, it } from 'vitest';
import { formatDate, formatKm, formatMoney, formatNumber, formatTime, plural, timeAgo } from './format';

// Intl output may use (narrow) no-break spaces; compare with plain spaces.
const norm = (s) => s.replace(/\s/g, ' ');

describe('format', () => {
  it('formats money as whole Kenyan shillings by default', () => {
    expect(norm(formatMoney(12500))).toBe('KES 12,500');
    expect(norm(formatMoney('7200.4'))).toBe('KES 7,200');
    expect(norm(formatMoney(99.5, { cents: true }))).toBe('KES 99.50');
    expect(formatMoney(null)).toBe('—');
  });

  it('formats numbers and distances with thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatKm(45210)).toBe('45,210 km');
    expect(formatKm(undefined)).toBe('—');
  });

  it('formats dates and 24-hour times, and tolerates bad input', () => {
    expect(norm(formatDate('2026-11-16T09:00:00Z'))).toMatch(/16 Nov 2026/);
    expect(formatTime(new Date(2026, 10, 16, 7, 5))).toBe('07:05');
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });

  it('uses the singular for one and the plural otherwise', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(0, 'day')).toBe('0 days');
    expect(plural(3, 'stop')).toBe('3 stops');
    expect(plural(2, 'person', 'people')).toBe('2 people');
    expect(plural(1500, 'vehicle')).toBe('1,500 vehicles');
  });

  it('describes elapsed time briefly', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(timeAgo(now - 2_000, now)).toBe('just now');
    expect(timeAgo(now - 20_000, now)).toBe('20 s ago');
    expect(timeAgo(now - 4 * 60_000, now)).toBe('4 min ago');
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago');
    expect(timeAgo(now - 49 * 3600_000, now)).toBe('2 days ago');
  });
});
