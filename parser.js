// Quick Capture: turns phrases like "Pay water bill Friday $42" or "Trash out every Tuesday night"
// into a structured item. A port of the iPhone app's CaptureParser so both behave the same.

import { startOfDay, addDays, addUnit, at, weekdayOf, daysInMonth } from './dates.js';

const MARK = '\u001F';

const numberPattern = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?: of)?|few)`;
const weekdayFullPattern = String.raw`(sunday|monday|tuesday|wednesday|thursday|friday|saturday)`;
const weekdayShortPattern = String.raw`(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)`;
const weekdayPattern = weekdayFullPattern;
const monthPattern = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;

const billWords = String.raw`\b(pay|bill|bills|rent|mortgage|invoice|tuition|premium|subscription|utilities|utility|electricity|credit card|loan|car payment|payment|taxes|dues|fees?)\b`;
const shoppingWords = String.raw`\b(buy|purchase|order|reorder|restock|stock up|grocery|groceries|shopping|pick up some|need more|out of)\b`;
const groceryWords = String.raw`\b(milk|eggs|bread|butter|cheese|yogurt|coffee|tea|cereal|rice|pasta|flour|sugar|bananas|apples|fruit|vegetables|veggies|chicken|beef|paper towels|toilet paper|tissues|napkins|detergent|dish soap|soap|shampoo|conditioner|toothpaste|deodorant|diapers|wipes|cat food|dog food|cat litter|batteries|light ?bulbs|trash bags|garbage bags|foil|sponges|snacks)\b`;
const appointmentWords = String.raw`\b(appointment|appt|dentist|doctor|dr|physician|pediatrician|dermatologist|optometrist|eye exam|checkup|check-up|physical|therapy|therapist|counselor|meeting|interview|haircut|hair cut|salon|barber|vet|veterinarian|consultation|reservation|dinner with|lunch with|coffee with|breakfast with|drinks with|date night|lesson|recital|conference|massage|parent-teacher|flight)\b`;
const reminderWords = String.raw`\b(call|phone|text|email|e-mail|message|reply to|respond to|write to|check on|check in with|follow up|remember|tell|birthday|anniversary)\b`;

const matches = (text, pattern) => new RegExp(pattern, 'i').test(text);

/** A string that recognized phrases are cut out of, leaving the title behind. */
class MutableText {
  constructor(value) { this.value = value; }

  /** Removes the first case-insensitive match and returns its groups (null when nothing matched). */
  take(pattern) {
    const match = new RegExp(pattern, 'i').exec(this.value);
    if (!match) return null;
    this.value = this.value.slice(0, match.index) + ` ${MARK} ` + this.value.slice(match.index + match[0].length);
    return Array.from(match, (group) => (group === undefined ? null : group));
  }

  cleanedTitle() {
    let text = this.value;
    const dangling = new RegExp(String.raw`\b(?:by|on|at|due|before|until|for|from|starting|in|this|next|every|each|around|about)\s*` + MARK, 'gi');
    for (let i = 0; i < 3; i++) text = text.replace(dangling, MARK);
    text = text.split(MARK).join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
      .replace(/\s+/g, ' ');
    const trimJunk = (s) => s.replace(/^[\s,;:\-–—.!?]+|[\s,;:\-–—.!?]+$/g, '');
    text = trimJunk(text);
    text = text.replace(/\s+(?:by|on|at|due|before|until|and)$/i, '');
    return trimJunk(text);
  }
}

function number(word) {
  if (/^\d+$/.test(word)) return parseInt(word, 10);
  const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, couple: 2, 'couple of': 2, few: 3 };
  return words[word.toLowerCase()] ?? null;
}

function weekdayNumber(word) {
  const map = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };
  return map[word.toLowerCase().slice(0, 3)] ?? null;
}

function monthNumber(word) {
  const map = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return map[word.toLowerCase().slice(0, 3)] ?? null;
}

function frequencyForUnit(unit) {
  switch (unit.toLowerCase().slice(0, 3)) {
    case 'day': return 'daily';
    case 'wee': return 'weekly';
    case 'mon': return 'monthly';
    default: return 'yearly';
  }
}

const monthComesFirst = (() => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).formatToParts(new Date(2020, 10, 22));
    return parts.findIndex((p) => p.type === 'month') < parts.findIndex((p) => p.type === 'day');
  } catch { return true; }
})();

export function parseCapture(input, { now = new Date(), memberNames = [] } = {}) {
  const normalize = (s) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const text = new MutableText(normalize(input));
  const result = { title: '', category: 'task', priority: 1, dueDate: null, hasDueTime: false, amount: null,
    recurrence: null, routineCategory: 'other', assigneeName: null };
  const today = startOfDay(now);

  const upcoming = (weekday, includeToday) => {
    let difference = (weekday - weekdayOf(today) + 7) % 7;
    if (difference === 0 && !includeToday) difference = 7;
    return addDays(today, difference);
  };
  const thisWeekend = () => {
    const w = weekdayOf(now);
    return (w === 7 || w === 1) ? today : upcoming(7, true);
  };
  const endOfWorkWeek = () => {
    const w = weekdayOf(now);
    return (w === 7 || w === 1) ? today : upcoming(6, true);
  };
  const nextDate = (dayOfMonth) => {
    for (let offset = 0; offset < 3; offset++) {
      const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const day = Math.min(dayOfMonth, daysInMonth(month));
      const candidate = new Date(month.getFullYear(), month.getMonth(), day);
      if (candidate >= today) return candidate;
    }
    return today;
  };
  const makeDate = (year, month, day) => {
    const y = year ?? now.getFullYear();
    let date = new Date(y, month - 1, day);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    if (year == null && date < today) date = new Date(y + 1, month - 1, day);
    return date;
  };

  // 1. Lead-in phrases.
  let reminderHint = false;
  const lead = text.take(String.raw`^\s*(?:please\s+)?(remind me to|remind me|remember to|don't forget to|dont forget to|don't forget|i need to|i have to|i must|i should|need to|have to|todo:?|to-do:?|to do:)\s+`);
  if (lead) {
    const phrase = (lead[1] || '').toLowerCase();
    reminderHint = phrase.includes('remind') || phrase.includes('remember') || phrase.includes('forget');
  }

  // 2. Priority words.
  let explicitPriority = null;
  if (text.take(String.raw`\b(?:low priority|not urgent|whenever|some ?day|eventually|no rush)\b`)) explicitPriority = 0;
  else if (text.take(String.raw`!{2,}|\b(?:urgent(?:ly)?|asap|a\.s\.a\.p\.?|important|high priority|top priority|critical)\b`)) explicitPriority = 2;

  // 3. Money.
  const money = text.take(String.raw`[$€£]\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`)
    ?? text.take(String.raw`\b(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks|usd|euros?|pounds)\b`);
  if (money && money[1]) result.amount = parseFloat(money[1].replace(/,/g, ''));

  // 4. Assignee.
  for (const name of memberNames) {
    if (!name.trim()) continue;
    const e = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      String.raw`^\s*` + e + String.raw`\s*[:,\-–]\s+`,
      '@' + e + String.raw`\b`,
      String.raw`\b(?:ask|have|get|tell)\s+` + e + String.raw`\s+to\s+`,
      String.raw`\b` + e + String.raw`\s+(?:needs to|should|has to|will)\s+`,
      String.raw`\b` + e + String.raw`'s turn to\s+`,
      String.raw`\bassign(?:ed)? to\s+` + e + String.raw`\b`,
    ];
    if (patterns.some((p) => text.take(p))) { result.assigneeName = name; break; }
  }

  // 5. Recurrence.
  let recurrenceWeekday = null, recurrenceDayOfMonth = null, timeHint = null;
  const units = String.raw`(days?|weeks?|months?|years?)`;
  let m;
  if ((m = text.take(String.raw`\b(?:every|each) other ` + units + String.raw`\b`)) && m[1]) {
    result.recurrence = { frequency: frequencyForUnit(m[1]), interval: 2 };
  } else if ((m = text.take(String.raw`\b(?:every|each) ` + numberPattern + ' ' + units + String.raw`\b`)) && number(m[1] || '') != null && m[2]) {
    result.recurrence = { frequency: frequencyForUnit(m[2]), interval: Math.max(1, number(m[1])) };
  } else if ((m = text.take(String.raw`\b(?:every|each) (?:single )?(day|morning|afternoon|evening|night)\b|\b(daily|nightly)\b`))) {
    result.recurrence = { frequency: 'daily', interval: 1 };
    const word = (m[1] || m[2] || '').toLowerCase();
    timeHint = { morning: [8, 0], afternoon: [14, 0], evening: [19, 0], night: [21, 0], nightly: [21, 0] }[word] ?? null;
  } else if ((m = text.take(String.raw`\b(?:every|each) ` + weekdayPattern + String.raw`s?\b`) ?? text.take(String.raw`\bon ` + weekdayPattern + String.raw`s\b`))) {
    result.recurrence = { frequency: 'weekly', interval: 1 };
    recurrenceWeekday = m[1] ? weekdayNumber(m[1]) : null;
  } else if (text.take(String.raw`\b(?:bi-?weekly|fortnightly)\b`)) {
    result.recurrence = { frequency: 'weekly', interval: 2 };
  } else if (text.take(String.raw`\b(?:every|each) week\b|\bweekly\b`)) {
    result.recurrence = { frequency: 'weekly', interval: 1 };
  } else if ((m = text.take(String.raw`\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)? of (?:every|each) month\b`)
      ?? text.take(String.raw`\b(?:every|each) month on the (\d{1,2})(?:st|nd|rd|th)?\b`)
      ?? text.take(String.raw`\b(?:every|each) (\d{1,2})(?:st|nd|rd|th)\b`))) {
    result.recurrence = { frequency: 'monthly', interval: 1 };
    const d = parseInt(m[1], 10);
    recurrenceDayOfMonth = d >= 1 && d <= 31 ? d : null;
  } else if (text.take(String.raw`\b(?:quarterly|every quarter)\b`)) {
    result.recurrence = { frequency: 'monthly', interval: 3 };
  } else if (text.take(String.raw`\b(?:every|each) month\b|\bmonthly\b`)) {
    result.recurrence = { frequency: 'monthly', interval: 1 };
  } else if (text.take(String.raw`\b(?:every|each) year\b|\b(?:yearly|annually|annual)\b`)) {
    result.recurrence = { frequency: 'yearly', interval: 1 };
  }

  // 6. Time of day.
  let exactDate = null;
  let time = (() => {
    let t;
    if ((t = text.take(String.raw`\bin (?:` + numberPattern + String.raw` (hours?|hrs?|minutes?|mins?)|(half an hour))\b`))) {
      let minutes = 0;
      if (t[3]) minutes = 30;
      else if (t[1] && number(t[1]) != null && t[2]) minutes = t[2].toLowerCase().startsWith('h') ? number(t[1]) * 60 : number(t[1]);
      if (minutes > 0) { exactDate = new Date(now.getTime() + minutes * 60000); return null; }
    }
    if ((t = text.take(String.raw`(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?(?![a-z])`))) {
      let hour = parseInt(t[1], 10);
      if (hour >= 1 && hour <= 12) {
        const minute = t[2] ? parseInt(t[2], 10) : 0;
        const pm = t[3].toLowerCase() === 'p';
        if (pm && hour !== 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
        return [hour, Math.min(minute, 59)];
      }
    }
    if ((t = text.take(String.raw`(?:\bat\s+)?\b(\d{1,2}):(\d{2})\b`))) {
      let hour = parseInt(t[1], 10); const minute = parseInt(t[2], 10);
      if (hour <= 23 && minute <= 59) { if (hour >= 1 && hour <= 6) hour += 12; return [hour, minute]; }
    }
    if ((t = text.take(String.raw`\bat (\d{1,2})\b(?!\s*(?:st|nd|rd|th|%|/|\.\d|days?|weeks?|months?|years?|hours?|minutes?|mins?|[a-z]+ (?:st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane)\b))`))) {
      let hour = parseInt(t[1], 10);
      if (hour >= 1 && hour <= 12) { if (hour <= 7) hour += 12; return [hour, 0]; }
    }
    if (text.take(String.raw`\b(?:at )?(?:noon|midday)\b`)) return [12, 0];
    if (text.take(String.raw`\b(?:at )?midnight\b`)) return [23, 59];
    if (text.take(String.raw`\b(?:by )?(?:the )?end of (?:the )?day\b|\beod\b`)) return [17, 0];
    if (text.take(String.raw`\b(?:this |in the )?morning\b`)) return [9, 0];
    if (text.take(String.raw`\b(?:this |in the )?afternoon\b`)) return [14, 0];
    if (text.take(String.raw`\b(?:this |in the )?evening\b`)) return [18, 0];
    if (text.take(String.raw`\b(?:at |in the )?night\b`)) return [20, 0];
    return null;
  })();

  // 7. Day.
  const day = (() => {
    let d;
    if (text.take(String.raw`\btonight\b`)) { if (!time) time = [20, 0]; return today; }
    if (text.take(String.raw`\b(?:the )?day after (?:tomorrow|tmrw)\b`)) return addDays(today, 2);
    if (text.take(String.raw`\b(?:tomorrow|tmrw|tmr|tomorow|tommorow|tommorrow)\b`)) return addDays(today, 1);
    if (text.take(String.raw`\btoday\b`)) return today;
    if (text.take(String.raw`\bnext weekend\b`)) return addDays(thisWeekend(), 7);
    if (text.take(String.raw`\b(?:this )?weekend\b`)) return thisWeekend();
    if (text.take(String.raw`\b(?:by )?(?:the )?end of (?:the )?week\b|\bthis week\b`)) return endOfWorkWeek();
    if (text.take(String.raw`\bnext week\b`)) return upcoming(2, false);
    if (text.take(String.raw`\b(?:by )?(?:the )?end of (?:the )?month\b|\bthis month\b`)) return new Date(today.getFullYear(), today.getMonth() + 1, 0);
    if (text.take(String.raw`\b(?:by )?(?:the )?end of (?:the )?year\b|\bthis year\b`)) return new Date(today.getFullYear(), 11, 31);
    if (text.take(String.raw`\bnext month\b`)) return addUnit(today, 'monthly', 1);
    if (text.take(String.raw`\bnext year\b`)) return addUnit(today, 'yearly', 1);
    if ((d = text.take(String.raw`\bin ` + numberPattern + String.raw` (days?|weeks?|months?|years?)\b`)) && number(d[1] || '') != null) {
      return addUnit(today, frequencyForUnit(d[2]), number(d[1]));
    }
    if ((d = text.take(String.raw`\b(?:(on|this|next|by|coming|this coming)\s+)?` + weekdayFullPattern + String.raw`\b`)
        ?? text.take(String.raw`\b(on|this|next|by)\s+` + weekdayShortPattern + String.raw`\.?(?![a-z])`)) && d[2]) {
      const weekday = weekdayNumber(d[2]);
      if ((d[1] || '').toLowerCase() === 'next') {
        const candidate = upcoming(weekday, false);
        const weekStart = addDays(today, -(weekdayOf(today) - 1));
        const sameWeek = candidate < addDays(weekStart, 7);
        return sameWeek ? addDays(candidate, 7) : candidate;
      }
      return upcoming(weekday, true);
    }
    if ((d = text.take(String.raw`\b(\d{4})-(\d{2})-(\d{2})\b`))) return makeDate(+d[1], +d[2], +d[3]);
    if ((d = text.take(String.raw`\b` + monthPattern + String.raw`\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b`))) {
      return makeDate(d[3] ? +d[3] : null, monthNumber(d[1]), +d[2]);
    }
    if ((d = text.take(String.raw`\b(?:the )?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?` + monthPattern + String.raw`\b(?:,?\s*(\d{4}))?`))) {
      return makeDate(d[3] ? +d[3] : null, monthNumber(d[2]), +d[1]);
    }
    if ((d = text.take(String.raw`\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b`))) {
      const [month, dd] = monthComesFirst ? [+d[1], +d[2]] : [+d[2], +d[1]];
      let year = d[3] ? +d[3] : null;
      if (year != null && year < 100) year += 2000;
      return makeDate(year, month, dd);
    }
    if ((d = text.take(String.raw`\b(?:the )(\d{1,2})(?:st|nd|rd|th)\b`) ?? text.take(String.raw`\b(?:on|by) the (\d{1,2})\b`))) {
      const n = +d[1];
      if (n >= 1 && n <= 31) return nextDate(n);
    }
    return null;
  })();

  if (!time && timeHint) time = timeHint;

  if (exactDate) {
    result.dueDate = exactDate; result.hasDueTime = true;
  } else if (day) {
    if (time) { result.dueDate = at(day, time[0], time[1]); result.hasDueTime = true; } else result.dueDate = day;
  } else if (time) {
    let candidate = at(now, time[0], time[1]);
    if (candidate <= now && (!result.recurrence || result.recurrence.frequency === 'daily')) candidate = addDays(candidate, 1);
    result.dueDate = candidate; result.hasDueTime = true;
  }

  if (result.recurrence) {
    const explicitDay = exactDate ? startOfDay(exactDate) : day;
    const routineTime = exactDate ? [exactDate.getHours(), exactDate.getMinutes()] : time;
    let start = explicitDay ?? (recurrenceWeekday ? upcoming(recurrenceWeekday, true) : recurrenceDayOfMonth ? nextDate(recurrenceDayOfMonth) : today);
    if (routineTime) {
      start = at(start, routineTime[0], routineTime[1]);
      if (start <= now) start = addUnit(start, result.recurrence.frequency, result.recurrence.interval);
    }
    result.dueDate = start;
    result.hasDueTime = !!routineTime;
  }

  // Title and category.
  let title = text.cleanedTitle();
  const lower = normalize(input).toLowerCase();
  result.category = (() => {
    if (result.amount != null || matches(lower, billWords)) return 'bill';
    if (matches(lower, shoppingWords)) return 'shopping';
    if (matches(title.toLowerCase(), groceryWords) && title.split(' ').length <= 6) return 'shopping';
    if (matches(title.toLowerCase(), String.raw`^(plan|organi[sz]e|prepare|research|set up|get ready|figure out)\b`)) return 'task';
    if (matches(lower, appointmentWords)) return 'appointment';
    if (reminderHint || matches(lower, reminderWords)) return 'reminder';
    return 'task';
  })();
  if (result.category === 'shopping') {
    title = title.replace(/^(?:buy|get|grab|pick up|purchase|order|restock)\s+(?:some\s+|more\s+)?/i, '');
  }
  if (result.recurrence) {
    const ordered = [
      ['birthdays', String.raw`\b(birthdays?|bday|anniversary)\b`],
      ['medication', String.raw`\b(pills?|medication|medicine|meds|vitamins?|insulin|inhaler|prescription|dose|antibiotics?|supplements?)\b`],
      ['pets', String.raw`\b(dogs?|cats?|pets?|puppy|kitten|feed the|walk the|litter|fish tank|aquarium|flea|heartworm|groom(?:ing)?|vet)\b`],
      ['vehicle', String.raw`\b(car|truck|vehicle|oil change|oil|tires?|registration|inspection|smog|emissions|car wash)\b`],
      ['bills', String.raw`\b(rent|mortgage|bills?|pay|payment|insurance|subscription|utilities|loan|credit card)\b`],
      ['supplies', String.raw`\b(restock|refill|supplies|toilet paper|paper towels|detergent|soap|filters?|groceries|buy|order)\b`],
      ['health', String.raw`\b(workout|work out|exercise|gym|run|yoga|stretch|meditate|meditation|weigh in|blood pressure|floss|doctor|dentist|checkup)\b`],
      ['home', String.raw`\b(trash|garbage|recycling|recycle|bins?|clean|cleaning|laundry|vacuum|dishes|dishwasher|mop|dust|plants?|lawn|mow|sheets|bathroom|kitchen|fridge|gutters|smoke detector)\b`],
    ];
    result.routineCategory = ordered.find(([, p]) => matches(lower, p))?.[0] ?? 'other';
  }
  title = title.trim() || input.trim();
  result.title = title.charAt(0).toUpperCase() + title.slice(1);

  if (explicitPriority != null) result.priority = explicitPriority;
  else if (result.category === 'bill' && result.dueDate && result.dueDate < addDays(today, 2)) result.priority = 2;

  return result;
}
