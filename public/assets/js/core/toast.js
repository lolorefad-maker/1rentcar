import { html, render } from './dom.js';

let stack;

/** Short, non-blocking confirmation / error message at the bottom of the screen. */
export function toast(message, type = 'success') {
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const item = document.createElement('div');
  item.className = `toast toast--${type}`;
  const icon = type === 'error' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
  render(item, html`<i class="${icon}" aria-hidden="true"></i><span>${message}</span>`);
  stack.append(item);
  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 300);
  }, 4200);
}
