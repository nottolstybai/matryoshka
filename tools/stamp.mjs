// Метка версии для выкладки: дописывает ?v=<версия> к стилям и всем JS-модулям в web/index.html.
//
//   node tools/stamp.mjs <версия>
//
// Хостинг кеширует файлы (GitHub Pages — ~10 минут), и без метки после выкладки браузер может
// собрать страницу из новых и старых модулей. Вложенные import'ы метку не видят, поэтому
// версия раздаётся через import map. Запускается только в CI перед выкладкой, в репозиторий не коммитится.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Использование: node tools/stamp.mjs <версия>');
  process.exit(1);
}

const web = new URL('../web/', import.meta.url);
const page = new URL('index.html', web);
const v = encodeURIComponent(version);

const imports = Object.fromEntries(
  readdirSync(new URL('js/', web))
    .filter((f) => f.endsWith('.js'))
    .map((f) => [`./js/${f}`, `./js/${f}?v=${v}`]),
);
const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>\n  `;

let html = readFileSync(page, 'utf8');
for (const [from, to] of [
  ['href="css/style.css"', `href="css/style.css?v=${v}"`],
  ['<script type="module" src="js/main.js">', `${importMap}<script type="module" src="js/main.js?v=${v}">`],
]) {
  if (!html.includes(from)) throw new Error(`В index.html не найдено: ${from}`);
  html = html.replace(from, to);
}
writeFileSync(page, html);
console.log(`index.html: версия ${version}, модулей в import map: ${Object.keys(imports).length}`);
