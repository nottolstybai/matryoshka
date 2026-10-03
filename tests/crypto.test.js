import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerHash, sealAnswer, openAnswer, newPuzzleId } from '../web/js/crypto.js';
import { sealPuzzle } from '../tools/seal.mjs';

test('answerHash: регистр, ё и знаки препинания не важны, соль важна', async () => {
  const h = await answerHash('a', 'Ёж');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await answerHash('a', ' еж! '), h);
  assert.notEqual(await answerHash('b', 'Ёж'), h, 'разные дни — разные хеши');
  assert.notEqual(await answerHash('a', 'ежи'), h);
});

test('sealAnswer/openAnswer: слово открывается только правильным ответом', async () => {
  const sealed = await sealAnswer('a', 'Мёд');
  assert.equal(await openAnswer('a', 'мед', sealed), 'Мёд', 'показывается исходная форма с ё и заглавной');
  await assert.rejects(openAnswer('a', 'сахар', sealed));
  await assert.rejects(openAnswer('b', 'мед', sealed), 'чужая соль не подходит');
  assert.notEqual(await sealAnswer('a', 'Мёд'), sealed, 'случайный iv — шифр каждый раз разный');
});

test('newPuzzleId: случайный', () => {
  assert.notEqual(newPuzzleId(), newPuzzleId());
});

test('sealPuzzle: печатает без ответов и факта, хеши проверяют ввод', async () => {
  const plain = {
    date: '2000-01-01',
    fact: 'Ёж живёт в лесу.',
    puzzle_text: '{колючий зверь} живёт в {растёт много деревьев}у.',
    nodes: [
      { answer: 'Ёж', clue: 'колючий зверь', depth: 1, parent: null },
      { answer: 'лес', clue: 'растёт много деревьев', depth: 1, parent: null },
    ],
  };
  const p = await sealPuzzle(plain);
  assert.deepEqual(Object.keys(p).sort(), ['date', 'id', 'nodes', 'puzzle_text']);
  assert.ok(!JSON.stringify(p).includes('Ёж') && !JSON.stringify(p).includes('лес'));
  assert.equal(p.nodes[1].hash, await answerHash(p.id, 'ЛЕС'));
  assert.equal(await openAnswer(p.id, 'еж', p.nodes[0].sealed), 'Ёж');
});

test('sealPuzzle: битая головоломка не печатается', async () => {
  const plain = { date: '2000-01-01', fact: 'Ёж живёт.', puzzle_text: '{колючий зверь} живёт.', nodes: [{ answer: 'Еж', clue: 'колючий зверь', depth: 1, parent: null }] };
  await assert.rejects(sealPuzzle(plain), /не складываются в факт/);
  await assert.rejects(sealPuzzle({ ...plain, date: '2000-13-01' }), /плохая дата/);
  await assert.rejects(sealPuzzle({ ...plain, puzzle_text: '{колючий зверь живёт.' }), /Незакрытая скобка/);
});
