import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, validate } from '../web/js/parser.js';
import { localDate, isDate, dayNumber, pickPuzzle } from '../web/js/daily.js';

const puzzles = JSON.parse(readFileSync(new URL('../web/data/puzzles.json', import.meta.url), 'utf8'));

test('puzzles.json: каждая головоломка валидна, даты уникальны', () => {
  for (const p of puzzles) {
    assert.ok(isDate(p.date), `плохая дата ${p.date}`);
    assert.deepEqual(validate(p, parse(p.puzzle_text)), [], p.date);
  }
  assert.equal(new Set(puzzles.map((p) => p.date)).size, puzzles.length);
});

test('localDate берёт локальную дату, а не UTC', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDate(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('isDate', () => {
  assert.ok(isDate('2026-02-28'));
  assert.ok(!isDate('2026-02-30'));
  assert.ok(!isDate('2026-1-5'));
  assert.ok(!isDate('завтра'));
});

test('dayNumber не сбивается на переходе времени', () => {
  assert.equal(dayNumber('2026-03-30') - dayNumber('2026-03-29'), 1);
  assert.equal(dayNumber('2027-01-01') - dayNumber('2026-12-31'), 1);
});

test('pickPuzzle: точная дата, иначе по кругу', () => {
  const pool = [{ date: '2026-10-03' }, { date: '2026-10-01' }, { date: '2026-10-02' }];
  assert.equal(pickPuzzle(pool, '2026-10-02').date, '2026-10-02');
  assert.equal(pickPuzzle(pool, '2026-10-04').date, '2026-10-01'); // +3 дня от начала → по кругу
  assert.equal(pickPuzzle(pool, '2026-10-05').date, '2026-10-02');
  assert.equal(pickPuzzle(pool, '2026-09-30').date, '2026-10-03'); // раньше пула — тоже по кругу
  assert.equal(pickPuzzle([], '2026-10-01'), null);
});
