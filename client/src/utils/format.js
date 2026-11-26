// One place for how numbers, money, dates and counts are written, using
// the Intl APIs with Kenyan English conventions. Pages import from here
// (config/fleet.js re-exports the common ones).
export const LOCALE = 'en-KE';

const numberFmt = new Intl.NumberFormat(LOCALE);
const moneyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'KES', currencyDisplay: 'code', maximumFractionDigits: 0 });
const moneyCentsFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'KES', currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const pluralRules = new Intl.PluralRules(LOCALE);

const DASH = '—';
const valid = (d) => d != null && d !== '' && !Number.isNaN(new Date(d).getTime());

/** 12,500 */
export const formatNumber = (n) => (n == null || n === '' ? DASH : numberFmt.format(Number(n)));
/** KES 12,500 (whole shillings) or KES 12,500.50 with { cents: true } */
export const formatMoney = (n, { cents = false } = {}) => (n == null || n === '' ? DASH : (cents ? moneyCentsFmt : moneyFmt).format(Number(n)));
/** 12,500 km */
export const formatKm = (n) => (n == null || n === '' ? DASH : `${numberFmt.format(Number(n))} km`);
/** 16 Nov 2026 */
export const formatDate = (d) => (valid(d) ? dateFmt.format(new Date(d)) : DASH);
/** Mon, 16 Nov */
export const formatShortDate = (d) => (valid(d) ? shortDateFmt.format(new Date(d)) : DASH);
/** 07:30 (24-hour, as on Kenyan timetables) */
export const formatTime = (d) => (valid(d) ? timeFmt.format(new Date(d)) : DASH);
/** 16 Nov 2026, 07:30 */
export const formatDateTime = (d) => (valid(d) ? dateTimeFmt.format(new Date(d)) : DASH);

/**
 * Count with the right word form: plural(1, 'day') → "1 day",
 * plural(3, 'day') → "3 days", plural(2, 'person', 'people') → "2 people".
 */
export function plural(n, one, other = `${one}s`) {
  return `${numberFmt.format(n)} ${pluralRules.select(n) === 'one' ? one : other}`;
}

/** "just now", "20 s ago", "4 min ago", "3 h ago", "1 day ago", "2 days ago" */
export function timeAgo(date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${plural(Math.round(h / 24), 'day')} ago`;
}
