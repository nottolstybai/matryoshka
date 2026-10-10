// Прогресс игрока в localStorage.
// Формат: { days: { 'YYYY-MM-DD': { id, solved: [n…], answers: { n: слово }, hints, errors, time, done, onTime } } }
//   id      — id головоломки; если пул поменялся и дате досталась другая головоломка, запись не применяется;
//   answers — разгаданные слова: в puzzles.json их нет в открытом виде, а показывать после перезагрузки надо;
//   hints   — взятые подсказки: { n: { hint: текст, letter: буква, reveal: true } };
//   errors  — число неверных ответов;
//   time    — время решения в миллисекундах (пока вкладка была видна);
//   onTime  — факт собран в свой же день (только такие дни идут в серию).

import { dayNumber } from './daily.js';

export const KEY = 'fact-rebus:v1';

// Сырой прогресс из хранилища; null — хранилище недоступно (нет localStorage, запрещены cookies).
function read(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.days === 'object') return p;
  } catch {}
  return { days: {} };
}

// storage передаётся явно в тестах; в браузере localStorage может быть недоступен — тогда играем без сохранения.
export function loadProgress(storage = globalThis.localStorage) {
  return read(storage) ?? { days: {} };
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(progress));
  } catch {}
}

// Складывает две записи одного дня: ту, что уже лежит в хранилище (theirs), и ту, что собрала эта вкладка (mine).
// Разгаданное не пропадает ни с одной стороны; total — число ребусов в головоломке.
function mergeDay(theirs, mine, total) {
  if (!theirs || theirs.id !== mine.id) return mine;
  const solved = [...new Set([...theirs.solved, ...mine.solved])];
  const hints = { ...theirs.hints };
  for (const [id, h] of Object.entries(mine.hints ?? {})) hints[id] = { ...hints[id], ...h };
  const known = [theirs.errors, mine.errors].filter((n) => typeof n === 'number');
  return {
    ...mine,
    solved,
    answers: { ...theirs.answers, ...mine.answers },
    hints,
    errors: known.length ? Math.max(...known) : null,
    time: Math.max(theirs.time ?? 0, mine.time ?? 0),
    done: Boolean(theirs.done || mine.done || solved.length >= total),
    onTime: Boolean(theirs.onTime || mine.onTime),
  };
}

// Сохраняет запись одного дня и возвращает весь прогресс, каким он стал.
// Пишем поверх того, что лежит в хранилище сейчас, а не поверх копии, прочитанной при загрузке страницы:
// иначе вкладка, открытая с утра, стёрла бы всё, что с тех пор решено в другой.
export function saveDay(progress, date, entry, total, storage = globalThis.localStorage) {
  const fresh = read(storage) ?? progress; // без хранилища прогресс живёт в памяти вкладки
  fresh.days[date] = mergeDay(fresh.days[date], entry, total);
  saveProgress(fresh, storage);
  return fresh;
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
