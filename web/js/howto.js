// Окно «Как играть»: правила и мини-ребус из одного слова на том же движке.
// При первом визите открывается само; кнопка «Как играть» открывает его снова.

import { parse } from './parser.js';
import { Game } from './model.js';
import { render, collapse, shake, finished } from './render.js';
import { answerHash } from './crypto.js';

const SEEN_KEY = 'fact-rebus:howto';
// Пример не секретный, поэтому ответ лежит открыто; проверка идёт тем же путём, что в игре.
const EXAMPLE = { id: 'howto', puzzle_text: 'Мыши боятся {домашний зверь, который мурлычет}ов.', answer: 'кот' };

const $ = (sel) => document.querySelector(sel);

function seen(store) {
  try {
    return store?.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(store) {
  try {
    store?.setItem(SEEN_KEY, '1');
  } catch {}
}

// store — localStorage или null; onClose вызывается после закрытия окна.
export async function setupHowto(store, onClose) {
  const dialog = $('#howto');
  const board = $('#howto-board');
  const form = $('#howto-form');
  const input = $('#howto-guess');
  const status = $('#howto-status');
  const done = $('#howto-done');
  const exampleKey = await answerHash(EXAMPLE.id, EXAMPLE.answer);
  let game;
  let closing = false;

  const reset = () => {
    game = new Game(parse(EXAMPLE.puzzle_text), [exampleKey]);
    render(board, game);
    input.value = '';
    input.disabled = false;
    status.textContent = '';
    status.className = 'status';
    done.textContent = 'Пропустить';
    done.classList.remove('primary');
  };

  const open = () => {
    reset();
    closing = false;
    dialog.showModal();
    input.focus();
  };

  // Закрытие с короткой анимацией; повторные вызовы во время неё игнорируются.
  // Все пути закрытия (кнопка, Esc, клик по фону) идут сюда: на событие 'close' не полагаемся —
  // в фоновой вкладке Chrome его не присылает.
  const close = async () => {
    if (closing || !dialog.open) return;
    closing = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await finished(dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 180, easing: 'ease-in' }));
    }
    dialog.close();
    markSeen(store);
    onClose();
  };

  // Esc и клик по фону закрывают окно той же анимацией.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  done.addEventListener('click', close);
  $('#howto-open').addEventListener('click', open);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (game.done || !input.value.trim()) return;
    const key = await answerHash(EXAMPLE.id, input.value);
    if (game.done) return; // пока считался хеш, пример уже решили предыдущей отправкой
    const id = game.guess(key);
    if (id === null) {
      status.textContent = 'Не подходит. Подсказка: он говорит «мяу».';
      status.className = 'status bad';
      shake(input);
      input.select();
      return;
    }
    game.answers[id] = EXAMPLE.answer;
    input.value = '';
    input.disabled = true;
    status.textContent = 'Верно! «кот» + «ов» = «котов». Так решаются все ребусы.';
    status.className = 'status ok';
    collapse(board, game, id);
    done.textContent = 'Играть';
    done.classList.add('primary');
    done.focus();
  });

  if (!seen(store)) open();
}
