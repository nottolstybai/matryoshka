// Печать головоломок: открытые головоломки (с ответами и фактом) → зашифрованные в web/data/puzzles.json.
//
//   node tools/seal.mjs <source.json> [--replace]
//
// source.json — массив в авторском формате: { date, fact, puzzle_text, nodes: [{ answer, clue, depth, parent }] }.
// Уже напечатанные даты пропускаются; --replace перепечатывает их (у дня сменится id, прогресс игроков за него сбросится).
// Исходник с ответами в репозиторий не коммитится — см. .gitignore.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse, validate } from '../web/js/parser.js';
import { isDate } from '../web/js/daily.js';
import { normalize } from '../web/js/model.js';
import { newPuzzleId, answerHash, sealAnswer, openAnswer } from '../web/js/crypto.js';

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
  for (const n of p.nodes) {
    const node = { hash: await answerHash(id, n.answer), sealed: await sealAnswer(id, n.answer) };
    // Самопроверка: ответ проходит по хешу и расшифровывает своё слово.
    if ((await openAnswer(id, n.answer, node.sealed)) !== n.answer) throw new Error(`${p.date}: не сошлась расшифровка «${n.answer}»`);
    nodes.push(node);
  }
  return { date: p.date, id, puzzle_text: p.puzzle_text, nodes };
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
      console.log(`${p.date}: уже есть, пропускаю (--replace, чтобы перепечатать)`);
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
