import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../web/js/tokens.js';

test('tokenize: обычный текст по словам, пробелы отдельно', () => {
  assert.deepEqual(tokenize('Медоносная ', false, true), { pre: '', words: ['Медоносная', ' '], post: '' });
  assert.deepEqual(tokenize(' умеет узнавать ', true, true), { pre: '', words: [' ', 'умеет', ' ', 'узнавать', ' '], post: '' });
  assert.deepEqual(tokenize('просто текст', false, false), { pre: '', words: ['просто', ' ', 'текст'], post: '' });
});

test('tokenize: окончание после скобки — хвост предыдущего ребуса', () => {
  assert.deepEqual(tokenize('ам.', true, false), { pre: 'ам.', words: [], post: '' });
  assert.deepEqual(tokenize('у умеет', true, false), { pre: 'у', words: [' ', 'умеет'], post: '' });
  assert.deepEqual(tokenize(' не портится', true, false), { pre: '', words: [' ', 'не', ' ', 'портится'], post: '' });
});

test('tokenize: приставка перед скобкой — хвост следующего ребуса', () => {
  assert.deepEqual(tokenize(', Те', true, true), { pre: ',', words: [' '], post: 'Те' });
  assert.deepEqual(tokenize('за', false, true), { pre: '', words: [], post: 'за' });
  assert.deepEqual(tokenize('по ', false, true), { pre: '', words: ['по', ' '], post: '' });
});

test('tokenize: текст без пробелов между двумя ребусами уходит в окончание', () => {
  assert.deepEqual(tokenize('xyz', true, true), { pre: 'xyz', words: [], post: '' });
  assert.deepEqual(tokenize(' ', true, true), { pre: '', words: [' '], post: '' });
  assert.deepEqual(tokenize('', true, true), { pre: '', words: [], post: '' });
});
