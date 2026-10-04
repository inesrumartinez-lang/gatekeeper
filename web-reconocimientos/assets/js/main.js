/* ==========================================================================
   Seniar · interacciones
   Sin dependencias. Lo que se mueve con el scroll usa animaciones CSS ligadas
   al scroll cuando el navegador las admite y, si no, un único bucle de
   requestAnimationFrame. Todo se desactiva con prefers-reduced-motion.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const absTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const onMedia = (mq, fn) => {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };

  const nf = window.Intl && Intl.NumberFormat ? new Intl.NumberFormat('es-ES') : null;
  /* Norma RAE: sin separador hasta 9999 y espacio fino a partir de 10 000 */
  const fmt = (n) => {
    const s = nf ? nf.format(n) : String(n);
    return Math.abs(n) >= 10000 ? s.replace(/\./g, ' ') : s.replace(/\./g, '');
  };
  const formatDays = (n) => (n < 0 ? '−' + fmt(-n) : fmt(n));

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motionQuery.matches;
  const scrollTimeline = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  const cssScrollFx = () => scrollTimeline && !reduce;

  const announcer = $('[data-announcer]');
  const announce = (msg) => {
    if (!announcer) return;
    announcer.textContent = '';
    window.setTimeout(() => { announcer.textContent = msg; }, 60);
  };

  const form = $('[data-form]');
  const CONFIG = {
    email: 'hola@seniar.es',
    endpoint: form ? (form.dataset.endpoint || '').trim() : '',
    timeout: 15000
  };

  /* ------------------------------------------------------------------
     Bucle de scroll: la posición se lee en el evento y se usa en el frame
     ------------------------------------------------------------------ */
  const onScrollFns = [];
  const onMeasureFns = [];
  let vh = window.innerHeight;
  let scrollPos = window.scrollY;
  let raf = 0;
  let lastFrame = 0;

  const requestTick = () => {
    if (!raf) raf = window.requestAnimationFrame(tick);
  };
  function tick(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
    lastFrame = now;
    let again = false;
    for (const fn of onScrollFns) {
      if (fn(scrollPos, dt) === true) again = true;
    }
    if (again) requestTick();
    else lastFrame = 0;
  }
  /* Suavizado independiente de la frecuencia de refresco */
  const approach = (current, target, dt, tau) => {
    const next = current + (target - current) * (1 - Math.exp(-dt / tau));
    return Math.abs(target - next) < 0.02 ? target : next;
  };

  const measureAll = () => {
    vh = window.innerHeight;
    scrollPos = window.scrollY;
    for (const fn of onMeasureFns) fn();
    requestTick();
  };
  let measureTimer = 0;
  const scheduleMeasure = () => {
    window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(measureAll, 120);
  };
  window.addEventListener('scroll', () => {
    scrollPos = window.scrollY;
    requestTick();
  }, { passive: true });
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('load', scheduleMeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMeasure);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(document.body);

  const onMotionChange = [];
  onMedia(motionQuery, (e) => {
    reduce = e.matches;
    root.style.scrollBehavior = reduce ? '' : 'smooth';
    onMotionChange.forEach((fn) => fn(reduce));
    measureAll();
  });

  /* El desplazamiento suave se activa tras la carga: así, una URL con #ancla
     salta directamente en lugar de animar toda la página */
  const enableSmooth = () => window.requestAnimationFrame(() => {
    if (!reduce) root.style.scrollBehavior = 'smooth';
  });
  if (document.readyState === 'complete') enableSmooth();
  else window.addEventListener('load', enableSmooth, { once: true });

  /* Animación por tiempo (dial de portada y contadores) */
  function tween(from, to, duration, ease, onUpdate, isCancelled) {
    return new Promise((resolve) => {
      if (reduce || duration <= 0) {
        onUpdate(to);
        resolve();
        return;
      }
      const start = performance.now();
      const step = (now) => {
        if (isCancelled && isCancelled()) { resolve(); return; }
        const t = clamp((now - start) / duration, 0, 1);
        onUpdate(lerp(from, to, ease(t)));
        if (t < 1) window.requestAnimationFrame(step);
        else resolve();
      };
      window.requestAnimationFrame(step);
    });
  }
  const wait = (ms) => new Promise((r) => window.setTimeout(r, reduce ? 0 : ms));

  /* Elementos que solo se animan mientras están en pantalla */
  const watchVisibility = (el, rootMargin = '10% 0px') => {
    const state = { visible: false };
    if (!('IntersectionObserver' in window)) { state.visible = true; return state; }
    new IntersectionObserver((entries) => {
      state.visible = entries.some((e) => e.isIntersecting);
      if (state.visible) requestTick();
    }, { rootMargin }).observe(el);
    return state;
  };

  /* ------------------------------------------------------------------
     Cabecera: fondo al hacer scroll, se oculta al bajar y cambia de tono
     ------------------------------------------------------------------ */
  const header = $('[data-header]');
  const panel = $('[data-panel]');
  const nightZones = $$('main > [data-tone="night"], body > footer[data-tone="night"]');
  let zones = [];
  let headerH = 72;
  let lastY = window.scrollY;
  let headerHidden = false;
  let menuOpen = false;
  let lastTone = '';
  let scrolled = null;

  const setHeaderHidden = (hide) => {
    if (hide === headerHidden) return;
    headerHidden = hide;
    header.classList.toggle('is-hidden', hide);
    if (panel) panel.classList.toggle('is-offset', !hide);
  };
  if (panel) panel.classList.add('is-offset');

  onMeasureFns.push(() => {
    headerH = header.offsetHeight;
    zones = nightZones.map((el) => {
      const top = absTop(el);
      return [top, top + el.offsetHeight];
    });
  });
  onScrollFns.push((y) => {
    const isScrolled = y > 8;
    if (isScrolled !== scrolled) { scrolled = isScrolled; header.classList.toggle('is-scrolled', isScrolled); }
    const dy = y - lastY;
    const focusInside = header.contains(document.activeElement);
    if (!menuOpen && !focusInside && y > 520 && dy > 4) setHeaderHidden(true);
    else if (dy < -4 || y <= 520 || menuOpen || focusInside) setHeaderHidden(false);
    lastY = y;

    if (!menuOpen) {
      const probe = y + headerH / 2;
      const tone = zones.some(([a, b]) => probe >= a && probe < b) ? 'night' : '';
      if (tone !== lastTone) {
        lastTone = tone;
        if (tone) header.dataset.tone = tone;
        else delete header.dataset.tone;
      }
    }
  });
  header.addEventListener('focusin', () => setHeaderHidden(false));

  /* Enlace activo en la navegación */
  const navLinks = $$('.site-nav__link');
  const navTargets = navLinks.map((a) => $(a.getAttribute('href')));
  const contactSection = $('#contacto');
  let navTops = [];
  let contactTop = Infinity;
  let currentNav = -2;
  onMeasureFns.push(() => {
    navTops = navTargets.map((t) => (t ? absTop(t) : Infinity));
    contactTop = contactSection ? absTop(contactSection) : Infinity;
    currentNav = -2;
  });
  onScrollFns.push((y) => {
    const line = y + vh * 0.35;
    let current = -1;
    navTops.forEach((top, i) => { if (line >= top) current = i; });
    if (line >= contactTop) current = -1;
    if (current === currentNav) return;
    currentNav = current;
    navLinks.forEach((a, i) => {
      const on = i === current;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  });

  /* ------------------------------------------------------------------
     Menú móvil
     ------------------------------------------------------------------ */
  const menu = $('[data-menu]');
  const menuBtn = $('[data-menu-toggle]');
  const outside = [$('main'), $('footer'), $('.skip-link')].filter(Boolean);

  function openMenu() {
    menuOpen = true;
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Cerrar menú');
    $('.menu-btn__label', menuBtn).textContent = 'Cerrar';
    header.dataset.tone = 'night';
    lastTone = 'night';
    setHeaderHidden(false);
    window.requestAnimationFrame(() => {
      menu.classList.add('is-open');
      /* Lo costoso (inert, bloqueo de scroll y foco) va después del primer pintado */
      window.setTimeout(() => {
        if (!menuOpen) return;
        root.classList.add('menu-open');
        outside.forEach((el) => { el.inert = true; });
        const first = $('.menu__link', menu);
        if (first) first.focus({ preventScroll: true });
      }, 0);
    });
  }
  function closeMenu(returnFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    $('.menu-btn__label', menuBtn).textContent = 'Menú';
    if (returnFocus) menuBtn.focus({ preventScroll: true });
    window.setTimeout(() => {
      root.classList.remove('menu-open');
      outside.forEach((el) => { el.inert = false; });
      if (!menuOpen) menu.hidden = true;
      lastTone = null;
      requestTick();
    }, reduce ? 0 : 320);
  }
  if (menu && menuBtn) {
    menuBtn.addEventListener('click', () => (menuOpen ? closeMenu(true) : openMenu()));
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeMenu(false);
    });
    header.addEventListener('click', (e) => {
      if (menuOpen && e.target.closest('a')) closeMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (!menuOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }
      if (e.key === 'Tab') {
        const items = [menuBtn, ...$$('a, button', menu)].filter((el) => el === menuBtn || el.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    onMedia(window.matchMedia('(min-width: 1000px)'), (e) => {
      if (e.matches) closeMenu(false);
    });
  }

  /* ------------------------------------------------------------------
     Aparición al entrar en pantalla
     ------------------------------------------------------------------ */
  /* Los titulares se parten en líneas justo al aparecer (respetando el corte
     equilibrado del navegador) y se restauran al terminar la animación */
  function revealSplit(el) {
    if (reduce || el.children.length) { el.classList.add('is-in'); return; }
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const words = text.split(' ');
    el.textContent = '';
    const spans = words.map((w, i) => {
      const s = document.createElement('span');
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
    const lines = [];
    let top = null;
    spans.forEach((s) => {
      const t = s.offsetTop;
      if (top === null || Math.abs(t - top) > 2) { lines.push([]); top = t; }
      lines[lines.length - 1].push(s.textContent);
    });
    el.textContent = '';
    lines.forEach((ws, i) => {
      const line = document.createElement('span');
      line.className = 'split-line';
      const inner = document.createElement('span');
      inner.textContent = ws.join(' ');
      inner.style.setProperty('--li', i);
      line.appendChild(inner);
      el.appendChild(line);
    });
    void el.offsetWidth;
    el.classList.add('is-in');
    window.setTimeout(() => { el.textContent = text; }, 1100 + lines.length * 90 + 200);
  }

  $$('[data-stagger]').forEach((group) => {
    $$(':scope > [data-reveal]', group).forEach((el, i) => el.style.setProperty('--i', i));
  });

  const revealTargets = $$('[data-reveal], [data-split]');
  const reveal = (el) => {
    if (el.classList.contains('is-in')) return;
    if (el.hasAttribute('data-split')) revealSplit(el);
    else el.classList.add('is-in');
    el.dispatchEvent(new CustomEvent('reveal'));
  };
  if ('IntersectionObserver' in window && window.innerHeight < 3000) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach(reveal);
  }
  /* Un elemento enfocable nunca debe quedar invisible esperando al scroll */
  document.addEventListener('focusin', (e) => {
    const pending = e.target.closest('[data-reveal]:not(.is-in), [data-split]:not(.is-in)');
    if (pending) reveal(pending);
  });

  /* ------------------------------------------------------------------
     Dial de portada: un ciclo completo en menos de cinco segundos
     ------------------------------------------------------------------ */
  function makeDial(el) {
    const num = $('[data-dial-num]', el);
    const chip = $('[data-dial-chip]', el);
    const arc = $('.dial__arc', el);
    const mask = $('.dial__mask', el);
    const head = $('[data-dial-head]', el);
    const halo = $('[data-dial-halo]', el);
    const R = 150;
    let lastN = null;
    let lastState = null;
    let lastLabel = null;
    return {
      set(d, label) {
        const n = Math.round(d);
        if (n !== lastN) { num.textContent = formatDays(n); lastN = n; }
        const remaining = clamp(d, 0, 365);
        const elapsed = 365 - remaining;
        const dash = remaining.toFixed(2) + ' 365';
        const offset = (-elapsed).toFixed(2);
        arc.style.strokeDasharray = dash;
        arc.style.strokeDashoffset = offset;
        /* La máscara hereda el giro del círculo que enmascara: mismo trazo */
        mask.style.strokeDasharray = dash;
        mask.style.strokeDashoffset = offset;
        const th = (elapsed / 365) * Math.PI * 2;
        const cx = (200 + R * Math.sin(th)).toFixed(2);
        const cy = (200 - R * Math.cos(th)).toFixed(2);
        head.setAttribute('cx', cx);
        head.setAttribute('cy', cy);
        halo.setAttribute('cx', cx);
        halo.setAttribute('cy', cy);
        const state = d > 55.5 ? 'ok' : d > 0 ? 'warn' : 'late';
        if (state !== lastState) { el.dataset.state = state; lastState = state; }
        if (label && label !== lastLabel) { chip.textContent = label; lastLabel = label; }
      }
    };
  }

  const hero = $('[data-hero]');
  if (hero) {
    const dialEl = $('[data-dial]', hero);
    const dial = makeDial(dialEl);
    const lines = $$('[data-readout] li', hero);
    const replay = $('[data-replay]', hero);
    let run = 0;
    let playing = false;
    let started = false;
    let heroVisible = true;

    const showLine = (i) => { if (lines[i]) lines[i].classList.add('is-on'); };
    const finalState = () => {
      run++;
      playing = false;
      dial.set(365, 'Vigente');
      lines.forEach((l) => l.classList.add('is-on'));
      replay.removeAttribute('aria-disabled');
    };

    async function play() {
      if (playing) return;
      const id = ++run;
      const cancelled = () => id !== run;
      playing = true;
      replay.setAttribute('aria-disabled', 'true');
      lines.forEach((l) => l.classList.remove('is-on'));
      dial.set(365, 'Vigente');
      await wait(250);
      if (cancelled()) return;
      await tween(365, 55, 1000, easeInOut, (v) => dial.set(v, v > 55.5 ? 'Vigente' : 'En gestión'), cancelled);
      if (cancelled()) return;
      dial.set(55, 'En gestión');
      showLine(0);
      await wait(380);
      if (cancelled()) return;
      showLine(1);
      await tween(55, 48, 280, easeOut, (v) => dial.set(v, 'Cita pedida'), cancelled);
      if (cancelled()) return;
      showLine(2);
      await tween(48, 45, 260, easeOut, (v) => dial.set(v, 'Cita reservada'), cancelled);
      if (cancelled()) return;
      showLine(3);
      await tween(45, 25, 480, easeInOut, (v) => dial.set(v, 'Recordatorios'), cancelled);
      if (cancelled()) return;
      showLine(4);
      await tween(25, 24, 220, easeOut, (v) => dial.set(v, 'Asistencia'), cancelled);
      if (cancelled()) return;
      showLine(5);
      await tween(24, 17, 260, easeOut, (v) => dial.set(v, 'Certificado'), cancelled);
      if (cancelled()) return;
      dialEl.classList.remove('dial--flash');
      void dialEl.offsetWidth;
      dialEl.classList.add('dial--flash');
      await tween(17, 365, 850, easeOut, (v) => dial.set(v, v > 300 ? 'Vigente' : 'Certificado'), cancelled);
      if (cancelled()) return;
      playing = false;
      dial.set(365, 'Vigente');
      replay.hidden = false;
      replay.removeAttribute('aria-disabled');
    }

    const start = () => {
      if (started) return;
      started = true;
      if (reduce || !heroVisible) finalState();
      else play();
    };

    finalState();
    if (!reduce) {
      lines.forEach((l) => l.classList.remove('is-on'));
      dial.set(365, 'Vigente');
    }
    const begin = () => {
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          heroVisible = entries.some((e) => e.isIntersecting);
          if (heroVisible && !started && document.visibilityState === 'visible') start();
          if (!heroVisible && playing) { finalState(); replay.hidden = false; }
          if (!heroVisible && !started) { started = true; finalState(); replay.hidden = false; }
        }, { threshold: 0.3 }).observe(hero);
      } else {
        start();
      }
    };
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && playing) { finalState(); replay.hidden = false; }
    });
    replay.addEventListener('click', () => {
      if (replay.getAttribute('aria-disabled') === 'true') return;
      play();
    });
    onMotionChange.push((r) => { if (r) { finalState(); } });
  }

  /* ------------------------------------------------------------------
     Registro en movimiento ligado al scroll
     ------------------------------------------------------------------ */
  const ticker = $('.ticker');
  if (ticker) {
    const rows = $$('[data-ticker]', ticker);
    rows.forEach((row) => { row.innerHTML = row.innerHTML + row.innerHTML + row.innerHTML; });
    ticker.classList.add('is-ready');
    const vis = watchVisibility(ticker);
    let top = 0;
    const widths = rows.map(() => 0);
    const current = rows.map(() => null);
    onMeasureFns.push(() => {
      top = absTop(ticker);
      rows.forEach((row, i) => { widths[i] = row.scrollWidth; });
    });
    onScrollFns.push((y, dt) => {
      if (cssScrollFx()) return false;
      if (reduce) {
        rows.forEach((row) => { row.style.transform = ''; });
        return false;
      }
      if (!vis.visible) return false;
      let again = false;
      rows.forEach((row, i) => {
        const dir = Number(row.dataset.ticker) || -1;
        const progress = clamp((y + vh - top) / (vh + ticker.offsetHeight), 0, 1);
        const target = dir < 0 ? -0.16 * widths[i] * progress : -0.3 * widths[i] + 0.16 * widths[i] * progress;
        current[i] = current[i] === null ? target : approach(current[i], target, dt, 90);
        row.style.transform = `translateX(${current[i].toFixed(1)}px)`;
        if (current[i] !== target) again = true;
      });
      return again;
    });
  }

  /* ------------------------------------------------------------------
     El problema: tachado progresivo (respaldo sin CSS ligado al scroll)
     ------------------------------------------------------------------ */
  const pains = $$('[data-pain]');
  if (pains.length) {
    const vis = watchVisibility($('.pains__list'), '20% 0px');
    let boxes = [];
    let lastP = pains.map(() => -1);
    onMeasureFns.push(() => {
      boxes = pains.map((el) => [absTop(el), el.offsetHeight]);
      lastP = pains.map(() => -1);
    });
    onScrollFns.push((y) => {
      if (cssScrollFx()) return false;
      if (!vis.visible && !reduce) return false;
      pains.forEach((el, i) => {
        const box = boxes[i];
        if (!box) return;
        const center = box[0] + box[1] / 2 - y;
        const p = reduce ? 0 : clamp((vh * 0.66 - center) / (vh * 0.24), 0, 1);
        if (Math.abs(p - lastP[i]) < 0.002) return;
        lastP[i] = p;
        const span = el.querySelector('.pain__text > span');
        span.style.backgroundSize = `${(p * 100).toFixed(1)}% 0.075em`;
        el.classList.toggle('is-struck', p > 0.55);
      });
      return false;
    });
  }

  /* ------------------------------------------------------------------
     Fondos oscuros que se expanden al entrar (respaldo sin CSS ligado)
     ------------------------------------------------------------------ */
  $$('[data-expand]').forEach((bg) => {
    const section = bg.parentElement;
    const vis = watchVisibility(section, '0px');
    let top = 0;
    let last = -1;
    onMeasureFns.push(() => { top = absTop(section); last = -1; });
    onScrollFns.push((y) => {
      if (cssScrollFx()) return false;
      if (reduce) { if (last !== 1) { bg.style.transform = ''; last = 1; } return false; }
      if (!vis.visible) return false;
      const p = clamp((y + vh - top) / (vh * 0.75), 0, 1);
      if (Math.abs(p - last) < 0.001) return false;
      last = p;
      bg.style.transform = p >= 1 ? '' : `scaleX(${(0.95 + 0.05 * easeOut(p)).toFixed(4)})`;
      return false;
    });
  });

  /* ------------------------------------------------------------------
     Cómo funciona: escena fija en escritorio, lista con panel en móvil
     ------------------------------------------------------------------ */
  const process = $('[data-process]');
  if (process && panel) {
    const scene = $('[data-scene]', process);
    const steps = $$('[data-step]', process);
    const days = steps.map((s) => Number(s.dataset.day));
    const countEl = $('[data-count]', process);
    const chipEl = $('[data-panel-chip]', process);
    const indexEl = $('[data-panel-index]', process);
    const titleEl = $('[data-panel-title]', process);
    const ticksEl = $('[data-ruler-ticks]', process);
    const rulerBody = $('.ruler__body', process);
    const head = $('[data-ruler-head]', process);
    const marks = $$('[data-mark]', process).map((m) => [m, Number(m.dataset.mark)]);
    const fill = $('[data-steps-fill]', process);
    const list = $('.steps', process);
    const dots = $$('[data-goto]', process);
    const pinQuery = window.matchMedia('(min-width: 1000px) and (min-height: 620px)');

    const frag = document.createDocumentFragment();
    for (let i = 0; i <= 90; i++) frag.appendChild(document.createElement('i'));
    ticksEl.appendChild(frag);

    let pinned = false;
    let sceneTop = 0;
    let stepPx = 300;
    let tops = [];
    let listTop = 0;
    let listH = 1;
    let rulerW = 0;
    let active = -1;
    let shown = days[0];
    let lastN = null;
    let lastState = null;
    let lastFill = -1;

    const setPinned = () => {
      const want = pinQuery.matches && !reduce;
      if (want === pinned) return;
      pinned = want;
      process.classList.toggle('is-pinned', pinned);
      if (!pinned) scene.style.removeProperty('--scene-h');
      active = -1;
    };
    setPinned();
    onMedia(pinQuery, () => { setPinned(); measureAll(); });
    onMotionChange.push(() => { setPinned(); });

    onMeasureFns.push(() => {
      if (pinned) {
        stepPx = Math.round(vh * 0.34);
        scene.style.setProperty('--scene-h', `${steps.length * stepPx + vh}px`);
      }
      sceneTop = absTop(scene);
      tops = steps.map(absTop);
      listTop = absTop(list);
      listH = list.offsetHeight || 1;
      rulerW = rulerBody.clientWidth;
      lastN = null;
    });

    const setActive = (i) => {
      active = i;
      steps.forEach((s, k) => {
        s.classList.toggle('is-active', k === i);
        s.classList.toggle('is-past', k < i);
        s.classList.toggle('is-passed', k < i);
      });
      dots.forEach((d, k) => {
        if (k === i) d.setAttribute('aria-current', 'step');
        else d.removeAttribute('aria-current');
        d.classList.toggle('is-passed', k < i);
      });
      chipEl.textContent = steps[i].dataset.chip;
      indexEl.textContent = String(i + 1).padStart(2, '0');
      titleEl.textContent = steps[i].dataset.title;
    };

    const render = (d) => {
      const n = Math.round(d);
      if (n !== lastN) {
        lastN = n;
        countEl.textContent = formatDays(n);
        const pos = clamp((90 - d) / 90, 0, 1);
        head.style.transform = `translateX(${(pos * rulerW).toFixed(1)}px)`;
        marks.forEach(([m, md]) => m.classList.toggle('is-passed', d <= md + 0.5));
      }
      const state = d > 55.5 ? 'ok' : d > 0 ? 'warn' : 'late';
      if (state !== lastState) { panel.dataset.state = state; lastState = state; }
    };

    onScrollFns.push((y, dt) => {
      if (!tops.length) return false;
      let i;
      if (pinned) {
        i = clamp(Math.floor((y - sceneTop) / stepPx), 0, steps.length - 1);
      } else {
        const line = y + vh * 0.45;
        i = 0;
        while (i < steps.length - 1 && line >= tops[i + 1]) i++;
        const f = clamp((line - listTop) / listH, 0, 1);
        if (Math.abs(f - lastFill) > 0.001) {
          lastFill = f;
          fill.style.transform = `scaleY(${f.toFixed(4)})`;
        }
      }
      if (i !== active) setActive(i);
      const target = days[i];
      shown = reduce ? target : approach(shown, target, dt, 110);
      render(shown);
      return shown !== target;
    });

    const goTo = (k) => {
      if (!pinned) {
        steps[k].scrollIntoView({ block: 'center' });
        return;
      }
      window.scrollTo({ top: sceneTop + k * stepPx + 2, behavior: reduce ? 'auto' : 'smooth' });
    };
    dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.goto))));
    /* Si el foco entra en un paso oculto de la escena, la escena avanza hasta él */
    process.addEventListener('focusin', (e) => {
      if (!pinned) return;
      const st = e.target.closest('[data-step]');
      if (!st) return;
      const k = steps.indexOf(st);
      if (k !== active) window.scrollTo({ top: sceneTop + k * stepPx + 2, behavior: 'auto' });
    });
  }

  /* Demo de confirmación de asistencia */
  $$('[data-confirm]').forEach((box) => {
    const result = $('[data-confirm-result]', box);
    const buttons = $$('[data-answer]', box);
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        const yes = btn.dataset.answer === 'si';
        result.classList.toggle('is-yes', yes);
        result.classList.toggle('is-no', !yes);
        result.textContent = yes
          ? 'Anotado. En siete días pedimos el certificado de aptitud.'
          : 'Sin problema. Volvemos a pedir disponibilidad y buscamos una cita nueva.';
      });
    });
  });

  /* ------------------------------------------------------------------
     Hoja de registro: recuento, filtros y una actualización en directo
     ------------------------------------------------------------------ */
  const sheet = $('[data-sheet]');
  if (sheet) {
    const rows = $$('tbody tr', sheet);
    const filters = $$('[data-filter]', sheet);
    const status = $('[data-sheet-status]', sheet);
    const ref = $('[data-sheet-ref]', sheet);
    const expr = $('[data-sheet-expr]', sheet);
    const scroller = $('.sheet__scroll', sheet);
    const plural = (n) => (n === 1 ? '1 trabajador' : `${n} trabajadores`);

    filters.forEach((btn) => {
      btn.addEventListener('click', () => {
        /* La hoja conserva su altura para que la página no salte */
        if (!scroller.style.minHeight) scroller.style.minHeight = `${scroller.offsetHeight}px`;
        const f = btn.dataset.filter;
        filters.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        let visible = 0;
        rows.forEach((tr) => {
          const show = f === 'all' || tr.dataset.state === f;
          tr.hidden = !show;
          if (show) visible++;
        });
        status.textContent = `Mostrando ${plural(visible)}`;
      });
    });

    const countUp = () => {
      sheet.classList.add('is-counted');
      $$('[data-days]', sheet).forEach((el) => {
        const to = Number(el.dataset.days);
        tween(0, to, 1200, easeOut, (v) => { el.textContent = formatDays(Math.round(v)); });
      });
      const live = $('[data-live]', sheet);
      if (!live) return;
      window.setTimeout(() => {
        $('[data-live-disp]', live).textContent = 'Jue · mañana';
        $('[data-live-cita]', live).textContent = 'Jue 22/10 · 09:00';
        $('[data-live-centro]', live).textContent = 'Centro Norte';
        $('[data-live-chip]', live).textContent = 'Cita reservada';
        live.classList.add('is-updated');
        $$('.is-selected', sheet).forEach((c) => c.classList.remove('is-selected'));
        $('[data-live-state]', live).classList.add('is-selected');
        ref.textContent = 'G7';
        expr.textContent = 'Cita reservada';
      }, reduce ? 0 : 1900);
    };
    if (sheet.classList.contains('is-in')) countUp();
    else sheet.addEventListener('reveal', countUp, { once: true });
  }

  /* ------------------------------------------------------------------
     Calculadora
     ------------------------------------------------------------------ */
  const calc = $('[data-calc]');
  let calcValue = 250;
  const parseCount = (raw) => {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : NaN;
  };
  if (calc) {
    const range = $('#calc-range');
    const number = $('#calc-number');
    const outs = {
      year: $('[data-out="year"]', calc),
      month: $('[data-out="month"]', calc),
      comms: $('[data-out="comms"]', calc),
      week: $('[data-out="week"]', calc)
    };
    const MIN = 10;
    const MAX = 5000;
    const LIMIT = 999999;
    const snap = (n) => {
      if (n < 100) return Math.max(MIN, Math.round(n / 5) * 5);
      if (n < 1000) return Math.round(n / 10) * 10;
      return Math.round(n / 50) * 50;
    };
    const stepFor = (n) => (n < 100 ? 5 : n < 1000 ? 10 : 50);
    const toN = (v) => snap(MIN * Math.pow(MAX / MIN, v / 1000));
    const toV = (n) => Math.round((1000 * Math.log(clamp(n, MIN, MAX) / MIN)) / Math.log(MAX / MIN));
    const shownVals = { year: 250, month: 21, comms: 1750, week: 34 };
    const calcStatus = $('[data-calc-status]', calc);
    let anim = 0;
    let statusTimer = 0;

    const update = (n, source) => {
      n = clamp(Math.round(n), 1, LIMIT);
      calcValue = n;
      const targets = {
        year: n,
        month: Math.max(1, Math.round(n / 12)),
        comms: n * 7,
        week: Math.max(1, Math.round((n * 7) / 52))
      };
      if (source !== 'range') range.value = String(toV(n));
      range.style.setProperty('--fill', (Number(range.value) / 10).toFixed(1) + '%');
      range.setAttribute('aria-valuetext', `${fmt(n)} ${n === 1 ? 'trabajador' : 'trabajadores'}`);
      if (source !== 'number') number.value = fmt(n);
      if (source && calcStatus) {
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => {
          calcStatus.textContent = `Con ${fmt(n)} ${n === 1 ? 'trabajador' : 'trabajadores'}: ${fmt(targets.year)} reconocimientos al año, unas ${fmt(targets.month)} citas al mes y ${fmt(targets.comms)} correos y avisos.`;
        }, 700);
      }
      const id = ++anim;
      const from = { ...shownVals };
      tween(0, 1, 380, easeOut, (t) => {
        Object.keys(targets).forEach((k) => {
          const v = Math.round(lerp(from[k], targets[k], t));
          shownVals[k] = v;
          outs[k].textContent = fmt(v);
        });
      }, () => id !== anim);
    };

    range.addEventListener('input', () => update(toN(Number(range.value)), 'range'));
    range.addEventListener('keydown', (e) => {
      let n = calcValue;
      const s = stepFor(n);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.floor(n / s) * s + s;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.ceil(n / s) * s - s;
      else if (e.key === 'PageUp') n = snap(n * 1.5);
      else if (e.key === 'PageDown') n = snap(n / 1.5);
      else if (e.key === 'Home') n = MIN;
      else if (e.key === 'End') n = MAX;
      else return;
      e.preventDefault();
      update(clamp(n, MIN, MAX), null);
    });
    number.addEventListener('input', () => {
      const n = parseCount(number.value);
      if (n > 0) update(n, 'number');
    });
    number.addEventListener('blur', () => {
      const n = parseCount(number.value);
      update(n > 0 ? n : calcValue, null);
    });
    update(calcValue, null);

    $('[data-calc-cta]', calc).addEventListener('click', () => {
      const field = $('#f-trabajadores');
      if (field) {
        field.value = fmt(calcValue);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  /* ------------------------------------------------------------------
     Formulario de contacto
     ------------------------------------------------------------------ */
  if (form) {
    form.noValidate = true;
    const card = form.closest('.form-card');
    const done = $('[data-form-done]', card);
    const statusEl = $('[data-form-status]', form);
    const submit = $('[data-submit]', form);
    const submitLabel = $('[data-submit-label]', form);
    const area = $('[data-done-area]', done);
    const idleLabel = CONFIG.endpoint ? 'Enviar solicitud' : 'Preparar mi solicitud';
    submitLabel.textContent = idleLabel;
    let attempted = false;
    let lastRequest = '';

    const rules = {
      nombre: (v) => (v.trim().length >= 2 ? '' : 'Escribe tu nombre y apellidos.'),
      empresa: (v) => (v.trim().length >= 2 ? '' : 'Indica el nombre de tu empresa.'),
      trabajadores: (v) => {
        const n = parseCount(v);
        return /^[\d\s.]+$/.test(v.trim()) && n >= 1 ? '' : 'Indica cuántas personas tiene tu plantilla, por ejemplo 250.';
      },
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Escribe un correo válido, por ejemplo, nombre@empresa.es.'),
      telefono: (v) => (!v.trim() || /^[+()\d\s.-]{9,20}$/.test(v.trim()) ? '' : 'Revisa el teléfono o déjalo en blanco.'),
      privacidad: (_, el) => (el.checked ? '' : 'Marca la casilla para confirmar que has leído la información sobre protección de datos.')
    };

    const showError = (el, msg) => {
      const err = $('#e-' + el.name, form);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) {
        err.textContent = msg;
        err.hidden = !msg;
      }
    };
    const validateField = (el) => {
      const rule = rules[el.name];
      if (!rule) return '';
      const msg = rule(el.value || '', el);
      showError(el, msg);
      return msg;
    };

    Object.keys(rules).forEach((name) => {
      const el = form.elements[name];
      if (!el) return;
      const isCheck = el.type === 'checkbox';
      el.addEventListener('blur', (e) => {
        /* Si el foco va al botón de enviar, valida el envío (evita que el
           mensaje de error desplace el botón bajo el puntero) */
        if (e.relatedTarget && e.relatedTarget === submit) return;
        if (attempted || (!isCheck && el.value)) validateField(el);
      });
      el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') validateField(el); });
      el.addEventListener('change', () => { if (attempted || isCheck) validateField(el); });
    });

    const data = () => ({
      nombre: form.elements.nombre.value.trim(),
      empresa: form.elements.empresa.value.trim(),
      trabajadores: String(parseCount(form.elements.trabajadores.value)),
      email: form.elements.email.value.trim(),
      telefono: form.elements.telefono.value.trim(),
      servicio_prevencion: form.elements.servicio_prevencion.value.trim(),
      mensaje: form.elements.mensaje.value.trim()
    });

    const composeText = (d, maxMessage) => {
      const msg = maxMessage && d.mensaje.length > maxMessage ? d.mensaje.slice(0, maxMessage) + '…' : d.mensaje;
      return [
        `Nombre: ${d.nombre}`,
        `Empresa: ${d.empresa}`,
        `Trabajadores: ${d.trabajadores}`,
        `Correo: ${d.email}`,
        d.telefono ? `Teléfono: ${d.telefono}` : '',
        d.servicio_prevencion ? `Servicio de prevención: ${d.servicio_prevencion}` : '',
        msg ? `\nMensaje:\n${msg}` : ''
      ].filter(Boolean).join('\n');
    };

    const showDone = (mode, d) => {
      const title = $('[data-done-title]', done);
      const text = $('[data-done-text]', done);
      const mailBox = $('[data-done-mail]', done);
      const firstName = d.nombre.split(' ')[0];
      area.hidden = true;
      if (mode === 'sent') {
        title.textContent = `Gracias, ${firstName}. Hemos recibido tu solicitud.`;
        text.textContent = `Te escribiremos a ${d.email} para preparar tu propuesta.`;
        mailBox.hidden = true;
      } else {
        title.textContent = `Último paso, ${firstName}: envíanos la solicitud por correo.`;
        text.textContent = 'Pulsa el botón para abrirla en tu programa de correo, ya redactada, o cópiala y envíala tú.';
        const subject = `Solicitud de propuesta · ${d.empresa}`;
        lastRequest = composeText(d);
        /* Algunos clientes de correo fallan con enlaces mailto muy largos */
        $('[data-done-mailto]', done).href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(composeText(d, 600))}`;
        area.value = lastRequest;
        mailBox.hidden = false;
      }
      form.hidden = true;
      done.hidden = false;
      title.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      attempted = true;
      statusEl.classList.remove('is-error');
      statusEl.textContent = '';
      let firstInvalid = null;
      Object.keys(rules).forEach((name) => {
        const el = form.elements[name];
        if (el && validateField(el) && !firstInvalid) firstInvalid = el;
      });
      if (firstInvalid) {
        statusEl.classList.add('is-error');
        statusEl.textContent = 'Revisa los campos marcados.';
        firstInvalid.focus();
        return;
      }
      const d = data();
      const trap = form.elements._gotcha;
      if (trap && trap.value) {
        showDone('sent', d);
        return;
      }
      if (!CONFIG.endpoint) {
        showDone('mail', d);
        attempted = false;
        return;
      }
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      submitLabel.textContent = 'Enviando…';
      const controller = window.AbortController ? new AbortController() : null;
      const timer = controller ? window.setTimeout(() => controller.abort(), CONFIG.timeout) : 0;
      try {
        const res = await fetch(CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            ...d,
            _gotcha: trap ? trap.value : '',
            origen: window.location.origin + window.location.pathname,
            fecha: new Date().toISOString()
          }),
          signal: controller ? controller.signal : undefined
        });
        if (!res.ok) throw new Error(String(res.status));
        showDone('sent', d);
        form.reset();
        attempted = false;
      } catch (err) {
        statusEl.classList.add('is-error');
        statusEl.textContent = `No hemos podido enviar tu solicitud. Inténtalo de nuevo o escríbenos a ${CONFIG.email}.`;
      } finally {
        window.clearTimeout(timer);
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
        submitLabel.textContent = idleLabel;
      }
    });

    $('[data-done-back]', done).addEventListener('click', () => {
      done.hidden = true;
      form.hidden = false;
      form.elements.nombre.focus();
    });
    $('[data-done-copy]', done).addEventListener('click', (e) => {
      copyText(lastRequest, e.currentTarget, $('[data-done-copy-label]', done), 'Copiar solicitud', () => {
        area.hidden = false;
        area.focus();
        area.select();
        return 'Selecciónala y cópiala';
      });
    });
  }

  /* ------------------------------------------------------------------
     Copiar al portapapeles con alternativa
     ------------------------------------------------------------------ */
  const copyTimers = new WeakMap();
  function copyText(text, button, labelEl, original, fallback) {
    const label = labelEl || button;
    const say = (msg) => {
      label.textContent = msg;
      announce(msg);
      window.clearTimeout(copyTimers.get(button));
      copyTimers.set(button, window.setTimeout(() => { label.textContent = original; }, 2400));
    };
    const doFallback = () => say(fallback ? fallback() : 'No se pudo copiar');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => say('Copiado'), doFallback);
    } else {
      doFallback();
    }
  }
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copy, btn, $('[data-copy-label]', btn), 'Copiar', () => {
        const target = $('[data-email-text]');
        if (!target) return 'No se pudo copiar';
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
        return 'Seleccionado';
      });
    });
  });

  /* ------------------------------------------------------------------
     Botones magnéticos (solo con ratón)
     ------------------------------------------------------------------ */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        if (reduce) return;
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.transform = `translate(${(x * 10).toFixed(1)}px, ${(y * 8).toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* Año en el pie */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  window.__seniar = true;
  window.requestAnimationFrame(measureAll);
})();
