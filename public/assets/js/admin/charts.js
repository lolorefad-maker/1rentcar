/**
 * Small SVG charts for the dashboard, following the dataviz method:
 * one validated series colour, ≤24px columns with 4px rounded data-ends,
 * hairline grid, hover/focus tooltip, and a table twin provided by the caller.
 */
import { html, render } from '../core/dom.js';

const WIDTH = 720;
const PAD = { top: 16, right: 12, bottom: 30, left: 60 };
const TICKS = 4;
const MAX_BAR = 24;

function niceMax(value) {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Column with a rounded top (data end) and a square baseline. */
function columnPath(x, y, width, height) {
  const r = Math.min(4, height, width / 2);
  const bottom = y + height;
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${bottom}Z`;
}

/**
 * @param data   [{ label, value, detail }]
 * @param opts   { height, formatValue, formatTick, emptyText, ariaLabel }
 */
export function columnChart(container, data, { height = 250, formatValue, formatTick, emptyText, ariaLabel }) {
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(MAX_BAR, band * 0.62);
  const labelEvery = Math.ceil(data.length / 6);
  const y = (value) => (max ? baseline - (value / max) * plotHeight : baseline);
  const ticks = max ? Array.from({ length: TICKS + 1 }, (_, i) => (max / TICKS) * i) : [0];

  render(
    container,
    html`
      <div class="chart" dir="ltr">
        <svg viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${ariaLabel}">
          ${ticks.map(
            (tick) => html`
              <line class="${tick === 0 ? 'baseline' : 'gridline'}" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
              <text class="tick" x="${PAD.left - 10}" y="${y(tick) + 4}" text-anchor="end">${formatTick(tick)}</text>`,
          )}
          ${data.map((d, i) => {
            const x = PAD.left + i * band;
            const barHeight = baseline - y(d.value);
            return html`
              <rect class="hit" x="${x}" y="${PAD.top}" width="${band}" height="${plotHeight}" tabindex="0" data-index="${i}"
                aria-label="${d.label}: ${formatValue(d.value)}"></rect>
              ${barHeight > 0 ? html`<path class="bar" d="${columnPath(x + (band - barWidth) / 2, y(d.value), barWidth, barHeight)}"></path>` : html`<path class="bar" d=""></path>`}
              ${i % labelEvery === 0 ? html`<text class="tick" x="${x + band / 2}" y="${height - 8}" text-anchor="middle">${d.label}</text>` : ''}`;
          })}
          ${max === 0 && emptyText
            ? html`<text class="tick" x="${PAD.left + plotWidth / 2}" y="${PAD.top + plotHeight / 2}" text-anchor="middle">${emptyText}</text>`
            : ''}
        </svg>
        <div class="chart-tooltip" hidden></div>
      </div>`,
  );

  const chart = container.querySelector('.chart');
  const svg = chart.querySelector('svg');
  const tooltip = chart.querySelector('.chart-tooltip');

  function show(target) {
    const d = data[Number(target.dataset.index)];
    const scale = svg.getBoundingClientRect().width / WIDTH;
    const index = Number(target.dataset.index);
    const strong = document.createElement('strong');
    strong.textContent = formatValue(d.value);
    const detail = document.createElement('span');
    detail.textContent = d.detail ? `${d.label} · ${d.detail}` : d.label;
    tooltip.replaceChildren(strong, detail);
    tooltip.style.left = `${(PAD.left + index * band + band / 2) * scale}px`;
    tooltip.style.top = `${y(d.value) * scale}px`;
    tooltip.hidden = false;
  }

  const hide = () => {
    tooltip.hidden = true;
  };

  svg.addEventListener('pointerover', (event) => {
    if (event.target.classList.contains('hit')) show(event.target);
  });
  svg.addEventListener('focusin', (event) => {
    if (event.target.classList.contains('hit')) show(event.target);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focusout', hide);
}

/** Horizontal single-series bars with the value at the tip (label → value on one row, bar below). */
export function barList(rows) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return html`<div class="bar-list">${rows.map(
    (row) => html`
      <div class="bar-row">
        <span class="bar-row__label" title="${row.label}">${row.label}</span>
        <span class="bar-row__value">${row.display}</span>
        <span class="bar-row__bar" style="width: ${Math.max(1, (row.value / max) * 100)}%"></span>
      </div>`,
  )}</div>`;
}
