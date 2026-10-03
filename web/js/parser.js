// Парсер вложенных ребусов: puzzle_text -> дерево.
// Узлы нумеруются в порядке открывающих скобок (pre-order) — в том же порядке
// идёт массив nodes в puzzles.json, поэтому nodes[i] описывает узел с id = i.

export class ParseError extends Error {
  constructor(message, pos) {
    super(`${message} (позиция ${pos})`);
    this.pos = pos;
  }
}

// Возвращает { root, nodes }.
// root/узел: { id, depth, parent, clue, parts, children }
//   parts    — вперемешку строки и дочерние узлы, в порядке текста;
//   clue     — сырой текст внутри скобок (с вложенными {…});
//   children — id прямых детей.
// Корень имеет id = null и depth = 0; ребусы верхнего уровня — depth 1.
export function parse(text) {
  const root = { id: null, depth: 0, parent: null, clue: text, parts: [], children: [] };
  const nodes = [];
  const stack = [root];
  let buf = '';

  const flush = () => {
    if (buf) stack.at(-1).parts.push(buf);
    buf = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      flush();
      const parent = stack.at(-1);
      const node = { id: nodes.length, depth: stack.length, parent: parent.id, clue: '', parts: [], children: [], start: i };
      nodes.push(node);
      parent.parts.push(node);
      parent.children.push(node.id);
      stack.push(node);
    } else if (ch === '}') {
      if (stack.length === 1) throw new ParseError('Лишняя закрывающая скобка', i);
      flush();
      const node = stack.pop();
      node.clue = text.slice(node.start + 1, i);
      if (!node.clue.replace(/\{[^]*\}/g, '').trim()) throw new ParseError('Пустой ребус', node.start);
      delete node.start;
    } else {
      buf += ch;
    }
  }
  if (stack.length > 1) throw new ParseError('Незакрытая скобка', stack.at(-1).start);
  flush();
  return { root, nodes };
}

// Собирает текст, подставляя ответы вместо ребусов. Для корня даёт итоговый факт.
// Текст вокруг скобки клеится к ответу без пробела: «по {…}ам» + «глаз» = «по глазам».
export function assemble(node, answers) {
  return node.parts.map((p) => (typeof p === 'string' ? p : answers[p.id])).join('');
}

// Проверяет, что puzzle (формат puzzles.json) согласован с разобранным деревом.
// Возвращает список ошибок; пустой — всё хорошо.
export function validate(puzzle, tree) {
  const errors = [];
  if (puzzle.nodes.length !== tree.nodes.length) {
    errors.push(`nodes: ожидалось ${tree.nodes.length}, в данных ${puzzle.nodes.length}`);
    return errors;
  }
  tree.nodes.forEach((n, i) => {
    const d = puzzle.nodes[i];
    if (d.clue !== n.clue) errors.push(`nodes[${i}].clue не совпадает с текстом в скобках`);
    if (d.depth !== n.depth) errors.push(`nodes[${i}].depth: ${d.depth} != ${n.depth}`);
    if (d.parent !== n.parent) errors.push(`nodes[${i}].parent: ${d.parent} != ${n.parent}`);
    if (!d.answer?.trim()) errors.push(`nodes[${i}].answer пустой`);
  });
  const answers = puzzle.nodes.map((d) => d.answer);
  const fact = assemble(tree.root, answers);
  if (fact !== puzzle.fact) errors.push(`ответы не складываются в факт: «${fact}»`);
  return errors;
}
