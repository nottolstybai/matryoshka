// Ручной выбор темы поверх системной. Выбор хранится в localStorage; до первой отрисовки
// его применяет встроенный скрипт в <head> index.html (иначе мелькнула бы системная тема).

const KEY = 'fact-rebus:theme';
const COLORS = { light: '#f4efe4', dark: '#16140f' };

const current = () =>
  document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  // Цвет панели браузера на телефоне — тоже по выбранной теме, а не по системной.
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = COLORS[theme];
}

export function setupThemeToggle(button) {
  const label = () => {
    const next = current() === 'dark' ? 'светлую' : 'тёмную';
    button.title = `Включить ${next} тему`;
    button.setAttribute('aria-label', button.title);
  };
  if (document.documentElement.dataset.theme) apply(document.documentElement.dataset.theme);
  label();
  button.addEventListener('click', () => {
    const theme = current() === 'dark' ? 'light' : 'dark';
    apply(theme);
    label();
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  });
  // Пока выбор не сделан, тема следует за системой — подпись кнопки тоже.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
}
