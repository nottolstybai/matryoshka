// Печать головоломок: открытые головоломки (с ответами и фактом) → зашифрованные в web/data/puzzles.json.
//
//   node tools/seal.mjs <source.json> [--replace]
//
// source.json — массив в авторском формате: { date, fact, puzzle_text, nodes: [{ answer, clue, depth, parent, hint? }] }.
// Уже напечатанные даты не перепечатываются, а дополняются недостающими полями (reveal, hint) с тем же id —
// прогресс игроков сохраняется. --replace перепечатывает их заново (id сменится, прогресс за день сбросится).
// Исходник с ответами в репозиторий не коммитится — см. .gitignore.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse, validate } from '../web/js/parser.js';
import { isDate } from '../web/js/daily.js';
import { normalize } from '../web/js/model.js';
import { newPuzzleId, answerHash, sealAnswer, openAnswer, sealAux, openAux } from '../web/js/crypto.js';

const POOL = new URL('../web/data/puzzles.json', import.meta.url);

// Проверяет открытую головоломку и шифрует её ответы. Бросает исключение со списком ошибок.
export async function sealPuzzle(p) {
  const errors = isDate(p.date) ? [] : [`плохая дата ${p.date}`];
  try {
    errors.push(...validate(p, parse(p.puzzle_text)));
  } catch (err) {
    errors.push(err.message);
  }
  if (errors.length) throw new Error(`${p.date}: ${errors.join('; ')}`);

  const id = newPuzzleId();
  const nodes = [];
  for (const [i, n] of p.nodes.entries()) {
    const node = { hash: await answerHash(id, n.answer), sealed: await sealAnswer(id, n.answer) };
    // Самопроверка: ответ проходит по хешу и расшифровывает своё слово.
    if ((await openAnswer(id, n.answer, node.sealed)) !== n.answer) throw new Error(`${p.date}: не сошлась расшифровка «${n.answer}»`);
    await addAux(id, i, n, node);
    nodes.push(node);
  }
  return { date: p.date, id, puzzle_text: p.puzzle_text, nodes };
}

// Записи, которые игра открывает сама: слово для «первой буквы» и «открыть слово», дополнительная подсказка.
async function addAux(id, i, plain, node) {
  if (!node.reveal) {
    node.reveal = await sealAux(id, `reveal:${i}`, plain.answer);
    if ((await openAux(id, `reveal:${i}`, node.reveal)) !== plain.answer) throw new Error('не сошлась расшифровка reveal');
  }
  if (plain.hint && !node.hint) node.hint = await sealAux(id, `hint:${i}`, plain.hint);
}

// Дополняет уже напечатанную головоломку недостающими reveal и hint, не меняя id, hash и sealed.
// Возвращает число дополненных узлов. Бросает исключение, если исходник не соответствует напечатанному.
export async function upgradePuzzle(sealed, p) {
  if (sealed.puzzle_text !== p.puzzle_text || sealed.nodes.length !== p.nodes.length) {
    throw new Error(`${p.date}: исходник не совпадает с напечатанной головоломкой (нужен --replace)`);
  }
  let changed = 0;
  for (const [i, n] of p.nodes.entries()) {
    const node = sealed.nodes[i];
    if ((await answerHash(sealed.id, n.answer)) !== node.hash) throw new Error(`${p.date}: ответ узла ${i} не совпадает с напечатанным (нужен --replace)`);
    const before = Object.keys(node).length;
    await addAux(sealed.id, i, n, node);
    if (Object.keys(node).length !== before) changed++;
  }
  return changed;
}

async function main([src, ...flags]) {
  if (!src) throw new Error('Использование: node tools/seal.mjs <source.json> [--replace]');
  const replace = flags.includes('--replace');
  const source = JSON.parse(readFileSync(src, 'utf8'));
  const pool = existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')) : [];
  const byDate = new Map(pool.map((p) => [p.date, p]));

  let sealed = 0;
  for (const p of source) {
    if (byDate.has(p.date) && !replace) {
      const changed = await upgradePuzzle(byDate.get(p.date), p);
      console.log(changed ? `${p.date}: дополнено узлов — ${changed}` : `${p.date}: без изменений`);
      continue;
    }
    byDate.set(p.date, await sealPuzzle(p));
    sealed++;
    console.log(`${p.date}: готово`);
    // Ответ, записанный прямо в видимом тексте, выдаёт себя: «в(осьминог)ий житель».
    for (const n of p.nodes) {
      if (normalize(p.puzzle_text).includes(normalize(n.answer))) console.log(`  ! «${n.answer}» встречается в тексте подсказок`);
    }
  }

  const out = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(POOL, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Напечатано: ${sealed}, всего в пуле: ${out.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
