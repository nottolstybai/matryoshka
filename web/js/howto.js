// Окно «Как играть»: правила и мини-ребус из одного слова на том же движке.
// При первом визите открывается само; кнопка «Как играть» открывает его снова.

import { parse } from './parser.js';
import { Game } from './model.js';
import { render, collapse, shake } from './render.js';

const SEEN_KEY = 'fact-rebus:howto';
const EXAMPLE = {
  puzzle_text: 'Мыши боятся {домашний зверь, который мурлычет}ов.',
  nodes: [{ answer: 'кот' }],
};

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
export function setupHowto(store, onClose) {
  const dialog = $('#howto');
  const board = $('#howto-board');
  const form = $('#howto-form');
  const input = $('#howto-guess');
  const status = $('#howto-status');
  const done = $('#howto-done');
  let game;
  let closing = false;

  const reset = () => {
    game = new Game(parse(EXAMPLE.puzzle_text), EXAMPLE.nodes);
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
  const close = async () => {
    if (closing || !dialog.open) return;
    closing = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const anim = dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 180, easing: 'ease-in' });
      await anim.finished.catch(() => {});
    }
    dialog.close();
  };

  dialog.addEventListener('close', () => {
    markSeen(store);
    onClose();
  });
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (game.done || !input.value.trim()) return;
    const id = game.guess(input.value);
    if (id === null) {
      status.textContent = 'Не подходит. Подсказка: он говорит «мяу».';
      status.className = 'status bad';
      shake(input);
      input.select();
      return;
    }
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
