// Прогресс игрока в localStorage.
// Формат: { days: { 'YYYY-MM-DD': { id, solved: [n…], answers: { n: слово }, done, onTime } } }
//   id      — id головоломки; если пул поменялся и дате досталась другая головоломка, запись не применяется;
//   answers — разгаданные слова: в puzzles.json их нет в открытом виде, а показывать после перезагрузки надо;
//   onTime  — факт собран в свой же день (только такие дни идут в серию).

import { dayNumber } from './daily.js';

const KEY = 'fact-rebus:v1';

// storage передаётся явно в тестах; в браузере localStorage может быть недоступен — тогда играем без сохранения.
export function loadProgress(storage = globalThis.localStorage) {
  try {
    const p = JSON.parse(storage.getItem(KEY));
    if (p && typeof p.days === 'object') return p;
  } catch {}
  return { days: {} };
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(progress));
  } catch {}
}

// Запись дня, если она относится к этой же головоломке.
export function dayEntry(progress, date, id) {
  const e = progress.days[date];
  return e && e.id === id ? e : null;
}

export function dayStatus(progress, date) {
  const e = progress.days[date];
  if (!e) return null;
  return e.done ? 'done' : e.solved.length ? 'started' : null;
}

export function stats(progress, today) {
  const done = Object.entries(progress.days).filter(([, e]) => e.done);
  const days = new Set(done.filter(([, e]) => e.onTime).map(([d]) => dayNumber(d)));

  // Текущая серия считается от сегодня, а если сегодня ещё не решено — от вчера.
  let streak = 0;
  let d = dayNumber(today);
  if (!days.has(d)) d--;
  while (days.has(d)) {
    streak++;
    d--;
  }

  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of [...days].sort((a, b) => a - b)) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }

  return { total: done.length, streak, best };
}
