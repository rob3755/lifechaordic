// Calendar helpers. Weekdays use 1 = Sunday … 7 = Saturday, like the iPhone app.

export const DAY = 86400000;

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
export const at = (d, hour, minute) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
export const weekdayOf = (d) => d.getDay() + 1;
export const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Adds months, keeping the day inside the month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d, n) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  first.setDate(Math.min(d.getDate(), daysInMonth(first)));
  return first;
}

/** Adds `n` repeats of a routine frequency: daily, weekly, monthly or yearly. */
export function addUnit(d, frequency, n) {
  switch (frequency) {
    case 'daily': return addDays(d, n);
    case 'weekly': return addDays(d, 7 * n);
    case 'monthly': return addMonths(d, n);
    default: return addMonths(d, 12 * n);
  }
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

export const formatTime = (d) => timeFormat.format(d);
export const formatLongDate = (d) => longDate.format(d);
export const formatMonthDay = (d) => monthDay.format(d);
export const formatWeekday = (d) => weekdayName.format(d);

/** "Today", "Tomorrow 3:00 PM", "Yesterday", "Fri, Oct 10". */
export function relativeDay(date, hasTime, now = new Date()) {
  const today = startOfDay(now);
  const diff = Math.round((startOfDay(date) - today) / DAY);
  let label;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7) label = formatWeekday(date);
  else label = shortDate.format(date);
  return hasTime ? `${label} ${formatTime(date)}` : label;
}

/** Value for <input type="date">. */
export const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Value for <input type="time">. */
export const toTimeInput = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function fromInputs(dateValue, timeValue) {
  if (!dateValue) return null;
  const [y, m, d] = dateValue.split('-').map(Number);
  if (timeValue) {
    const [h, min] = timeValue.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
  }
  return new Date(y, m - 1, d);
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
