import { api } from '../core/api.js';
import { html, render, richText } from '../core/dom.js';
import { formatMoney } from '../core/format.js';
import { applyTranslations, lang, t } from '../core/i18n.js';

const QUICK_REPLIES = ['chat.quick.wedding', 'chat.quick.g63', 'chat.quick.airport', 'chat.quick.offers'];

const SESSION_STORAGE_KEY = 'chatSession';

/** One key per browser tab session, so the owner sees each conversation as a thread. */
function sessionKey() {
  try {
    let key = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!key) {
      key = (crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      sessionStorage.setItem(SESSION_STORAGE_KEY, key);
    }
    return key;
  } catch {
    return '';
  }
}

/** Floating bilingual concierge. Replies (and car suggestions) come from POST /api/chat. */
export function initConcierge({ settings }) {
  const root = document.createElement('div');
  root.className = 'concierge';
  render(
    root,
    html`
      <section class="concierge__panel" id="concierge-panel" hidden data-i18n-attr="aria-label:chat.title">
        <header class="concierge__head">
          <div class="concierge__avatar" aria-hidden="true"><i class="ri-vip-crown-2-line"></i></div>
          <div class="concierge__title">
            <strong data-i18n="chat.title"></strong>
            <small data-i18n="chat.status"></small>
          </div>
          <button class="icon-btn" type="button" data-close data-i18n-attr="aria-label:chat.close"><i class="ri-close-line"></i></button>
        </header>
        <div class="concierge__log" data-log aria-live="polite"></div>
        <div class="concierge__quick">
          ${QUICK_REPLIES.map((key) => html`<button class="chip" type="button" data-quick="${key}" data-i18n="${key}"></button>`)}
        </div>
        <form class="concierge__form" data-form>
          <label class="sr-only" for="concierge-input" data-i18n="chat.placeholder"></label>
          <input class="control" id="concierge-input" name="message" maxlength="500" autocomplete="off" data-i18n-attr="placeholder:chat.placeholder">
          <button class="icon-btn" type="submit" data-i18n-attr="aria-label:chat.send"><i class="ri-send-plane-2-fill flip-rtl"></i></button>
        </form>
      </section>
      <button class="concierge__launcher" type="button" aria-controls="concierge-panel" aria-expanded="false" data-launcher data-i18n-attr="aria-label:chat.open">
        <i class="ri-chat-smile-3-line" aria-hidden="true"></i>
      </button>`,
  );
  document.body.append(root);
  applyTranslations(root);

  const panel = root.querySelector('.concierge__panel');
  const launcher = root.querySelector('[data-launcher]');
  const launcherIcon = launcher.querySelector('i');
  const log = root.querySelector('[data-log]');
  const form = root.querySelector('[data-form]');
  const input = form.elements.namedItem('message');
  let greeted = false;

  const scrollToEnd = () => {
    log.scrollTop = log.scrollHeight;
  };

  function addBubble(modifier, content) {
    const bubble = document.createElement('div');
    bubble.className = `bubble bubble--${modifier}`;
    render(bubble, content);
    log.append(bubble);
    scrollToEnd();
    return bubble;
  }

  function addBotReply(text, cars = []) {
    addBubble('bot', richText(text));
    if (cars.length === 0) return;
    const list = document.createElement('div');
    list.className = 'bubble-cars';
    render(
      list,
      html`${cars.map(
        (car) => html`
          <a class="bubble-car" href="/cars/${car.slug}">
            ${car.image ? html`<img src="${car.image}" alt="" loading="lazy">` : ''}
            <span>${car.name}<small>${t('hero.from', { price: formatMoney(car.dailyRate, settings.currency) })}</small></span>
          </a>`,
      )}`,
    );
    log.append(list);
    scrollToEnd();
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    launcherIcon.className = open ? 'ri-close-line' : 'ri-chat-smile-3-line';
    if (!open) return;
    if (!greeted) {
      addBotReply(t('chat.welcome'));
      greeted = true;
    }
    input.focus();
  }

  async function send(text) {
    const message = text.trim();
    if (!message) return;
    addBubble('user', message);
    input.value = '';
    const typing = addBubble('typing', html`<span></span><span></span><span></span>`);
    try {
      const reply = await api('/chat', { method: 'POST', body: { message, lang: lang(), sessionKey: sessionKey() } });
      typing.remove();
      addBotReply(reply.reply, reply.cars);
    } catch {
      typing.remove();
      addBotReply(t('chat.error'));
    }
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden));
  root.querySelector('[data-close]').addEventListener('click', () => {
    setOpen(false);
    launcher.focus();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      launcher.focus();
    }
  });
  root.querySelector('.concierge__quick').addEventListener('click', (event) => {
    const quick = event.target.closest('[data-quick]');
    if (quick) send(t(quick.dataset.quick));
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
}
