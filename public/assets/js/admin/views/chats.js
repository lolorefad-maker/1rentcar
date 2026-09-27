import { $, html, render, richText } from '../../core/dom.js';
import { formatTimestamp } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, openModal, toast } from '../ui.js';

export async function mount({ content, actions, ctx }) {
  let chats = (await ctx.api('/chats')).chats;

  render(actions, html`<button class="btn btn--ghost btn--sm" type="button" data-refresh><i class="ri-refresh-line" aria-hidden="true"></i>${t('common.refresh')}</button>`);

  function draw() {
    render(
      content,
      html`
        <section class="card">
          <div class="card__head"><p class="card__sub">${t('chats.hint')}</p></div>
          ${chats.length === 0
            ? html`<p class="empty">${t('chats.empty')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>${t('col.conversation')}</th><th class="num">${t('chats.messages', { n: '' })}</th>
                      <th>${t('col.language')}</th><th>${t('col.when')}</th><th><span class="sr-only">${t('common.actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${chats.map(
                      (chat) => html`
                        <tr class="is-clickable" data-id="${chat.id}">
                          <td>
                            <span class="cell-main">${chat.lastMessage || '—'}</span>
                            ${chat.isRead ? '' : html`<span class="badge badge--accent">${t('chats.unread')}</span>`}
                          </td>
                          <td class="num">${chat.messageCount}</td>
                          <td>${chat.lang === 'ar' ? 'العربية' : 'English'}</td>
                          <td class="nowrap">${formatTimestamp(chat.updatedAt)}</td>
                          <td>
                            <div class="row-actions">
                              <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>
                            </div>
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );
  }

  async function openTranscript(chat) {
    const { messages } = await ctx.api(`/chats/${chat.id}`);
    openModal({
      title: t('chats.transcript'),
      size: 'md',
      content: html`
        <div class="transcript">
          ${messages.map(
            (message) => html`
              <div class="transcript__row transcript__row--${message.role}">
                <span class="transcript__who">${message.role === 'user' ? t('chats.visitor') : t('chats.bot')}</span>
                <p class="transcript__text">${richText(message.text)}</p>
                <time class="transcript__time">${formatTimestamp(message.createdAt)}</time>
              </div>`,
          )}
        </div>`,
      footer: html`<button class="btn btn--ghost" type="button" data-modal-close>${t('common.close')}</button>`,
    });

    if (!chat.isRead) {
      try {
        const { chat: updated } = await ctx.api(`/chats/${chat.id}`, { method: 'PATCH', body: { isRead: true } });
        Object.assign(chat, updated);
        draw();
        ctx.refreshBadges();
      } catch {
        /* marking as read is not critical */
      }
    }
  }

  content.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const chat = chats.find((item) => item.id === Number(row.dataset.id));
    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('chats.confirmDelete')))) return;
      try {
        await ctx.api(`/chats/${chat.id}`, { method: 'DELETE' });
        chats = chats.filter((item) => item.id !== chat.id);
        draw();
        toast(t('common.deleted'));
        ctx.refreshBadges();
      } catch (err) {
        toast(errorText(err), 'error');
      }
      return;
    }
    openTranscript(chat).catch((err) => toast(errorText(err), 'error'));
  });

  $('[data-refresh]', actions).addEventListener('click', async () => {
    chats = (await ctx.api('/chats')).chats;
    draw();
  });

  draw();
}
