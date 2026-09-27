import { $, html, raw, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { errorText, field, readForm, selected, showFieldErrors, toast, withBusy } from '../ui.js';

const CURRENCIES = ['USD', 'JOD', 'EUR', 'AED', 'SAR'];

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;

const card = (key, title, hint, body, extraActions = '') => html`
  <form class="card" data-form="${key}" novalidate>
    <div class="card__head">
      <div>
        <h2 class="card__title">${title}</h2>
        ${hint ? html`<p class="card__sub">${hint}</p>` : ''}
      </div>
      <div class="toolbar">${extraActions}<button class="btn btn--primary btn--sm" type="submit">${key === 'security' ? t('settings.changePassword') : t('common.save')}</button></div>
    </div>
    <div class="card__body form-grid">${body}</div>
  </form>`;

export async function mount({ content, ctx }) {
  const s = ctx.settings;
  // Staff may only change their own password; business settings are manager-only.
  const manages = ctx.can('manager');

  render(
    content,
    html`
      ${manages ? card(
        'business',
        t('settings.business'),
        t('settings.businessHint'),
        html`
          ${field(t('field.businessName'), input('businessName', s.businessName, 'required maxlength="60"'))}
          ${field(t('field.email'), input('email', s.email, 'type="email" maxlength="120"'))}
          ${field(t('field.phone'), input('phone', s.phone, 'maxlength="30" dir="ltr"'))}
          ${field(t('field.whatsapp'), input('whatsapp', s.whatsapp, 'maxlength="20" inputmode="numeric" dir="ltr"'), { hint: t('field.whatsappHint') })}
          ${field(t('field.addressEn'), input('addressEn', s.addressEn, 'maxlength="200"'))}
          ${field(t('field.addressAr'), input('addressAr', s.addressAr, 'maxlength="200" dir="rtl"'))}
          ${field(t('field.hoursEn'), input('hoursEn', s.hoursEn, 'maxlength="100"'))}
          ${field(t('field.hoursAr'), input('hoursAr', s.hoursAr, 'maxlength="100" dir="rtl"'))}
          ${field(t('field.instagramUrl'), input('instagramUrl', s.instagramUrl, 'type="url" maxlength="300" dir="ltr"'))}
          ${field(t('field.facebookUrl'), input('facebookUrl', s.facebookUrl, 'type="url" maxlength="300" dir="ltr"'))}
          ${field(t('field.tiktokUrl'), input('tiktokUrl', s.tiktokUrl, 'type="url" maxlength="300" dir="ltr"'))}`,
      ) : ''}
      ${manages ? card(
        'pricing',
        t('settings.pricing'),
        t('settings.pricingHint'),
        html`
          ${field(
            t('field.currency'),
            html`<select class="control" name="currency">${CURRENCIES.map((code) => html`<option value="${code}"${selected(code === s.currency)}>${code}</option>`)}</select>`,
          )}
          ${field(t('field.minimumNoticeHours'), input('minimumNoticeHours', s.minimumNoticeHours, 'type="number" min="0" max="720" required'))}
          ${field(t('field.airportFee'), input('airportFee', s.airportFee, 'type="number" min="0" step="1" required'))}
          ${field(t('field.chauffeurDailyRate'), input('chauffeurDailyRate', s.chauffeurDailyRate, 'type="number" min="0" step="1" required'))}
          ${field(t('field.weeklyDiscountPercent'), input('weeklyDiscountPercent', s.weeklyDiscountPercent, 'type="number" min="0" max="90" required'))}
          ${field(t('field.monthlyDiscountPercent'), input('monthlyDiscountPercent', s.monthlyDiscountPercent, 'type="number" min="0" max="90" required'))}`,
      ) : ''}
      ${manages ? card(
        'automation',
        t('settings.automation'),
        t('settings.automationHint'),
        field(t('field.webhookUrl'), input('webhookUrl', s.webhookUrl, 'type="url" maxlength="500" dir="ltr" placeholder="https://…"'), { span: true }),
        html`<button class="btn btn--ghost btn--sm" type="button" data-test-webhook><i class="ri-send-plane-line flip-rtl" aria-hidden="true"></i>${t('settings.test')}</button>`,
      ) : ''}
      ${card(
        'security',
        t('settings.security'),
        '',
        html`
          ${field(t('field.currentPassword'), input('currentPassword', '', 'type="password" required autocomplete="current-password"'), { span: true })}
          ${field(t('field.newPassword'), input('newPassword', '', 'type="password" required minlength="8" autocomplete="new-password"'))}
          ${field(t('field.confirmPassword'), input('confirmPassword', '', 'type="password" required minlength="8" autocomplete="new-password"'))}`,
      )}`,
  );

  async function saveSettings(form, keys) {
    const data = readForm(form);
    const patch = Object.fromEntries(keys.map((key) => [key, data[key]]));
    try {
      const { settings } = await ctx.api('/settings', { method: 'PUT', body: patch });
      ctx.setSettings(settings);
      showFieldErrors(form, null);
      toast(t('common.saved'));
    } catch (err) {
      showFieldErrors(form, err);
      toast(errorText(err), 'error');
    }
  }

  const FORM_KEYS = {
    business: ['businessName', 'email', 'phone', 'whatsapp', 'addressEn', 'addressAr', 'hoursEn', 'hoursAr', 'instagramUrl', 'facebookUrl', 'tiktokUrl'],
    pricing: ['currency', 'minimumNoticeHours', 'airportFee', 'chauffeurDailyRate', 'weeklyDiscountPercent', 'monthlyDiscountPercent'],
    automation: ['webhookUrl'],
  };

  content.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const key = form.dataset.form;
    const button = $('button[type="submit"]', form);

    if (key === 'security') {
      const data = readForm(form);
      if (!form.reportValidity()) return;
      if (data.newPassword !== data.confirmPassword) {
        toast(t('settings.passwordMismatch'), 'error');
        form.elements.namedItem('confirmPassword').setAttribute('aria-invalid', 'true');
        return;
      }
      await withBusy(button, async () => {
        try {
          await ctx.api('/password', { method: 'PUT', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
          form.reset();
          showFieldErrors(form, null);
          ctx.setUsingDefaultPassword(false);
          document.querySelector('.banner')?.remove();
          toast(t('settings.passwordChanged'));
        } catch (err) {
          showFieldErrors(form, err);
          toast(errorText(err), 'error');
        }
      });
      return;
    }

    await withBusy(button, () => saveSettings(form, FORM_KEYS[key]));
  });

  $('[data-test-webhook]', content)?.addEventListener('click', async (event) => {
    const url = content.querySelector('[data-form="automation"]').elements.namedItem('webhookUrl').value.trim();
    await withBusy(event.currentTarget, async () => {
      try {
        const result = await ctx.api('/webhook/test', { method: 'POST', body: { url } });
        toast(t('settings.testResult', { status: result.status }), result.ok ? 'success' : 'error');
      } catch (err) {
        toast(errorText(err), 'error');
      }
    });
  });

  if (window.location.hash.includes('security')) {
    content.querySelector('[data-form="security"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
