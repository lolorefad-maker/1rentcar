import { html, render } from '../../core/dom.js';
import { formatTimestamp } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, toast, whatsappLink } from '../ui.js';

export async function mount({ content, ctx }) {
  let messages = (await ctx.api('/messages')).messages;
  let filter = messages.some((message) => !message.isRead) ? 'unread' : 'all';

  function messageHtml(message) {
    const wa = message.phone ? whatsappLink(message.phone) : '';
    return html`
      <article class="message${message.isRead ? '' : ' is-unread'}" data-id="${message.id}">
        <div class="message__head">
          <span class="message__name">${message.name}</span>
          ${message.phone ? html`<a class="cell-sub" dir="ltr" href="tel:${message.phone.replace(/[^\d+]/g, '')}">${message.phone}</a>` : ''}
          ${message.email ? html`<a class="cell-sub" href="mailto:${message.email}">${message.email}</a>` : ''}
          <span class="badge badge--muted">${t(`source.${message.source}`)}</span>
          ${message.carName ? html`<span class="cell-sub">${t('inbox.about', { car: message.carName })}</span>` : ''}
          <span class="message__time">${formatTimestamp(message.createdAt)}</span>
        </div>
        <p class="message__body">${message.message}</p>
        <div class="message__actions">
          <button class="btn btn--ghost btn--sm" type="button" data-toggle-read>
            <i class="${message.isRead ? 'ri-mail-unread-line' : 'ri-mail-check-line'}" aria-hidden="true"></i>${message.isRead ? t('inbox.markUnread') : t('inbox.markRead')}
          </button>
          ${wa ? html`<a class="btn btn--whatsapp btn--sm" href="${wa}" target="_blank" rel="noopener"><i class="ri-whatsapp-line" aria-hidden="true"></i>${t('inbox.reply')}</a>` : ''}
          ${message.email ? html`<a class="btn btn--ghost btn--sm" href="mailto:${message.email}"><i class="ri-mail-send-line" aria-hidden="true"></i>${t('inbox.email')}</a>` : ''}
          <button class="btn btn--danger btn--sm" type="button" data-delete><i class="ri-delete-bin-line" aria-hidden="true"></i>${t('common.delete')}</button>
        </div>
      </article>`;
  }

  function draw() {
    const unread = messages.filter((message) => !message.isRead).length;
    const visible = filter === 'unread' ? messages.filter((message) => !message.isRead) : messages;
    render(
      content,
      html`
        <section class="card">
          <div class="card__head">
            <div class="segmented" role="group">
              <button type="button" data-filter="unread" aria-pressed="${filter === 'unread'}">${t('inbox.unread')} (${unread})</button>
              <button type="button" data-filter="all" aria-pressed="${filter === 'all'}">${t('inbox.all')} (${messages.length})</button>
            </div>
          </div>
          <div>${visible.length ? visible.map(messageHtml) : html`<p class="empty">${t('inbox.empty')}</p>`}</div>
        </section>`,
    );
  }

  content.addEventListener('click', async (event) => {
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      filter = filterButton.dataset.filter;
      draw();
      return;
    }
    const article = event.target.closest('[data-id]');
    if (!article) return;
    const message = messages.find((item) => item.id === Number(article.dataset.id));

    if (event.target.closest('[data-toggle-read]')) {
      try {
        const { message: updated } = await ctx.api(`/messages/${message.id}`, { method: 'PATCH', body: { isRead: !message.isRead } });
        Object.assign(message, updated);
        draw();
        ctx.refreshBadges();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }

    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('inbox.confirmDelete', { name: message.name })))) return;
      try {
        await ctx.api(`/messages/${message.id}`, { method: 'DELETE' });
        messages = messages.filter((item) => item.id !== message.id);
        draw();
        toast(t('common.deleted'));
        ctx.refreshBadges();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  draw();
}
