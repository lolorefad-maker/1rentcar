import { $, html, render } from '../../core/dom.js';
import { formatCompactMoney, formatDateTime, formatMoney, formatNumber, formatShortDate } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { barList, columnChart } from '../charts.js';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const STATUS_ICONS = {
  pending: 'ri-time-line',
  confirmed: 'ri-checkbox-circle-line',
  completed: 'ri-flag-2-line',
  cancelled: 'ri-close-circle-line',
};

const tile = ({ icon, label, value, hint, hero = false }) => html`
  <article class="tile${hero ? ' tile--hero' : ''}">
    <p class="tile__label"><i class="${icon}" aria-hidden="true"></i>${label}</p>
    <p class="tile__value">${value}</p>
    <p class="tile__hint">${hint}</p>
  </article>`;

function bookingList(rows, dateField, emptyText) {
  if (rows.length === 0) return html`<p class="empty">${emptyText}</p>`;
  return html`${rows.map(
    (row) => html`
      <a class="list-row" href="#/bookings?open=${row.id}">
        <span><span class="cell-main">${row.customerName}</span><br><span class="cell-sub">${row.carName}</span></span>
        <span class="nowrap">${formatDateTime(row[dateField])}</span>
      </a>`,
  )}`;
}

export async function mount({ content, actions, ctx }) {
  const [data, { alerts }] = await Promise.all([ctx.api('/overview'), ctx.api('/fleet-alerts')]);
  const currency = ctx.settings.currency;
  const money = (amount) => formatMoney(amount, currency);
  const pending = data.bookingsByStatus.pending;

  render(actions, html`<button class="btn btn--ghost btn--sm" type="button" data-refresh><i class="ri-refresh-line" aria-hidden="true"></i>${t('common.refresh')}</button>`);
  $('[data-refresh]', actions).addEventListener('click', () => ctx.rerender());

  render(
    content,
    html`
      <section class="tiles">
        ${tile({ icon: 'ri-money-dollar-circle-line', label: t('overview.revenue'), value: money(data.revenue), hint: t('overview.revenueHint'), hero: true })}
        ${tile({ icon: 'ri-time-line', label: t('overview.pipeline'), value: formatNumber(pending.count), hint: t('overview.pipelineHint', { value: money(pending.value) }) })}
        ${tile({ icon: 'ri-key-2-line', label: t('overview.onRent'), value: formatNumber(data.fleet.onRent), hint: t('overview.onRentHint', { active: data.fleet.active }) })}
        ${tile({ icon: 'ri-bar-chart-line', label: t('overview.average'), value: money(data.averageBookingValue), hint: t('overview.averageHint') })}
        ${tile({ icon: 'ri-mail-unread-line', label: t('overview.unread'), value: formatNumber(data.unreadMessages + data.unreadChats), hint: t('overview.unreadHint') })}
        ${tile({ icon: 'ri-wallet-3-line', label: t('overview.outstanding'), value: money(data.outstanding), hint: t('overview.outstandingHint') })}
        ${tile({ icon: 'ri-tools-line', label: t('overview.monthExpenses'), value: money(data.monthExpenses), hint: t('inventory.expenses') })}
      </section>

      ${alerts.length
        ? html`
          <section class="card">
            <header class="card__head">
              <h2 class="card__title">${t('overview.alerts')}</h2>
              <a class="btn btn--ghost btn--sm" href="#/inventory">${t('nav.inventory')}</a>
            </header>
            <ul class="alert-list">
              ${alerts.slice(0, 6).map(
                (alert) => html`
                  <li class="alert-list__item alert-list__item--${alert.severity}">
                    <span class="alert-list__badge">${t(`alert.${alert.severity}`)}</span>
                    <div>
                      <span class="cell-main">${alert.carName}</span>
                      <div class="cell-sub">${t(`alert.${alert.type}`)}${alert.date ? ` · ${formatShortDate(`${alert.date}T00:00`)}` : ''}</div>
                    </div>
                  </li>`,
              )}
            </ul>
          </section>`
        : ''}

      <section class="grid-wide">
        <article class="card">
          <header class="card__head">
            <div>
              <h2 class="card__title">${t('overview.trend')}</h2>
              <p class="card__sub">${t('overview.trendSub')}</p>
            </div>
            <div class="segmented" role="group" data-trend-mode>
              <button type="button" data-mode="chart" aria-pressed="true">${t('overview.showChart')}</button>
              <button type="button" data-mode="table" aria-pressed="false">${t('overview.showTable')}</button>
            </div>
          </header>
          <div class="card__body" data-trend></div>
        </article>

        <article class="card">
          <header class="card__head"><h2 class="card__title">${t('overview.status')}</h2></header>
          <div class="status-list">
            ${STATUSES.map(
              (status) => html`
                <a class="status-row" href="#/bookings">
                  <i class="${STATUS_ICONS[status]} tone-${status}" aria-hidden="true"></i>
                  <span>${t(`status.${status}`)}</span>
                  <span class="status-row__count">${formatNumber(data.bookingsByStatus[status].count)}</span>
                  <span class="status-row__value">${money(data.bookingsByStatus[status].value)}</span>
                </a>`,
            )}
          </div>
        </article>
      </section>

      <section class="grid-2">
        <article class="card">
          <header class="card__head"><h2 class="card__title">${t('overview.topCars')}</h2></header>
          <div class="card__body">
            ${data.topCars.length
              ? barList(
                  data.topCars.map((car) => ({
                    label: car.carName,
                    value: car.bookings,
                    display: `${t('overview.bookingsCount', { n: car.bookings })} · ${money(car.revenue)}`,
                  })),
                )
              : html`<p class="empty">${t('overview.topCarsEmpty')}</p>`}
          </div>
        </article>

        <article class="card">
          <header class="card__head"><h2 class="card__title">${t('overview.pickups')}</h2></header>
          <div>${bookingList(data.upcomingPickups, 'pickupAt', t('overview.noPickups'))}</div>
          <header class="card__head" style="border-top: 1px solid var(--line)"><h2 class="card__title">${t('overview.returns')}</h2></header>
          <div>${bookingList(data.dueReturns, 'returnAt', t('overview.noReturns'))}</div>
        </article>
      </section>`,
  );

  const trendEl = $('[data-trend]', content);
  const points = data.trend.map((day) => ({
    label: formatShortDate(`${day.day}T00:00`),
    value: day.revenue,
    bookings: day.bookings,
    detail: t('overview.bookingsCount', { n: day.bookings }),
  }));

  function showChart() {
    columnChart(trendEl, points, {
      formatValue: money,
      formatTick: (value) => formatCompactMoney(value, currency),
      emptyText: t('overview.noRevenue'),
      ariaLabel: t('overview.trend'),
    });
  }

  function showTable() {
    render(
      trendEl,
      html`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>${t('overview.day')}</th><th class="num">${t('overview.value')}</th><th class="num">${t('overview.bookings')}</th></tr></thead>
            <tbody>${points.map((point) => html`<tr><td>${point.label}</td><td class="num">${money(point.value)}</td><td class="num">${point.bookings}</td></tr>`)}</tbody>
          </table>
        </div>`,
    );
  }

  $('[data-trend-mode]', content).addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    event.currentTarget.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    if (button.dataset.mode === 'table') showTable();
    else showChart();
  });

  showChart();
}
