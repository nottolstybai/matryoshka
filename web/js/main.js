import { parse } from './parser.js';
import { Game } from './model.js';
import { answerHash, openAnswer } from './crypto.js';
import { render, collapse, nudge, reveal, celebrate, shake } from './render.js';
import { localDate, isDate, parseDate, pickPuzzle } from './daily.js';
import { loadProgress, saveProgress, dayEntry, dayStatus, stats } from './progress.js';
import { renderCalendar } from './calendar.js';
import { setupHowto } from './howto.js';

const $ = (sel) => document.querySelector(sel);

async function loadPuzzles() {
  const res = await fetch('data/puzzles.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не удалось загрузить puzzles.json: HTTP ${res.status}`);
  return res.json();
}

// Дата из ?date=YYYY-MM-DD (архив); будущие дни и дни до первой головоломки не открываем.
function chosenDate(today, first) {
  const q = new URLSearchParams(location.search).get('date');
  return q && isDate(q) && q >= first && q <= today ? q : today;
}

// Сам доступ к localStorage может бросить SecurityError (запрещены cookies) — тогда играем без сохранения.
function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const fmtDate = (date) => parseDate(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function showStats(progress, today) {
  const s = stats(progress, today);
  $('#stat-total').textContent = s.total;
  $('#stat-streak').textContent = s.streak;
  $('#stat-best').textContent = s.best;
  return s;
}

function showCalendar(progress, { first, today, selected }) {
  const d = parseDate(selected);
  const view = { year: d.getFullYear(), month: d.getMonth() };
  const draw = () => renderCalendar($('#calendar'), { view, first, today, selected, progress, onNav });
  const onNav = (delta) => {
    const m = new Date(view.year, view.month + delta, 1);
    view.year = m.getFullYear();
    view.month = m.getMonth();
    draw();
  };
  draw();
  return draw;
}

function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

// Точки прогресса: по одной на ребус, слева направо закрашиваются по числу разгаданных.
function showProgress(game) {
  const dots = $('#progress .dots');
  const total = game.tree.nodes.length;
  if (dots.childElementCount !== total) dots.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
  [...dots.children].forEach((dot, i) => dot.classList.toggle('on', i < game.solved.size));
  $('#count').textContent = game.done ? 'Всё разгадано' : `${game.solved.size} из ${total}`;
}

function start(puzzle, date, today, progress, redrawCalendar, store) {
  const tree = parse(puzzle.puzzle_text);
  if (tree.nodes.length !== puzzle.nodes.length) throw new Error('Головоломка битая: число ребусов не совпадает с ответами');

  const game = new Game(tree, puzzle.nodes.map((n) => n.hash));
  // Восстанавливаем только узлы, для которых сохранено слово: без него нечего показать.
  const entry = dayEntry(progress, date, puzzle.id);
  const saved = entry?.answers ?? {};
  game.restore((entry?.solved ?? []).filter((id) => typeof saved[id] === 'string'));
  for (const id of game.solved) game.answers[id] = saved[id];

  const board = $('#board');
  const input = $('#guess');
  const form = $('#guess-form');
  const isToday = date === today;

  $('#day').textContent = fmtDate(date);
  $('#day').dateTime = date;
  $('#kicker').textContent = isToday ? 'Факт дня' : 'Из архива';
  $('#to-today').hidden = isToday;

  const save = () => {
    const prev = dayEntry(progress, date, puzzle.id);
    progress.days[date] = {
      id: puzzle.id,
      solved: [...game.solved],
      answers: Object.fromEntries([...game.solved].map((id) => [id, game.answers[id]])),
      done: game.done,
      onTime: prev?.onTime || (game.done && localDate() === date),
    };
    saveProgress(progress, store);
  };

  // Финал: поле проявляется целиком, статистика и короткая карточка.
  const finish = (animated) => {
    input.disabled = true;
    input.value = '';
    input.placeholder = 'Факт уже собран';
    form.querySelector('button').disabled = true;
    const s = showStats(progress, today);
    const finale = $('#finale');
    $('#finale-text').textContent = isToday
      ? `Решено фактов: ${s.total} · серия: ${s.streak}. Завтра будет новый факт.`
      : `Решено фактов: ${s.total}. Это факт из архива — серия считается только за свой день.`;
    if (!animated) {
      board.classList.add('done');
      finale.hidden = false;
      return;
    }
    reveal(board).then(() => {
      finale.hidden = false;
      celebrate(board);
    });
  };

  render(board, game);
  showProgress(game);
  showStats(progress, today);
  if (game.done) {
    finish(false);
    setStatus('Этот факт уже собран.', 'ok');
  } else {
    setStatus(game.solved.size ? 'Продолжайте: подсвеченные ребусы открыты.' : 'Начните с подсвеченных ребусов. Ответ — слово в начальной форме.');
    input.focus({ preventScroll: true });
  }

  // Проверка ввода асинхронная (хеш и расшифровка), поэтому отправки идут строго по очереди.
  const check = async (value) => {
    if (game.done) return;
    const key = await answerHash(puzzle.id, value);
    const id = game.guess(key);
    if (id === null) {
      const locked = game.lockedAnswerId(key);
      if (locked !== null) {
        setStatus('Слово верное, но этот ребус ещё закрыт — сначала разгадайте вложенный.', 'hint');
        nudge(board, game.blockers(locked));
      } else if (game.isSolvedKey(key)) {
        setStatus('Это слово уже разгадано.', 'hint');
      } else {
        setStatus('Не подходит. Попробуйте другое слово.', 'bad');
        shake(input);
      }
      if (input.value.trim() === value) input.select();
      return;
    }

    try {
      game.answers[id] = await openAnswer(puzzle.id, value, puzzle.nodes[id].sealed);
    } catch (err) {
      game.solved.delete(id); // хеш сошёлся, а шифр нет — данные битые, не засчитываем
      throw err;
    }
    if (input.value.trim() === value) input.value = '';
    const before = dayStatus(progress, date);
    save();
    if (dayStatus(progress, date) !== before) redrawCalendar();
    showProgress(game);
    setStatus(`Верно — «${game.answers[id]}»!`, 'ok');
    // Финал запускает только последний разгаданный ребус, даже если анимации идут внахлёст.
    const last = game.done;
    collapse(board, game, id).then(() => {
      if (last) finish(true);
    });
  };

  let queue = Promise.resolve();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (game.done) return;
    const value = input.value.trim();
    if (!value) {
      setStatus('Введите слово в начальной форме — ответ на подсвеченный ребус.', 'hint');
      input.focus();
      return;
    }
    queue = queue
      .then(() => check(value))
      .catch((err) => {
        console.error(err);
        setStatus('Не получилось проверить ответ. Обновите страницу.', 'bad');
      });
  });
}

async function main() {
  try {
    // crypto.subtle есть только в защищённом контексте: https или localhost.
    if (!globalThis.crypto?.subtle) throw new Error('Игра работает только по https или на localhost.');
    const puzzles = await loadPuzzles();
    if (!puzzles.length) throw new Error('В puzzles.json нет головоломок');
    const today = localDate();
    const first = puzzles.map((p) => p.date).sort()[0];
    const date = chosenDate(today, first);
    const store = storage();
    const progress = loadProgress(store);
    const redrawCalendar = showCalendar(progress, { first, today, selected: date });
    start(pickPuzzle(puzzles, date), date, today, progress, redrawCalendar, store);
    setupHowto(store, () => {
      if (!$('#guess').disabled) $('#guess').focus({ preventScroll: true });
    });
  } catch (err) {
    setStatus(location.protocol === 'file:' ? 'Откройте игру через локальный сервер: make dev' : err.message, 'bad');
    $('#guess').disabled = true;
    console.error(err);
  }
}

main();
