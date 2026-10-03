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
  // nodes — массив из puzzles.json. answer — слово в начальной форме;
  // окончания и приставки стоят в тексте вплотную к скобкам и приклеиваются к ответу.
  constructor(tree, nodes) {
    this.tree = tree;
    this.answers = nodes.map((n) => n.answer);
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

  get done() {
    return this.solved.size === this.tree.nodes.length;
  }

  #matches(id, input) {
    return normalize(this.answers[id]) === normalize(input);
  }

  // Сверяет ввод со всеми доступными узлами. Возвращает id разгаданного узла или null.
  // На этапе 4 сравнение заменится на SHA-256.
  guess(input) {
    const id = this.activeIds().find((i) => this.#matches(i, input));
    if (id === undefined) return null;
    this.solved.add(id);
    return id;
  }

  // Ввод подходит к ребусу, который ещё закрыт вложенными.
  isLockedAnswer(input) {
    return this.lockedAnswerId(input) !== null;
  }

  // id закрытого ребуса, к которому подходит ввод, или null.
  lockedAnswerId(input) {
    const n = this.tree.nodes.find((n) => !this.isSolved(n.id) && !this.isActive(n.id) && this.#matches(n.id, input));
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
