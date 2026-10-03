// Отрисовка поля. Поле строится один раз (render), а при каждом ходе обновляется
// точечно (collapse): заменяется только разгаданный ребус, соседи доезжают на новые
// места через FLIP. Анимируются transform и opacity; исключение — высота поля при схлопывании.
//
// Разметка:
//   <span class="rebus depth-N active|locked|solved" data-id="N">
//     <span class="box">…слова подсказки…</span>   — пока не решён
//     или <span class="w answer">слово</span>      — когда решён
//   </span>
// Каждое слово — inline-block токен .w (transform не работает на строчных элементах).
//
// Пристёжки (.att) — скобки, окончания, приставки и знаки препинания, которые стоят вплотную
// к соседнему ребусу. Они кладутся ВНУТРЬ крайнего слова этого ребуса: между двумя
// inline-block строка может разорваться (точка уезжала на новую строку), внутри одного — нет.
// data-owner — чей кусок текста: id ребуса (его скобки и текст его подсказки) или 'root'.
// Когда ребус id схлопывается, его собственные пристёжки исчезают вместе с подсказкой,
// а чужие (скобки внешних ребусов, окончание из текста родителя) переезжают в слово-ответ.

import { tokenize } from './tokens.js';

const EASE = 'cubic-bezier(.2, .7, .2, 1)';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Окончание анимации. В скрытой вкладке браузер не доигрывает анимации и anim.finished
// не наступает, пока игрок не вернётся, — поэтому подстраховываемся таймером.
export const finished = (anim) => {
  const ms = anim.effect.getComputedTiming().endTime + 50;
  return Promise.race([anim.finished.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
};

export function render(container, game) {
  container.replaceChildren(...buildParts(game.tree.root.parts, game, 'root', false));
  for (const a of container.querySelectorAll('.att')) paint(a, game);
  container.classList.toggle('done', game.done);
}

// Схлопывает ребус id в ответ. Возвращает промис окончания анимации.
// Сначала подсказка вспыхивает и гаснет, затем на её месте поднимается слово,
// а соседние слова доезжают на новые места (FLIP). Повторный вызов безвреден.
export async function collapse(container, game, id) {
  const el = container.querySelector(`.rebus[data-id="${id}"]`);
  const box = el?.querySelector(':scope > .box');
  if (!box) return;
  const animate = !reduced();

  if (animate) {
    box.classList.add('solving');
    for (const a of container.querySelectorAll(`.att[data-owner="${id}"]`)) a.classList.add('solving');
    await finished(box.animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }));
    // Пока подсказка гасла, мог схлопнуться родитель — тогда этой плашки уже нет на странице.
    if (!box.isConnected) return;
  }

  // FIRST: где стоят слова до подмены и какой высоты поле.
  const first = new Map();
  const height = container.offsetHeight;
  if (animate) {
    for (const w of container.querySelectorAll('.w')) {
      if (box.contains(w)) continue;
      first.set(w, w.getBoundingClientRect());
      for (const a of w.getAnimations()) a.cancel();
    }
  }

  const ans = answer(game.answers[id]);
  // Чужие пристёжки с краёв подсказки переезжают в слово-ответ, свои исчезают вместе с ней.
  const foreign = (side) =>
    [...edgeToken(box, side).querySelectorAll(':scope > .att')].filter((a) => a.dataset.side === side && a.dataset.owner !== String(id));
  ans.prepend(...foreign('lead'));
  ans.append(...foreign('trail'));
  box.replaceWith(ans);
  el.classList.remove('active', 'locked');
  el.classList.add('solved');
  const parentId = game.tree.nodes[id].parent;
  const parentEl = parentId === null ? null : container.querySelector(`.rebus[data-id="${parentId}"]`);
  if (parentEl && !parentEl.classList.contains('solved')) {
    const active = game.isActive(parentId);
    parentEl.classList.toggle('active', active);
    parentEl.classList.toggle('locked', !active);
    for (const a of container.querySelectorAll(`.att[data-owner="${parentId}"]`)) paint(a, game);
    if (active && animate) popBraces(container, parentId, 1.3);
  }
  if (!animate) return;

  // LAST: слова с небольшим сдвигом по той же строке доезжают; остальные (перенос строки,
  // большой сдвиг) мягко проявляются на месте — иначе длинные перелёты выглядят суетливо.
  const maxSlide = 4 * parseFloat(getComputedStyle(container).fontSize);
  const anims = [];
  for (const [w, a] of first) {
    if (!w.isConnected) continue;
    const b = w.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    anims.push(
      Math.abs(dy) > 1 || Math.abs(dx) > maxSlide
        ? w.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' })
        : w.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 360, easing: EASE }),
    );
  }
  // Короткий ответ вместо длинной подсказки меняет число строк: высоту поля ведём плавно,
  // иначе лист и всё под ним дёргаются. Это единственная анимация раскладки — на одном элементе.
  const newHeight = container.offsetHeight;
  if (Math.abs(newHeight - height) > 1) {
    anims.push(container.animate([{ height: `${height}px` }, { height: `${newHeight}px` }], { duration: 360, easing: EASE }));
  }
  el.classList.remove('fresh');
  el.classList.add('fresh'); // цвет «верно» плавно уходит в обычный (CSS)
  anims.push(ans.animate([{ opacity: 0, transform: 'translateY(.3em)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE }));
  await Promise.all(anims.map(finished));
}

// Короткая тряска поля ввода при неверном ответе.
export function shake(input) {
  input.classList.add('invalid');
  setTimeout(() => input.classList.remove('invalid'), 700);
  if (reduced()) return;
  input.animate(
    [0, -7, 6, -4, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 360, easing: 'ease-out' },
  );
}

// Подсвечивает ребусы, которые нужно разгадать раньше (ответ верный, но ребус закрыт).
export function nudge(container, ids) {
  for (const id of ids) {
    const box = container.querySelector(`.rebus[data-id="${id}"] > .box`);
    if (!box) continue;
    box.classList.remove('nudge');
    box.classList.add('nudge');
    setTimeout(() => box.classList.remove('nudge'), 1300);
    if (!reduced()) popBraces(container, id, 1.3);
  }
}

// Финал: факт проявляется целиком — слова по очереди поднимаются из полутона.
export function reveal(container) {
  container.classList.add('done');
  if (reduced()) return Promise.resolve();
  const anims = [...container.querySelectorAll('.w')].map((w, i) =>
    w.animate(
      [{ opacity: 0.25, transform: 'translateY(.3em)' }, { opacity: 1, transform: 'none' }],
      { duration: 560, delay: 100 + i * 34, easing: EASE, fill: 'backwards' },
    ),
  );
  return Promise.all(anims.map(finished));
}

// Сдержанный салют: два десятка бумажных конфетти над поданным элементом.
export function celebrate(anchor) {
  if (reduced()) return;
  const r = anchor.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'sparks';
  layer.setAttribute('aria-hidden', 'true');
  const anims = [];
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('i');
    s.className = `spark c${i % 4}`;
    s.style.left = `${r.left + r.width * (0.15 + 0.7 * Math.random())}px`;
    s.style.top = `${r.top + r.height * 0.35}px`;
    layer.append(s);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const dist = 110 + Math.random() * 150;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const spin = 240 + Math.random() * 360;
    anims.push(
      s.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy + 200}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 1200 + Math.random() * 500, easing: 'cubic-bezier(.2, .6, .3, 1)', fill: 'forwards' },
      ),
    );
  }
  document.body.append(layer);
  Promise.all(anims.map(finished)).then(() => layer.remove());
}

// ---- построение дерева -------------------------------------------------------

// owner — чей это текст: id ребуса, в подсказке которого он стоит, или 'root'.
function buildParts(parts, game, owner, inBox) {
  const out = [];
  let pre = ''; // приставка для следующего ребуса
  let last = null; // предыдущий ребус — к нему пристёгивается окончание
  parts.forEach((p, i) => {
    if (typeof p !== 'string') {
      last = buildNode(p, game);
      if (pre) attach(last, 'lead', att('glue', pre, owner));
      pre = '';
      out.push(last);
      return;
    }
    let text = p;
    if (inBox && i === 0) text = text.trimStart();
    if (inBox && i === parts.length - 1) text = text.trimEnd();
    const t = tokenize(text, i > 0, i < parts.length - 1);
    if (t.pre && last) attach(last, 'trail', att('glue', t.pre, owner));
    for (const w of t.words) out.push(/^\s+$/.test(w) ? document.createTextNode(' ') : token(w));
    pre = t.post;
    last = null;
  });
  return out;
}

function buildNode(node, game) {
  const el = document.createElement('span');
  el.className = `rebus depth-${Math.min(node.depth, 3)}`;
  el.dataset.id = node.id;
  if (game.isSolved(node.id)) {
    el.classList.add('solved');
    el.append(answer(game.answers[node.id]));
  } else {
    el.classList.add(game.isActive(node.id) ? 'active' : 'locked');
    el.append(buildBox(node, game));
  }
  return el;
}

function buildBox(node, game) {
  const box = document.createElement('span');
  box.className = 'box';
  box.append(...buildParts(node.parts, game, node.id, true));
  // Свои скобки — снаружи всех пристёжек вложенных ребусов: «{» в начало, «}» в конец.
  attach(box, 'lead', att('brace', '{', node.id));
  attach(box, 'trail', att('brace', '}', node.id));
  return box;
}

const isToken = (n) => n instanceof Element && n.classList.contains('w');

// Крайнее слово ребуса, подсказки или слова: side — 'lead' (первое) или 'trail' (последнее).
function edgeToken(node, side) {
  if (isToken(node)) return node;
  const kids = [...node.children].filter((k) => isToken(k) || k.matches('.rebus, .box'));
  return edgeToken(side === 'lead' ? kids[0] : kids.at(-1), side);
}

function attach(node, side, el) {
  el.dataset.side = side;
  const tok = edgeToken(node, side);
  if (side === 'lead') tok.prepend(el);
  else tok.append(el);
}

function att(kind, text, owner) {
  const el = document.createElement('span');
  el.className = `att ${kind}`;
  el.dataset.owner = owner;
  el.textContent = text;
  return el;
}

// Цвет пристёжки — по состоянию её владельца, а не ребуса, в чьё слово она вложена.
function paint(el, game) {
  const owner = el.dataset.owner;
  const state = owner === 'root' ? 'root' : game.isActive(Number(owner)) ? 'active' : 'locked';
  el.classList.remove('s-root', 's-active', 's-locked');
  el.classList.add(`s-${state}`);
}

function token(text) {
  const el = document.createElement('span');
  el.className = 'w';
  el.textContent = text;
  return el;
}

function answer(text) {
  const el = token(text);
  el.classList.add('answer');
  return el;
}

// ---- анимации ------------------------------------------------------------------

function popBraces(container, id, scale) {
  for (const b of container.querySelectorAll(`.att.brace[data-owner="${id}"]`)) {
    b.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 520, delay: 120, easing: 'ease-in-out' },
    );
  }
}
