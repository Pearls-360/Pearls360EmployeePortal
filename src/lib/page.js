/** Reveals the page once it is safe to show (pairs with the `.js body` fade in base.css). */
export function markReady() {
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}

export function setYear() {
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}
