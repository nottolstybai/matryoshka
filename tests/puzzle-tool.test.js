import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromDraft, nextDate } from '../tools/puzzle.mjs';

// Черновик из 13 ребусов: 6 верхних, у каждого вложенный, у первого вложенного — ещё один (третий уровень).
const TOPS = ['альфа', 'бета', 'гамма', 'дельта', 'эпсилон', 'зета'];
const KIDS = ['йота', 'каппа', 'лямбда', 'омикрон', 'сигма', 'тау'];
const intro = 'Это очень длинный выдуманный факт для проверки скрипта, в нём должно быть достаточно слов,';
const outro = 'и ещё немного обычного текста в конце, чтобы длина факта была как у настоящих.';
function draft() {
  const rebus = (i) => {
    const deep = i === 0 ? ' и {третий уровень|омега}ом' : '';
    return `{подсказка номер ${i + 1} с {вложенная подсказка${deep}|${KIDS[i]}}ом|${TOPS[i]}}`;
  };
  return {
    topic: 'греческие буквы',
    domain: 'математика',
    fact: `${intro} ${TOPS.join(' ')} ${outro}`,
    text: `${intro} ${TOPS.map((_, i) => rebus(i)).join(' ')} ${outro}`,
  };
}

test('fromDraft: черновик превращается в авторский формат', () => {
  const r = fromDraft(draft(), { date: '2030-01-01' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.stats, { rebuses: 13, top: 6, nested: 7, maxDepth: 3, factLength: r.source.fact.length });
  assert.ok(!r.source.puzzle_text.includes('|'));
  assert.ok(!r.source.puzzle_text.includes('альфа'));
  assert.deepEqual(r.source.nodes[0], { answer: 'альфа', clue: 'подсказка номер 1 с {вложенная подсказка и {третий уровень}ом}ом', depth: 1, parent: null });
  assert.deepEqual(r.source.nodes[2], { answer: 'омега', clue: 'третий уровень', depth: 3, parent: 1 });
});

test('fromDraft: ловит типичные ошибки и не показывает ответы', () => {
  const noAnswer = draft();
  noAnswer.text = noAnswer.text.replace('|йота}', '}');
  assert.match(fromDraft(noAnswer).errors.join(), /ребус #2 .*нет «\|ответ»/);

  const wrongFact = draft();
  wrongFact.fact = wrongFact.fact.replace('бета', 'бэта');
  const errors = fromDraft(wrongFact).errors.join();
  assert.match(errors, /не складываются ровно в fact/);
  assert.ok(!errors.includes('альфа'), 'в сообщениях нет ответов');

  const giveaway = draft();
  giveaway.text = giveaway.text.replace('подсказка номер 3', 'подсказка про гаммаизлучение');
  assert.match(fromDraft(giveaway).errors.join(), /ребус #6 .*спрятан внутри слова/);

  const twoWords = draft();
  twoWords.text = twoWords.text.replace('|зета}', '|зета два}');
  twoWords.fact = twoWords.fact.replace('зета', 'зета два');
  assert.match(fromDraft(twoWords).errors.join(), /одним словом/);

  const small = { ...draft(), text: '{короткий|факт}.', fact: 'факт.' };
  const smallErrors = fromDraft(small).errors.join();
  assert.match(smallErrors, /ребусов 1/);
  assert.match(smallErrors, /нет вложенных/);
  assert.match(smallErrors, /факт короткий/);

  assert.match(fromDraft({ ...draft(), domain: '' }).errors.join(), /нет поля «domain»/);
  assert.match(fromDraft(draft(), { knownFacts: [draft().fact] }).errors.join(), /уже есть в пуле/);
});

test('nextDate: после последней даты пула, но не раньше сегодня', () => {
  const pool = [{ date: '2026-10-05' }, { date: '2026-10-03' }];
  assert.equal(nextDate(pool, '2026-10-03'), '2026-10-06');
  assert.equal(nextDate(pool, '2026-10-20'), '2026-10-20');
  assert.equal(nextDate([{ date: '2026-12-31' }], '2026-10-03'), '2027-01-01');
  assert.equal(nextDate([], '2026-10-03'), '2026-10-03');
});
