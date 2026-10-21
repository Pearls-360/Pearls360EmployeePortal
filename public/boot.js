// Runs before first paint (external so the Content-Security-Policy can forbid inline scripts).
document.documentElement.classList.add('js');
try {
  var theme = localStorage.getItem('p360-theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}
setTimeout(function () {
  if (document.body) document.body.classList.add('is-ready');
}, 2500);
