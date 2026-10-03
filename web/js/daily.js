// Выбор головоломки по дате. Даты — строки YYYY-MM-DD в локальном времени устройства.

const pad = (n) => String(n).padStart(2, '0');

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && localDate(parseDate(s)) === s;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Номер дня, считается через UTC, чтобы переход на летнее время не сбивал разницу.
export function dayNumber(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

// Головоломка с точной датой, а если её нет — по кругу от самой ранней даты,
// чтобы игра не пустела, когда пул закончился.
export function pickPuzzle(puzzles, date) {
  if (!puzzles.length) return null;
  const exact = puzzles.find((p) => p.date === date);
  if (exact) return exact;
  const sorted = [...puzzles].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const i = dayNumber(date) - dayNumber(sorted[0].date);
  return sorted[((i % n) + n) % n];
}
