// Защита ответов. Один и тот же код работает в браузере и в Node (crypto.subtle есть в обоих),
// поэтому печать головоломок (tools/seal.mjs) и проверка в игре не могут разойтись.
//
// Для каждого ответа в puzzles.json лежат:
//   hash   — SHA-256("hash:" + id + ":" + normalize(ответ)), hex: по нему проверяется ввод;
//   sealed — слово для показа (с ё и заглавной буквой), зашифрованное AES-GCM ключом
//            SHA-256("key:" + id + ":" + normalize(ответ)); расшифровать можно только правильным ответом.
// id — случайная соль головоломки: одинаковые слова в разных днях дают разные хеши.
// Префиксы "hash:" и "key:" разводят хеш и ключ: опубликованный хеш не открывает шифр.
//
// Это защита от подглядывания, а не от взлома: словарь русских слов перебирается быстро.

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

// Шифрует слово для показа; результат — base64(iv || шифртекст).
export async function sealAnswer(id, answer) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await answerKey(id, answer), enc.encode(answer)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

// Расшифровывает слово для показа. С неверным ответом бросает исключение (не сходится тег GCM).
export async function openAnswer(id, input, sealed) {
  const bytes = fromBase64(sealed);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await answerKey(id, input), bytes.slice(12));
  return dec.decode(plain);
}
