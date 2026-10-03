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
