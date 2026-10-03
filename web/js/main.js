import { parse } from './parser.js';
import { Game } from './model.js';
import { answerHash, openAnswer } from './crypto.js';
import { render, collapse, nudge, reveal, celebrate, shake } from './render.js';
import { localDate, isDate, parseDate, pickPuzzle } from './daily.js';
import { loadProgress, saveProgress, dayEntry, dayStatus, stats } from './progress.js';
import { renderCalendar } from './calendar.js';
import { setupHowto } from './howto.js';
import { setupThemeToggle } from './theme.js';

const $ = (sel) => document.querySelector(sel);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Фокус в поле ставим сами только при мыши: на телефоне он открыл бы клавиатуру без спроса.
const autofocus = () => matchMedia('(pointer: fine)').matches;

// Общее на всю страницу: пул, даты, прогресс. Заполняется один раз в main().
const ctx = { puzzles: [], today: '', first: '', progress: { days: {} }, store: null };
// Открытый день. При переключении дня заменяется целиком; всё асинхронное
// сверяет, что его день ещё открыт, — иначе результат не применяется.
let day = null;
const cal = { view: { year: 0, month: 0 }, selected: '' };

async function loadPuzzles() {
  const res = await fetch('data/puzzles.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не удалось загрузить puzzles.json: HTTP ${res.status}`);
  return res.json();
}

// Дата из ?date=YYYY-MM-DD (архив); будущие дни и дни до первой головоломки не открываем.
function chosenDate() {
  const q = new URLSearchParams(location.search).get('date');
  return q && isDate(q) && q >= ctx.first && q <= ctx.today ? q : ctx.today;
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

function showStats() {
  const s = stats(ctx.progress, ctx.today);
  $('#stat-total').textContent = s.total;
  $('#stat-streak').textContent = s.streak;
  $('#stat-best').textContent = s.best;
  return s;
}

function drawCalendar() {
  renderCalendar($('#calendar'), { view: cal.view, first: ctx.first, today: ctx.today, selected: cal.selected, progress: ctx.progress, onNav });
}

function onNav(delta) {
  const m = new Date(cal.view.year, cal.view.month + delta, 1);
  cal.view = { year: m.getFullYear(), month: m.getMonth() };
  drawCalendar();
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

function save(d) {
  const prev = dayEntry(ctx.progress, d.date, d.puzzle.id);
  ctx.progress.days[d.date] = {
    id: d.puzzle.id,
    solved: [...d.game.solved],
    answers: Object.fromEntries([...d.game.solved].map((id) => [id, d.game.answers[id]])),
    done: d.game.done,
    onTime: prev?.onTime || (d.game.done && localDate() === d.date),
  };
  saveProgress(ctx.progress, ctx.store);
}

// Финал: поле проявляется целиком, статистика и короткая карточка.
function finish(d, animated) {
  if (d !== day) return;
  const input = $('#guess');
  input.disabled = true;
  input.value = '';
  input.placeholder = 'Факт уже собран';
  $('#guess-form button').disabled = true;
  const s = showStats();
  $('#finale-text').textContent = d.date === ctx.today
    ? `Решено фактов: ${s.total} · серия: ${s.streak}. Завтра будет новый факт.`
    : `Решено фактов: ${s.total}. Это факт из архива — серия считается только за свой день.`;
  const board = $('#board');
  if (!animated) {
    board.classList.add('done');
    $('#finale').hidden = false;
    return;
  }
  reveal(board).then(() => {
    if (d !== day) return;
    $('#finale').hidden = false;
    celebrate(board);
  });
}

// Показывает день: строит игру, восстанавливает прогресс, сбрасывает поле, шапку и календарь.
function openDay(date) {
  const puzzle = pickPuzzle(ctx.puzzles, date);
  const tree = parse(puzzle.puzzle_text);
  if (tree.nodes.length !== puzzle.nodes.length) throw new Error('Головоломка битая: число ребусов не совпадает с ответами');

  const game = new Game(tree, puzzle.nodes.map((n) => n.hash));
  // Восстанавливаем только узлы, для которых сохранено слово: без него нечего показать.
  const entry = dayEntry(ctx.progress, date, puzzle.id);
  const saved = entry?.answers ?? {};
  game.restore((entry?.solved ?? []).filter((id) => typeof saved[id] === 'string'));
  for (const id of game.solved) game.answers[id] = saved[id];
  day = { date, puzzle, game };

  const isToday = date === ctx.today;
  $('#day').textContent = fmtDate(date);
  $('#day').dateTime = date;
  $('#kicker').textContent = isToday ? 'Факт дня' : 'Из архива';
  $('#to-today').hidden = isToday;

  const d = parseDate(date);
  cal.selected = date;
  cal.view = { year: d.getFullYear(), month: d.getMonth() };
  drawCalendar();

  const input = $('#guess');
  input.disabled = false;
  input.value = '';
  input.placeholder = 'Ваш ответ';
  input.classList.remove('invalid');
  $('#guess-form button').disabled = false;
  $('#finale').hidden = true;
  $('#board').classList.remove('done');

  render($('#board'), game);
  showProgress(game);
  showStats();
  if (game.done) {
    finish(day, false);
    setStatus('Этот факт уже собран.', 'ok');
  } else {
    setStatus(game.solved.size ? 'Продолжайте: подсвеченные ребусы открыты.' : 'Начните с подсвеченных ребусов. Ответ — слово в начальной форме.');
    if (autofocus()) input.focus({ preventScroll: true });
  }
}

// Переход на другой день без перезагрузки: адрес меняется, страница плавно уезжает к шапке.
function navigate(date, push) {
  if (push) history.pushState(null, '', date === ctx.today ? './' : `?date=${date}`);
  openDay(date);
  window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  if (!reduced()) {
    $('.sheet').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  }
}

// Проверка ввода асинхронная (хеш и расшифровка). d — день, для которого отправлен ответ.
async function check(d, value) {
  if (d !== day || d.game.done) return;
  const { game, puzzle } = d;
  const board = $('#board');
  const input = $('#guess');
  const key = await answerHash(puzzle.id, value);
  if (d !== day) return;
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
  if (d !== day) return; // день переключили, пока шла расшифровка, — ответ не засчитываем
  if (input.value.trim() === value) input.value = '';
  const before = dayStatus(ctx.progress, d.date);
  save(d);
  if (dayStatus(ctx.progress, d.date) !== before) drawCalendar();
  showProgress(game);
  setStatus(`Верно — «${game.answers[id]}»!`, 'ok');
  // Финал запускает только последний разгаданный ребус, даже если анимации идут внахлёст.
  const last = game.done;
  collapse(board, game, id).then(() => {
    if (last) finish(d, true);
  });
}

// Обработчики вешаются один раз; они работают с текущим днём через `day`.
function setupPage() {
  let queue = Promise.resolve();
  $('#guess-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!day || day.game.done) return;
    const input = $('#guess');
    const value = input.value.trim();
    if (!value) {
      setStatus('Введите слово в начальной форме — ответ на подсвеченный ребус.', 'hint');
      input.focus();
      return;
    }
    const d = day;
    queue = queue
      .then(() => check(d, value))
      .catch((err) => {
        console.error(err);
        setStatus('Не получилось проверить ответ. Обновите страницу.', 'bad');
      });
  });

  // Ссылки календаря и «К факту дня» остаются обычными ссылками (их можно открыть в новой вкладке),
  // но обычный клик переключает день на месте.
  const follow = (e, date) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (date !== day?.date) navigate(date, true);
    else window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  };
  $('#calendar').addEventListener('click', (e) => {
    const a = e.target.closest('a.cal-day');
    if (a) follow(e, new URL(a.href).searchParams.get('date'));
  });
  $('#to-today').addEventListener('click', (e) => follow(e, ctx.today));
  window.addEventListener('popstate', () => navigate(chosenDate(), false));
}

async function main() {
  setupThemeToggle($('#theme-toggle'));
  try {
    // crypto.subtle есть только в защищённом контексте: https или localhost.
    if (!globalThis.crypto?.subtle) throw new Error('Игра работает только по https или на localhost.');
    const puzzles = await loadPuzzles();
    if (!puzzles.length) throw new Error('В puzzles.json нет головоломок');
    ctx.puzzles = puzzles;
    ctx.today = localDate();
    ctx.first = puzzles.map((p) => p.date).sort()[0];
    ctx.store = storage();
    ctx.progress = loadProgress(ctx.store);
    setupPage();
    openDay(chosenDate());
    setupHowto(ctx.store, () => {
      if (!$('#guess').disabled && autofocus()) $('#guess').focus({ preventScroll: true });
    });
  } catch (err) {
    setStatus(location.protocol === 'file:' ? 'Откройте игру через локальный сервер: make dev' : err.message, 'bad');
    $('#guess').disabled = true;
    console.error(err);
  }
}

main();
