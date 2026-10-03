import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict, formatTime } from '../web/js/result.js';

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
