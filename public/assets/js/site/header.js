import { $, $$ } from '../core/dom.js';
import { lang, setLang } from '../core/i18n.js';

export function initHeader() {
  const header = $('[data-header]');
  if (!header) return;

  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const menuButton = $('[data-menu-toggle]', header);
  const setMenu = (open) => {
    header.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('no-scroll', open);
    menuButton?.setAttribute('aria-expanded', String(open));
  };
  menuButton?.addEventListener('click', () => setMenu(!header.classList.contains('is-menu-open')));
  $('[data-nav]', header)?.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  $$('[data-lang-toggle]').forEach((button) => {
    button.addEventListener('click', () => setLang(lang() === 'ar' ? 'en' : 'ar'));
  });
}
