// Защита ответов. Один и тот же код работает в браузере и в Node (crypto.subtle есть в обоих),
// поэтому печать головоломок (tools/seal.mjs) и проверка в игре не могут разойтись.
//
// Для каждого ответа в puzzles.json лежат:
//   hash   — SHA-256("hash:" + id + ":" + normalize(ответ)), hex: по нему проверяется ввод;
//   sealed — слово для показа (с ё и заглавной буквой), зашифрованное AES-GCM ключом
//            SHA-256("key:" + id + ":" + normalize(ответ)); расшифровать можно только правильным ответом.
//   reveal — то же слово, но под ключом SHA-256("aux:" + id + ":reveal:" + номер узла): его игра
//            открывает сама, без ответа игрока, — для «первой буквы» и «открыть слово»;
//   hint   — дополнительная подсказка, зашифрована так же (":hint:").
// id — случайная соль головоломки: одинаковые слова в разных днях дают разные хеши.
// Префиксы "hash:", "key:" и "aux:" разводят хеш и ключи: опубликованный хеш не открывает шифр.
//
// Это защита от подглядывания, а не от взлома: словарь русских слов перебирается быстро,
// а reveal и hint открываются кодом игры — они спрятаны только от чтения глазами.

import { normalize } from './model.js';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const digest = (text) => subtle.digest('SHA-256', enc.encode(text));

async function answerKey(id, input) {
  return subtle.importKey('raw', await digest(`key:${id}:${normalize(input)}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Случайный id головоломки (16 байт, base64).
export function newPuzzleId() {
  return toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function answerHash(id, input) {
  return hex(await digest(`hash:${id}:${normalize(input)}`));
}

// Ключ записи, которую игра открывает сама: slot — «reveal:3», «hint:3».
async function auxKey(id, slot) {
  return subtle.importKey('raw', await digest(`aux:${id}:${slot}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// AES-GCM; результат — base64(iv || шифртекст).
async function seal(key, text) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

async function open(key, sealed) {
  const bytes = fromBase64(sealed);
  return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}

// Шифрует слово для показа ключом из самого ответа.
export async function sealAnswer(id, answer) {
  return seal(await answerKey(id, answer), answer);
}

// Расшифровывает слово для показа. С неверным ответом бросает исключение (не сходится тег GCM).
export async function openAnswer(id, input, sealed) {
  return open(await answerKey(id, input), sealed);
}

// Запись, которую игра открывает без ответа игрока (reveal, hint).
export async function sealAux(id, slot, text) {
  return seal(await auxKey(id, slot), text);
}

export async function openAux(id, slot, sealed) {
  return open(await auxKey(id, slot), sealed);
}
