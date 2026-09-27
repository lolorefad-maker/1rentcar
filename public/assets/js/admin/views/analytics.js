import { $, html, render } from '../../core/dom.js';
import { formatCompactMoney, formatDate, formatMoney, formatNumber, toLocalInput } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { barList, columnChart } from '../charts.js';
import { errorText, readForm, toast } from '../ui.js';

const MONTH_FORMAT = { year: 'numeric', month: 'short', timeZone: 'UTC' };

const tile = ({ icon, label, value, hint, hero = false }) => html`
  <article class="tile${hero ? ' tile--hero' : ''}">
    <p class="tile__label"><i class="${icon}" aria-hidden="true"></i>${label}</p>
    <p class="tile__value">${value}</p>
    <p class="tile__hint">${hint}</p>
  </article>`;

const today = () => toLocalInput(new Date()).slice(0, 10);
const shift = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalInput(date).slice(0, 10);
};
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

const PRESETS = [
  { id: 'last30', from: () => shift(-30) },
  { id: 'last90', from: () => shift(-90) },
  { id: 'thisYear', from: startOfYear },
];

function csvOf(analytics, currency) {
  const rows = [
    ['section', 'label', 'value'],
    ['summary', 'revenue', analytics.revenue],
    ['summary', 'expenses', analytics.expenses],
    ['summary', 'netProfit', analytics.netProfit],
    ['summary', 'collected', analytics.collected],
    ['summary', 'conversionPercent', analytics.conversionPercent],
    ['summary', 'fleetUtilisationPercent', analytics.fleetUtilisationPercent],
    ['summary', 'currency', currency],
    ...analytics.trend.map((row) => ['month', row.month, row.revenue]),
    ...analytics.channels.map((row) => ['channel', row.channel, row.revenue]),
    ...analytics.expensesByCategory.map((row) => ['expense', row.category, row.amount]),
    ...analytics.utilisation.map((row) => ['utilisation', row.carName, row.days]),
    ...analytics.topCars.map((row) => ['car', row.carName, row.revenue]),
    ...analytics.topCustomers.map((row) => ['customer', `${row.customerName} ${row.phone}`, row.spent]),
  ];
  const escape = (value) => (/[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  const blob = new Blob([`﻿${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `analytics-${analytics.period.from}_${analytics.period.to}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function mount({ content, actions, ctx }) {
  const state = { from: shift(-90), to: today(), data: null };
  const currency = ctx.settings.currency;
  const money = (amount) => formatMoney(amount, currency);
  const monthLabel = (month) => new Intl.DateTimeFormat(undefined, MONTH_FORMAT).format(new Date(`${month}-01T00:00:00Z`));

  render(actions, html`<button class="btn btn--ghost btn--sm" type="button" data-export><i class="ri-download-2-line" aria-hidden="true"></i>${t('common.export')}</button>`);
  $('[data-export]', actions).addEventListener('click', () => state.data && csvOf(state.data, currency));

  function draw() {
    const data = state.data;
    render(
      content,
      html`
        <section class="card">
          <form class="toolbar toolbar--wrap" data-period>
            ${PRESETS.map((preset) => html`<button class="chip" type="button" data-preset="${preset.id}">${t(`analytics.${preset.id}`)}</button>`)}
            <input class="control control--sm" type="date" name="from" value="${state.from}" aria-label="${t('common.from')}">
            <input class="control control--sm" type="date" name="to" value="${state.to}" aria-label="${t('common.to')}">
            <button class="btn btn--ghost btn--sm" type="submit">${t('common.apply')}</button>
            <span class="cell-sub">${t('analytics.days', { n: data.period.days })}</span>
          </form>
        </section>

        <section class="tiles">
          ${tile({ icon: 'ri-money-dollar-circle-line', label: t('analytics.revenue'), value: money(data.revenue), hint: `${formatDate(`${data.period.from}T00:00`)} → ${formatDate(`${data.period.to}T00:00`)}`, hero: true })}
          ${tile({ icon: 'ri-wallet-3-line', label: t('analytics.collected'), value: money(data.collected), hint: t('payments.paid') })}
          ${tile({ icon: 'ri-tools-line', label: t('analytics.expenses'), value: money(data.expenses), hint: t('inventory.expenses') })}
          ${tile({ icon: 'ri-line-chart-line', label: t('analytics.net'), value: money(data.netProfit), hint: t('analytics.net') })}
          ${tile({ icon: 'ri-percent-line', label: t('analytics.conversion'), value: `${data.conversionPercent}%`, hint: t('analytics.requests') })}
          ${tile({ icon: 'ri-roadster-line', label: t('analytics.utilisation'), value: `${data.fleetUtilisationPercent}%`, hint: t('analytics.days', { n: data.period.days }) })}
        </section>

        <section class="card">
          <header class="card__head"><div><h2 class="card__title">${t('analytics.trend')}</h2><p class="card__sub">${t('analytics.trendSub')}</p></div></header>
          <div class="card__body" data-trend></div>
          <div class="table-wrap">
            <table class="table table--compact">
              <thead><tr><th>${t('analytics.month')}</th><th class="num">${t('analytics.revenue')}</th><th class="num">${t('nav.bookings')}</th></tr></thead>
              <tbody>${data.trend.map((row) => html`<tr><td>${monthLabel(row.month)}</td><td class="num">${money(row.revenue)}</td><td class="num">${formatNumber(row.bookings)}</td></tr>`)}</tbody>
            </table>
          </div>
        </section>

        <section class="grid-2">
          <article class="card">
            <header class="card__head"><div><h2 class="card__title">${t('analytics.perCar')}</h2><p class="card__sub">${t('analytics.perCarSub')}</p></div></header>
            <div class="card__body">
              ${data.utilisation.length
                ? barList(data.utilisation.map((row) => ({ label: row.carName, value: row.days, display: `${t('analytics.days', { n: row.days })} · ${t('analytics.ofPeriod', { percent: row.percent })}` })))
                : html`<p class="empty">${t('analytics.noData')}</p>`}
            </div>
          </article>

          <article class="card">
            <header class="card__head"><h2 class="card__title">${t('analytics.topCars')}</h2></header>
            <div class="card__body">
              ${data.topCars.length
                ? barList(data.topCars.map((row) => ({ label: row.carName, value: row.revenue, display: money(row.revenue) })))
                : html`<p class="empty">${t('analytics.noData')}</p>`}
            </div>
          </article>

          <article class="card">
            <header class="card__head"><h2 class="card__title">${t('analytics.byChannel')}</h2></header>
            <div class="card__body">
              ${data.channels.length
                ? barList(data.channels.map((row) => ({ label: t(`channel.${row.channel}`), value: row.count, display: `${formatNumber(row.count)} · ${money(row.revenue)}` })))
                : html`<p class="empty">${t('analytics.noData')}</p>`}
            </div>
          </article>

          <article class="card">
            <header class="card__head"><h2 class="card__title">${t('analytics.byCategory')}</h2></header>
            <div class="card__body">
              ${data.expensesByCategory.length
                ? barList(data.expensesByCategory.map((row) => ({ label: t(`expenseCat.${row.category}`), value: row.amount, display: money(row.amount) })))
                : html`<p class="empty">${t('inventory.emptyExpenses')}</p>`}
            </div>
          </article>
        </section>

        <section class="card">
          <header class="card__head"><h2 class="card__title">${t('analytics.topCustomers')}</h2></header>
          ${data.topCustomers.length === 0
            ? html`<p class="empty">${t('analytics.noData')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table table--compact">
                  <thead><tr><th>${t('col.customer')}</th><th class="num">${t('nav.bookings')}</th><th class="num">${t('col.spent')}</th></tr></thead>
                  <tbody>
                    ${data.topCustomers.map(
                      (row) => html`
                        <tr>
                          <td><span class="cell-main">${row.customerName}</span><div class="cell-sub" dir="ltr">${row.phone}</div></td>
                          <td class="num">${formatNumber(row.bookings)}</td>
                          <td class="num"><strong>${money(row.spent)}</strong></td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );

    columnChart(
      $('[data-trend]', content),
      data.trend.map((row) => ({ label: monthLabel(row.month), value: row.revenue, detail: t('overview.bookingsCount', { n: row.bookings }) })),
      {
        formatValue: money,
        formatTick: (value) => formatCompactMoney(value, currency),
        emptyText: t('analytics.noData'),
        ariaLabel: t('analytics.trend'),
      },
    );
  }

  async function load() {
    content.classList.add('is-loading');
    try {
      const { analytics } = await ctx.api(`/analytics?from=${state.from}&to=${state.to}`);
      state.data = analytics;
      draw();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      content.classList.remove('is-loading');
    }
  }

  content.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-period]')) return;
    event.preventDefault();
    const data = readForm(event.target);
    state.from = data.from;
    state.to = data.to;
    load();
  });

  content.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (!button) return;
    const preset = PRESETS.find((item) => item.id === button.dataset.preset);
    state.from = preset.from();
    state.to = today();
    load();
  });

  await load();
}
