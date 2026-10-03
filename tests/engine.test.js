import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, assemble, validate, ParseError } from '../web/js/parser.js';
import { Game, normalize } from '../web/js/model.js';

// Выдуманные головоломки: ответы на настоящие дни в репозиторий не попадают.
const samplePuzzle = {
  date: '2000-01-01',
  fact: 'Ёж и кот дружат.',
  puzzle_text: '{колючий зверь из {растёт много деревьев}а} и {мурлычет и живёт в {здание для жизни}е} дружат.',
  nodes: [
    { answer: 'Ёж', clue: 'колючий зверь из {растёт много деревьев}а', depth: 1, parent: null },
    { answer: 'лес', clue: 'растёт много деревьев', depth: 2, parent: 0 },
    { answer: 'кот', clue: 'мурлычет и живёт в {здание для жизни}е', depth: 1, parent: null },
    { answer: 'дом', clue: 'здание для жизни', depth: 2, parent: 2 },
  ],
};
const deepPuzzle = {
  puzzle_text: 'Старая {a {b {c}}} стоит.',
  nodes: [{ answer: 'башня' }, { answer: 'храм' }, { answer: 'купол' }],
};
// В игре ключ ответа — SHA-256 (crypto.js); модели всё равно, поэтому в тестах ключ — normalize(ответ).
const keys = (p) => p.nodes.map((n) => normalize(n.answer));

test('parse: дерево вложенности в pre-order', () => {
  const { root, nodes } = parse('A {b {c} d} E {f}');
  assert.equal(nodes.length, 3);
  assert.deepEqual(root.children, [0, 2]);
  assert.deepEqual(nodes.map((n) => [n.depth, n.parent, n.clue]), [
    [1, null, 'b {c} d'],
    [2, 0, 'c'],
    [1, null, 'f'],
  ]);
  assert.deepEqual(nodes[0].children, [1]);
});

test('parse: ошибки баланса и пустые ребусы', () => {
  assert.throws(() => parse('a {b'), ParseError);
  assert.throws(() => parse('a b}'), ParseError);
  assert.throws(() => parse('a {} b'), ParseError);
  assert.throws(() => parse('a { {x} } b'), ParseError);
});

test('parse: текст без ребусов', () => {
  const { root, nodes } = parse('просто текст');
  assert.equal(nodes.length, 0);
  assert.deepEqual(root.parts, ['просто текст']);
});

test('assemble: ответы складываются в факт и в подсказки родителей', () => {
  const tree = parse(samplePuzzle.puzzle_text);
  const answers = samplePuzzle.nodes.map((n) => n.answer);
  assert.equal(assemble(tree.root, answers), samplePuzzle.fact);
  assert.equal(assemble(tree.nodes[2], answers), 'мурлычет и живёт в доме');
});

test('assemble: приставки и окончания вокруг скобок клеятся к ответу', () => {
  const tree = parse('по {a}ам, Те{b}галь, за{c}ом');
  assert.equal(assemble(tree.root, ['глаз', 'ле', 'бор']), 'по глазам, Телегаль, забором');
});

test('validate: образец корректен, порча ловится', () => {
  const tree = parse(samplePuzzle.puzzle_text);
  assert.deepEqual(validate(samplePuzzle, tree), []);

  const broken = structuredClone(samplePuzzle);
  broken.nodes[0].answer = 'еж';
  broken.nodes[3].parent = 0;
  assert.equal(validate(broken, tree).length, 2); // parent + ответы не складываются в факт
});

test('Game: решение строго изнутри наружу', () => {
  const tree = parse(samplePuzzle.puzzle_text);
  const game = new Game(tree, keys(samplePuzzle));
  assert.deepEqual(game.activeIds(), [1, 3]);

  assert.equal(game.guess('еж'), null, 'внешний закрыт, пока не решён внутренний');
  assert.equal(game.guess('лес'), 1);
  assert.deepEqual(game.activeIds(), [0, 3]);
  assert.equal(game.guess('еж'), 0);
  assert.equal(game.guess('доме'), null, 'засчитывается только начальная форма');
  assert.equal(game.guess('дом'), 3);
  assert.equal(game.guess('кот'), 2);
  assert.ok(game.done);
});

test('Game: подсказывает, что слово верное, но ребус закрыт', () => {
  const tree = parse(samplePuzzle.puzzle_text);
  const game = new Game(tree, keys(samplePuzzle));

  assert.equal(game.guess('еж'), null);
  assert.ok(game.isLockedAnswer('еж'));
  assert.ok(!game.isLockedAnswer('заяц'));
  assert.equal(game.guess('лес'), 1);
  assert.ok(!game.isLockedAnswer('еж'), 'после леса ребус открыт');
  assert.ok(game.isSolvedKey('лес'));
  assert.ok(!game.isSolvedKey('еж'));
});

test('Game.restore: восстанавливает прогресс, отбрасывает чужие id', () => {
  const game = new Game(parse(samplePuzzle.puzzle_text), keys(samplePuzzle));
  game.restore([1, 3, 99, -1, '0']);
  assert.deepEqual([...game.solved], [1, 3]);
  assert.deepEqual(game.activeIds(), [0, 2]);
});

test('normalize', () => {
  assert.equal(normalize('  Ёжик   в  ТУМАНЕ! '), 'ежик в тумане');
  assert.equal(normalize('«Цветы».'), 'цветы');
  assert.equal(normalize('северо-запад'), 'северо-запад');
});

test('Game: lockedAnswerId и blockers — что подсветить, когда слово верное, но ребус закрыт', () => {
  const game = new Game(parse(deepPuzzle.puzzle_text), keys(deepPuzzle));
  assert.equal(game.lockedAnswerId('башня'), 0);
  assert.equal(game.lockedAnswerId('храм'), 1);
  assert.equal(game.lockedAnswerId('купол'), null, 'купол доступен, не закрыт');
  assert.equal(game.lockedAnswerId('шпиль'), null);
  assert.deepEqual(game.blockers(0), [2], 'башню держит самый глубокий — купол');
  assert.deepEqual(game.blockers(1), [2]);
  assert.equal(game.guess('купол'), 2);
  assert.deepEqual(game.blockers(0), [1], 'теперь башню держит храм');
  assert.deepEqual(game.blockers(1), [], 'храм открыт — его ничто не держит');
});
