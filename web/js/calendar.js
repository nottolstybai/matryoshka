// Календарь архива: месяц, неделя с понедельника.
// Дни раньше первой головоломки и будущие закрыты; решённые и начатые подсвечены.

import { localDate } from './daily.js';
import { dayStatus } from './progress.js';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const STATUS_LABEL = { done: 'решён', started: 'начат' };

// Даты месяца (month — 0..11) с пустыми ячейками в начале, чтобы первая неделя начиналась с понедельника.
export function monthDays(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const days = Array(lead).fill(null);
  for (let d = 1; d <= count; d++) days.push(localDate(new Date(year, month, d)));
  return days;
}

// view — { year, month }; first/today/selected — даты YYYY-MM-DD; onNav(±1) листает месяц.
export function renderCalendar(el, { view, first, today, selected, progress, onNav }) {
  const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const cur = monthKey(view.year, view.month);
  const title = new Date(view.year, view.month, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const head = document.createElement('div');
  head.className = 'cal-head';
  const prev = navButton('‹', 'Предыдущий месяц', cur <= first.slice(0, 7), () => onNav(-1));
  const next = navButton('›', 'Следующий месяц', cur >= today.slice(0, 7), () => onNav(1));
  const label = document.createElement('span');
  label.textContent = title[0].toUpperCase() + title.slice(1);
  label.setAttribute('aria-live', 'polite');
  head.append(prev, label, next);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  for (const w of WEEKDAYS) grid.append(cell('span', w, 'cal-weekday'));
  for (const date of monthDays(view.year, view.month)) {
    if (!date) {
      grid.append(cell('span', '', 'cal-empty'));
      continue;
    }
    const n = String(Number(date.slice(8)));
    const open = date >= first && date <= today;
    const day = open ? cell('a', n, 'cal-day') : cell('span', n, 'cal-day locked');
    const status = dayStatus(progress, date);
    if (open) {
      day.href = `?date=${date}`;
      day.title = [n, STATUS_LABEL[status]].filter(Boolean).join(' — ');
    }
    if (open && status) day.classList.add(status);
    if (date === today) {
      day.classList.add('today');
      day.setAttribute('aria-current', 'date');
    }
    if (date === selected) day.classList.add('selected');
    grid.append(day);
  }

  el.replaceChildren(head, grid);
}

function cell(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = className;
  return el;
}

function navButton(text, title, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}
