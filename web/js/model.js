// Модель игры: какие узлы разгаданы и какие доступны.
// Узел доступен (active), когда все его дети разгаданы — так решение идёт изнутри наружу.

// Регистр, ё, лишние пробелы и знаки препинания при сравнении не важны.
export function normalize(s) {
  return s
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class Game {
  // keys[i] — ключ ответа узла i: в игре это SHA-256 хеш (crypto.js), в тестах — просто normalize(ответ).
  // Ввод сравнивается по такому же ключу, поэтому модель не знает самих ответов.
  // answers[i] — слово для показа; заполняется снаружи, когда узел разгадан.
  constructor(tree, keys) {
    this.tree = tree;
    this.keys = keys;
    this.answers = [];
    this.solved = new Set();
  }

  // Восстанавливает сохранённый прогресс; чужие id отбрасываются.
  restore(ids) {
    for (const id of ids) if (Number.isInteger(id) && this.tree.nodes[id]) this.solved.add(id);
  }

  isSolved(id) {
    return this.solved.has(id);
  }

  isActive(id) {
    return !this.solved.has(id) && this.tree.nodes[id].children.every((c) => this.solved.has(c));
  }

  activeIds() {
    return this.tree.nodes.filter((n) => this.isActive(n.id)).map((n) => n.id);
  }

  // Ключ уже разгаданного узла (ввели слово повторно).
  isSolvedKey(key) {
    return [...this.solved].some((id) => this.#matches(id, key));
  }

  get done() {
    return this.solved.size === this.tree.nodes.length;
  }

  #matches(id, key) {
    return this.keys[id] === key;
  }

  // Сверяет ключ ввода со всеми доступными узлами. Возвращает id разгаданного узла или null.
  guess(key) {
    const id = this.activeIds().find((i) => this.#matches(i, key));
    if (id === undefined) return null;
    this.solved.add(id);
    return id;
  }

  // Ключ ввода подходит к ребусу, который ещё закрыт вложенными.
  isLockedAnswer(key) {
    return this.lockedAnswerId(key) !== null;
  }

  // id закрытого ребуса, к которому подходит ключ ввода, или null.
  lockedAnswerId(key) {
    const n = this.tree.nodes.find((n) => !this.isSolved(n.id) && !this.isActive(n.id) && this.#matches(n.id, key));
    return n ? n.id : null;
  }

  // Доступные ребусы внутри id — их нужно разгадать, чтобы id открылся.
  blockers(id) {
    const inside = (n) => {
      for (let p = n.parent; p !== null; p = this.tree.nodes[p].parent) if (p === id) return true;
      return false;
    };
    return this.activeIds().filter((a) => inside(this.tree.nodes[a]));
  }
}
