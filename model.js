// Data, storage and the app's rules (routine schedules, Break It Down, backups).
// Everything is kept on this device in IndexedDB. Backups use the same file format as the
// iPhone and Mac app, so a backup can be moved between them.

import { addUnit, startOfDay, isSameDay } from './dates.js';

export const TASK_CATEGORIES = {
  task: { title: 'Task', plural: 'Tasks', color: 'var(--blue)', icon: 'check' },
  reminder: { title: 'Reminder', plural: 'Reminders', color: 'var(--orange)', icon: 'bell' },
  bill: { title: 'Bill', plural: 'Bills', color: 'var(--green)', icon: 'card' },
  appointment: { title: 'Appointment', plural: 'Appointments', color: 'var(--purple)', icon: 'calendar' },
  shopping: { title: 'Shopping', plural: 'Shopping', color: 'var(--teal)', icon: 'cart' },
};

export const ROUTINE_CATEGORIES = {
  medication: { title: 'Medication', color: 'var(--pink)' },
  home: { title: 'Home', color: 'var(--brown)' },
  bills: { title: 'Bills & Rent', color: 'var(--green)' },
  pets: { title: 'Pet Care', color: 'var(--orange)' },
  vehicle: { title: 'Vehicle', color: 'var(--indigo)' },
  supplies: { title: 'Supplies', color: 'var(--teal)' },
  health: { title: 'Health', color: 'var(--red)' },
  birthdays: { title: 'Birthdays', color: 'var(--purple)' },
  other: { title: 'Other', color: 'var(--gray)' },
};

export const FREQUENCIES = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

export const DOCUMENT_KINDS = {
  receipt: 'Receipt', warranty: 'Warranty', insurance: 'Insurance', medical: 'Medical',
  identity: 'ID & Cards', manual: 'Manual', other: 'Other',
};

export const PRIORITIES = ['Low', 'Medium', 'High'];

export const MEMBER_COLORS = ['blue', 'green', 'orange', 'pink', 'purple', 'teal', 'indigo', 'red'];

export const newID = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
})).toUpperCase();

export function emptyState() {
  return { members: [], tasks: [], routines: [], notes: [], documents: [], settings: { theme: 'system', reminders: false, onboarded: false } };
}

// MARK: - Storage (IndexedDB, one record holding everything)

const DB_NAME = 'lifechaordic';
const STORE = 'kv';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState() {
  try {
    const db = await openDB();
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value) return { ...emptyState(), ...value, settings: { ...emptyState().settings, ...value.settings } };
  } catch (error) {
    console.error('Could not open storage', error);
  }
  return emptyState();
}

export async function saveState(state) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, 'state');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// MARK: - Tasks

export function makeTask(fields) {
  return {
    id: newID(), title: '', notes: '', category: 'task', priority: 1, dueDate: null, hasDueTime: false, amount: null,
    remindersEnabled: true, isCompleted: false, completedAt: null, createdAt: Date.now(), assigneeID: null, steps: [],
    locationName: null, latitude: null, longitude: null, remindOnArrival: true, ...fields,
  };
}

export const orderedSteps = (task) => [...task.steps].sort((a, b) => a.order - b.order);
export const nextStep = (task) => orderedSteps(task).find((s) => !s.isDone) ?? null;

export function isTaskOverdue(task, now = new Date()) {
  if (task.isCompleted || task.dueDate == null) return false;
  return task.hasDueTime ? task.dueDate < now.getTime() : task.dueDate < startOfDay(now).getTime();
}

export const isTaskDueToday = (task, now = new Date()) => task.dueDate != null && isSameDay(new Date(task.dueDate), now);

// MARK: - Routines

export function makeRoutine(fields) {
  const due = fields.nextDue ?? startOfDay(new Date()).getTime();
  return {
    id: newID(), title: '', notes: '', category: 'other', frequency: 'weekly', interval: 1, anchorDate: due, nextDue: due,
    hasTime: false, remindersEnabled: true, completionLog: [], createdAt: Date.now(), assigneeID: null,
    addsToShoppingList: false, amount: null, previousDue: null, ...fields,
  };
}

function occurrence(routine, index) {
  return addUnit(new Date(routine.anchorDate), routine.frequency, index * Math.max(1, routine.interval));
}

/** First occurrence after `after` that is also in the future (untimed routines compare by day). */
export function nextOccurrence(routine, after, now = new Date()) {
  const today = startOfDay(now).getTime();
  for (let index = 0; index < 50000; index++) {
    const candidate = occurrence(routine, index);
    const inFuture = routine.hasTime ? candidate > now : startOfDay(candidate).getTime() > today;
    if (candidate.getTime() > after && inFuture) return candidate.getTime();
  }
  return addUnit(new Date(after), routine.frequency, Math.max(1, routine.interval)).getTime();
}

export function markRoutineDone(routine, now = new Date()) {
  routine.completionLog.push(now.getTime());
  routine.previousDue = routine.nextDue;
  routine.nextDue = nextOccurrence(routine, routine.nextDue, now);
}

export function undoRoutine(routine) {
  if (!routine.completionLog.length || routine.previousDue == null) return false;
  routine.completionLog.pop();
  routine.nextDue = routine.previousDue;
  routine.previousDue = null;
  return true;
}

export function isRoutineOverdue(routine, now = new Date()) {
  return routine.hasTime ? routine.nextDue < now.getTime() : routine.nextDue < startOfDay(now).getTime();
}

export const isRoutineDueToday = (routine, now = new Date()) => isSameDay(new Date(routine.nextDue), now);

export const routineDoneToday = (routine, now = new Date()) => {
  const last = routine.completionLog[routine.completionLog.length - 1];
  return last != null && isSameDay(new Date(last), now);
};

export function scheduleSummary(routine) {
  const unit = FREQUENCIES[routine.frequency] ?? 'week';
  return routine.interval <= 1 ? `Every ${unit}` : `Every ${routine.interval} ${unit}s`;
}

// MARK: - Break It Down (built-in suggestions, same as the iPhone app without Apple Intelligence)

const TEMPLATES = [
  [/\b(mov(e|ing)|relocat)/, ['Pick a moving date', 'Get quotes from 2–3 movers', 'Collect boxes and tape', 'Pack one room at a time', 'Forward your mail', 'Update your address on accounts', 'Set up utilities at the new place']],
  [/\b(party|birthday|celebrat|shower|anniversary)/, ['Pick a date and time', 'Set a budget', 'Make the guest list', 'Choose and book the place', 'Send invitations', 'Order food and cake', 'Buy decorations']],
  [/\b(trip|vacation|travel|flights?|holiday)/, ['Pick travel dates', 'Set a budget', 'Compare and book flights', 'Book a place to stay', 'Arrange pet or house care', 'Make a packing list', 'Pack the night before']],
  [/\btax(es)?\b/, ['Gather income forms', 'Collect receipts for deductions', 'Choose software or a preparer', 'Fill in the return', 'Review and file', 'Save a copy in Documents']],
  [/\b(clean|declutter|organi[sz]e|tidy|garage|closet|basement|attic)/, ['Set a 20-minute timer', 'Grab bags for trash and donations', 'Clear one shelf or surface', 'Sort into keep, donate, toss', 'Put kept things back neatly', 'Drop off the donations']],
  [/\b(renew|passport|license|registration|permit)/, ['Check which documents are needed', 'Gather documents and ID', 'Fill out the form', 'Pay the fee', 'Submit and save the confirmation', 'Add the new expiry date to Documents']],
  [/\b(apply|application|job|resume|interview)/, ['Read the requirements', 'Update your resume', 'Write a short cover letter', 'Fill out the application', 'Submit and note the date', 'Follow up in a week']],
  [/\b(budget|finances|bills|savings)/, ['List all monthly bills', 'Note due dates and amounts', 'Add them as LifeChaordic bills', 'Set up autopay where you can', 'Pick a monthly savings amount']],
  [/\b(schedule|book|make).*(appointment|doctor|dentist|vet|checkup)/, ['Find the phone number or website', 'Check your calendar for free times', 'Call or book online', 'Add it to LifeChaordic with the time', 'Write down questions to ask']],
  [/\b(paint|renovat|remodel|repair|fix up|redo)/, ['Decide exactly what to change', 'Measure and take photos', 'Set a budget', 'Buy supplies or get quotes', 'Prep the space', 'Do the work in short sessions', 'Clean up']],
];

const FALLBACK_STEPS = ['Write down what "done" looks like', "List what you'll need", 'Do the first 10-minute part', 'Schedule time for the rest', 'Finish up and check it off'];

export function suggestSteps(title, existing = []) {
  const lower = title.trim().toLowerCase();
  if (!lower) return [];
  const steps = TEMPLATES.find(([pattern]) => pattern.test(lower))?.[1] ?? FALLBACK_STEPS;
  const seen = new Set(existing.map((s) => s.trim().toLowerCase()));
  return steps.filter((s) => !seen.has(s.toLowerCase())).slice(0, 7);
}

/** Adds suggested steps to a task. Returns how many were added. */
export function breakDown(task) {
  const steps = orderedSteps(task);
  const titles = suggestSteps(task.title, steps.map((s) => s.title));
  let order = (steps[steps.length - 1]?.order ?? -1) + 1;
  for (const title of titles) task.steps.push({ title, isDone: false, order: order++ });
  return titles.length;
}

// MARK: - Backups (compatible with the iPhone and Mac app)

const iso = (ms) => (ms == null ? undefined : new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'));
const ms = (value) => (value == null ? null : Date.parse(value));
const optional = (value) => (value == null ? undefined : value);

export function makeBackup(state) {
  return {
    version: 1,
    exportedAt: iso(Date.now()),
    members: state.members.map((m) => ({ id: m.id, name: m.name, color: m.color, createdAt: iso(m.createdAt) })),
    tasks: state.tasks.map((t) => ({
      id: t.id, title: t.title, notes: t.notes, category: t.category, priority: t.priority, dueDate: iso(t.dueDate),
      hasDueTime: t.hasDueTime, amount: optional(t.amount), remindersEnabled: t.remindersEnabled, isCompleted: t.isCompleted,
      completedAt: iso(t.completedAt), createdAt: iso(t.createdAt), assigneeID: optional(t.assigneeID),
      steps: t.steps.map((s) => ({ title: s.title, isDone: s.isDone, order: s.order })),
      locationName: optional(t.locationName), latitude: optional(t.latitude), longitude: optional(t.longitude),
      remindOnArrival: t.remindOnArrival,
    })),
    routines: state.routines.map((r) => ({
      id: r.id, title: r.title, notes: r.notes, category: r.category, frequency: r.frequency, interval: r.interval,
      anchorDate: iso(r.anchorDate), nextDue: iso(r.nextDue), hasTime: r.hasTime, remindersEnabled: r.remindersEnabled,
      completionLog: r.completionLog.map(iso), createdAt: iso(r.createdAt), assigneeID: optional(r.assigneeID),
      addsToShoppingList: r.addsToShoppingList, amount: optional(r.amount),
    })),
    notes: state.notes.map((n) => ({ title: n.title, body: n.body, isPinned: n.isPinned, createdAt: iso(n.createdAt), updatedAt: iso(n.updatedAt) })),
    documents: state.documents.map((d) => ({
      title: d.title, kind: d.kind, notes: d.notes, createdAt: iso(d.createdAt), expiresAt: iso(d.expiresAt),
      imageData: optional(d.imageData), thumbnailData: optional(d.thumbnailData), pdfData: optional(d.pdfData),
      pageCount: d.pageCount ?? 1, recognizedText: optional(d.recognizedText),
    })),
  };
}

/** Reads a backup file's JSON. Throws a friendly message when it isn't a LifeChaordic backup. */
export function readBackup(json, settings) {
  let backup;
  try { backup = JSON.parse(json); } catch { throw new Error("This file isn't a LifeChaordic backup."); }
  if (!backup || typeof backup.version !== 'number' || !Array.isArray(backup.tasks)) throw new Error("This file isn't a LifeChaordic backup.");
  if (backup.version > 1) throw new Error('This backup was made by a newer version of LifeChaordic. Update the app and try again.');
  return {
    settings,
    members: (backup.members ?? []).map((m) => ({ id: m.id, name: m.name, color: m.color, createdAt: ms(m.createdAt) })),
    tasks: backup.tasks.map((t) => makeTask({
      id: t.id, title: t.title, notes: t.notes ?? '', category: t.category, priority: t.priority, dueDate: ms(t.dueDate),
      hasDueTime: !!t.hasDueTime, amount: t.amount ?? null, remindersEnabled: t.remindersEnabled ?? true,
      isCompleted: !!t.isCompleted, completedAt: ms(t.completedAt), createdAt: ms(t.createdAt) ?? Date.now(),
      assigneeID: t.assigneeID ?? null, steps: (t.steps ?? []).map((s) => ({ title: s.title, isDone: !!s.isDone, order: s.order })),
      locationName: t.locationName ?? null, latitude: t.latitude ?? null, longitude: t.longitude ?? null,
      remindOnArrival: t.remindOnArrival ?? true,
    })),
    routines: (backup.routines ?? []).map((r) => makeRoutine({
      id: r.id, title: r.title, notes: r.notes ?? '', category: r.category, frequency: r.frequency, interval: r.interval ?? 1,
      anchorDate: ms(r.anchorDate), nextDue: ms(r.nextDue), hasTime: !!r.hasTime, remindersEnabled: r.remindersEnabled ?? true,
      completionLog: (r.completionLog ?? []).map(ms), createdAt: ms(r.createdAt) ?? Date.now(), assigneeID: r.assigneeID ?? null,
      addsToShoppingList: !!r.addsToShoppingList, amount: r.amount ?? null,
    })),
    notes: (backup.notes ?? []).map((n) => ({ id: newID(), title: n.title ?? '', body: n.body ?? '', isPinned: !!n.isPinned, createdAt: ms(n.createdAt), updatedAt: ms(n.updatedAt) })),
    documents: (backup.documents ?? []).map((d) => ({
      id: newID(), title: d.title ?? '', kind: d.kind ?? 'other', notes: d.notes ?? '', createdAt: ms(d.createdAt), expiresAt: ms(d.expiresAt),
      imageData: d.imageData ?? null, thumbnailData: d.thumbnailData ?? null, pdfData: d.pdfData ?? null, pageCount: d.pageCount ?? 1,
      recognizedText: d.recognizedText ?? null,
    })),
  };
}

export function backupFilename() {
  const d = new Date();
  return `LifeChaordic Backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
}

// MARK: - Sample data for a first look

export function sampleState() {
  const state = emptyState();
  const today = startOfDay(new Date());
  const day = (n, h, m) => { const d = new Date(today); d.setDate(d.getDate() + n); if (h != null) d.setHours(h, m ?? 0); return d.getTime(); };
  const alex = { id: newID(), name: 'Alex', color: 'teal', createdAt: Date.now() };
  state.members.push(alex);
  state.tasks.push(
    makeTask({ title: 'Pay electricity bill', category: 'bill', amount: 86.4, dueDate: day(-1), priority: 2 }),
    makeTask({ title: 'Dentist appointment', category: 'appointment', dueDate: day(0, 15), hasDueTime: true }),
    makeTask({ title: 'Call Mom', category: 'reminder', dueDate: day(0, 18), hasDueTime: true }),
    makeTask({ title: 'Plan the summer trip', category: 'task', dueDate: day(5), steps: [
      { title: 'Pick travel dates', isDone: true, order: 0 }, { title: 'Set a budget', isDone: false, order: 1 }, { title: 'Compare and book flights', isDone: false, order: 2 }] }),
    makeTask({ title: 'Milk', category: 'shopping' }),
    makeTask({ title: 'Paper towels', category: 'shopping', assigneeID: alex.id }),
    makeTask({ title: 'Renew car registration', category: 'task', dueDate: day(12) }),
  );
  state.routines.push(
    makeRoutine({ title: 'Take vitamin D', category: 'medication', frequency: 'daily', nextDue: day(0), anchorDate: day(0) }),
    makeRoutine({ title: 'Trash out', category: 'home', frequency: 'weekly', nextDue: day(2, 20), anchorDate: day(2, 20), hasTime: true }),
    makeRoutine({ title: 'Walk Biscuit', category: 'pets', frequency: 'daily', nextDue: day(0, 18), anchorDate: day(0, 18), hasTime: true, assigneeID: alex.id }),
    makeRoutine({ title: 'Pay rent', category: 'bills', frequency: 'monthly', nextDue: day(9), anchorDate: day(9), amount: 1450 }),
  );
  state.notes.push({ id: newID(), title: 'Wi-Fi', body: 'Network: HomeNet\nPassword: on the router sticker', isPinned: true, createdAt: Date.now(), updatedAt: Date.now() });
  state.settings.onboarded = true;
  return state;
}
