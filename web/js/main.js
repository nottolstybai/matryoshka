import { parse, assemble } from './parser.js';
import { Game } from './model.js';
import { answerHash, openAnswer, openAux } from './crypto.js';
import { render, collapse, nudge, reveal, celebrate, shake } from './render.js';
import { localDate, isDate, parseDate, pickPuzzle } from './daily.js';
import { loadProgress, saveProgress, dayEntry, dayStatus, stats } from './progress.js';
import { renderCalendar } from './calendar.js';
import { setupHowto } from './howto.js';
import { setupThemeToggle } from './theme.js';
import { verdict, formatTime, shareText } from './result.js';

const $ = (sel) => document.querySelector(sel);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Фокус в поле ставим сами только при мыши: на телефоне он открыл бы клавиатуру без спроса.
const autofocus = () => matchMedia('(pointer: fine)').matches;

// Общее на всю страницу: пул, даты, прогресс. Заполняется один раз в main().
const ctx = { puzzles: [], today: '', first: '', progress: { days: {} }, store: null };
// Открытый день: { date, puzzle, game, sel, hints, errors, elapsed, since, share }.
//   sel     — id ребуса, выбранного кликом, или null;
//   hints   — взятые подсказки: { id: { hint: текст, letter: буква, reveal: true } };
//   errors  — число неверных ответов (null у дней, решённых до появления счётчика);
//   elapsed — время решения в мс без текущего отрезка; since — начало текущего отрезка или null (пауза);
//   share   — текст для «Поделиться», появляется, когда день собран.
// При переключении дня объект заменяется целиком; всё асинхронное сверяет,
// что его день ещё открыт, — иначе результат не применяется.
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
  $('#count').textContent = `${game.solved.size} / ${total}`;
}

// ---- таймер ---------------------------------------------------------------------

const elapsed = (d) => d.elapsed + (d.since === null ? 0 : performance.now() - d.since);

// Время идёт, пока день не собран, вкладка видна и не открыто окно «Как играть».
function syncTimer() {
  if (!day) return;
  const run = !day.game.done && document.visibilityState === 'visible' && !$('#howto').open;
  if (run && day.since === null) day.since = performance.now();
  if (!run && day.since !== null) {
    day.elapsed = elapsed(day);
    day.since = null;
  }
  const t = elapsed(day);
  $('#timer').hidden = day.game.done && t === 0; // день, решённый до появления таймера
  $('#timer').textContent = formatTime(t);
}

// ---- сохранение -------------------------------------------------------------------

function save(d) {
  const prev = dayEntry(ctx.progress, d.date, d.puzzle.id);
  ctx.progress.days[d.date] = {
    id: d.puzzle.id,
    solved: [...d.game.solved],
    answers: Object.fromEntries([...d.game.solved].map((id) => [id, d.game.answers[id]])),
    hints: d.hints,
    errors: d.errors,
    time: Math.round(elapsed(d)),
    done: d.game.done,
    onTime: prev?.onTime || (d.game.done && localDate() === d.date),
  };
  saveProgress(ctx.progress, ctx.store);
}

// Останавливает таймер дня и запоминает время (уход со страницы, переключение дня).
function park(d) {
  if (!d || d.game.done) return;
  d.elapsed = elapsed(d);
  d.since = null;
  if (d.elapsed >= 1000) save(d);
}

// ---- выбранный ребус и подсказки ---------------------------------------------------

// Ребус, к которому относятся подсказки: выбранный кликом, а если доступен всего один — он.
function targetId(d) {
  if (d.game.done) return null;
  if (d.sel !== null && d.game.isActive(d.sel)) return d.sel;
  const active = d.game.activeIds();
  return active.length === 1 ? active[0] : null;
}

// Обновляет подсветку выбранного ребуса, его подсказку в панели и кнопки подсказок.
function showTarget() {
  const d = day;
  const board = $('#board');
  const id = targetId(d);
  for (const el of board.querySelectorAll('.rebus.selected')) el.classList.remove('selected');
  // Доступные ребусы можно выбрать и с клавиатуры.
  for (const el of board.querySelectorAll('.rebus:not(.solved)')) {
    const box = el.querySelector(':scope > .box');
    if (!box) continue;
    if (d.game.isActive(Number(el.dataset.id))) {
      box.tabIndex = 0;
      box.setAttribute('role', 'button');
    } else {
      box.removeAttribute('tabindex');
      box.removeAttribute('role');
    }
  }

  // Строка выбранного ребуса всегда на месте (кроме собранного дня), а кнопки подсказок
  // видны только при выбранном ребусе: высота панели при этом не меняется.
  const anyHints = d.puzzle.nodes.some((n) => n.reveal || n.hint);
  $('#target').hidden = d.game.done;
  $('#tools').hidden = !anyHints;
  $('#tools').classList.toggle('off', id === null);
  $('#target-clue').classList.toggle('empty', id === null);
  if (revealArmed && revealArmed.id !== id) resetRevealConfirm(); // переспрашивали про другой ребус
  if (id === null) {
    $('#target-clue').textContent = anyHints ? 'Нажмите на подсвеченный ребус, чтобы выбрать его и взять подсказку' : 'Нажмите на подсвеченный ребус, чтобы выбрать его';
    $('#target-hint').hidden = true;
    return;
  }

  board.querySelector(`.rebus[data-id="${id}"]`)?.classList.add('selected');
  $('#target-clue').textContent = `{${assemble(d.game.tree.nodes[id], d.game.answers)}}`;
  const node = d.puzzle.nodes[id];
  const used = d.hints[id] ?? {};
  const lines = [];
  if (used.letter) lines.push(`Первая буква — «${used.letter}».`);
  if (used.hint) lines.push(`Подсказка: ${used.hint}`);
  $('#target-hint').hidden = !lines.length;
  $('#target-hint').textContent = lines.join(' ');
  $('#tool-hint').hidden = !node.hint;
  $('#tool-hint').disabled = Boolean(used.hint);
  $('#tool-letter').hidden = !node.reveal;
  $('#tool-letter').disabled = Boolean(used.letter);
  $('#tool-reveal').hidden = !node.reveal;
  $('#tool-reveal').disabled = false;
}

// Клик по ребусу: доступный — выбрать (повторный клик снимает выбор), закрытый — показать, что мешает.
function select(id) {
  const d = day;
  if (d.game.done || d.game.isSolved(id)) return;
  if (!d.game.isActive(id)) {
    setStatus('Этот ребус ещё закрыт — сначала разгадайте вложенный.', 'hint');
    nudge($('#board'), d.game.blockers(id));
    return;
  }
  d.sel = d.sel === id ? null : id;
  showTarget();
  if (autofocus()) $('#guess').focus({ preventScroll: true });
}

// «Открыть слово» требует второго нажатия: первое только переспрашивает.
// revealArmed — { id ребуса, о котором спросили; timer } или null.
let revealArmed = null;
function resetRevealConfirm() {
  clearTimeout(revealArmed?.timer);
  revealArmed = null;
  $('#tool-reveal').textContent = 'Открыть слово';
  $('#tool-reveal').classList.remove('confirm');
}

async function useHint(kind) {
  const d = day;
  if (!d || d.game.done) return;
  const id = targetId(d);
  if (id === null) {
    setStatus('Сначала выберите ребус: нажмите на один из подсвеченных.', 'hint');
    return;
  }
  if (kind === 'reveal' && revealArmed?.id !== id) {
    resetRevealConfirm();
    $('#tool-reveal').textContent = 'Точно открыть?';
    $('#tool-reveal').classList.add('confirm');
    revealArmed = { id, timer: setTimeout(resetRevealConfirm, 4000) };
    return;
  }
  if (kind === 'reveal') resetRevealConfirm();
  const node = d.puzzle.nodes[id];
  const text = await openAux(d.puzzle.id, kind === 'hint' ? `hint:${id}` : `reveal:${id}`, kind === 'hint' ? node.hint : node.reveal);
  if (d !== day) return;
  const used = (d.hints[id] ??= {});
  if (kind === 'hint') used.hint = text;
  if (kind === 'letter') used.letter = text[0].toUpperCase();
  if (kind === 'reveal') {
    if (!d.game.solve(id)) return;
    used.reveal = true;
    d.game.answers[id] = text;
    solved(d, id, `Слово открыто — «${text}».`, 'hint');
    return;
  }
  save(d);
  showTarget();
}

// ---- ход игры ---------------------------------------------------------------------

// Финал: панель ввода уходит, факт проявляется целиком, под ним — карточка с итогом.
function finish(d, animated) {
  if (d !== day) return;
  const s = showStats();
  const used = Object.values(d.hints);
  const result = {
    total: d.game.tree.nodes.length,
    errors: d.errors,
    hints: used.filter((h) => h.hint).length,
    letters: used.filter((h) => h.letter).length,
    reveals: used.filter((h) => h.reveal).length,
  };
  $('#finale-verdict').textContent = verdict(result);
  $('#res-time').textContent = d.elapsed > 0 ? formatTime(d.elapsed) : '—';
  $('#res-errors').textContent = d.errors ?? '—';
  $('#res-hints').textContent = result.hints + result.letters; // текстовые подсказки и первые буквы вместе
  $('#res-reveals').textContent = result.reveals;
  $('#finale-text').textContent = d.date === ctx.today
    ? `Решено фактов: ${s.total} · серия: ${s.streak}. Завтра будет новый факт.`
    : `Решено фактов: ${s.total}.`;
  // Текст для «Поделиться»: ссылка ведёт на этот же день, серия — только у сегодняшнего.
  d.share = shareText({
    date: parseDate(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
    result,
    time: d.elapsed,
    streak: d.date === ctx.today ? s.streak : 0,
    url: `${location.origin}${location.pathname}?date=${d.date}`,
  });

  const board = $('#board');
  const show = () => {
    $('.dock').hidden = true;
    $('#finale').hidden = false;
  };
  if (!animated) {
    board.classList.add('done');
    show();
    return;
  }
  reveal(board).then(() => {
    if (d !== day) return;
    show();
    celebrate(board);
  });
}

// Узел id только что разгадан (вводом или «открыть слово»): сохранить, обновить всё вокруг, схлопнуть.
function solved(d, id, message, kind) {
  if (d.sel === id) d.sel = null;
  syncTimer(); // если это последний ребус — время останавливается здесь
  const before = dayStatus(ctx.progress, d.date);
  save(d);
  if (dayStatus(ctx.progress, d.date) !== before) drawCalendar();
  showProgress(d.game);
  setStatus(message, kind);
  // Финал запускает только последний разгаданный ребус, даже если анимации идут внахлёст.
  const last = d.game.done;
  collapse($('#board'), d.game, id).then(() => {
    if (d !== day) return;
    showTarget(); // родитель мог стать доступным — и единственным
    if (last) finish(d, true);
  });
  showTarget();
}

// Показывает день: строит игру, восстанавливает прогресс, сбрасывает поле, шапку и календарь.
function openDay(date) {
  park(day);
  const puzzle = pickPuzzle(ctx.puzzles, date);
  const tree = parse(puzzle.puzzle_text);
  if (tree.nodes.length !== puzzle.nodes.length) throw new Error('Головоломка битая: число ребусов не совпадает с ответами');

  const game = new Game(tree, puzzle.nodes.map((n) => n.hash));
  // Восстанавливаем только узлы, для которых сохранено слово: без него нечего показать.
  const entry = dayEntry(ctx.progress, date, puzzle.id);
  const saved = entry?.answers ?? {};
  game.restore((entry?.solved ?? []).filter((id) => typeof saved[id] === 'string'));
  for (const id of game.solved) game.answers[id] = saved[id];
  // errors: у начатого заново дня — 0; у дня, решённого до появления счётчика, — неизвестно (null).
  const errors = entry?.errors ?? (game.done ? null : 0);
  day = { date, puzzle, game, sel: null, hints: entry?.hints ?? {}, errors, elapsed: entry?.time ?? 0, since: null };

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
  input.value = '';
  input.classList.remove('invalid');
  $('.dock').hidden = false;
  $('#finale').hidden = true;
  $('#board').classList.remove('done');

  render($('#board'), game);
  showProgress(game);
  showStats();
  showTarget();
  syncTimer();
  if (game.done) {
    finish(day, false);
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
// Слово сверяется со всеми доступными ребусами, а не только с выбранным: верный ответ не должен пропасть.
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
      d.errors = (d.errors ?? 0) + 1;
      save(d);
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
  solved(d, id, `Верно — «${game.answers[id]}»!`, 'ok');
}

// «Поделиться»: на телефоне — системное меню, на компьютере — копирование в буфер.
async function share(button) {
  const text = day?.share;
  if (!text) return;
  const flash = (label) => {
    button.textContent = label;
    setTimeout(() => {
      button.textContent = 'Поделиться';
    }, 2000);
  };
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
    } catch (err) {
      if (err.name !== 'AbortError') flash('Не получилось'); // AbortError — игрок сам закрыл меню
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flash('Скопировано');
  } catch {
    flash('Не получилось');
  }
}

// Обработчики вешаются один раз; они работают с текущим днём через `day`.
function setupPage() {
  // Отправки ответов и подсказки идут строго по очереди: всё это асинхронное.
  let queue = Promise.resolve();
  const enqueue = (job) => {
    queue = queue.then(job).catch((err) => {
      console.error(err);
      setStatus('Не получилось проверить ответ. Обновите страницу.', 'bad');
    });
  };

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
    enqueue(() => check(d, value));
  });

  // Выбор ребуса кликом или с клавиатуры (Enter / пробел на подсвеченном).
  const pick = (target) => {
    const el = target.closest('.rebus:not(.solved)');
    if (el && day) select(Number(el.dataset.id));
  };
  $('#board').addEventListener('click', (e) => pick(e.target));
  $('#board').addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches('.box')) return;
    e.preventDefault();
    pick(e.target);
  });

  $('#share').addEventListener('click', (e) => share(e.currentTarget));

  for (const kind of ['hint', 'letter', 'reveal']) {
    $(`#tool-${kind}`).addEventListener('click', () => enqueue(() => useHint(kind)));
  }

  // Таймер: раз в секунду обновляем показ; пауза — когда вкладка скрыта или открыто «Как играть».
  setInterval(syncTimer, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') park(day);
    syncTimer();
  });
  window.addEventListener('pagehide', () => park(day));

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
      if (day && !day.game.done && autofocus()) $('#guess').focus({ preventScroll: true });
    });
  } catch (err) {
    setStatus(location.protocol === 'file:' ? 'Откройте игру через локальный сервер: make dev' : err.message, 'bad');
    $('#guess').disabled = true;
    console.error(err);
  }
}

main();
