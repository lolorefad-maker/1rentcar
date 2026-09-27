import { $, $$, html, render } from '../core/dom.js';
import { t } from '../core/i18n.js';

const SWIPE_THRESHOLD = 40;

/** Main image + thumbnails + fullscreen lightbox, with keyboard and swipe support. */
export function createGallery(root, images, { name }) {
  let index = 0;
  const count = images.length;
  const direction = () => (document.documentElement.dir === 'rtl' ? -1 : 1);

  function viewTag(src) {
    if (!src) return '';
    if (src.includes('interior')) return t('car.view.interior');
    if (src.includes('rear')) return t('car.view.rear');
    if (src.includes('detail')) return t('car.view.detail');
    return t('car.view.cover');
  }

  render(
    root,
    html`
      <div class="gallery__main">
        ${count ? html`<img src="${images[0].src}?v=bespoke" alt="${name}" data-main-image>` : ''}
        ${count ? html`<span class="badge badge--gold gallery__tag" data-tag style="position: absolute; inset-block-start: 1rem; inset-inline-start: 1rem; z-index: 2; pointer-events: none; backdrop-filter: blur(8px);"></span>` : ''}
        ${count ? html`<button class="gallery__zoom" type="button" data-zoom data-i18n-attr="aria-label:car.zoom"></button>` : ''}
        ${count > 1
          ? html`<button class="icon-btn gallery__nav gallery__nav--prev" type="button" data-step="-1" data-i18n-attr="aria-label:car.prev"><i class="ri-arrow-left-s-line flip-rtl"></i></button>
                 <button class="icon-btn gallery__nav gallery__nav--next" type="button" data-step="1" data-i18n-attr="aria-label:car.next"><i class="ri-arrow-right-s-line flip-rtl"></i></button>
                 <span class="badge gallery__counter" data-counter></span>`
          : ''}
      </div>
      ${count > 1
        ? html`<div class="gallery__thumbs">${images.map(
            (image, i) => html`<button class="thumb" type="button" data-thumb="${i}"><img src="${image.thumb}?v=bespoke" alt="" loading="lazy"></button>`,
          )}</div>`
        : ''}`,
  );

  const lightbox = document.createElement('dialog');
  lightbox.className = 'lightbox';
  render(
    lightbox,
    html`
      <div class="lightbox__stage">
        <img alt="${name}" data-lightbox-image>
        <span class="badge badge--gold gallery__tag" data-tag style="position: absolute; inset-block-start: 1.5rem; inset-inline-start: 1.5rem; z-index: 2; pointer-events: none; backdrop-filter: blur(8px);"></span>
      </div>
      <button class="icon-btn lightbox__close" type="button" data-close data-i18n-attr="aria-label:car.closePhoto"><i class="ri-close-line"></i></button>
      ${count > 1
        ? html`<button class="icon-btn gallery__nav gallery__nav--prev" type="button" data-step="-1" data-i18n-attr="aria-label:car.prev"><i class="ri-arrow-left-s-line flip-rtl"></i></button>
               <button class="icon-btn gallery__nav gallery__nav--next" type="button" data-step="1" data-i18n-attr="aria-label:car.next"><i class="ri-arrow-right-s-line flip-rtl"></i></button>
               <span class="badge gallery__counter" data-counter></span>`
        : ''}`,
  );
  document.body.append(lightbox);

  function refreshLabels() {
    for (const el of [root, lightbox]) {
      $$('[data-i18n-attr]', el).forEach((node) => {
        const [attr, key] = node.dataset.i18nAttr.split(':');
        node.setAttribute(attr, t(key));
      });
    }
    $$('[data-thumb]', root).forEach((thumb) => thumb.setAttribute('aria-label', t('car.thumb', { n: Number(thumb.dataset.thumb) + 1 })));
    if (count) {
      const tagText = viewTag(images[index]?.src);
      $$('[data-tag]', root).concat($$('[data-tag]', lightbox)).forEach((el) => {
        el.textContent = tagText;
      });
    }
  }

  function show(next) {
    if (!count) return;
    index = (next + count) % count;
    const image = images[index];
    const main = $('[data-main-image]', root);
    main.src = image.src;
    $('[data-lightbox-image]', lightbox).src = image.src;
    const tagText = viewTag(image.src);
    $$('[data-tag]', root).concat($$('[data-tag]', lightbox)).forEach((el) => {
      el.textContent = tagText;
    });
    $$('[data-counter]', root).concat($$('[data-counter]', lightbox)).forEach((el) => {
      el.textContent = `${index + 1} / ${count}`;
    });
    $$('[data-thumb]', root).forEach((thumb, i) => {
      thumb.classList.toggle('is-active', i === index);
      thumb.setAttribute('aria-current', String(i === index));
      if (i === index) thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function onClick(event) {
    const step = event.target.closest('[data-step]');
    if (step) show(index + Number(step.dataset.step));
    const thumb = event.target.closest('[data-thumb]');
    if (thumb) show(Number(thumb.dataset.thumb));
  }

  root.addEventListener('click', (event) => {
    onClick(event);
    if (event.target.closest('[data-zoom]')) lightbox.showModal();
  });
  lightbox.addEventListener('click', (event) => {
    onClick(event);
    if (event.target.closest('[data-close]') || event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') show(index + direction());
    if (event.key === 'ArrowLeft') show(index - direction());
  });

  let startX = null;
  root.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
  });
  root.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) > SWIPE_THRESHOLD) show(index - Math.sign(delta) * direction());
  });

  refreshLabels();
  show(0);
  return { refreshLabels };
}
