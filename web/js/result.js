// Итог дня: словесная оценка сборки. Чем меньше помощи понадобилось, тем она выше.
//   total — число ребусов; errors — неверные ответы (null, если день решён до появления счётчика);
//   hints — текстовые подсказки; letters — первые буквы; reveals — слова, открытые целиком.
export function verdict({ total, errors, hints, letters, reveals }) {
  const help = hints + letters;
  if (reveals === 0 && help === 0) return (errors ?? 0) <= 1 ? 'Собрано чисто' : 'Собрано без подсказок';
  if (reveals === 0) return help <= Math.ceil(total / 4) ? 'Собрано почти без подсказок' : 'Собрано с подсказками';
  if (reveals < total / 2) return 'Собрано с помощью';
  return 'Факт открыт, а не разгадан';
}

// Время как 03:07; минуты не ограничены часом (75:10).
export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Текст для «Поделиться»: без спойлеров — только дата, оценка и цифры.
//   date — подпись дня («3 октября»); time — мс или 0, если неизвестно; streak — серия (0, если не показывать);
//   url — ссылка на этот день. Нулевые показатели не перечисляются.
export function shareText({ date, result, time, streak, url }) {
  const details = [];
  if (time > 0) details.push(formatTime(time));
  if (result.errors) details.push(`ошибок: ${result.errors}`);
  const help = result.hints + result.letters;
  if (help) details.push(`подсказок: ${help}`);
  if (result.reveals) details.push(`открыто слов: ${result.reveals}`);
  const lines = [`Матрёшка · ${date}`, [verdict(result), ...details].join(' · ')];
  if (streak >= 2) lines.push(`Серия: ${streak} дн.`);
  lines.push(url);
  return lines.join('\n');
}
