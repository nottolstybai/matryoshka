// Разбивка текста между ребусами на токены для отрисовки.
// Буквы, прижатые к скобке без пробела (`по {…}ам`, `Те{…}галь`), — «хвост»:
// он приклеится к ответу, поэтому рисуется отдельно от обычных слов.

// text — строковый фрагмент; prev/next — слева/справа от него стоит ребус.
// Возвращает { pre, words, post }:
//   pre   — хвост предыдущего ребуса (окончание), '' если его нет;
//   post  — хвост следующего ребуса (приставка), '' если его нет;
//   words — остальное по словам; пробелы между словами — отдельные элементы.
export function tokenize(text, prev, next) {
  let pre = '';
  let post = '';
  if (prev) {
    const m = text.match(/^\S+/);
    if (m) {
      pre = m[0];
      text = text.slice(pre.length);
    }
  }
  if (next) {
    const m = text.match(/\S+$/);
    if (m) {
      post = m[0];
      text = text.slice(0, -post.length);
    }
  }
  const words = text.split(/(\s+)/).filter(Boolean);
  return { pre, words, post };
}

// Делит хвост на буквы, которые сольются с ответом, и остальное (знаки препинания).
// kind 'post' — окончание (буквы в начале: «ам,»), 'pre' — приставка (буквы в конце: ««Те»).
export function splitGlue(text, kind) {
  const m = kind === 'post' ? text.match(/^(\p{L}+)(.*)$/u) : text.match(/^(.*?)(\p{L}+)$/u);
  if (!m) return { letters: '', rest: text };
  return kind === 'post' ? { letters: m[1], rest: m[2] } : { letters: m[2], rest: m[1] };
}
