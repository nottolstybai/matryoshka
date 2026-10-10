// Проверка слов системным словарём macOS (NSSpellChecker). Запускается из tools/puzzle.mjs:
//   osascript -l JavaScript tools/spell.jxa.js слово слово …
// Печатает слова, которых в словаре нет, по одному в строке.
ObjC.import('AppKit');

function run(argv) {
  const checker = $.NSSpellChecker.sharedSpellChecker;
  checker.automaticallyIdentifiesLanguages = false;
  if (!checker.setLanguage($('ru'))) throw new Error('нет русского словаря');
  return argv.filter((w) => Number(checker.checkSpellingOfStringStartingAt($(w), 0).length) > 0).join('\n');
}
