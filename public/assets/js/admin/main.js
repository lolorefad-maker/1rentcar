import { api } from '../core/api.js';
import { $, $$, html, render } from '../core/dom.js';
import { initI18n, lang, registerStrings, setLang, t } from '../core/i18n.js';
import { adminApi, clearSession, currentSession, onUnauthorized, saveSession } from './session.js';
import { operationsStrings } from './strings-ops.js';
import { adminStrings } from './strings.js';
import { errorText, toast } from './ui.js';
import * as analytics from './views/analytics.js';
import * as bookings from './views/bookings.js';
import * as calendar from './views/calendar.js';
import * as chats from './views/chats.js';
import * as content from './views/content.js';
import * as customers from './views/customers.js';
import * as drivers from './views/drivers.js';
import * as fleet from './views/fleet.js';
import * as inbox from './views/inbox.js';
import * as inventory from './views/inventory.js';
import * as offers from './views/offers.js';
import * as overview from './views/overview.js';
import * as settings from './views/settings.js';
import * as team from './views/team.js';

const VIEWS = { overview, bookings, calendar, fleet, inventory, drivers, customers, inbox, chats, offers, analytics, content, team, settings };

/** Sidebar groups. `role` hides a section from accounts that cannot use it. */
const NAV = [
  { group: 'main', items: [{ id: 'overview', icon: 'ri-dashboard-3-line' }] },
  {
    group: 'operations',
    items: [
      { id: 'bookings', icon: 'ri-calendar-check-line', badge: true },
      { id: 'calendar', icon: 'ri-calendar-2-line' },
      { id: 'fleet', icon: 'ri-roadster-line', role: 'manager' },
      { id: 'inventory', icon: 'ri-tools-line', role: 'manager' },
      { id: 'drivers', icon: 'ri-steering-2-line', role: 'manager' },
    ],
  },
  {
    group: 'people',
    items: [
      { id: 'customers', icon: 'ri-contacts-book-3-line' },
      { id: 'inbox', icon: 'ri-mail-line', badge: true },
      { id: 'chats', icon: 'ri-chat-3-line', badge: true },
    ],
  },
  {
    group: 'growth',
    items: [
      { id: 'offers', icon: 'ri-coupon-3-line', role: 'manager' },
      { id: 'analytics', icon: 'ri-line-chart-line', role: 'manager' },
      { id: 'content', icon: 'ri-article-line', role: 'manager' },
    ],
  },
  {
    group: 'admin',
    items: [
      { id: 'team', icon: 'ri-team-line', role: 'owner' },
      { id: 'settings', icon: 'ri-settings-4-line' },
    ],
  },
];
const ROLE_RANK = { owner: 3, manager: 2, staff: 1 };
const DEFAULT_VIEW = 'overview';
const POLL_MS = 30_000;

initI18n(adminStrings);
registerStrings(operationsStrings);

const state = {
  settings: null,
  user: null,
  usingDefaultPassword: false,
  cleanup: null,
  routeId: 0,
  totalBookings: null,
  pollTimer: null,
  started: false,
};

const can = (minimumRole) => (ROLE_RANK[state.user?.role] ?? 3) >= (ROLE_RANK[minimumRole] ?? 0);

/** Shared helpers handed to every view. */
const ctx = {
  api: adminApi,
  can,
  get settings() {
    return state.settings;
  },
  get user() {
    return state.user;
  },
  setSettings(next) {
    state.settings = next;
    applyBrand();
  },
  setUsingDefaultPassword(value) {
    state.usingDefaultPassword = value;
  },
  refreshBadges,
  rerender: () => route(),
};

/** Views the signed-in account may open. */
const allowedViews = () =>
  NAV.flatMap((section) => section.items).filter((item) => !item.role || can(item.role));

function brandMarkup(name) {
  const [first, ...rest] = String(name || 'Luxury Motors').trim().split(/\s+/);
  return html`${first}${rest.length ? html` <span class="brand__accent">${rest.join(' ')}</span>` : ''}`;
}

function applyBrand() {
  document.title = t('admin.title', { business: state.settings?.businessName ?? '' });
  $$('[data-brand]').forEach((el) => render(el, brandMarkup(state.settings?.businessName)));
}

const currentViewId = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || DEFAULT_VIEW;

// --- Sign in -------------------------------------------------------------------------

async function showLogin(message = '') {
  stopPolling();
  let businessName = '';
  try {
    businessName = (await api('/settings')).businessName;
  } catch {
    /* brand is decorative here */
  }
  render(
    $('#app'),
    html`
      <main class="login">
        <form class="login__card" data-login>
          <a class="brand" href="/">${brandMarkup(businessName)}</a>
          <div>
            <h1 class="login__title">${t('login.title')}</h1>
            <p class="muted">${t('login.subtitle')}</p>
          </div>
          <label class="field">
            <span class="field__label">${t('login.username')}</span>
            <input class="control" name="username" placeholder="admin" autocomplete="username" autocapitalize="off" spellcheck="false">
          </label>
          <label class="field">
            <span class="field__label">${t('login.password')}</span>
            <input class="control" type="password" name="password" required autocomplete="current-password" autofocus>
          </label>
          <p class="login__error" role="alert">${message}</p>
          <button class="btn btn--primary btn--block" type="submit">${t('login.submit')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-lang>${t('nav.language')}</button>
        </form>
      </main>`,
  );
  document.title = t('login.title');

  const form = $('[data-login]');
  $('[data-lang]', form).addEventListener('click', () => setLang(lang() === 'ar' ? 'en' : 'ar'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    button.classList.add('is-loading');
    try {
      const session = await api('/admin/login', {
        method: 'POST',
        body: {
          username: form.elements.namedItem('username').value.trim(),
          password: form.elements.namedItem('password').value,
        },
      });
      saveSession(session);
      await startApp();
    } catch (err) {
      $('.login__error', form).textContent = errorText(err);
      button.classList.remove('is-loading');
    }
  });
}

// --- App shell -------------------------------------------------------------------------

function renderShell() {
  render(
    $('#app'),
    html`
      <div class="shell" data-shell>
        <aside class="sidebar">
          <a class="brand" href="/" target="_blank" rel="noopener" data-brand></a>
          <nav class="side-nav" aria-label="Admin">
            ${NAV.map((section) => {
              const items = section.items.filter((item) => !item.role || can(item.role));
              if (items.length === 0) return '';
              return html`
                <p class="side-nav__group">${t(`navGroup.${section.group}`)}</p>
                ${items.map(
                  (item) => html`
                    <a class="side-link" href="#/${item.id}" data-nav="${item.id}">
                      <i class="${item.icon}" aria-hidden="true"></i><span>${t(`nav.${item.id}`)}</span>
                      ${item.badge ? html`<span class="side-link__badge" data-badge="${item.id}" hidden></span>` : ''}
                    </a>`,
                )}`;
            })}
          </nav>
          <div class="sidebar__footer">
            ${state.user
              ? html`<p class="sidebar__user"><i class="ri-user-3-line" aria-hidden="true"></i><span>${state.user.name || state.user.username} · ${t(`role.${state.user.role}`)}</span></p>`
              : ''}
            <a class="side-link" href="/" target="_blank" rel="noopener"><i class="ri-external-link-line" aria-hidden="true"></i><span>${t('nav.viewSite')}</span></a>
            <button class="side-link" type="button" data-lang><i class="ri-translate-2" aria-hidden="true"></i><span>${t('nav.language')}</span></button>
            <button class="side-link" type="button" data-logout><i class="ri-logout-box-r-line flip-rtl" aria-hidden="true"></i><span>${t('nav.logout')}</span></button>
          </div>
        </aside>
        <div class="nav-backdrop" data-nav-close></div>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-toggle" type="button" data-nav-open aria-label="${t('nav.menu')}"><i class="ri-menu-line"></i></button>
            <h1 class="topbar__title" data-title></h1>
            <div class="topbar__actions" data-actions></div>
          </header>
          <div class="content" data-content></div>
        </div>
      </div>`,
  );
  applyBrand();

  const shell = $('[data-shell]');
  $('[data-nav-open]').addEventListener('click', () => shell.classList.add('is-nav-open'));
  $('[data-nav-close]').addEventListener('click', () => shell.classList.remove('is-nav-open'));
  $('[data-lang]', shell).addEventListener('click', () => setLang(lang() === 'ar' ? 'en' : 'ar'));
  $('[data-logout]', shell).addEventListener('click', async () => {
    try {
      await adminApi('/logout', { method: 'POST' });
    } catch {
      /* signing out locally is enough */
    }
    clearSession();
    showLogin();
  });
}

async function route() {
  const routeId = ++state.routeId;
  const requested = currentViewId();
  const id = VIEWS[requested] && allowedViews().some((item) => item.id === requested) ? requested : DEFAULT_VIEW;
  // Keep the address bar honest when a view is not available to this account.
  if (id !== requested) window.history.replaceState(null, '', `#/${id}`);
  state.cleanup?.();
  state.cleanup = null;

  $('[data-shell]')?.classList.remove('is-nav-open');
  $$('[data-nav]').forEach((link) => {
    if (link.dataset.nav === id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('[data-title]').textContent = t(`nav.${id}`);

  const content = $('[data-content]');
  const actions = $('[data-actions]');
  render(actions, '');
  content.classList.add('is-loading');
  try {
    const cleanup = await VIEWS[id].mount({ content, actions, ctx });
    if (routeId !== state.routeId) return;
    state.cleanup = cleanup ?? null;
    if (state.usingDefaultPassword) {
      content.insertAdjacentHTML(
        'afterbegin',
        String(html`<div class="banner"><i class="ri-shield-keyhole-line" aria-hidden="true"></i><span>${t('banner.defaultPassword')}</span><a href="#/settings?security">${t('banner.action')}</a></div>`),
      );
    }
  } catch (err) {
    if (err.status === 401 || routeId !== state.routeId) return;
    render(content, html`<div class="card"><p class="empty">${errorText(err)}</p></div>`);
  } finally {
    if (routeId === state.routeId) content.classList.remove('is-loading');
  }
}

// --- Live badges & new-booking alerts --------------------------------------------------------

async function refreshBadges() {
  let data;
  try {
    data = await adminApi('/overview');
  } catch {
    return;
  }
  const setBadge = (id, count) => {
    const badge = $(`[data-badge="${id}"]`);
    if (!badge) return;
    badge.hidden = !count;
    badge.textContent = String(count);
  };
  setBadge('bookings', data.bookingsByStatus.pending.count);
  setBadge('inbox', data.unreadMessages);
  setBadge('chats', data.unreadChats);

  const previous = state.totalBookings;
  state.totalBookings = data.totalBookings;
  if (previous !== null && data.totalBookings > previous) {
    try {
      const { bookings: list } = await adminApi('/bookings');
      toast(t('toast.newBooking', { name: list[0]?.customerName ?? '' }));
    } catch {
      /* the badge already shows it */
    }
    const busy = document.querySelector('dialog[open]');
    if (!busy && ['overview', 'bookings'].includes(currentViewId())) route();
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (!document.hidden) refreshBadges();
  }, POLL_MS);
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

// --- Boot ------------------------------------------------------------------------------------

async function startApp() {
  try {
    const [{ settings: loaded }, session] = await Promise.all([adminApi('/settings'), adminApi('/session')]);
    state.settings = loaded;
    state.user = session.user;
    state.usingDefaultPassword = session.usingDefaultPassword;
  } catch (err) {
    if (err.status !== 401) showLogin(errorText(err));
    return;
  }
  renderShell();
  if (!state.started) {
    window.addEventListener('hashchange', route);
    state.started = true;
  }
  state.totalBookings = null;
  await route();
  refreshBadges();
  startPolling();
}

onUnauthorized((err) => showLogin(errorText(err)));

document.addEventListener('langchange', () => {
  if (!currentSession()) {
    showLogin();
    return;
  }
  renderShell();
  route();
  refreshBadges();
});

if (currentSession()) startApp();
else showLogin();
