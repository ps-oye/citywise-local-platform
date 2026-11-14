export function setText(selector, value, root = document) {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
  return element;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
