/* Shared header / footer / mobile menu for every page.
   Runs synchronously at the top of <body> so there is no layout flash. */
(function () {
  var script = document.currentScript;
  var active = (script && script.getAttribute('data-active')) || '';
  var activeSub = (script && script.getAttribute('data-active-sub')) || '';
  document.documentElement.classList.add('js');
  // Safety net: never leave the page invisible if main.js fails to load
  setTimeout(function () { if (document.body) document.body.classList.add('is-ready'); }, 2500);

  var SERVICES = [
    { href: 'service-luxury-weddings.html', label: 'Luxury Weddings' },
    { href: 'service-corporate-experiences.html', label: 'Corporate Experiences' },
    { href: 'service-conferences-summits.html', label: 'Conferences and Summits' },
    { href: 'service-brand-activations.html', label: 'Brand Activations and Launches' },
    { href: 'service-galas-fundraisers.html', label: 'Galas and Fundraisers' },
    { href: 'service-political-community.html', label: 'Political and Community Events' },
    { href: 'service-destination.html', label: 'Destination Celebrations' },
    { href: 'service-private-milestones.html', label: 'Private Milestones and Social Gatherings' },
    { href: 'service-kids.html', label: "Elevated Children's Experiences" },
    { href: 'service-proposals.html', label: 'Proposals' }
  ];
  function cls(key) { return active === key ? ' is-active' : ''; }
  function subLinks(items) {
    return items.map(function (i) {
      return '<a href="' + i.href + '" class="' + (activeSub === i.href ? 'is-active' : '') + (i.isNew ? ' is-new' : '') + '">' + i.label + '</a>';
    }).join('');
  }

  var brand =
    '<a class="brand" href="index.html" aria-label="Pearls 360 Design & Planning — Home">' +
      '<img class="brand__mark" src="assets/img/logo.png" alt="" width="44" height="44">' +
      '<span class="brand__text">PEARLS 360<small>Design &amp; Planning</small></span>' +
    '</a>';

  var header =
    '<header class="site-header" id="site-header">' +
      '<div class="container site-header__inner">' +
        brand +
        '<nav class="nav" aria-label="Primary">' +
          '<div class="nav__item' + cls('home') + '"><a class="nav__link" href="index.html">Home</a></div>' +
          '<div class="nav__item' + cls('about') + '"><a class="nav__link" href="about.html">About</a></div>' +
          '<div class="nav__item' + cls('services') + '"><a class="nav__link" href="services.html">Services<span class="chev"></span></a>' +
            '<div class="nav__dropdown">' + subLinks(SERVICES) + '</div></div>' +
          '<div class="nav__item' + cls('portfolio') + '"><a class="nav__link" href="portfolio.html">Portfolio</a></div>' +
          '<div class="nav__item' + cls('team') + '"><a class="nav__link" href="team.html">Team</a></div>' +
          '<div class="nav__item' + cls('careers') + '"><a class="nav__link" href="careers.html">Careers</a></div>' +
          '<div class="nav__item' + cls('blog') + '"><a class="nav__link" href="blog.html">Journal</a></div>' +
          '<div class="nav__item' + cls('faqs') + '"><a class="nav__link" href="faqs.html">FAQ</a></div>' +
        '</nav>' +
        '<div class="header-cta"><a class="btn btn--ghost" href="contact.html">Begin Your Inquiry</a></div>' +
        '<button class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="menu-overlay"><span></span><span></span><span></span></button>' +
      '</div>' +
    '</header>' +
    '<div class="menu-overlay" id="menu-overlay" aria-hidden="true">' +
      '<ul class="menu-overlay__list">' +
        '<li><a href="index.html">Home</a></li>' +
        '<li><a href="about.html">About</a></li>' +
        '<li><button type="button" data-sub aria-expanded="false">Services<span class="menu-plus" aria-hidden="true"></span></button><div class="menu-overlay__sub"><div>' + subLinks(SERVICES) + '</div></div></li>' +
        '<li><a href="portfolio.html">Portfolio</a></li>' +
        '<li><a href="team.html">Team</a></li>' +
        '<li><a href="careers.html">Careers</a></li>' +
        '<li><a href="blog.html">Journal</a></li>' +
        '<li><a href="faqs.html">FAQ</a></li>' +
        '<li><a href="contact.html">Begin Your Inquiry</a></li>' +
      '</ul>' +
      '<div class="menu-overlay__meta">' +
        '<a href="tel:+12407911532">+1 (240) 791-1532</a>' +
        '<a href="mailto:Info@pearls360design.com">Info@pearls360design.com</a>' +
        '<span>Washington DC · Maryland · Worldwide</span>' +
      '</div>' +
    '</div>';

  script.insertAdjacentHTML('afterend', header);

  var ICON_IG = '<svg viewBox="0 0 24 24"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm5.9-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM12 2c-2.7 0-3 0-4.1.1-1.1 0-1.8.2-2.5.5a5 5 0 0 0-1.8 1.2A5 5 0 0 0 2.4 5.6c-.3.7-.4 1.4-.5 2.5C2 9 2 9.3 2 12s0 3 .1 4.1c0 1.1.2 1.8.5 2.5a5 5 0 0 0 1.2 1.8 5 5 0 0 0 1.8 1.2c.7.3 1.4.4 2.5.5H12c2.7 0 3 0 4.1-.1 1.1 0 1.8-.2 2.5-.5a5 5 0 0 0 1.8-1.2 5 5 0 0 0 1.2-1.8c.3-.7.4-1.4.5-2.5V12c0-2.7 0-3-.1-4.1 0-1.1-.2-1.8-.5-2.5a5 5 0 0 0-1.2-1.8 5 5 0 0 0-1.8-1.2c-.7-.3-1.4-.4-2.5-.5H12zm0 1.8h4c1 0 1.5.2 1.9.3.5.2.8.4 1.2.8.4.4.6.7.8 1.2.1.4.3.9.3 1.9v8c0 1-.2 1.5-.3 1.9-.2.5-.4.8-.8 1.2-.4.4-.7.6-1.2.8-.4.1-.9.3-1.9.3h-8c-1 0-1.5-.2-1.9-.3a3.2 3.2 0 0 1-1.2-.8 3.2 3.2 0 0 1-.8-1.2c-.1-.4-.3-.9-.3-1.9v-8c0-1 .2-1.5.3-1.9.2-.5.4-.8.8-1.2.4-.4.7-.6 1.2-.8.4-.1.9-.3 1.9-.3h4z"/></svg>';
  var ICON_FB = '<svg viewBox="0 0 24 24"><path d="M13.5 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.3h2.8V22h3.4z"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.5 2.1-.8 3.3-.2 1 .5 1.8 1.5 1.8 1.8 0 3.1-1.9 3.1-4.5 0-2.4-1.7-4-4.1-4a4.3 4.3 0 0 0-4.5 4.3c0 .9.3 1.8.7 2.3.1.1.1.2.1.3l-.3 1.1c0 .2-.1.2-.3.1-1.2-.6-2-2.4-2-3.8 0-3.1 2.3-6 6.5-6 3.4 0 6.1 2.4 6.1 5.7 0 3.4-2.1 6.1-5.1 6.1-1 0-1.9-.5-2.3-1.1l-.6 2.4c-.2.9-.8 2-1.2 2.6A10 10 0 1 0 12 2z"/></svg>';
  var ICON_TT = '<svg viewBox="0 0 24 24"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.5V9.7a5.7 5.7 0 0 0-6.5 5.6 5.7 5.7 0 0 0 5.7 5.7 5.7 5.7 0 0 0 5.7-5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z"/></svg>';

  var footer =
    '<footer class="site-footer">' +
      '<div class="footer-marquee marquee marquee--big" aria-hidden="true"><div class="marquee__track" data-marquee>' +
        '<span class="marquee__item">Crafting <em>Timeless</em> Celebrations <i></i></span>' +
        '<span class="marquee__item">Design. Plan. <em>Celebrate.</em> <i></i></span>' +
        '<span class="marquee__item">Turning Dreams into <em>Remarkable</em> Realities <i></i></span>' +
      '</div></div>' +
      '<div class="container">' +
        '<div class="site-footer__top">' +
          '<div class="site-footer__brand">' + brand +
            '<p>Luxury weddings, corporate experiences and destination celebrations designed with intention, artistry and emotion. Washington DC · Maryland · Worldwide.</p>' +
            '<div class="socials">' +
              '<a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="Instagram">' + ICON_IG + '</a>' +
              '<a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="Facebook">' + ICON_FB + '</a>' +
              '<a href="https://www.pinterest.com/" target="_blank" rel="noopener" aria-label="Pinterest">' + ICON_PIN + '</a>' +
              '<a href="https://www.tiktok.com/" target="_blank" rel="noopener" aria-label="TikTok">' + ICON_TT + '</a>' +
            '</div>' +
          '</div>' +
          '<div><h4>Explore</h4><ul>' +
            '<li><a href="index.html">Home</a></li><li><a href="about.html">About Us</a></li><li><a href="services.html">Services</a></li>' +
            '<li><a href="portfolio.html">Portfolio</a></li><li><a href="team.html">Team</a></li><li><a href="careers.html">Careers</a></li><li><a href="blog.html">Journal</a></li>' +
            '<li><a href="faqs.html">FAQ</a></li><li><a href="contact.html">Contact</a></li>' +
          '</ul></div>' +
          '<div><h4>Services</h4><ul>' + SERVICES.map(function (s) { return '<li><a href="' + s.href + '">' + s.label + '</a></li>'; }).join('') + '</ul></div>' +
          '<div class="site-footer__contact"><h4>Begin Your Inquiry</h4>' +
            '<p>Studio</p><a href="contact.html">1810 Kings Way Street, USA</a>' +
            '<p>Phone</p><a href="tel:+12407911532">+1 (240) 791-1532</a>' +
            '<p>Email</p><a href="mailto:Info@pearls360design.com">Info@pearls360design.com</a>' +
          '</div>' +
        '</div>' +
        '<div class="site-footer__bottom">' +
          '<span>&copy; <span data-year></span> Pearls 360 Design &amp; Planning. All rights reserved.</span>' +
          '<span><a href="privacy-policy.html">Privacy Policy</a> &nbsp;·&nbsp; <a href="terms.html">Terms &amp; Conditions</a></span>' +
        '</div>' +
      '</div>' +
    '</footer>' +
    '<button class="to-top" aria-label="Back to top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>';

  document.addEventListener('DOMContentLoaded', function () {
    document.body.insertAdjacentHTML('beforeend', footer);
    var y = document.querySelector('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
