import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict, formatTime, shareText } from '../web/js/result.js';

test('verdict: оценка падает с количеством помощи', () => {
  const base = { total: 16, errors: 0, hints: 0, letters: 0, reveals: 0 };
  assert.equal(verdict(base), 'Собрано чисто');
  assert.equal(verdict({ ...base, errors: 1 }), 'Собрано чисто', 'одна ошибка прощается');
  assert.equal(verdict({ ...base, errors: 5 }), 'Собрано без подсказок');
  assert.equal(verdict({ ...base, errors: null }), 'Собрано чисто', 'старый день без счётчика ошибок');
  assert.equal(verdict({ ...base, hints: 2, letters: 2 }), 'Собрано почти без подсказок', 'до четверти ребусов');
  assert.equal(verdict({ ...base, hints: 3, letters: 2 }), 'Собрано с подсказками');
  assert.equal(verdict({ ...base, reveals: 7 }), 'Собрано с помощью');
  assert.equal(verdict({ ...base, reveals: 8 }), 'Факт открыт, а не разгадан', 'половина слов открыта');
});

test('formatTime', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(22_900), '00:22');
  assert.equal(formatTime(187_000), '03:07');
  assert.equal(formatTime(75 * 60_000 + 10_000), '75:10');
});

test('shareText: без спойлеров, нулевые показатели не перечисляются', () => {
  const clean = { total: 16, errors: 0, hints: 0, letters: 0, reveals: 0 };
  assert.equal(
    shareText({ date: '3 октября', result: clean, time: 252_000, streak: 3, url: 'https://example.com/?date=2026-10-03' }),
    'Матрёшка · 3 октября\nСобрано чисто · 04:12\nСерия: 3 дн.\nhttps://example.com/?date=2026-10-03',
  );
  assert.equal(
    shareText({ date: '1 октября', result: { total: 16, errors: 4, hints: 1, letters: 2, reveals: 1 }, time: 0, streak: 1, url: 'u' }),
    'Матрёшка · 1 октября\nСобрано с помощью · ошибок: 4 · подсказок: 3 · открыто слов: 1\nu',
    'без времени и без серии из одного дня',
  );
});
