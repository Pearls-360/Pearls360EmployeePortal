// Runs before first paint (external so the Content-Security-Policy can forbid inline scripts).
document.documentElement.classList.add('js');
document.documentElement.setAttribute('data-theme', 'light');
setTimeout(function () {
  if (document.body) document.body.classList.add('is-ready');
}, 2500);
