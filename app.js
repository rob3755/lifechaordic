// LifeChaordic for Windows and Android: an installable web app that keeps everything on this device.

import { parseCapture } from './parser.js';
import {
  relativeDay, formatLongDate, formatTime, formatMonthDay, startOfDay, toDateInput, toTimeInput, fromInputs, isSameDay, addDays, ordinal, formatWeekday,
} from './dates.js';
import {
  TASK_CATEGORIES, ROUTINE_CATEGORIES, FREQUENCIES, DOCUMENT_KINDS, PRIORITIES, MEMBER_COLORS, newID, loadState, saveState, makeTask, makeRoutine,
  orderedSteps, nextStep, isTaskOverdue, isTaskDueToday, markRoutineDone, undoRoutine, isRoutineOverdue, isRoutineDueToday, routineDoneToday,
  scheduleSummary, breakDown, makeBackup, readBackup, backupFilename, sampleState, emptyState,
} from './model.js';

let state = emptyState();
let route = 'today';
let taskFilter = 'all';
let showCompleted = false;
let searchText = '';

// MARK: - Tiny DOM helpers (text is always set as text, never as HTML)

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2" /><circle cx="5" cy="18" r="1"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  doc: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-8 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H6"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
};

const icon = (name, cls = '') => {
  const span = el('span', { class: `icon ${cls}`, 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
  return span;
};

const money = (amount) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
const member = (id) => state.members.find((m) => m.id === id);
const initials = (name) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

// MARK: - Saving

let saveTimer;
function commit({ rerender = true } = {}) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state).catch((e) => toast("Couldn't save. Check that storage isn't full.", true)), 250);
  if (rerender) render();
}

function toast(text, isError = false) {
  const host = document.getElementById('toast');
  host.textContent = text;
  host.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(host._timer);
  host._timer = setTimeout(() => { host.className = 'toast'; }, isError ? 4000 : 2500);
}

// MARK: - Navigation

const TABS = [
  ['today', 'Today', 'sun'],
  ['tasks', 'Tasks', 'list'],
  ['routines', 'Routines', 'repeat'],
  ['notes', 'Notes', 'note'],
  ['documents', 'Documents', 'doc'],
];

function navigate(to) {
  route = to;
  if (location.hash !== `#${to}`) history.replaceState(null, '', `#${to}`);
  searchText = '';
  render();
  document.getElementById('main').scrollTop = 0;
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    el('div', { class: 'brand' }, el('img', { src: 'icons/icon-192.png', alt: '' }), el('span', {}, 'LifeChaordic')),
    ...TABS.map(([id, title, iconName]) => el('button', {
      class: `nav-item${route === id ? ' active' : ''}`, onclick: () => navigate(id), 'aria-current': route === id ? 'page' : null,
    }, icon(iconName), el('span', {}, title))),
    el('button', { class: `nav-item settings-link${route === 'settings' ? ' active' : ''}`, onclick: () => navigate('settings') }, icon('gear'), el('span', {}, 'Settings')),
  );
}

// MARK: - Rows

function categoryBadge(category) {
  const meta = TASK_CATEGORIES[category] ?? TASK_CATEGORIES.task;
  return el('span', { class: 'badge', style: { color: meta.color } }, icon(meta.icon, 'small'), meta.title);
}

function memberBadge(id) {
  const m = member(id);
  return m ? el('span', { class: 'member', style: { background: `var(--${m.color})` }, title: m.name }, initials(m.name)) : null;
}

function taskRow(task) {
  const meta = TASK_CATEGORIES[task.category] ?? TASK_CATEGORIES.task;
  const overdue = isTaskOverdue(task);
  const next = !task.isCompleted ? nextStep(task) : null;
  const details = [categoryBadge(task.category)];
  if (task.dueDate != null) details.push(el('span', { class: overdue ? 'overdue' : '' }, relativeDay(new Date(task.dueDate), task.hasDueTime)));
  if (task.amount != null) details.push(el('span', {}, money(task.amount)));
  if (task.steps.length) details.push(el('span', {}, `${task.steps.filter((s) => s.isDone).length}/${task.steps.length} steps`));

  return el('li', { class: `row${task.isCompleted ? ' done' : ''}` },
    el('button', {
      class: `check${task.isCompleted ? ' checked' : ''}`, style: { color: task.isCompleted ? 'var(--green)' : meta.color },
      'aria-label': task.isCompleted ? `Mark ${task.title} not done` : `Mark ${task.title} done`,
      onclick: () => { toggleTask(task); },
    }, task.isCompleted ? icon('check') : null),
    el('div', { class: 'row-body', onclick: () => openTaskEditor(task), role: 'button', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter') openTaskEditor(task); } },
      el('div', { class: 'row-title' }, task.title, task.priority === 2 && !task.isCompleted ? el('span', { class: 'urgent', title: 'High priority' }, '!') : null),
      el('div', { class: 'row-meta' }, details),
      next ? el('button', {
        class: 'next-step', onclick: (e) => { e.stopPropagation(); next.isDone = true; commit(); toast('Step done'); },
      }, el('span', { class: 'mini-check', style: { borderColor: meta.color } }), `Next: ${next.title}`) : null,
    ),
    memberBadge(task.assigneeID),
    el('button', { class: 'row-action', title: 'Break It Down', 'aria-label': `Break ${task.title} down into steps`, onclick: (e) => {
      e.stopPropagation();
      const added = breakDown(task);
      commit();
      toast(added ? `Added ${added} step${added === 1 ? '' : 's'}` : 'No new steps to add', !added);
    } }, task.isCompleted ? null : icon('sparkles')),
  );
}

function toggleTask(task) {
  task.isCompleted = !task.isCompleted;
  task.completedAt = task.isCompleted ? Date.now() : null;
  commit();
  if (task.isCompleted) toast(`Done: ${task.title}`);
}

function routineRow(routine) {
  const meta = ROUTINE_CATEGORIES[routine.category] ?? ROUTINE_CATEGORIES.other;
  const overdue = isRoutineOverdue(routine);
  const doneToday = routineDoneToday(routine);
  return el('li', { class: 'row' },
    el('span', { class: 'routine-dot', style: { background: meta.color } }, icon('repeat', 'small')),
    el('div', { class: 'row-body', onclick: () => openRoutineEditor(routine), role: 'button', tabindex: '0' },
      el('div', { class: 'row-title' }, routine.title),
      el('div', { class: 'row-meta' },
        el('span', { class: overdue ? 'overdue' : '' }, relativeDay(new Date(routine.nextDue), routine.hasTime)),
        el('span', {}, scheduleSummary(routine)),
        routine.amount != null ? el('span', {}, money(routine.amount)) : null),
    ),
    memberBadge(routine.assigneeID),
    doneToday && routine.previousDue != null
      ? el('button', { class: 'row-action', title: 'Undo', onclick: () => { undoRoutine(routine); commit(); } }, icon('undo'))
      : null,
    el('button', {
      class: 'check', style: { color: meta.color }, 'aria-label': `Mark ${routine.title} done`, title: 'Done',
      onclick: () => { markRoutineDone(routine); commit(); toast(`Done. Next: ${relativeDay(new Date(routine.nextDue), routine.hasTime)}`); },
    }),
  );
}

function section(title, rows, extra) {
  if (!rows.length) return null;
  return el('section', { class: 'group' },
    el('h2', { class: title === 'Overdue' ? 'overdue' : '' }, title, extra ?? null),
    el('ul', { class: 'card list' }, rows));
}

function empty(iconName, title, text, action) {
  return el('div', { class: 'empty' }, icon(iconName, 'big'), el('h3', {}, title), el('p', {}, text), action ?? null);
}

// MARK: - Quick Capture

function captureCard() {
  const preview = el('div', { class: 'capture-preview' });
  const input = el('input', {
    id: 'capture', type: 'text', placeholder: 'Type anything: "Pay water bill Friday $42"', autocomplete: 'off', enterkeyhint: 'done',
    oninput: () => updatePreview(), onkeydown: (e) => { if (e.key === 'Enter') add(false); },
  });

  function updatePreview() {
    const text = input.value.trim();
    preview.replaceChildren();
    if (!text) return;
    const r = parseCapture(text, { memberNames: state.members.map((m) => m.name) });
    const chips = [el('strong', {}, r.title)];
    if (r.recurrence) chips.push(el('span', { class: 'chip' }, icon('repeat', 'small'), `${scheduleSummary(r.recurrence)} · Routine`));
    else chips.push(el('span', { class: 'chip', style: { color: TASK_CATEGORIES[r.category].color } }, TASK_CATEGORIES[r.category].title));
    if (r.dueDate) chips.push(el('span', { class: 'chip' }, relativeDay(r.dueDate, r.hasDueTime)));
    if (r.amount != null) chips.push(el('span', { class: 'chip' }, money(r.amount)));
    if (r.priority === 2) chips.push(el('span', { class: 'chip urgent-chip' }, 'High priority'));
    if (r.assigneeName) chips.push(el('span', { class: 'chip' }, r.assigneeName));
    preview.append(el('div', { class: 'chips' }, chips),
      el('div', { class: 'capture-actions' },
        !r.recurrence ? el('button', { class: 'secondary', onclick: () => add(true) }, icon('sparkles', 'small'), 'Break Into Steps') : null,
        el('button', { class: 'primary', onclick: () => add(false) }, 'Add')));
  }

  function add(withSteps) {
    const text = input.value.trim();
    if (!text) return;
    const r = parseCapture(text, { memberNames: state.members.map((m) => m.name) });
    const assigneeID = r.assigneeName ? state.members.find((m) => m.name === r.assigneeName)?.id ?? null : null;
    if (r.recurrence) {
      const due = (r.dueDate ?? startOfDay(new Date())).getTime();
      state.routines.push(makeRoutine({ title: r.title, category: r.routineCategory, frequency: r.recurrence.frequency, interval: r.recurrence.interval,
        nextDue: due, anchorDate: due, hasTime: r.hasDueTime, amount: r.amount, assigneeID }));
      toast(`Added routine: ${r.title}`);
    } else {
      const task = makeTask({ title: r.title, category: r.category, priority: r.priority, dueDate: r.dueDate?.getTime() ?? null,
        hasDueTime: r.hasDueTime, amount: r.amount, assigneeID });
      if (withSteps) breakDown(task);
      state.tasks.push(task);
      toast(withSteps ? `Added ${r.title} with ${task.steps.length} steps` : `Added ${r.title}`);
    }
    input.value = '';
    commit();
    requestAnimationFrame(() => document.getElementById('capture')?.focus());
  }

  return el('div', { class: 'card capture' },
    el('label', { for: 'capture', class: 'capture-label' }, icon('plus'), 'Quick Capture'),
    input, preview);
}

// MARK: - Views

function todayView() {
  const now = new Date();
  const openTasks = state.tasks.filter((t) => !t.isCompleted);
  const overdueTasks = openTasks.filter((t) => isTaskOverdue(t, now));
  const todayTasks = openTasks.filter((t) => isTaskDueToday(t, now) && !isTaskOverdue(t, now));
  const overdueRoutines = state.routines.filter((r) => isRoutineOverdue(r, now));
  const todayRoutines = state.routines.filter((r) => isRoutineDueToday(r, now) && !isRoutineOverdue(r, now));
  const doneToday = state.tasks.filter((t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)).length
    + state.routines.reduce((n, r) => n + r.completionLog.filter((d) => isSameDay(new Date(d), now)).length, 0);
  const total = doneToday + overdueTasks.length + todayTasks.length + overdueRoutines.length + todayRoutines.length;
  const soon = openTasks.filter((t) => t.dueDate != null && t.dueDate >= addDays(startOfDay(now), 1).getTime() && t.dueDate < addDays(startOfDay(now), 8).getTime())
    .sort((a, b) => a.dueDate - b.dueDate);
  const byDue = (a, b) => (a.dueDate ?? a.nextDue) - (b.dueDate ?? b.nextDue);

  return [
    el('p', { class: 'date-line' }, formatLongDate(now)),
    captureCard(),
    el('div', { class: 'card progress-card' },
      el('div', { class: 'progress-text' }, `${doneToday} of ${total} done today`),
      el('div', { class: 'progress' }, el('div', { style: { width: `${total ? (doneToday / total) * 100 : 0}%` } })),
      openTasks.length ? el('button', { class: 'link', onclick: openFocus }, icon('focus', 'small'), 'One Thing at a Time') : null),
    section('Overdue', [...overdueTasks.sort(byDue).map(taskRow), ...overdueRoutines.sort(byDue).map(routineRow)]),
    section('Today', [...todayTasks.sort(byDue).map(taskRow), ...todayRoutines.sort(byDue).map(routineRow)]),
    section('Coming Up', soon.map(taskRow)),
    !overdueTasks.length && !todayTasks.length && !overdueRoutines.length && !todayRoutines.length
      ? el('p', { class: 'calm' }, "Nothing else due today. Enjoy the breathing room.") : null,
  ];
}

function tasksView() {
  const now = new Date();
  const filters = [['all', 'All'], ...Object.entries(TASK_CATEGORIES).map(([id, m]) => [id, m.plural])];
  const visible = state.tasks.filter((t) => taskFilter === 'all' || t.category === taskFilter);
  const open = visible.filter((t) => !t.isCompleted);
  const done = visible.filter((t) => t.isCompleted).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const byDue = (a, b) => a.dueDate - b.dueDate;
  const overdue = open.filter((t) => isTaskOverdue(t, now)).sort(byDue);
  const today = open.filter((t) => isTaskDueToday(t, now) && !isTaskOverdue(t, now)).sort(byDue);
  const later = open.filter((t) => t.dueDate != null && !isTaskOverdue(t, now) && !isTaskDueToday(t, now)).sort(byDue);
  const someday = open.filter((t) => t.dueDate == null).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

  return [
    el('div', { class: 'filters', role: 'tablist' }, filters.map(([id, title]) =>
      el('button', { class: `filter${taskFilter === id ? ' active' : ''}`, role: 'tab', 'aria-selected': String(taskFilter === id), onclick: () => { taskFilter = id; render(); } }, title))),
    open.length === 0 && !done.length ? empty('list', 'No Tasks', 'Add things from Quick Capture on Today, or press New.', el('button', { class: 'primary', onclick: () => openTaskEditor(null) }, 'New Task')) : null,
    section('Overdue', overdue.map(taskRow)),
    section('Today', today.map(taskRow)),
    section('Upcoming', later.map(taskRow)),
    section(taskFilter === 'shopping' ? 'To Buy' : 'Anytime', someday.map(taskRow)),
    done.length ? el('button', { class: 'link center', onclick: () => { showCompleted = !showCompleted; render(); } }, showCompleted ? 'Hide Completed' : `Show Completed (${done.length})`) : null,
    showCompleted ? section('Completed', done.slice(0, 100).map(taskRow)) : null,
  ];
}

function routinesView() {
  const sorted = [...state.routines].sort((a, b) => a.nextDue - b.nextDue);
  if (!sorted.length) {
    return [empty('repeat', 'No Routines', 'Routines repeat on a schedule: "Trash out every Tuesday night" or "Pay rent on the 1st of every month".',
      el('button', { class: 'primary', onclick: () => openRoutineEditor(null) }, 'New Routine'))];
  }
  const groups = {};
  for (const r of sorted) (groups[r.category] ??= []).push(r);
  return Object.entries(ROUTINE_CATEGORIES).map(([id, meta]) => section(meta.title, (groups[id] ?? []).map(routineRow)));
}

function notesView() {
  const sorted = [...state.notes].sort((a, b) => (b.isPinned - a.isPinned) || (b.updatedAt - a.updatedAt));
  if (!sorted.length) {
    return [empty('note', 'No Notes', 'Keep Wi-Fi passwords, gift ideas, measurements and anything else you want to find later.',
      el('button', { class: 'primary', onclick: () => openNoteEditor(null) }, 'New Note'))];
  }
  const row = (note) => el('li', { class: 'row' },
    el('div', { class: 'row-body', onclick: () => openNoteEditor(note), role: 'button', tabindex: '0' },
      el('div', { class: 'row-title' }, note.isPinned ? icon('pin', 'small pinned') : null, note.title.trim() || note.body.split('\n')[0] || 'New Note'),
      el('div', { class: 'row-meta' }, el('span', {}, formatMonthDay(new Date(note.updatedAt))), el('span', { class: 'clip' }, note.body.replace(/\n/g, ' ').slice(0, 120)))));
  return [section('Pinned', sorted.filter((n) => n.isPinned).map(row)), section('Notes', sorted.filter((n) => !n.isPinned).map(row))];
}

const docSrc = (d) => d.thumbnailData ? `data:image/jpeg;base64,${d.thumbnailData}` : d.imageData ? `data:image/jpeg;base64,${d.imageData}` : null;

function documentsView() {
  if (!state.documents.length) {
    return [empty('doc', 'No Documents', 'Keep photos of receipts, warranties and insurance cards here so they are easy to find.',
      el('button', { class: 'primary', onclick: () => openDocumentEditor(null) }, 'Add Document'))];
  }
  const sorted = [...state.documents].sort((a, b) => b.createdAt - a.createdAt);
  return [el('div', { class: 'doc-grid' }, sorted.map((d) => el('button', { class: 'doc-tile card', onclick: () => openDocumentEditor(d) },
    docSrc(d) ? el('img', { src: docSrc(d), alt: '' }) : el('div', { class: 'doc-placeholder' }, icon('doc', 'big')),
    el('div', { class: 'doc-title' }, d.title || DOCUMENT_KINDS[d.kind] || 'Document'),
    el('div', { class: 'row-meta' }, el('span', {}, DOCUMENT_KINDS[d.kind] ?? 'Other'),
      d.expiresAt ? el('span', { class: d.expiresAt < Date.now() ? 'overdue' : '' }, `Expires ${formatMonthDay(new Date(d.expiresAt))}`) : null))))];
}

function searchView() {
  const q = searchText.toLowerCase();
  const has = (...parts) => parts.join(' ').toLowerCase().includes(q);
  const tasks = state.tasks.filter((t) => has(t.title, t.notes, ...t.steps.map((s) => s.title)));
  const routines = state.routines.filter((r) => has(r.title, r.notes));
  const notes = state.notes.filter((n) => has(n.title, n.body));
  const docs = state.documents.filter((d) => has(d.title, d.notes, d.recognizedText ?? ''));
  const results = [
    section('Tasks', tasks.map(taskRow)),
    section('Routines', routines.map(routineRow)),
    section('Notes', notes.map((n) => el('li', { class: 'row' }, el('div', { class: 'row-body', onclick: () => openNoteEditor(n), role: 'button' }, el('div', { class: 'row-title' }, n.title || n.body.split('\n')[0]))))),
    section('Documents', docs.map((d) => el('li', { class: 'row' }, el('div', { class: 'row-body', onclick: () => openDocumentEditor(d), role: 'button' }, el('div', { class: 'row-title' }, d.title || 'Document'))))),
  ].filter(Boolean);
  return results.length ? results : [empty('search', 'No Results', `Nothing matches "${searchText}".`)];
}

function settingsView() {
  const s = state.settings;
  const memberRows = state.members.map((m) => el('li', { class: 'row' },
    el('span', { class: 'member', style: { background: `var(--${m.color})` } }, initials(m.name)),
    el('div', { class: 'row-body' }, el('div', { class: 'row-title' }, m.name)),
    el('button', { class: 'row-action', 'aria-label': `Remove ${m.name}`, onclick: () => {
      if (!confirm(`Remove ${m.name}? Their tasks and routines stay, unassigned.`)) return;
      state.members = state.members.filter((x) => x.id !== m.id);
      for (const t of state.tasks) if (t.assigneeID === m.id) t.assigneeID = null;
      for (const r of state.routines) if (r.assigneeID === m.id) r.assigneeID = null;
      commit();
    } }, icon('trash'))));

  const nameInput = el('input', { type: 'text', placeholder: 'Add a person', 'aria-label': 'Name', onkeydown: (e) => { if (e.key === 'Enter') addMember(); } });
  function addMember() {
    const name = nameInput.value.trim();
    if (!name) return;
    state.members.push({ id: newID(), name, color: MEMBER_COLORS[state.members.length % MEMBER_COLORS.length], createdAt: Date.now() });
    commit();
  }

  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const restored = readBackup(await file.text(), state.settings);
      if (!confirm('Replace everything on this device with this backup?')) return;
      state = restored;
      commit();
      toast(`Restored ${state.tasks.length + state.routines.length + state.notes.length + state.documents.length} items`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      fileInput.value = '';
    }
  } });

  return [
    el('section', { class: 'group' }, el('h2', {}, 'Household'),
      el('ul', { class: 'card list' }, memberRows, el('li', { class: 'row' }, nameInput, el('button', { class: 'secondary', onclick: addMember }, 'Add'))),
      el('p', { class: 'footnote' }, 'Assign chores, errands, bills and routines. Quick Capture understands "Alex: walk the dog every evening."')),
    el('section', { class: 'group' }, el('h2', {}, 'Reminders'),
      el('div', { class: 'card pad' },
        el('label', { class: 'toggle' }, el('span', {}, 'Remind me when timed items are due'),
          el('input', { type: 'checkbox', checked: s.reminders, onchange: async (e) => {
            if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
              const result = await Notification.requestPermission();
              if (result !== 'granted') { e.target.checked = false; toast('Allow notifications for this app in your browser settings.', true); return; }
            }
            s.reminders = e.target.checked;
            commit();
          } }))),
      el('p', { class: 'footnote' }, 'Reminders appear while LifeChaordic is open (it can stay minimized). Windows and Android may not show them once the app is fully closed.')),
    el('section', { class: 'group' }, el('h2', {}, 'Appearance'),
      el('div', { class: 'card pad' }, el('label', { class: 'toggle' }, el('span', {}, 'Theme'),
        el('select', { onchange: (e) => { s.theme = e.target.value; applyTheme(); commit(); } },
          ['system', 'light', 'dark'].map((t) => el('option', { value: t, selected: s.theme === t }, t[0].toUpperCase() + t.slice(1))))))),
    el('section', { class: 'group' }, el('h2', {}, 'Data'),
      el('div', { class: 'card stack' },
        el('button', { class: 'menu-item', onclick: exportBackup }, icon('download'), 'Export Backup…'),
        el('button', { class: 'menu-item', onclick: () => fileInput.click() }, icon('upload'), 'Restore from Backup…'), fileInput,
        el('button', { class: 'menu-item', onclick: () => { if (confirm('Replace everything with sample data?')) { state = { ...sampleState(), settings: state.settings }; commit(); } } }, icon('sparkles'), 'Load Sample Data'),
        el('button', { class: 'menu-item destructive', onclick: () => { if (confirm('Delete everything on this device? This cannot be undone.')) { state = { ...emptyState(), settings: state.settings }; commit(); toast('All data deleted'); } } }, icon('trash'), 'Delete All Data')),
      el('p', { class: 'footnote' }, 'Everything is stored only on this device. Backups use the same format as LifeChaordic on iPhone and Mac, so you can move your data between them: export on one, restore on the other.')),
    el('section', { class: 'group' }, el('h2', {}, 'About'),
      el('div', { class: 'card pad' }, el('p', {}, 'LifeChaordic for Windows and Android · Version 1.0'),
        el('p', { class: 'footnote flush' }, 'No account, no ads, no tracking.'))),
  ];
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(makeBackup(state))], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: backupFilename() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup saved');
}

// MARK: - Editors (dialogs)

function openDialog(title, body, { onClose, wide } = {}) {
  const dialog = el('dialog', { class: `sheet${wide ? ' wide' : ''}` },
    el('header', {}, el('h2', {}, title), el('button', { class: 'icon-button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close'))),
    el('div', { class: 'sheet-body' }, body));
  dialog.addEventListener('close', () => { onClose?.(); dialog.remove(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

const field = (label, control) => el('label', { class: 'field' }, el('span', {}, label), control);

function openTaskEditor(existing) {
  const task = existing ?? makeTask({});
  const draft = structuredClone(task);
  const due = draft.dueDate != null ? new Date(draft.dueDate) : null;

  const title = el('input', { type: 'text', value: draft.title, placeholder: 'Title', class: 'title-input' });
  const notes = el('textarea', { rows: 3, placeholder: 'Notes' }, draft.notes);
  const category = el('select', {}, Object.entries(TASK_CATEGORIES).map(([id, m]) => el('option', { value: id, selected: draft.category === id }, m.title)));
  const priority = el('select', {}, PRIORITIES.map((p, i) => el('option', { value: i, selected: draft.priority === i }, p)));
  const date = el('input', { type: 'date', value: due ? toDateInput(due) : '' });
  const time = el('input', { type: 'time', value: due && draft.hasDueTime ? toTimeInput(due) : '' });
  const amount = el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: draft.amount ?? '', placeholder: '0.00' });
  const assignee = el('select', {}, el('option', { value: '' }, 'No one'), state.members.map((m) => el('option', { value: m.id, selected: draft.assigneeID === m.id }, m.name)));

  const stepsList = el('ul', { class: 'steps' });
  const newStep = el('input', { type: 'text', placeholder: 'Add a step', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } } });
  function addStep() {
    const text = newStep.value.trim();
    if (!text) return;
    draft.steps.push({ title: text, isDone: false, order: (orderedSteps(draft).at(-1)?.order ?? -1) + 1 });
    newStep.value = '';
    renderSteps();
  }
  function renderSteps() {
    stepsList.replaceChildren(...orderedSteps(draft).map((step) => el('li', {},
      el('input', { type: 'checkbox', checked: step.isDone, 'aria-label': step.title, onchange: (e) => { step.isDone = e.target.checked; } }),
      el('span', { class: step.isDone ? 'struck' : '' }, step.title),
      el('button', { class: 'icon-button', 'aria-label': `Delete ${step.title}`, onclick: () => { draft.steps = draft.steps.filter((s) => s !== step); renderSteps(); } }, icon('close')))));
  }
  renderSteps();

  let deleted = false;
  const body = [
    title,
    el('div', { class: 'grid2' }, field('Type', category), field('Priority', priority), field('Date', date), field('Time', time), field('Amount', amount), field('Assigned to', assignee)),
    notes,
    el('div', { class: 'steps-header' }, el('h3', {}, 'Steps'),
      el('button', { class: 'secondary', onclick: () => {
        draft.title = title.value;
        const added = breakDown(draft);
        renderSteps();
        toast(added ? `Added ${added} step${added === 1 ? '' : 's'}` : 'No new steps to add', !added);
      } }, icon('sparkles', 'small'), 'Break It Down')),
    el('p', { class: 'footnote flush' }, 'Big tasks feel lighter in small steps. LifeChaordic shows you just the next one.'),
    stepsList, newStep,
    el('div', { class: 'sheet-actions' },
      existing ? el('button', { class: 'destructive-button', onclick: () => {
        if (!confirm(`Delete "${task.title}"?`)) return;
        state.tasks = state.tasks.filter((t) => t.id !== task.id); deleted = true; commit(); dialog.close();
      } }, icon('trash', 'small'), 'Delete') : el('span'),
      el('button', { class: 'primary', onclick: () => dialog.close() }, existing ? 'Done' : 'Add Task')),
  ];

  const dialog = openDialog(existing ? 'Edit Task' : 'New Task', body, { wide: true, onClose: () => {
    if (deleted) return;
    if (!title.value.trim()) { if (!existing) return; }
    Object.assign(task, {
      title: title.value.trim() || task.title, notes: notes.value, category: category.value, priority: Number(priority.value),
      dueDate: fromInputs(date.value, time.value)?.getTime() ?? null, hasDueTime: !!(date.value && time.value),
      amount: amount.value === '' ? null : Number(amount.value), assigneeID: assignee.value || null, steps: draft.steps,
    });
    if (!existing) state.tasks.push(task);
    commit();
  } });
  if (!existing) title.focus();
}

function openRoutineEditor(existing) {
  const routine = existing ?? makeRoutine({});
  const due = new Date(routine.nextDue);
  const title = el('input', { type: 'text', value: routine.title, placeholder: 'Title', class: 'title-input' });
  const category = el('select', {}, Object.entries(ROUTINE_CATEGORIES).map(([id, m]) => el('option', { value: id, selected: routine.category === id }, m.title)));
  const frequency = el('select', {}, Object.keys(FREQUENCIES).map((f) => el('option', { value: f, selected: routine.frequency === f }, f[0].toUpperCase() + f.slice(1))));
  const interval = el('input', { type: 'number', min: '1', max: '99', value: routine.interval });
  const date = el('input', { type: 'date', value: toDateInput(due) });
  const time = el('input', { type: 'time', value: routine.hasTime ? toTimeInput(due) : '' });
  const amount = el('input', { type: 'number', step: '0.01', min: '0', value: routine.amount ?? '', placeholder: 'Optional' });
  const assignee = el('select', {}, el('option', { value: '' }, 'No one'), state.members.map((m) => el('option', { value: m.id, selected: routine.assigneeID === m.id }, m.name)));
  const notes = el('textarea', { rows: 3, placeholder: 'Notes' }, routine.notes);
  const history = routine.completionLog.slice(-5).reverse();

  let deleted = false;
  const dialog = openDialog(existing ? 'Edit Routine' : 'New Routine', [
    title,
    el('div', { class: 'grid2' }, field('Repeats', frequency), field('Every', interval), field('Next due', date), field('Time', time),
      field('Category', category), field('Amount', amount), field('Assigned to', assignee)),
    notes,
    history.length ? el('div', {}, el('h3', {}, 'Recently done'), el('p', { class: 'footnote flush' }, history.map((d) => relativeDay(new Date(d), true)).join(' · '))) : null,
    el('div', { class: 'sheet-actions' },
      existing ? el('button', { class: 'destructive-button', onclick: () => {
        if (!confirm(`Delete "${routine.title}"?`)) return;
        state.routines = state.routines.filter((r) => r.id !== routine.id); deleted = true; commit(); dialog.close();
      } }, icon('trash', 'small'), 'Delete') : el('span'),
      el('button', { class: 'primary', onclick: () => dialog.close() }, existing ? 'Done' : 'Add Routine')),
  ], { wide: true, onClose: () => {
    if (deleted || (!existing && !title.value.trim())) return;
    const nextDue = (fromInputs(date.value, time.value) ?? startOfDay(new Date())).getTime();
    const scheduleChanged = nextDue !== routine.nextDue || frequency.value !== routine.frequency || Number(interval.value) !== routine.interval;
    Object.assign(routine, {
      title: title.value.trim() || routine.title, category: category.value, frequency: frequency.value, interval: Math.max(1, Number(interval.value) || 1),
      hasTime: !!time.value, amount: amount.value === '' ? null : Number(amount.value), assigneeID: assignee.value || null, notes: notes.value,
    });
    if (scheduleChanged) { routine.nextDue = nextDue; routine.anchorDate = nextDue; routine.previousDue = null; }
    if (!existing) state.routines.push(routine);
    commit();
  } });
  if (!existing) title.focus();
}

function openNoteEditor(existing) {
  const note = existing ?? { id: newID(), title: '', body: '', isPinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  const title = el('input', { type: 'text', value: note.title, placeholder: 'Title', class: 'title-input' });
  const body = el('textarea', { rows: 14, placeholder: 'Start writing…', class: 'note-body' }, note.body);
  const pin = el('input', { type: 'checkbox', checked: note.isPinned });
  let deleted = false;
  const dialog = openDialog(existing ? 'Note' : 'New Note', [
    title, body,
    el('div', { class: 'sheet-actions' },
      el('label', { class: 'inline' }, pin, 'Pinned'),
      existing ? el('button', { class: 'destructive-button', onclick: () => { state.notes = state.notes.filter((n) => n.id !== note.id); deleted = true; commit(); dialog.close(); } }, icon('trash', 'small'), 'Delete') : null,
      el('button', { class: 'primary', onclick: () => dialog.close() }, 'Done')),
  ], { wide: true, onClose: () => {
    if (deleted) return;
    if (!title.value.trim() && !body.value.trim()) {
      if (existing) state.notes = state.notes.filter((n) => n.id !== note.id);
      commit();
      return;
    }
    const changed = note.title !== title.value || note.body !== body.value || note.isPinned !== pin.checked;
    Object.assign(note, { title: title.value, body: body.value, isPinned: pin.checked });
    if (changed) note.updatedAt = Date.now();
    if (!existing) state.notes.push(note);
    commit();
  } });
  (existing ? body : title).focus();
}

/** Shrinks a photo to keep storage small (and creates the thumbnail the iPhone app uses). */
function resizeImage(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = el('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function openDocumentEditor(existing) {
  const doc = existing ?? { id: newID(), title: '', kind: 'receipt', notes: '', createdAt: Date.now(), expiresAt: null, imageData: null, thumbnailData: null, pdfData: null, pageCount: 1, recognizedText: null };
  const draft = { imageData: doc.imageData, thumbnailData: doc.thumbnailData, pdfData: doc.pdfData };
  const title = el('input', { type: 'text', value: doc.title, placeholder: 'Title', class: 'title-input' });
  const kind = el('select', {}, Object.entries(DOCUMENT_KINDS).map(([id, t]) => el('option', { value: id, selected: doc.kind === id }, t)));
  const expires = el('input', { type: 'date', value: doc.expiresAt ? toDateInput(new Date(doc.expiresAt)) : '' });
  const notes = el('textarea', { rows: 3, placeholder: 'Notes' }, doc.notes);
  const preview = el('div', { class: 'doc-preview' });
  const renderPreview = () => {
    preview.replaceChildren();
    if (draft.imageData) preview.append(el('img', { src: `data:image/jpeg;base64,${draft.imageData}`, alt: doc.title }));
    if (draft.pdfData) preview.append(el('button', { class: 'secondary', onclick: () => {
      const bytes = Uint8Array.from(atob(draft.pdfData), (c) => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
    } }, 'Open PDF'));
    if (doc.recognizedText) preview.append(el('details', {}, el('summary', {}, 'Text on this document'), el('p', { class: 'footnote flush pre' }, doc.recognizedText)));
  };
  renderPreview();
  const photo = el('input', { type: 'file', accept: 'image/*,application/pdf', hidden: true, onchange: async () => {
    const file = photo.files[0];
    if (!file) return;
    try {
      if (file.type === 'application/pdf') {
        const buffer = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
        draft.pdfData = btoa(binary);
      } else {
        draft.imageData = await resizeImage(file, 2000);
        draft.thumbnailData = await resizeImage(file, 400);
      }
      if (!title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, '');
      renderPreview();
    } catch {
      toast("That file couldn't be opened", true);
    }
  } });

  let deleted = false;
  const dialog = openDialog(existing ? 'Document' : 'Add Document', [
    title, preview,
    el('button', { class: 'secondary', onclick: () => photo.click() }, icon('upload', 'small'), draft.imageData || draft.pdfData ? 'Replace Photo or PDF' : 'Choose Photo or PDF'), photo,
    el('div', { class: 'grid2' }, field('Kind', kind), field('Expires', expires)),
    notes,
    el('div', { class: 'sheet-actions' },
      existing ? el('button', { class: 'destructive-button', onclick: () => {
        if (!confirm(`Delete "${doc.title || 'this document'}"?`)) return;
        state.documents = state.documents.filter((d) => d.id !== doc.id); deleted = true; commit(); dialog.close();
      } }, icon('trash', 'small'), 'Delete') : el('span'),
      el('button', { class: 'primary', onclick: () => dialog.close() }, existing ? 'Done' : 'Save')),
  ], { wide: true, onClose: () => {
    if (deleted || (!existing && !title.value.trim() && !draft.imageData && !draft.pdfData)) return;
    Object.assign(doc, { title: title.value.trim(), kind: kind.value, notes: notes.value, expiresAt: fromInputs(expires.value, '')?.getTime() ?? null, ...draft });
    if (!existing) state.documents.push(doc);
    commit();
  } });
}

/** One Thing at a Time: shows a single task so starting feels easy. */
function openFocus() {
  const now = new Date();
  const candidates = state.tasks.filter((t) => !t.isCompleted).sort((a, b) =>
    (isTaskOverdue(b, now) - isTaskOverdue(a, now)) || (b.priority - a.priority) || ((a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)));
  let index = 0;
  const content = el('div', { class: 'focus' });
  const show = () => {
    const task = candidates[index];
    if (!task) { content.replaceChildren(el('h3', {}, 'All clear.'), el('p', {}, 'Nothing left to pick. Nice work.')); return; }
    const step = nextStep(task);
    content.replaceChildren(...[
      categoryBadge(task.category),
      el('h3', { class: 'focus-title' }, task.title),
      step ? el('p', { class: 'focus-step' }, `Just this: ${step.title}`) : null,
      task.dueDate != null ? el('p', { class: 'footnote flush' }, relativeDay(new Date(task.dueDate), task.hasDueTime)) : null,
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'secondary', onclick: () => { index = (index + 1) % candidates.length; show(); } }, 'Something Else'),
        el('button', { class: 'primary', onclick: () => {
          if (step) step.isDone = true; else { task.isCompleted = true; task.completedAt = Date.now(); candidates.splice(index, 1); if (index >= candidates.length) index = 0; }
          commit({ rerender: true });
          toast(step ? 'Step done' : 'Done');
          show();
        } }, step ? 'Step Done' : 'Done')),
    ].filter(Boolean));
  };
  show();
  openDialog('One Thing at a Time', content);
}

// MARK: - Reminders while the app is open

const notified = new Set();
function checkReminders() {
  if (!state.settings.reminders || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  const due = [
    ...state.tasks.filter((t) => !t.isCompleted && t.hasDueTime && t.remindersEnabled && t.dueDate <= now && t.dueDate > now - 15 * 60000).map((t) => [t.id + t.dueDate, t.title]),
    ...state.routines.filter((r) => r.hasTime && r.remindersEnabled && r.nextDue <= now && r.nextDue > now - 15 * 60000).map((r) => [r.id + r.nextDue, r.title]),
  ];
  for (const [key, title] of due) {
    if (notified.has(key)) continue;
    notified.add(key);
    const options = { body: 'Due now', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: key };
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, options)).catch(() => new Notification(title, options));
  }
}

// MARK: - Render

function applyTheme() {
  const theme = state.settings.theme;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

const TITLES = { today: 'Today', tasks: 'Tasks', routines: 'Routines', notes: 'Notes', documents: 'Documents', settings: 'Settings' };

function render() {
  renderNav();
  const header = document.getElementById('header');
  const add = { tasks: () => openTaskEditor(null), routines: () => openRoutineEditor(null), notes: () => openNoteEditor(null), documents: () => openDocumentEditor(null), today: () => document.getElementById('capture')?.focus() }[route];
  const search = el('input', { type: 'search', placeholder: 'Search tasks, notes, documents', value: searchText, 'aria-label': 'Search',
    oninput: (e) => { searchText = e.target.value; renderMain(); } });
  header.replaceChildren(...[
    el('h1', {}, searchText ? 'Search' : TITLES[route]),
    route !== 'settings' ? el('div', { class: 'search' }, icon('search', 'small'), search) : null,
    el('div', { class: 'header-actions' },
      add ? el('button', { class: 'icon-button filled', 'aria-label': 'New', title: 'New (Ctrl+N)', onclick: add }, icon('plus')) : null,
      el('button', { class: 'icon-button settings-button', 'aria-label': 'Settings', onclick: () => navigate('settings') }, icon('gear'))),
  ].filter(Boolean));
  renderMain();
}

function renderMain() {
  const main = document.getElementById('content');
  const views = { today: todayView, tasks: tasksView, routines: routinesView, notes: notesView, documents: documentsView, settings: settingsView };
  const content = searchText.trim() && route !== 'settings' ? searchView() : (views[route] ?? todayView)();
  main.replaceChildren(...content.filter(Boolean));
}

function welcome() {
  const content = el('div', { class: 'welcome' },
    el('img', { src: 'icons/icon-512.png', alt: '', class: 'welcome-logo' }),
    el('h3', {}, 'Welcome to LifeChaordic'),
    el('p', {}, 'Type or speak naturally. LifeChaordic files it as a task, bill, appointment or shopping item, and keeps your routines running.'),
    el('p', { class: 'footnote flush' }, 'Everything stays on this device. Already use LifeChaordic on iPhone? Export a backup there and restore it in Settings here.'),
    el('div', { class: 'sheet-actions' },
      el('button', { class: 'secondary', onclick: () => { state = { ...sampleState(), settings: { ...state.settings, onboarded: true } }; commit(); dialog.close(); } }, 'Explore with Sample Data'),
      el('button', { class: 'primary', onclick: () => { state.settings.onboarded = true; commit(); dialog.close(); } }, 'Get Started')));
  const dialog = openDialog('LifeChaordic', content, { onClose: () => { if (!state.settings.onboarded) { state.settings.onboarded = true; commit(); } } });
}

async function start() {
  state = await loadState();
  applyTheme();
  const hash = location.hash.slice(1);
  if (TITLES[hash]) route = hash;
  render();
  if (!state.settings.onboarded) welcome();

  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TITLES[h] && h !== route) navigate(h); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); navigate('today'); requestAnimationFrame(() => document.getElementById('capture')?.focus()); }
  });
  // Re-render at midnight and every minute so "Today" and "Overdue" stay correct.
  setInterval(() => { checkReminders(); if (!document.querySelector('dialog[open]') && document.activeElement?.tagName !== 'INPUT') renderMain(); }, 60000);
  checkReminders();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.();
}

start();
