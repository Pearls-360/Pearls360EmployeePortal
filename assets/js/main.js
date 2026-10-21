/* Pearls 360 — interaction & motion layer
   Lenis (smooth scroll) + GSAP ScrollTrigger. Degrades gracefully without them. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  var hasLenis = typeof Lenis !== 'undefined';
  var lenis = null;

  if (!hasGsap || reduced) {
    // Show everything immediately; CSS initial states are keyed off html.js
    document.documentElement.classList.remove('js');
  }

  function q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- Smooth scroll */
  function initScroll() {
    if (!hasGsap) return;
    gsap.registerPlugin(ScrollTrigger);
    if (hasLenis && !reduced && !('ontouchstart' in window && window.innerWidth < 900)) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }
  function scrollTo(target, offset) {
    var shift = offset == null ? -80 : offset;
    if (lenis) lenis.scrollTo(target, { offset: shift, duration: 1 });
    else if (typeof target === 'number') window.scrollTo({ top: Math.max(0, target + shift), behavior: 'smooth' });
    else window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.pageYOffset + shift), behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- Header */
  function initHeader() {
    var header = q('#site-header');
    if (!header) return;
    var lastY = window.scrollY, ticking = false;
    function update() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 40);
      if (y > 200 && y > lastY + 4 && !document.body.classList.contains('menu-open')) header.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 200) header.classList.remove('is-hidden');
      lastY = y; ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();

    var toTop = q('.to-top');
    if (toTop) {
      window.addEventListener('scroll', function () { toTop.classList.toggle('is-visible', window.scrollY > 800); }, { passive: true });
      toTop.addEventListener('click', function () { scrollTo(0); });
    }
  }

  /* ---------------------------------------------------------------- Mobile menu */
  function initMenu() {
    var toggle = q('.nav-toggle'), overlay = q('#menu-overlay');
    if (!toggle || !overlay) return;
    function setOpen(open) {
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      overlay.setAttribute('aria-hidden', String(!open));
      if (!open) {
        qa('[data-sub]', overlay).forEach(function (btn) {
          btn.parentElement.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        });
      }
      if (lenis) open ? lenis.stop() : lenis.start();
      document.documentElement.style.overflow = open ? 'hidden' : '';
    }
    toggle.addEventListener('click', function () { setOpen(!document.body.classList.contains('menu-open')); });
    qa('[data-sub]', overlay).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var li = btn.parentElement;
        var willOpen = !li.classList.contains('is-open');
        qa('[data-sub]', overlay).forEach(function (other) {
          other.parentElement.classList.remove('is-open');
          other.setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          li.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1100) setOpen(false); });
  }

  /* ---------------------------------------------------------------- Text splitting */
  function splitLines(el) {
    if (el.dataset.split === 'done') return;
    var frag = document.createDocumentFragment();
    function words(text, italic) {
      var parts = text.split(/(\s+)/);
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span');
        w.className = 'w' + (italic ? ' i' : '');
        w.textContent = p;
        w.style.display = 'inline-block';
        if (italic) w.style.fontStyle = 'italic';
        frag.appendChild(w);
      });
    }
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) words(n.nodeValue, false);
      else if (n.nodeType === 1 && (n.tagName === 'EM' || n.tagName === 'I')) words(n.textContent, true);
      else if (n.nodeType === 1 && n.tagName === 'BR') frag.appendChild(document.createElement('br'));
      else words(n.textContent, false);
    });
    el.innerHTML = '';
    el.appendChild(frag);

    var ws = qa('.w', el), lines = [], current = null, lastTop = null;
    ws.forEach(function (w) {
      var top = w.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 4) { current = []; lines.push(current); lastTop = top; }
      current.push(w);
    });
    el.innerHTML = '';
    lines.forEach(function (line) {
      var l = document.createElement('span'); l.className = 'line';
      var inner = document.createElement('span');
      line.forEach(function (w, i) {
        if (i) inner.appendChild(document.createTextNode(' '));
        w.style.display = '';
        inner.appendChild(w);
      });
      l.appendChild(inner); el.appendChild(l);
    });
    el.dataset.split = 'done';
    return qa('.line > span', el);
  }

  /* ---------------------------------------------------------------- Scroll animations */
  function initReveals() {
    if (!hasGsap || reduced) return;
    var ease = 'power3.out';

    function inHomeHero(el) {
      return !!(el.closest && el.closest('.hero'));
    }
    function inFirstBand(el) {
      if (inHomeHero(el)) return false;
      if (el.closest && el.closest('.page-hero')) return true;
      var section = el.closest && el.closest('.section');
      if (!section) return false;
      var prev = section.previousElementSibling;
      return !!(prev && prev.classList.contains('page-hero'));
    }
    function triggerFor(el) {
      if (inHomeHero(el) || inFirstBand(el)) return null;
      return {
        trigger: el,
        start: 'top 98%',
        toggleActions: 'play none none none'
      };
    }

    // Split headings — cinematic on the home hero, quick elsewhere
    qa('.split-lines').forEach(function (el) {
      var spans = splitLines(el);
      if (!spans || !spans.length) return;
      var home = inHomeHero(el);
      var vars = {
        y: 0,
        duration: home ? 1.1 : 0.62,
        ease: ease,
        stagger: home ? 0.09 : 0.045
      };
      var st = triggerFor(el);
      if (st) vars.scrollTrigger = st;
      gsap.to(spans, vars);
    });

    // Generic reveals
    qa('[data-reveal]').forEach(function (el) {
      var home = inHomeHero(el);
      var delay = parseFloat(el.dataset.delay || 0);
      if (!home) delay = Math.min(delay, 0.12);
      var vars = {
        opacity: 1, x: 0, y: 0, scale: 1,
        duration: home ? 1.1 : 0.55,
        ease: ease,
        delay: delay
      };
      var st = triggerFor(el);
      if (st) vars.scrollTrigger = st;
      gsap.to(el, vars);
    });

    // Staggered children
    qa('[data-stagger]').forEach(function (el) {
      var home = inHomeHero(el);
      var stagger = parseFloat(el.dataset.stagger) || 0.12;
      if (!home) stagger = Math.min(stagger, 0.07);
      var vars = {
        opacity: 1, y: 0,
        duration: home ? 1 : 0.5,
        ease: ease,
        stagger: stagger
      };
      var st = triggerFor(el);
      if (st) vars.scrollTrigger = st;
      gsap.to(el.children, vars);
    });

    // Image curtain reveal
    qa('.reveal-mask').forEach(function (el) {
      var cover = document.createElement('span');
      cover.className = 'reveal-mask__cover';
      el.appendChild(cover);
      var img = el.querySelector('img, .media, video');
      var home = inHomeHero(el);
      var st = triggerFor(el);
      var tl = gsap.timeline(st ? { scrollTrigger: st } : {});
      tl.to(cover, { scaleY: 0, duration: home ? 1.3 : 0.7, ease: home ? 'power4.inOut' : 'power3.inOut' }, 0);
      if (img) tl.to(img, { scale: 1, duration: home ? 1.8 : 0.95, ease: 'power3.out' }, home ? 0.1 : 0.04);
    });

    // Parallax for bleed and tagged media
    qa('.bleed img, [data-parallax] img').forEach(function (img) {
      gsap.fromTo(img, { yPercent: -8 }, {
        yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // Process step top lines
    qa('.steps').forEach(function (steps) {
      var lines = qa('.step__line', steps);
      if (!lines.length) return;
      gsap.to(lines, { width: '100%', duration: 1.2, ease: 'power2.inOut', stagger: 0.2,
        scrollTrigger: { trigger: steps, start: 'top 80%', toggleActions: 'play none play none' } });
    });

    // Counters
    qa('[data-count]').forEach(function (el) {
      var target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 2, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none play none' },
        onUpdate: function () { el.textContent = Math.round(obj.v).toLocaleString('en-US') + suffix; }
      });
    });

    // Pinned intro text scale (subtle) on hero titles
    qa('[data-hero-fade]').forEach(function (el) {
      gsap.to(el, { opacity: 0, y: -40, ease: 'none',
        scrollTrigger: { trigger: el.closest('.hero') || el, start: 'top top', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------------------------------------------------------------- Marquee */
  function initMarquee() {
    qa('[data-marquee]').forEach(function (track) {
      var items = qa('.marquee__item', track);
      if (!items.length) return;
      var wrapW = track.parentElement.offsetWidth;
      var contentW = track.scrollWidth;
      var i = 0;
      while (track.scrollWidth < wrapW * 2 + contentW && i < 12) {
        items.forEach(function (it) { track.appendChild(it.cloneNode(true)); });
        i++;
      }
      var loopW = 0;
      items.forEach(function (it) { loopW += it.offsetWidth; });
      var speed = parseFloat(track.dataset.speed || 60); // px per second
      if (hasGsap && !reduced) {
        gsap.to(track, { x: -loopW, duration: loopW / speed, ease: 'none', repeat: -1 });
      } else if (!reduced) {
        track.style.animation = 'marquee ' + (loopW / speed) + 's linear infinite';
        track.style.setProperty('--loop', '-' + loopW + 'px');
      }
    });
  }

  /* ---------------------------------------------------------------- Hero slideshow */
  function initHero() {
    var hero = q('.hero'); if (!hero) return;
    var slides = qa('.hero__slide', hero); if (slides.length < 2) { slides[0] && slides[0].classList.add('is-active'); return; }
    var idx = 0, timer, progress = q('.hero__progress span', hero), counter = q('.hero__counter b', hero);
    var DUR = 6500;
    function go(n) {
      slides[idx].classList.remove('is-active');
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add('is-active');
      if (counter) counter.textContent = String(idx + 1).padStart(2, '0');
      restart();
    }
    function restart() {
      clearTimeout(timer);
      if (progress) { progress.style.transition = 'none'; progress.style.width = '0'; void progress.offsetWidth; progress.style.transition = 'width ' + DUR + 'ms linear'; progress.style.width = '100%'; }
      timer = setTimeout(function () { go(idx + 1); }, DUR);
    }
    slides[0].classList.add('is-active');
    restart();
    var prev = q('.hero__arrow--prev', hero), next = q('.hero__arrow--next', hero);
    if (prev) prev.addEventListener('click', function () { go(idx - 1); });
    if (next) next.addEventListener('click', function () { go(idx + 1); });
    document.addEventListener('visibilitychange', function () { document.hidden ? clearTimeout(timer) : restart(); });
  }

  /* ---------------------------------------------------------------- Testimonials */
  function initTestimonials() {
    qa('.testimonials').forEach(function (root) {
      var items = qa('.testimonial', root), dotsWrap = q('.testimonials__dots', root);
      if (!items.length) return;
      var idx = 0, timer, DUR = 7000;
      var dots = items.map(function (_, i) {
        var b = document.createElement('button'); b.setAttribute('aria-label', 'Testimonial ' + (i + 1));
        b.addEventListener('click', function () { show(i); });
        dotsWrap && dotsWrap.appendChild(b); return b;
      });
      function show(n) {
        items[idx].classList.remove('is-active'); dots[idx] && dots[idx].classList.remove('is-active');
        idx = (n + items.length) % items.length;
        items[idx].classList.add('is-active'); dots[idx] && dots[idx].classList.add('is-active');
        clearTimeout(timer); timer = setTimeout(function () { show(idx + 1); }, DUR);
      }
      // size the track to tallest item
      var h = 0; items.forEach(function (it) { it.style.position = 'relative'; it.style.visibility = 'visible'; h = Math.max(h, it.offsetHeight); it.style.position = ''; it.style.visibility = ''; });
      var track = q('.testimonials__track', root); if (track) track.style.minHeight = h + 'px';
      show(0);
    });
  }

  /* ---------------------------------------------------------------- FAQ */
  function initFaq() {
    qa('.faq__item').forEach(function (item) {
      var btn = q('.faq__q', item);
      btn && btn.addEventListener('click', function () {
        var open = item.classList.contains('is-open');
        qa('.faq__item.is-open', item.parentElement).forEach(function (o) { o.classList.remove('is-open'); q('.faq__q', o).setAttribute('aria-expanded', 'false'); });
        if (!open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  /* ---------------------------------------------------------------- Gallery + lightbox */
  function initGallery() {
    var galleries = qa('.gallery'); if (!galleries.length) return;
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt=""><button class="lightbox__close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<button class="lightbox__prev" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="lightbox__next" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<div class="lightbox__count"></div>';
    document.body.appendChild(lb);
    var img = q('img', lb), count = q('.lightbox__count', lb), list = [], idx = 0;
    function open(items, i) { list = items; idx = i; render(); lb.classList.add('is-open'); if (lenis) lenis.stop(); document.documentElement.style.overflow = 'hidden'; }
    function close() { lb.classList.remove('is-open'); if (lenis) lenis.start(); document.documentElement.style.overflow = ''; }
    function render() { var f = list[idx], src = f.querySelector('img'); img.src = src.dataset.full || src.src; img.alt = src.alt; count.textContent = (idx + 1) + ' / ' + list.length; }
    function step(d) { idx = (idx + d + list.length) % list.length; render(); }
    q('.lightbox__close', lb).addEventListener('click', close);
    q('.lightbox__prev', lb).addEventListener('click', function () { step(-1); });
    q('.lightbox__next', lb).addEventListener('click', function () { step(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);
    });

    galleries.forEach(function (g) {
      qa('figure', g).forEach(function (fig) {
        fig.addEventListener('click', function () {
          var visible = qa('figure', g).filter(function (f) { return !f.classList.contains('is-hidden'); });
          open(visible, visible.indexOf(fig));
        });
      });
      // filters
      var filters = q('.filters[data-for="' + g.id + '"]');
      if (filters) {
        qa('button', filters).forEach(function (b) {
          b.addEventListener('click', function () {
            qa('button', filters).forEach(function (x) { x.classList.remove('is-active'); }); b.classList.add('is-active');
            var f = b.dataset.filter;
            qa('figure', g).forEach(function (fig) {
              var show = f === 'all' || (fig.dataset.tags || '').split(' ').indexOf(f) > -1;
              fig.classList.toggle('is-hidden', !show);
            });
            if (hasGsap) { gsap.fromTo(qa('figure:not(.is-hidden)', g), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .7, stagger: .03, ease: 'power3.out' }); ScrollTrigger.refresh(); }
          });
        });
      }
      // stagger in on scroll
      if (hasGsap && !reduced) {
        qa('figure', g).forEach(function (fig, i) {
          gsap.fromTo(fig, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: fig, start: 'top 92%', toggleActions: 'play none play none' } });
        });
      }
    });
  }

  /* ---------------------------------------------------------------- Reels */
  function initReels() {
    qa('.reel').forEach(function (reel) {
      var v = q('video', reel); if (!v) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { v.play().then(function () { reel.classList.add('is-playing'); }).catch(function () {}); }
          else { v.pause(); reel.classList.remove('is-playing'); }
        });
      }, { threshold: 0.35 });
      io.observe(reel);
      var btn = q('.reel__play', reel);
      btn && btn.addEventListener('click', function () { if (v.paused) { v.play(); reel.classList.add('is-playing'); } else { v.pause(); reel.classList.remove('is-playing'); } });
      v.addEventListener('pause', function () { reel.classList.remove('is-playing'); });
      v.addEventListener('play', function () { reel.classList.add('is-playing'); });
    });
  }

  /* ---------------------------------------------------------------- Contact form */
  function initForm() {
    var form = q('form[data-inquiry]'); if (!form) return;
    qa('input[type="file"]', form).forEach(function (input) {
      input.addEventListener('change', function () {
        var wrap = input.closest('.field');
        var label = wrap && q('[data-file-label]', wrap);
        var file = input.files && input.files[0];
        if (wrap) wrap.classList.toggle('has-file', !!file);
        if (label) label.textContent = file ? file.name : (label.getAttribute('data-empty') || 'PDF or Word — optional');
      });
    });
    var steps = qa('.form__step', form);
    var index = 0;
    var back = q('[data-form-back]', form);
    var next = q('[data-form-next]', form);
    var submit = q('[data-form-submit]', form);
    var note = q('[data-form-note]', form);
    var page = q('[data-form-page]', form);
    var bar = q('[data-form-bar]', form);

    function fieldWrap(el) { return el.closest('.field'); }

    function setInvalid(el, invalid, message) {
      var wrap = fieldWrap(el);
      if (!wrap) return;
      wrap.classList.toggle('is-invalid', invalid);
      el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      var msg = q('.field__error', wrap);
      if (invalid) {
        if (!msg) {
          msg = document.createElement('p');
          msg.className = 'field__error';
          wrap.appendChild(msg);
        }
        msg.textContent = message || 'This field is required.';
      } else if (msg) {
        msg.remove();
      }
    }

    function stepValid(step) {
      var fields = qa('input, textarea, select', step);
      var first = null;
      var seen = {};
      fields.forEach(function (el) {
        if (el.type === 'file') return;
        if (el.type === 'radio' || el.type === 'checkbox') {
          if (seen[el.name]) return;
          seen[el.name] = true;
          var group = qa('input[name="' + el.name.replace(/"/g, '\\"') + '"]', step);
          var required = group.some(function (item) { return item.required; });
          if (!required) return;
          var checked = group.some(function (item) { return item.checked; });
          group.forEach(function (item) { setInvalid(item, !checked, 'Please choose an option.'); });
          if (!checked && !first) first = fieldWrap(el) || el;
          return;
        }
        if (!el.required && el.checkValidity()) { setInvalid(el, false); return; }
        var invalid = !el.checkValidity();
        var message = el.validity.valueMissing ? 'This field is required.' : (el.validationMessage || 'Please check this field.');
        setInvalid(el, invalid, message);
        if (invalid && !first) first = el;
      });
      if (first) {
        var control = first.matches && first.matches('input, textarea, select') ? first : q('input, textarea, select', first);
        if (control && control.focus) control.focus({ preventScroll: true });
        goTo(fieldWrap(first) || first);
        return false;
      }
      return true;
    }

    function goTo(el) {
      if (!el) return;
      requestAnimationFrame(function () { scrollTo(el, -132); });
    }

    function show(n, scroll) {
      index = n;
      steps.forEach(function (step, i) { step.hidden = i !== index; });
      if (back) back.hidden = index === 0;
      if (next) next.hidden = index === steps.length - 1;
      if (submit) submit.hidden = index !== steps.length - 1;
      if (note) note.hidden = index !== steps.length - 1;
      if (page) page.textContent = 'Page ' + (index + 1) + ' of ' + steps.length;
      if (bar) bar.style.width = ((index + 1) / steps.length * 100) + '%';
      if (scroll) goTo(page || steps[index] || form);
    }

    form.addEventListener('input', function (e) {
      var el = e.target;
      if (!el.matches || !el.matches('input, textarea, select')) return;
      if (el.type === 'radio' || el.type === 'checkbox') {
        var group = qa('input[name="' + el.name.replace(/"/g, '\\"') + '"]', form);
        if (group.some(function (item) { return item.checked; })) group.forEach(function (item) { setInvalid(item, false); });
        return;
      }
      if (el.checkValidity()) setInvalid(el, false);
    });

    if (steps.length) {
      show(0, false);
      next && next.addEventListener('click', function () { if (stepValid(steps[index])) show(index + 1, true); });
      back && back.addEventListener('click', function () { show(index - 1, true); });
    }

    function fileToBase64(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var result = String(reader.result || '');
          resolve({
            filename: file.name,
            type: file.type || '',
            content: result.split(',')[1] || ''
          });
        };
        reader.onerror = function () { reject(new Error('Unable to read the selected file.')); };
        reader.readAsDataURL(file);
      });
    }

    function serializeForm(el) {
      var fd = new FormData(el);
      var fields = {};
      var pending = [];
      var skips = { 'https://': true, 'http://': true };
      fd.forEach(function (value, key) {
        if (value instanceof File) {
          if (value.name) pending.push(fileToBase64(value));
          return;
        }
        var text = String(value).trim();
        if (!text || skips[text]) return;
        if (!fields[key]) fields[key] = [];
        fields[key].push(text);
      });
      return Promise.all(pending).then(function (encoded) {
        return { fields: fields, files: encoded };
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (steps.length && !stepValid(steps[index])) return;
      var isCareer = form.classList.contains('apply-form');
      var endpoint = isCareer ? '/api/career' : '/api/inquiry';
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
      }
      if (note) {
        note.hidden = false;
        note.classList.remove('is-error');
        note.textContent = 'Sending…';
      }
      serializeForm(form).then(function (payload) {
        return fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
      }).then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        }).catch(function () {
          return { res: res, data: {} };
        });
      }).then(function (result) {
        if (!result.res.ok || !result.data.ok) {
          throw new Error(result.data.error || 'Unable to send just now. Please try again.');
        }
        form.classList.add('is-sent');
        var wrap = form.closest('.contact-form') || form;
        wrap.classList.add('is-sent');
        var success = q('.form__success', form) || wrap;
        requestAnimationFrame(function () { goTo(success); });
      }).catch(function (err) {
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
        }
        if (note) {
          note.hidden = false;
          note.classList.add('is-error');
          note.textContent = (err && err.message) || 'Unable to send just now. Please email Info@pearls360design.com.';
        }
      });
    });
  }

  /* ---------------------------------------------------------------- Page transitions & anchors */
  function initLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      var href = a.getAttribute('href'); if (!href) return;
      if (href.charAt(0) === '#') {
        var t = q(href); if (t) { e.preventDefault(); scrollTo(t); }
        return;
      }
      if (a.target === '_blank' || /^(mailto:|tel:|https?:)/.test(href) || e.metaKey || e.ctrlKey || reduced) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(function () { window.location.href = href; }, 380);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) document.body.classList.remove('is-leaving'); });
  }

  /* ---------------------------------------------------------------- Boot */
  function boot() {
    initScroll();
    initHeader();
    initMenu();
    initLinks();
    initHero();
    initTestimonials();
    initFaq();
    initGallery();
    initReels();
    initForm();
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      initReveals();
      initMarquee();
      document.body.classList.add('is-ready');
      if (hasGsap) ScrollTrigger.refresh();
    });
    // Keep ScrollTrigger positions accurate as lazy images / videos load
    if (hasGsap) {
      var rt;
      function refreshSoon() { clearTimeout(rt); rt = setTimeout(function () { ScrollTrigger.refresh(); }, 200); }
      qa('img').forEach(function (img) { if (!img.complete) img.addEventListener('load', refreshSoon, { toggleActions: 'play none play none' }); });
      window.addEventListener('load', refreshSoon);
    }
    // Safety: never leave the page invisible
    setTimeout(function () { document.body.classList.add('is-ready'); }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
