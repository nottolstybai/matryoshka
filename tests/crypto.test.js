import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerHash, sealAnswer, openAnswer, sealAux, openAux, newPuzzleId } from '../web/js/crypto.js';
import { sealPuzzle, upgradePuzzle } from '../tools/seal.mjs';

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

test('sealAux/openAux: запись открывается без ответа, но только своим слотом и своей головоломкой', async () => {
  const sealed = await sealAux('a', 'reveal:3', 'Мёд');
  assert.equal(await openAux('a', 'reveal:3', sealed), 'Мёд');
  await assert.rejects(openAux('a', 'reveal:4', sealed), 'чужой номер узла');
  await assert.rejects(openAux('a', 'hint:3', sealed), 'чужой вид записи');
  await assert.rejects(openAux('b', 'reveal:3', sealed), 'чужая головоломка');
  await assert.rejects(openAnswer('a', 'мед', sealed), 'ключ ответа эту запись не открывает');
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
  assert.equal(await openAux(p.id, 'reveal:1', p.nodes[1].reveal), 'лес', 'слово для «открыть слово»');
  assert.ok(!('hint' in p.nodes[0]), 'без доп. подсказки в исходнике поля hint нет');
});

test('sealPuzzle/upgradePuzzle: подсказки шифруются, старый день дополняется без смены id', async () => {
  const plain = {
    date: '2000-01-01',
    fact: 'Ёж живёт в лесу.',
    puzzle_text: '{колючий зверь} живёт в {растёт много деревьев}у.',
    nodes: [
      { answer: 'Ёж', clue: 'колючий зверь', depth: 1, parent: null },
      { answer: 'лес', clue: 'растёт много деревьев', depth: 1, parent: null },
    ],
  };
  // Старый формат: только hash и sealed.
  const old = await sealPuzzle(plain);
  for (const n of old.nodes) delete n.reveal;
  const snapshot = structuredClone(old);

  const withHints = structuredClone(plain);
  withHints.nodes[1].hint = 'там грибы и леший';
  assert.equal(await upgradePuzzle(old, withHints), 2);
  assert.equal(old.id, snapshot.id);
  assert.equal(old.nodes[0].hash, snapshot.nodes[0].hash);
  assert.equal(old.nodes[0].sealed, snapshot.nodes[0].sealed);
  assert.equal(await openAux(old.id, 'reveal:0', old.nodes[0].reveal), 'Ёж');
  assert.equal(await openAux(old.id, 'hint:1', old.nodes[1].hint), 'там грибы и леший');
  assert.ok(!JSON.stringify(old).includes('леший'));
  assert.equal(await upgradePuzzle(old, withHints), 0, 'повторный запуск ничего не меняет');

  const wrong = structuredClone(withHints);
  wrong.nodes[0].answer = 'Ежик';
  await assert.rejects(upgradePuzzle(old, wrong), /не совпадает с напечатанным/);
});

test('sealPuzzle: битая головоломка не печатается', async () => {
  const plain = { date: '2000-01-01', fact: 'Ёж живёт.', puzzle_text: '{колючий зверь} живёт.', nodes: [{ answer: 'Еж', clue: 'колючий зверь', depth: 1, parent: null }] };
  await assert.rejects(sealPuzzle(plain), /не складываются в факт/);
  await assert.rejects(sealPuzzle({ ...plain, date: '2000-13-01' }), /плохая дата/);
  await assert.rejects(sealPuzzle({ ...plain, puzzle_text: '{колючий зверь живёт.' }), /Незакрытая скобка/);
});
