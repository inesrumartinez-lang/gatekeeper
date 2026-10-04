/* ==========================================================================
   Vigente · interacciones
   Sin dependencias. Todo lo que se mueve con el scroll pasa por un único
   bucle de requestAnimationFrame y se desactiva con prefers-reduced-motion.
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
  const nf = new Intl.NumberFormat('es-ES');
  const formatDays = (n) => (n < 0 ? '−' + nf.format(Math.abs(n)) : nf.format(n));
  const absTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motionQuery.matches;

  const form = $('[data-form]');
  const CONFIG = {
    email: 'hola@vigente.es',
    endpoint: form ? (form.dataset.endpoint || '').trim() : ''
  };

  /* ------------------------------------------------------------------
     Bucle de scroll: una sola lectura de scrollY por frame
     ------------------------------------------------------------------ */
  const onScrollFns = [];
  const onMeasureFns = [];
  let vh = window.innerHeight;
  let raf = 0;

  const requestTick = () => {
    if (!raf) raf = window.requestAnimationFrame(tick);
  };
  function tick() {
    raf = 0;
    const y = window.scrollY;
    let again = false;
    for (const fn of onScrollFns) {
      if (fn(y) === true) again = true;
    }
    if (again) requestTick();
  }
  const measureAll = () => {
    vh = window.innerHeight;
    for (const fn of onMeasureFns) fn();
    requestTick();
  };
  let measureTimer = 0;
  const scheduleMeasure = () => {
    window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(measureAll, 100);
  };
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('load', measureAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(document.body);

  const onMotionChange = [];
  const handleMotionChange = (e) => {
    reduce = e.matches;
    onMotionChange.forEach((fn) => fn(reduce));
    measureAll();
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(handleMotionChange);

  /* Animación por tiempo (para el dial de portada y contadores) */
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

  /* ------------------------------------------------------------------
     Cabecera: fondo al hacer scroll, se oculta al bajar y cambia de tono
     ------------------------------------------------------------------ */
  const header = $('[data-header]');
  const nightZones = $$('main > [data-tone="night"], body > footer[data-tone="night"]');
  let zones = [];
  let headerH = 72;
  let lastY = window.scrollY;
  let headerHidden = false;
  let menuOpen = false;

  const setHeaderHidden = (hide) => {
    if (hide === headerHidden) return;
    headerHidden = hide;
    header.classList.toggle('is-hidden', hide);
    root.style.setProperty('--hdr-offset', hide ? '0px' : 'var(--header-h)');
  };
  root.style.setProperty('--hdr-offset', 'var(--header-h)');

  onMeasureFns.push(() => {
    headerH = header.offsetHeight;
    zones = nightZones.map((el) => {
      const top = absTop(el);
      return [top, top + el.offsetHeight];
    });
  });
  onScrollFns.push((y) => {
    header.classList.toggle('is-scrolled', y > 8);
    const dy = y - lastY;
    const focusInside = header.contains(document.activeElement);
    if (!menuOpen && !focusInside && y > 520 && dy > 4) setHeaderHidden(true);
    else if (dy < -4 || y <= 520 || menuOpen || focusInside) setHeaderHidden(false);
    lastY = y;

    if (!menuOpen) {
      const probe = y + headerH / 2;
      const onNight = zones.some(([a, b]) => probe >= a && probe < b);
      if (onNight) header.dataset.tone = 'night';
      else delete header.dataset.tone;
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
    window.requestAnimationFrame(() => menu.classList.add('is-open'));
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Cerrar menú');
    $('.menu-btn__label', menuBtn).textContent = 'Cerrar';
    root.classList.add('menu-open');
    header.dataset.tone = 'night';
    setHeaderHidden(false);
    outside.forEach((el) => { el.inert = true; });
    const first = $('.menu__link', menu);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(returnFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    $('.menu-btn__label', menuBtn).textContent = 'Menú';
    root.classList.remove('menu-open');
    outside.forEach((el) => { el.inert = false; });
    window.setTimeout(() => { if (!menuOpen) menu.hidden = true; }, reduce ? 0 : 360);
    if (returnFocus) menuBtn.focus({ preventScroll: true });
    requestTick();
  }
  if (menu && menuBtn) {
    menuBtn.addEventListener('click', () => (menuOpen ? closeMenu(true) : openMenu()));
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (!menuOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }
      if (e.key === 'Tab') {
        const items = [menuBtn, ...$$('a, button', menu)].filter((el) => el.offsetParent !== null || el === menuBtn);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.matchMedia('(min-width: 1000px)').addEventListener('change', (e) => {
      if (e.matches) closeMenu(false);
    });
  }

  /* ------------------------------------------------------------------
     Aparición al entrar en pantalla
     ------------------------------------------------------------------ */
  function splitWords(el) {
    let index = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/([ \t\n\r]+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r]+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--wi', index++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(el);
    el.classList.add('split');
  }
  if (!reduce) $$('[data-split]').forEach(splitWords);

  $$('[data-stagger]').forEach((group) => {
    $$(':scope > [data-reveal]', group).forEach((el, i) => el.style.setProperty('--i', i));
  });

  const revealTargets = $$('[data-reveal], .split');
  const reveal = (el) => {
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    el.dispatchEvent(new CustomEvent('reveal'));
  };
  if ('IntersectionObserver' in window) {
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

  /* ------------------------------------------------------------------
     Dial de portada: un ciclo completo en seis segundos
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
        mask.style.strokeDasharray = dash;
        mask.style.strokeDashoffset = offset;
        const th = (elapsed / 365) * Math.PI * 2;
        const cx = (200 + R * Math.sin(th)).toFixed(2);
        const cy = (200 - R * Math.cos(th)).toFixed(2);
        head.setAttribute('cx', cx);
        head.setAttribute('cy', cy);
        halo.setAttribute('cx', cx);
        halo.setAttribute('cy', cy);
        const state = d > 55 ? 'ok' : d > 0 ? 'warn' : 'late';
        if (state !== lastState) { el.dataset.state = state; lastState = state; }
        if (label && label !== lastLabel) { chip.textContent = label; lastLabel = label; }
      }
    };
  }

  const hero = $('[data-hero]');
  if (hero) {
    const dialEl = $('[data-dial]', hero);
    const dial = makeDial(dialEl);
    const events = $$('.event', hero);
    const replay = $('[data-replay]', hero);
    let run = 0;
    let started = false;

    const finalState = () => {
      dial.set(365, 'Vigente · 365 días');
      events.forEach((e) => e.classList.add('is-on'));
    };

    async function play() {
      const id = ++run;
      const cancelled = () => id !== run;
      replay.hidden = true;
      events.forEach((e) => e.classList.remove('is-on'));
      dial.set(365, 'Vigente');
      await wait(650);
      if (cancelled()) return;
      await tween(365, 55, 1800, easeInOut, (v) => dial.set(v, v > 55 ? 'Vigente' : 'En gestión'), cancelled);
      if (cancelled()) return;
      events[0].classList.add('is-on');
      await tween(55, 48, 520, easeOut, (v) => dial.set(v, 'Disponibilidad recibida'), cancelled);
      await wait(380);
      if (cancelled()) return;
      events[1].classList.add('is-on');
      await tween(48, 45, 420, easeOut, (v) => dial.set(v, 'Cita reservada'), cancelled);
      await wait(420);
      if (cancelled()) return;
      events[2].classList.add('is-on');
      await tween(45, 25, 900, easeInOut, (v) => dial.set(v, 'Recordatorios'), cancelled);
      if (cancelled()) return;
      events[3].classList.add('is-on');
      await tween(25, 24, 300, easeOut, (v) => dial.set(v, 'Asistencia confirmada'), cancelled);
      await wait(700);
      if (cancelled()) return;
      dialEl.classList.remove('dial--flash');
      void dialEl.offsetWidth;
      dialEl.classList.add('dial--flash');
      await tween(24, 365, 1300, easeOut, (v) => dial.set(v, v > 300 ? 'Vigente · 365 días' : 'Certificado archivado'), cancelled);
      if (cancelled()) return;
      dial.set(365, 'Vigente · 365 días');
      replay.hidden = false;
    }

    const start = () => {
      if (started) return;
      started = true;
      if (reduce) finalState();
      else play();
    };

    finalState();
    if (!reduce) {
      events.forEach((e) => e.classList.remove('is-on'));
      dial.set(365, 'Vigente');
    }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(hero);
    } else {
      start();
    }
    replay.addEventListener('click', () => { play(); });
    onMotionChange.push((r) => { if (r) { run++; finalState(); replay.hidden = true; } });
  }

  /* ------------------------------------------------------------------
     Cinta de palabras ligada al scroll
     ------------------------------------------------------------------ */
  $$('[data-ticker]').forEach((row) => {
    const dir = Number(row.dataset.ticker) || -1;
    const original = row.innerHTML;
    row.innerHTML = original + original + original;
    let top = 0;
    let width = 0;
    let current = null;
    onMeasureFns.push(() => {
      top = absTop(row);
      width = row.scrollWidth / 3;
    });
    onScrollFns.push((y) => {
      if (reduce) {
        row.style.transform = dir > 0 ? `translate3d(${-width}px,0,0)` : 'none';
        return false;
      }
      const progress = y + vh - top;
      const target = (dir > 0 ? -width : 0) + progress * 0.32 * dir;
      if (current === null) current = target;
      current = lerp(current, target, 0.12);
      if (Math.abs(current - target) < 0.1) current = target;
      row.style.transform = `translate3d(${current.toFixed(2)}px,0,0)`;
      return current !== target;
    });
  });

  /* ------------------------------------------------------------------
     El problema: tachado progresivo
     ------------------------------------------------------------------ */
  const pains = $$('[data-pain]');
  let painBoxes = [];
  onMeasureFns.push(() => {
    painBoxes = pains.map((el) => { const t = absTop(el); return [t, el.offsetHeight]; });
  });
  onScrollFns.push((y) => {
    pains.forEach((el, i) => {
      const box = painBoxes[i];
      if (!box) return;
      const center = box[0] + box[1] / 2 - y;
      const p = reduce ? 1 : clamp((vh * 0.68 - center) / (vh * 0.26), 0, 1);
      el.style.setProperty('--p', p.toFixed(3));
      el.classList.toggle('is-struck', p > 0.55);
    });
  });

  /* ------------------------------------------------------------------
     Secciones oscuras que se expanden al entrar
     ------------------------------------------------------------------ */
  $$('[data-expand]').forEach((section) => {
    let top = 0;
    onMeasureFns.push(() => { top = absTop(section); });
    onScrollFns.push((y) => {
      if (reduce) { section.style.setProperty('--sx', '1'); return; }
      const p = clamp((y + vh - top) / (vh * 0.7), 0, 1);
      section.style.setProperty('--sx', (0.95 + 0.05 * easeOut(p)).toFixed(4));
    });
  });

  /* ------------------------------------------------------------------
     Cómo funciona: contador, regla y paso activo
     ------------------------------------------------------------------ */
  const process = $('[data-process]');
  if (process) {
    const steps = $$('[data-step]', process);
    const days = steps.map((s) => Number(s.dataset.day));
    const panel = $('[data-panel]', process);
    const countEl = $('[data-count]', process);
    const chipEl = $('[data-panel-chip]', process);
    const indexEl = $('[data-panel-index]', process);
    const titleEl = $('[data-panel-title]', process);
    const ticksEl = $('[data-ruler-ticks]', process);
    const ruler = $('[data-ruler]', process);
    const head = $('[data-ruler-head]', process);
    const marks = $$('[data-mark]', process).map((m) => [m, Number(m.dataset.mark)]);
    const fill = $('[data-steps-fill]', process);
    const list = $('.steps', process);

    const frag = document.createDocumentFragment();
    for (let i = 0; i <= 90; i++) frag.appendChild(document.createElement('i'));
    ticksEl.appendChild(frag);

    let tops = [];
    let heights = [];
    let listTop = 0;
    let listH = 1;
    let rulerW = 0;
    let active = -1;
    let shown = days[0];
    let lastN = null;
    let lastState = null;

    onMeasureFns.push(() => {
      tops = steps.map(absTop);
      heights = steps.map((s) => s.offsetHeight);
      listTop = absTop(list);
      listH = list.offsetHeight || 1;
      rulerW = ruler.clientWidth;
    });

    const setActive = (i) => {
      active = i;
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      chipEl.textContent = steps[i].dataset.chip;
      indexEl.textContent = String(i + 1).padStart(2, '0');
      titleEl.textContent = steps[i].dataset.title;
    };

    const render = (d) => {
      const n = Math.round(d);
      if (n !== lastN) { countEl.textContent = formatDays(n); lastN = n; }
      const state = d > 55 ? 'ok' : d > 0 ? 'warn' : 'late';
      if (state !== lastState) { panel.dataset.state = state; lastState = state; }
      const pos = clamp((90 - d) / 90, 0, 1);
      head.style.transform = `translate3d(${(pos * rulerW).toFixed(2)}px,0,0)`;
      marks.forEach(([m, md]) => m.classList.toggle('is-passed', d <= md + 0.01));
    };

    onScrollFns.push((y) => {
      if (!tops.length) return false;
      const line = y + vh * 0.55;
      let i = 0;
      while (i < steps.length - 1 && line >= tops[i + 1]) i++;
      const span = (tops[i + 1] || tops[i] + heights[i]) - tops[i];
      const p = clamp((line - tops[i]) / span, 0, 1);
      let target = days[i];
      if (i < steps.length - 2 && p > 0.74) {
        target = lerp(days[i], days[i + 1], easeInOut((p - 0.74) / 0.26));
      }
      if (i !== active) setActive(i);
      shown = reduce ? target : lerp(shown, target, 0.11);
      if (Math.abs(shown - target) < 0.05) shown = target;
      render(shown);
      const f = clamp((line - listTop) / listH, 0, 1);
      fill.style.setProperty('--fill', f.toFixed(4));
      return shown !== target;
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
    const plural = (n) => (n === 1 ? '1 trabajador' : `${n} trabajadores`);

    filters.forEach((btn) => {
      btn.addEventListener('click', () => {
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
        const cell = live.querySelector('[data-live-cita]');
        cell.classList.add('is-selected');
        cell.style.position = 'relative';
        ref.textContent = 'E7';
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
  if (calc) {
    const range = $('#calc-range');
    const number = $('#calc-number');
    const outs = {
      year: $('[data-out="year"]', calc),
      month: $('[data-out="month"]', calc),
      comms: $('[data-out="comms"]', calc),
      reminders: $('[data-out="reminders"]', calc),
      n: $('[data-out="n"]', calc)
    };
    const MIN = 10;
    const MAX = 5000;
    const toN = (v) => {
      const n = MIN * Math.pow(MAX / MIN, v / 1000);
      if (n < 100) return Math.round(n / 5) * 5;
      if (n < 1000) return Math.round(n / 10) * 10;
      return Math.round(n / 50) * 50;
    };
    const toV = (n) => Math.round((1000 * Math.log(clamp(n, MIN, MAX) / MIN)) / Math.log(MAX / MIN));
    const shownVals = { year: 250, month: 21, comms: 1750, reminders: 500 };
    let anim = 0;

    const update = (n, source) => {
      n = clamp(Math.round(n), 1, 100000);
      calcValue = n;
      const targets = { year: n, month: Math.max(1, Math.round(n / 12)), comms: n * 7, reminders: n * 2 };
      if (source !== 'range') range.value = String(toV(n));
      range.style.setProperty('--fill', (Number(range.value) / 10).toFixed(1) + '%');
      range.setAttribute('aria-valuetext', `${nf.format(n)} ${n === 1 ? 'trabajador' : 'trabajadores'}`);
      if (source !== 'number') number.value = String(n);
      outs.n.textContent = nf.format(n);
      const id = ++anim;
      const from = { ...shownVals };
      tween(0, 1, 420, easeOut, (t) => {
        if (id !== anim) return;
        Object.keys(targets).forEach((k) => {
          const v = Math.round(lerp(from[k], targets[k], t));
          shownVals[k] = v;
          outs[k].textContent = nf.format(v);
        });
      });
    };

    range.addEventListener('input', () => update(toN(Number(range.value)), 'range'));
    number.addEventListener('input', () => {
      const n = parseInt(number.value, 10);
      if (n > 0) update(n, 'number');
    });
    number.addEventListener('blur', () => {
      const n = parseInt(number.value, 10);
      update(n > 0 ? n : calcValue, null);
    });
    update(calcValue, null);

    const cta = $('[data-calc-cta]', calc);
    cta.addEventListener('click', () => {
      const field = $('#f-trabajadores');
      if (field) {
        field.value = String(calcValue);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  /* ------------------------------------------------------------------
     Formulario de contacto
     ------------------------------------------------------------------ */
  if (form) {
    const card = form.closest('.form-card');
    const done = $('[data-form-done]', card);
    const statusEl = $('[data-form-status]', form);
    const submit = $('[data-submit]', form);
    const submitLabel = $('[data-submit-label]', form);
    let attempted = false;
    let lastRequest = '';

    const rules = {
      nombre: (v) => (v.trim().length >= 2 ? '' : 'Escribe tu nombre y apellidos.'),
      empresa: (v) => (v.trim().length >= 2 ? '' : 'Indica el nombre de tu empresa.'),
      trabajadores: (v) => (/^\d+$/.test(v.trim()) && Number(v) >= 1 ? '' : 'Indica cuántas personas tiene tu plantilla (un número a partir de 1).'),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Escribe un email válido, por ejemplo nombre@empresa.es.'),
      telefono: (v) => (!v.trim() || /^[+()\d\s.-]{9,20}$/.test(v.trim()) ? '' : 'Revisa el teléfono o déjalo en blanco.'),
      privacidad: (_, el) => (el.checked ? '' : 'Necesitamos tu consentimiento para poder responderte.')
    };

    const showError = (el, msg) => {
      const err = $('#e-' + el.name, form);
      if (msg) {
        el.setAttribute('aria-invalid', 'true');
        if (err) { err.textContent = msg; err.hidden = false; }
      } else {
        el.removeAttribute('aria-invalid');
        if (err) { err.textContent = ''; err.hidden = true; }
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
      el.addEventListener('blur', () => { if (attempted || el.value) validateField(el); });
      el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') validateField(el); });
      el.addEventListener('change', () => { if (attempted) validateField(el); });
    });

    const data = () => ({
      nombre: form.elements.nombre.value.trim(),
      empresa: form.elements.empresa.value.trim(),
      trabajadores: form.elements.trabajadores.value.trim(),
      email: form.elements.email.value.trim(),
      telefono: form.elements.telefono.value.trim(),
      servicio_prevencion: form.elements.servicio_prevencion.value.trim(),
      mensaje: form.elements.mensaje.value.trim()
    });

    const composeText = (d) => [
      `Nombre: ${d.nombre}`,
      `Empresa: ${d.empresa}`,
      `Trabajadores: ${d.trabajadores}`,
      `Email: ${d.email}`,
      d.telefono ? `Teléfono: ${d.telefono}` : '',
      d.servicio_prevencion ? `Servicio de prevención: ${d.servicio_prevencion}` : '',
      d.mensaje ? `\nMensaje:\n${d.mensaje}` : ''
    ].filter(Boolean).join('\n');

    const showDone = (mode, d) => {
      const title = $('[data-done-title]', done);
      const text = $('[data-done-text]', done);
      const mailBox = $('[data-done-mail]', done);
      const firstName = d.nombre.split(' ')[0];
      if (mode === 'sent') {
        title.textContent = `Gracias, ${firstName}. Hemos recibido tu solicitud.`;
        text.textContent = `Te escribiremos a ${d.email} para preparar tu propuesta.`;
        mailBox.hidden = true;
      } else {
        title.textContent = `Tu solicitud está lista, ${firstName}.`;
        text.textContent = 'Solo falta enviarla. Pulsa el botón para abrirla en tu correo o cópiala y envíanosla tú.';
        const subject = `Solicitud de propuesta · ${d.empresa}`;
        lastRequest = composeText(d);
        $('[data-done-mailto]', done).href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lastRequest)}`;
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
      if (form.elements.web && form.elements.web.value) {
        showDone('sent', d);
        return;
      }
      if (!CONFIG.endpoint) {
        showDone('mail', d);
        return;
      }
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      submitLabel.textContent = 'Enviando…';
      try {
        const res = await fetch(CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...d, origen: window.location.href, fecha: new Date().toISOString() })
        });
        if (!res.ok) throw new Error(String(res.status));
        showDone('sent', d);
        form.reset();
      } catch (err) {
        statusEl.classList.add('is-error');
        statusEl.textContent = `No hemos podido enviar tu solicitud. Inténtalo de nuevo o escríbenos a ${CONFIG.email}.`;
      } finally {
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
        submitLabel.textContent = 'Enviar solicitud';
      }
    });

    $('[data-done-back]', done).addEventListener('click', () => {
      done.hidden = true;
      form.hidden = false;
      form.elements.nombre.focus();
    });
    $('[data-done-copy]', done).addEventListener('click', (e) => {
      copyText(lastRequest, e.currentTarget, $('[data-done-copy-label]', done), 'Copiar solicitud');
    });
  }

  /* ------------------------------------------------------------------
     Copiar al portapapeles con alternativa
     ------------------------------------------------------------------ */
  function copyText(text, button, labelEl, original) {
    const label = labelEl || button;
    const done = (msg) => {
      label.textContent = msg;
      window.setTimeout(() => { label.textContent = original; }, 2200);
    };
    const fallback = () => {
      const target = $('[data-email-text]');
      if (target && text === CONFIG.email) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
        done('Seleccionado');
      } else {
        done('No se pudo copiar');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done('Copiado'), fallback);
    } else {
      fallback();
    }
  }
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyText(btn.dataset.copy, btn, $('[data-copy-label]', btn), 'Copiar'));
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
        btn.style.transform = `translate3d(${(x * 10).toFixed(1)}px, ${(y * 8).toFixed(1)}px, 0)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* Año en el pie */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  window.__vigente = true;
  measureAll();
})();
