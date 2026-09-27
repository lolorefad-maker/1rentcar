import { $, html, raw, render } from '../../core/dom.js';
import { formatTimestamp } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { checkRow, confirmDialog, errorText, field, openModal, readForm, selected, showFieldErrors, toast, uniqueId, withBusy } from '../ui.js';

const ROLES = ['owner', 'manager', 'staff'];

/** Activity codes read as plain sentences; unknown ones fall back to the raw code. */
function actionLabel(action) {
  const key = `activity.${action}`;
  const text = t(key);
  return text === key ? action : text;
}
const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;

function openUserEditor(ctx, user, onSaved) {
  const isNew = !user;
  const values = user ?? { username: '', name: '', role: 'staff', isActive: true };
  const formId = uniqueId('user-form');
  const { dialog, close } = openModal({
    title: isNew ? t('team.newTitle') : t('team.editTitle', { name: user.name || user.username }),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(t('field.username'), input('username', values.username, `maxlength="30" autocomplete="off" pattern="[A-Za-z0-9._-]{3,30}" ${isNew ? 'required' : 'disabled'}`))}
        ${field(t('field.fullName'), input('name', values.name, 'maxlength="80"'))}
        ${field(
          t('field.role'),
          html`<select class="control" name="role">${ROLES.map((role) => html`<option value="${role}"${selected(role === values.role)}>${t(`role.${role}`)}</option>`)}</select>`,
          { hint: t(`role.${values.role}Hint`) },
        )}
        ${field(t('field.password'), html`<input class="control" type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128"${raw(isNew ? ' required' : '')}>`, {
          hint: isNew ? '' : t('team.passwordHint'),
        })}
        ${checkRow('isActive', values.isActive, t('field.accountActive'))}
        <p class="form-error span-all" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('common.save')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  const roleSelect = form.elements.namedItem('role');
  roleSelect.addEventListener('change', () => {
    const hint = roleSelect.closest('.field').querySelector('.field__hint');
    if (hint) hint.textContent = t(`role.${roleSelect.value}Hint`);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const body = readForm(form);
    if (!body.password) delete body.password;
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        const { user: saved } = isNew
          ? await ctx.api('/users', { method: 'POST', body })
          : await ctx.api(`/users/${user.id}`, { method: 'PUT', body });
        toast(t('common.saved'));
        close();
        onSaved(saved);
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

export async function mount({ content, actions, ctx }) {
  const [{ users }, { activity }] = await Promise.all([ctx.api('/users'), ctx.api('/activity')]);
  const state = { users, activity };

  render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-add><i class="ri-user-add-line" aria-hidden="true"></i>${t('team.add')}</button>`);

  function draw() {
    render(
      content,
      html`
        <section class="card">
          <div class="card__head"><div><h2 class="card__title">${t('team.users')}</h2><p class="card__sub">${t('team.hint')}</p></div></div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>${t('field.username')}</th><th>${t('col.role')}</th><th>${t('team.lastLogin')}</th><th>${t('col.status')}</th><th><span class="sr-only">${t('common.actions')}</span></th></tr>
              </thead>
              <tbody>
                ${state.users.map(
                  (user) => html`
                    <tr data-id="${user.id}" class="${user.isActive ? '' : 'is-dim'}">
                      <td>
                        <span class="cell-main">${user.name || user.username}</span>
                        <div class="cell-sub mono">${user.username}${user.id === ctx.user?.id ? html` · ${t('team.you')}` : ''}</div>
                      </td>
                      <td><span class="badge badge--${user.role === 'owner' ? 'accent' : 'muted'}">${t(`role.${user.role}`)}</span></td>
                      <td class="nowrap">${user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : t('team.never')}</td>
                      <td>${user.isActive ? html`<span class="badge badge--ok">${t('common.yes')}</span>` : html`<span class="badge">${t('common.no')}</span>`}</td>
                      <td>
                        <div class="row-actions">
                          <button class="icon-btn icon-btn--sm" type="button" data-edit aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
                          <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>
                        </div>
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h2 class="card__title">${t('team.activity')}</h2></div>
          ${state.activity.length === 0
            ? html`<p class="empty">${t('team.activityEmpty')}</p>`
            : html`
              <div class="table-wrap table-wrap--scroll">
                <table class="table table--compact">
                  <thead><tr><th>${t('col.when')}</th><th>${t('col.who')}</th><th>${t('col.change')}</th></tr></thead>
                  <tbody>
                    ${state.activity.map(
                      (entry) => html`
                        <tr>
                          <td class="nowrap cell-sub">${formatTimestamp(entry.createdAt)}</td>
                          <td class="mono">${entry.userName}</td>
                          <td><span class="cell-main">${actionLabel(entry.action)}</span>${entry.summary ? html`<div class="cell-sub">${entry.summary}</div>` : ''}</td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );
  }

  function replace(saved) {
    const index = state.users.findIndex((user) => user.id === saved.id);
    if (index >= 0) state.users[index] = saved;
    else state.users.push(saved);
    draw();
  }

  content.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const user = state.users.find((item) => item.id === Number(row.dataset.id));
    if (event.target.closest('[data-edit]')) openUserEditor(ctx, user, replace);
    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('team.confirmDelete', { name: user.name || user.username })))) return;
      try {
        await ctx.api(`/users/${user.id}`, { method: 'DELETE' });
        state.users = state.users.filter((item) => item.id !== user.id);
        draw();
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  $('[data-add]', actions).addEventListener('click', () => openUserEditor(ctx, null, replace));
  draw();
}
