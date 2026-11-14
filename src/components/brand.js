import { setText } from '../utils/dom.js';

export function applyBrand(config, pageTitle) {
  document.querySelectorAll('[data-brand]').forEach((element) => { element.textContent = config.brandName; });
  document.title = `${pageTitle} · ${config.brandName}`;
  setText('[data-year]', new Date().getFullYear());
}
