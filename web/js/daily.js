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

// Головоломка этой даты или null. Чужую под дату не подставляем: игрок принял бы её за новую.
export function pickPuzzle(puzzles, date) {
  return puzzles.find((p) => p.date === date) ?? null;
}

// Последний вышедший день: самая поздняя дата пула не позже today. Когда пул кончился,
// игра открывает его, а не пустую страницу. null — ещё ничего не вышло.
export function latestDate(puzzles, today) {
  return puzzles.map((p) => p.date).filter((d) => d <= today).sort().at(-1) ?? null;
}
