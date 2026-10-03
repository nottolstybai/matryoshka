import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress, dayEntry, dayStatus, stats } from '../web/js/progress.js';
import { monthDays } from '../web/js/calendar.js';

const memoryStorage = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

const done = (onTime = true) => ({ fact: 'f', solved: [0], done: true, onTime });

test('loadProgress/saveProgress: туда и обратно', () => {
  const storage = memoryStorage();
  const p = loadProgress(storage);
  assert.deepEqual(p, { days: {} });
  p.days['2026-10-03'] = done();
  saveProgress(p, storage);
  assert.deepEqual(loadProgress(storage), p);
});

test('loadProgress: мусор и недоступное хранилище не роняют игру', () => {
  assert.deepEqual(loadProgress(memoryStorage({ 'fact-rebus:v1': '{не json' })), { days: {} });
  assert.deepEqual(loadProgress(memoryStorage({ 'fact-rebus:v1': '42' })), { days: {} });
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.deepEqual(loadProgress(broken), { days: {} });
  assert.doesNotThrow(() => saveProgress({ days: {} }, broken));
});

test('dayEntry: запись чужой головоломки не применяется', () => {
  const p = { days: { '2026-10-03': done() } };
  assert.ok(dayEntry(p, '2026-10-03', 'f'));
  assert.equal(dayEntry(p, '2026-10-03', 'другой факт'), null);
  assert.equal(dayEntry(p, '2026-10-04', 'f'), null);
});

test('dayStatus', () => {
  const p = { days: { a: done(), b: { fact: 'f', solved: [1], done: false }, c: { fact: 'f', solved: [], done: false } } };
  assert.equal(dayStatus(p, 'a'), 'done');
  assert.equal(dayStatus(p, 'b'), 'started');
  assert.equal(dayStatus(p, 'c'), null);
  assert.equal(dayStatus(p, 'нет'), null);
});

test('stats: серии считаются только по дням, решённым вовремя', () => {
  const p = {
    days: {
      '2026-09-25': done(),
      '2026-09-26': done(),
      '2026-09-27': done(),
      '2026-09-29': done(false), // из архива — в total, но не в серию
      '2026-10-01': done(),
      '2026-10-02': done(),
      '2026-10-03': { fact: 'f', solved: [0], done: false },
    },
  };
  assert.deepEqual(stats(p, '2026-10-03'), { total: 6, streak: 2, best: 3 }, 'сегодня ещё не решено — серия от вчера');
  assert.deepEqual(stats(p, '2026-10-04'), { total: 6, streak: 0, best: 3 }, 'пропущен день — серия обнулилась');
  p.days['2026-10-03'] = done();
  assert.equal(stats(p, '2026-10-03').streak, 3);
  assert.deepEqual(stats({ days: {} }, '2026-10-03'), { total: 0, streak: 0, best: 0 });
});

test('monthDays: неделя с понедельника', () => {
  const oct = monthDays(2026, 9); // 1 октября 2026 — четверг
  assert.deepEqual(oct.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(oct.filter(Boolean).length, 31);
  assert.equal(oct.at(-1), '2026-10-31');
  assert.equal(monthDays(2026, 1).filter(Boolean).length, 28);
  assert.equal(monthDays(2026, 5)[0], '2026-06-01', '1 июня 2026 — понедельник, без отступа');
});
