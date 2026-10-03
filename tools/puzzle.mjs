// Инструменты для скилла генерации головоломок (.claude/skills/generate-puzzle).
//
//   node tools/puzzle.mjs status          — следующая свободная дата, прошлые сферы, темы и факты (будущие — без спойлеров)
//   node tools/puzzle.mjs check <draft>   — проверить черновик
//   node tools/puzzle.mjs add <draft>     — проверить, дописать в puzzles/source.json и зашифровать в пул
//   node tools/puzzle.mjs hints <file>    — дописать доп. подсказки старым головоломкам: { "дата": ["подсказка узла 0", …] }
//                                           (после этого — make seal, он дополнит пул без смены id)
//
// Черновик — JSON { topic, domain, fact, text, date? }. В text ответ и дополнительная подсказка
// пишутся рядом с ребусом: {подсказка|ответ|доп. подсказка}
//   «Мыши боятся {домашний зверь, который мурлычет|кот|он говорит «мяу»}ов»
// Ответ и доп. подсказка — в конце своих скобок, после вложенных ребусов.
// Скрипт сам вырезает ответы, строит puzzle_text и nodes (clue/depth/parent) в авторском формате.
// В выводе нет ответов — только номера ребусов и начало подсказки.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse, validate } from '../web/js/parser.js';
import { normalize } from '../web/js/model.js';
import { isDate, localDate, parseDate } from '../web/js/daily.js';
import { sealPuzzle } from './seal.mjs';

const SOURCE = new URL('../puzzles/source.json', import.meta.url);
const POOL = new URL('../web/data/puzzles.json', import.meta.url);

// Требования к головоломке.
export const LIMITS = { minRebuses: 12, maxRebuses: 22, minFact: 150, goodFact: 200, maxFact: 450 };

const readJson = (url) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : []);
const short = (s) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);
const label = (i, clue) => `ребус #${i + 1} «${short(clue)}»`;

// Следующая свободная дата: после последней в пуле, но не раньше сегодняшней.
export function nextDate(pool, today) {
  const last = pool.map((p) => p.date).sort().at(-1);
  if (!last || last < today) return today;
  const d = parseDate(last);
  d.setDate(d.getDate() + 1);
  return localDate(d);
}

// Черновик → головоломка в авторском формате + ошибки, предупреждения и статистика.
export function fromDraft(draft, { date, knownFacts = [] } = {}) {
  const errors = [];
  const warnings = [];
  for (const f of ['topic', 'domain', 'fact', 'text']) {
    if (typeof draft[f] !== 'string' || !draft[f].trim()) errors.push(`нет поля «${f}»`);
  }
  if (errors.length) return { errors, warnings };

  let raw;
  try {
    raw = parse(draft.text);
  } catch (err) {
    return { errors: [`скобки: ${err.message}`], warnings };
  }

  // Хвост собственного текста узла: «|ответ|доп. подсказка».
  const hints = [];
  const answers = raw.nodes.map((n, i) => {
    const m = n.clue.match(/\|([^{}|]*)(?:\|([^{}|]*))?$/);
    if (!m) errors.push(`${label(i, n.clue)}: нет «|ответ|доп. подсказка» перед закрывающей скобкой`);
    hints.push((m?.[2] ?? '').trim());
    return m ? m[1].trim() : '';
  });
  const puzzle_text = draft.text.replace(/\s*\|[^{}|]*(?:\|[^{}|]*)?\}/g, '}');
  if (puzzle_text.includes('|')) errors.push('лишний «|» в тексте: он разрешён только перед ответом');
  if (errors.length) return { errors, warnings };

  const tree = parse(puzzle_text);
  const source = {
    date,
    topic: draft.topic.trim(),
    domain: draft.domain.trim(),
    fact: draft.fact.trim(),
    puzzle_text,
    nodes: tree.nodes.map((n, i) => ({ answer: answers[i], clue: n.clue, depth: n.depth, parent: n.parent, hint: hints[i] })),
  };
  errors.push(...validate(source, tree).filter((e) => !e.startsWith('ответы не складываются')));
  // Своя формулировка без собранного текста: в нём были бы ответы.
  if (validate(source, tree).some((e) => e.startsWith('ответы не складываются'))) {
    errors.push('ответы с окончаниями не складываются ровно в fact (проверь окончания у скобок, пробелы и знаки препинания)');
  }

  // Ответы: одно слово; не встречаются в видимом тексте; не повторяются.
  const visible = normalize(puzzle_text);
  const words = new Set(visible.split(/[^\p{L}\p{N}-]+/u));
  const seen = new Map();
  tree.nodes.forEach((n, i) => {
    const a = normalize(answers[i]);
    if (!/^[\p{L}-]+$/u.test(answers[i])) errors.push(`${label(i, n.clue)}: ответ должен быть одним словом из букв`);
    // Вид «скрытое слово» («спрятан в «пистолете»») нарочно содержит ответ внутри другого слова —
    // для него собственный текст подсказки из проверки исключается, но ответ в нём обязан быть.
    const ownText = n.parts.filter((x) => typeof x === 'string');
    const hidden = /спрятан[оа]? (в|внутри)/i.test(ownText.join(' '));
    let seenText = visible;
    let seenWords = words;
    if (hidden) {
      // Ответ должен быть в каждом слове-носителе в кавычках, а если кавычек нет — хотя бы где-то в подсказке.
      // Носитель может быть собран из вложенного ребуса («{…|апостол}е») — берём текст с подставленными ответами.
      const full = n.parts.map((x) => (typeof x === 'string' ? x : answers[x.id])).join('');
      const carriers = [...full.matchAll(/«([^»]+)»/g)].map((m) => normalize(m[1]));
      const missing = carriers.length ? carriers.filter((c) => !c.includes(a)) : normalize(full).includes(a) ? [] : [''];
      if (missing.length) errors.push(`${label(i, n.clue)}: заявлено скрытое слово, но ответа нет в ${carriers.length ? `«${missing.join('», «')}»` : 'подсказке'}`);
      seenText = normalize(ownText.reduce((t, part) => t.replace(part, ' '), puzzle_text));
      seenWords = new Set(seenText.split(/[^\p{L}\p{N}-]+/u));
    }
    if (seenWords.has(a)) errors.push(`${label(i, n.clue)}: ответ стоит в тексте подсказок целым словом`);
    else if (a.length >= 4 && seenText.includes(a)) errors.push(`${label(i, n.clue)}: ответ спрятан внутри слова в подсказках`);
    // Кусочки из 2–3 букв («ты», «сто») совпадают с буквами обычных слов постоянно — про них не предупреждаем.
    if (seen.has(a)) warnings.push(`${label(i, n.clue)}: тот же ответ, что у ребуса #${seen.get(a) + 1}`);
    else seen.set(a, i);
    // Буквенные виды подсказок проверяются по буквам: в них чаще всего ошибаются.
    const own = n.clue.replace(/\{[^]*\}/g, '');
    const letters = (w) => [...normalize(w).replace(/[^\p{L}]/gu, '')];
    const anagram = own.match(/анаграмма (?:слова )?«([^»]+)»/i);
    if (anagram) {
      if (letters(anagram[1]).sort().join('') !== letters(answers[i]).sort().join('')) errors.push(`${label(i, n.clue)}: это не анаграмма — буквы не совпадают с ответом`);
      else if (normalize(anagram[1]) === a) errors.push(`${label(i, n.clue)}: анаграмма совпадает с самим ответом`);
    }
    const reversed = own.match(/«([^»]+)» наоборот/i);
    if (reversed && letters(reversed[1]).reverse().join('') !== letters(answers[i]).join('')) {
      errors.push(`${label(i, n.clue)}: слово наоборот не даёт ответ`);
    }
    // Дополнительная подсказка: есть, не повторяет основную и тоже не называет ответ.
    const h = normalize(hints[i]);
    if (!h) errors.push(`${label(i, n.clue)}: нет дополнительной подсказки (третья часть после «|»)`);
    else if (h.includes(a)) errors.push(`${label(i, n.clue)}: дополнительная подсказка содержит ответ`);
    else if (h === normalize(n.clue.replace(/\{[^]*\}/g, ''))) errors.push(`${label(i, n.clue)}: дополнительная подсказка повторяет основную`);
  });

  const stats = {
    rebuses: tree.nodes.length,
    top: tree.root.children.length,
    nested: tree.nodes.length - tree.root.children.length,
    maxDepth: Math.max(0, ...tree.nodes.map((n) => n.depth)),
    factLength: source.fact.length,
  };
  if (stats.rebuses < LIMITS.minRebuses || stats.rebuses > LIMITS.maxRebuses) {
    errors.push(`ребусов ${stats.rebuses}, нужно ${LIMITS.minRebuses}–${LIMITS.maxRebuses} (ориентир — 15)`);
  }
  if (stats.maxDepth < 2) errors.push('нет вложенных ребусов');
  else if (stats.nested < 4) warnings.push(`вложенных ребусов всего ${stats.nested} — игра интереснее, когда их больше`);
  if (stats.maxDepth < 3) warnings.push('нет ни одного ребуса третьего уровня');
  if (stats.factLength < LIMITS.minFact) errors.push(`факт короткий: ${stats.factLength} символов, нужно от ${LIMITS.minFact}`);
  else if (stats.factLength < LIMITS.goodFact) warnings.push(`факт ${stats.factLength} символов — лучше от ${LIMITS.goodFact}`);
  if (stats.factLength > LIMITS.maxFact) warnings.push(`факт длинный: ${stats.factLength} символов`);
  if (knownFacts.some((f) => normalize(f) === normalize(source.fact))) errors.push('такой факт уже есть в пуле');
  if (date && !isDate(date)) errors.push(`плохая дата ${date}`);

  return { source, errors, warnings, stats };
}

function report({ errors, warnings, stats }) {
  if (stats) console.log(`Ребусов: ${stats.rebuses} (верхних ${stats.top}, вложенных ${stats.nested}), глубина до ${stats.maxDepth}, факт ${stats.factLength} символов`);
  for (const w of warnings) console.log(`  предупреждение: ${w}`);
  for (const e of errors) console.log(`  ОШИБКА: ${e}`);
  console.log(errors.length ? `Не готово: ошибок ${errors.length}` : 'Проверка пройдена');
}

function load(draftPath) {
  const source = readJson(SOURCE);
  const pool = readJson(POOL);
  const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
  // Дата: из поля date, иначе из имени файла (2026-10-09.json), иначе следующая свободная.
  const fromName = draftPath.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  const date = draft.date ?? (fromName && isDate(fromName) ? fromName : nextDate(pool, localDate()));
  const result = fromDraft(draft, { date, knownFacts: source.map((p) => p.fact) });
  if (pool.some((p) => p.date === date)) result.errors.push(`дата ${date} уже занята`);
  return { source, pool, date, result };
}

async function main([cmd, arg]) {
  if (cmd === 'status') {
    const source = readJson(SOURCE);
    const pool = readJson(POOL);
    console.log(`Головоломок в пуле: ${pool.length}, последняя: ${pool.map((p) => p.date).sort().at(-1) ?? '—'}`);
    console.log(`Следующая свободная дата: ${nextDate(pool, localDate())}`);
    // Будущие дни автор ещё не играл: по ним только сфера, без темы и факта.
    const today = localDate();
    console.log('Уже были (дата · сфера · тема · факт; у будущих дней — только сфера):');
    for (const p of [...source].sort((a, b) => a.date.localeCompare(b.date))) {
      console.log(p.date > today ? `  ${p.date} · ${p.domain ?? '—'}` : `  ${p.date} · ${p.domain ?? '—'} · ${p.topic ?? '—'} · ${p.fact}`);
    }
    return;
  }
  if (cmd === 'check' && arg) {
    const { date, result } = load(arg);
    console.log(`Дата: ${date}`);
    report(result);
    process.exitCode = result.errors.length ? 1 : 0;
    return;
  }
  if (cmd === 'add' && arg) {
    const { source, pool, date, result } = load(arg);
    report(result);
    if (result.errors.length) {
      process.exitCode = 1;
      return;
    }
    const sealed = await sealPuzzle(result.source);
    mkdirSync(new URL('.', SOURCE), { recursive: true });
    writeFileSync(SOURCE, `${JSON.stringify([...source, result.source], null, 2)}\n`);
    writeFileSync(POOL, `${JSON.stringify([...pool, sealed].sort((a, b) => a.date.localeCompare(b.date)), null, 2)}\n`);
    console.log(`Добавлено: ${date} · ${result.source.domain}`); // без темы — автор будет это решать
    return;
  }
  if (cmd === 'hints' && arg) {
    const source = readJson(SOURCE);
    const errors = [];
    for (const [date, hints] of Object.entries(JSON.parse(readFileSync(arg, 'utf8')))) {
      const p = source.find((x) => x.date === date);
      if (!p) errors.push(`${date}: нет такой головоломки`);
      else if (!Array.isArray(hints) || hints.length !== p.nodes.length) errors.push(`${date}: подсказок ${hints?.length}, а ребусов ${p.nodes.length}`);
      else {
        p.nodes.forEach((n, i) => {
          const h = normalize(String(hints[i] ?? ''));
          if (!h) errors.push(`${date}: ${label(i, n.clue)}: пустая подсказка`);
          else if (h.includes(normalize(n.answer))) errors.push(`${date}: ${label(i, n.clue)}: подсказка содержит ответ`);
          else n.hint = String(hints[i]).trim();
        });
      }
    }
    for (const e of errors) console.log(`  ОШИБКА: ${e}`);
    if (errors.length) {
      process.exitCode = 1;
      return;
    }
    writeFileSync(SOURCE, `${JSON.stringify(source, null, 2)}\n`);
    console.log('Подсказки записаны в исходник. Теперь: make seal');
    return;
  }
  console.error('Использование: node tools/puzzle.mjs status | check <draft.json> | add <draft.json> | hints <file.json>');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
