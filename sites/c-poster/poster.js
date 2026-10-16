// poster.js : site C. Scale contrast does the work; this file only measures, sequences and wires.
import { createField } from './field.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap, ST = window.ScrollTrigger;
const motion = !reduced && !!gsap && !!ST;

root.classList.add('js');
if (reduced) root.classList.add('rm');
if (motion) root.classList.add('motion'); else root.classList.add('gentle');

const MSG = {
  off: 'בגרסת התצוגה הזו הטופס עוד לא מחובר, אז שום דבר לא נשלח.',
  ok: 'קיבלנו. נחזור אליכם בהקדם.',
  err: 'משהו לא עבד בשליחה. אפשר לנסות שוב, או לכתוב לנו בלינקדאין.',
};

/* ── Fit: giant type sized to its column (and capped by the viewport height) ── */
function fitAll() {
  $$('[data-fit]').forEach((el) => {
    const box = el.parentElement;
    const cs = getComputedStyle(box);
    const avail = (box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * parseFloat(el.dataset.fit || '1');
    el.style.fontSize = '200px';
    const w = el.offsetWidth;
    let fs = (200 * avail) / Math.max(1, w);
    const vh = parseFloat(el.dataset.fitVh || '0');
    if (vh) fs = Math.min(fs, window.innerHeight * vh);
    el.style.fontSize = fs.toFixed(2) + 'px';
  });
  // Phone: "Lead" and "Bound" each fill the measure, a justified poster stack.
  const lines = $$('.wm-line');
  if (window.innerWidth < 760) {
    const wm = $('.wm');
    lines.forEach((ln) => {
      ln.style.fontSize = '200px';
      const fs = Math.min((200 * wm.clientWidth * 0.985) / Math.max(1, ln.offsetWidth), window.innerHeight * 0.25);
      ln.style.fontSize = fs.toFixed(2) + 'px';
    });
  } else {
    lines.forEach((ln) => (ln.style.fontSize = ''));
  }
  // 37% sets the scale; 8% is drawn at 8/37 of it, so the glyph heights are the data.
  const row = $('.nr-row');
  if (row) {
    const probe = $('.nr-37 .nr-fig');
    probe.style.fontSize = '200px';
    const w37 = probe.offsetWidth;
    probe.style.fontSize = '';
    const wide = row.clientWidth;
    const mobile = window.innerWidth < 760;
    const share = mobile ? 0.98 : 0.82;
    let F = (200 * wide * share) / Math.max(1, w37);
    F = Math.min(F, window.innerHeight * (mobile ? 0.36 : 0.8));
    row.style.setProperty('--F', F.toFixed(2) + 'px');
  }
}

/* ── Split giant words into glyph spans (Hebrew letters do not join, so this is safe) ── */
function split(el) {
  const text = el.textContent;
  el.textContent = '';
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    el.appendChild(s);
  }
}

/* ── Nav: takes the ground of whatever is under it; steps aside on the way down ── */
function initNav() {
  const nav = $('#nav');
  const hero = $('#top');
  const grounds = $$('[data-ground]');
  const toggle = $('.nav-toggle');
  const panel = $('#nav-panel');
  let lastY = scrollY, ground = 'black', ticking = false;

  const setGround = (g) => {
    if (g === ground) return;
    nav.classList.remove('g-' + ground); nav.classList.add('g-' + g); ground = g;
  };
  const update = () => {
    ticking = false;
    const y = scrollY;
    const probe = Math.min(40, nav.offsetHeight / 2);
    for (const el of grounds) {
      const r = el.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { setGround(el.dataset.ground); break; }
    }
    nav.classList.toggle('past-hero', y > hero.offsetHeight * 0.55);
    const open = toggle.getAttribute('aria-expanded') === 'true';
    if (!open && !nav.contains(document.activeElement)) {
      if (y > lastY + 6 && y > hero.offsetHeight * 0.5) nav.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 80) nav.classList.remove('is-hidden');
    }
    lastY = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
  update();

  const close = () => { toggle.setAttribute('aria-expanded', 'false'); panel.hidden = true; };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open)); panel.hidden = open;
    if (!open) panel.querySelector('a')?.focus();
  });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { close(); toggle.focus(); } });
}

/* ── Booking dialog + both forms. Never a fake success. ── */
let chosenRoute = '';
function initDialog() {
  const dlg = $('#book');
  const route = $('#b-route');
  let opener = null;

  const open = (r) => {
    if (r) chosenRoute = r;
    if (chosenRoute) route.value = chosenRoute;
    const st = $('.f-status', dlg); st.textContent = ''; st.removeAttribute('data-kind');
    opener = document.activeElement;
    dlg.showModal();
    root.classList.add('dlg-open');
    $('#b-name').focus();
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-book]');
    if (!b) return;
    e.preventDefault();
    open(b.dataset.route);
  });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // backdrop
  dlg.addEventListener('close', () => { root.classList.remove('dlg-open'); opener?.focus?.(); });
}

function initForms() {
  $$('form.form').forEach((form) => {
    const st = $('.f-status', form);
    const btn = $('button[type="submit"]', form);
    const say = (kind) => { st.dataset.kind = kind; st.textContent = MSG[kind]; };
    form.addEventListener('input', (e) => { if (e.target.matches('[aria-invalid]') && e.target.checkValidity()) e.target.removeAttribute('aria-invalid'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // A bare domain is what people type; make it a URL before the browser judges it.
      $$('input[type="url"]', form).forEach((i) => { const v = i.value.trim(); if (v && !/^[a-z]+:\/\//i.test(v)) i.value = 'https://' + v; });
      const bad = $$('input, select', form).filter((i) => !i.checkValidity());
      $$('input, select', form).forEach((i) => i.toggleAttribute('aria-invalid', !i.checkValidity()));
      $$('[aria-invalid]', form).forEach((i) => i.setAttribute('aria-invalid', 'true'));
      if (bad.length) { st.removeAttribute('data-kind'); st.textContent = ''; bad[0].focus(); form.reportValidity(); return; }
      const endpoint = (window.LB_CONFIG || {})[form.dataset.endpoint] || '';
      if (!endpoint) { say('off'); return; }
      btn.disabled = true;
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        if (!res.ok) throw new Error(String(res.status));
        say('ok'); form.reset();
      } catch (err) {
        say('err');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

/* ── Offers: a real tablist; the choice waits in the booking form ── */
function initOffers() {
  const tabs = $$('.of-tab');
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    chosenRoute = tab.dataset.route;
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const map = { ArrowDown: 1, ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1 };
      if (e.key in map) { e.preventDefault(); select(tabs[(i + map[e.key] + n) % n], true); }
      else if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
      else if (e.key === 'End') { e.preventDefault(); select(tabs[n - 1], true); }
    });
  });
}

/* ── Gentle mode (reduced motion, or no scroll engine): opacity only ── */
function initGentle() {
  const els = $$('.stage-copy, .nb-fig, .nr-item, .nt-dial, .sc-copy, .rp, .cn, .case-quote, .fd, .fit-col, .st-list li, .of-body, .sg-text, .faq-list, .close-in');
  els.forEach((el) => el.setAttribute('data-reveal', ''));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}

/* ── Motion: every number gets its own held screen ── */
function initMotion(field) {
  gsap.registerPlugin(ST);
  const S = (trigger, extra) => ({ trigger, scrub: 0.6, invalidateOnRefresh: true, ...extra });

  // the field (signature)
  ST.create({ trigger: '#method', start: 'top top', end: 'bottom bottom', onUpdate: (s) => field.set(s.progress), onRefresh: (s) => field.set(s.progress, true) });

  // hero exit: the wordmark keeps its weight, the copy leaves first
  gsap.to('.hero-copy', { yPercent: -18, autoAlpha: 0, ease: 'none', scrollTrigger: S('#top', { start: 'top top', end: 'bottom 30%' }) });

  // stage words: letters rise into place; the copy follows
  $$('.stage').forEach((sec) => {
    const chars = $$('.stage-word .ch', sec);
    gsap.fromTo(chars, { yPercent: 140 }, { yPercent: 0, ease: 'power3.out', stagger: 0.07, scrollTrigger: S(sec, { start: 'top 88%', end: 'top 8%' }) });
    gsap.fromTo($('.stage-copy', sec), { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, ease: 'power2.out', scrollTrigger: S(sec, { start: 'top 30%', end: 'top -12%' }) });
  });

  // <2%: the number rises out of the ground, the qualifier slides in
  {
    const tl = gsap.timeline({ scrollTrigger: S('#n-bounce', { start: 'top 55%', end: 'bottom bottom' }) });
    tl.fromTo('#n-bounce .nb-big', { clipPath: 'inset(100% -10% -10% -10%)', yPercent: 18 }, { clipPath: 'inset(-10% -10% -10% -10%)', yPercent: 0, ease: 'power2.out', duration: 1 })
      .fromTo('#n-bounce .nb-pre', { autoAlpha: 0, x: 60 }, { autoAlpha: 1, x: 0, ease: 'power2.out', duration: 0.6 }, 0.35)
      .fromTo('#n-bounce .nb-lab', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.7)
      .to({}, { duration: 0.8 });
  }

  // 8% and 37%: both start at the same size; LinkedIn grows to its true proportion
  {
    const tl = gsap.timeline({ scrollTrigger: S('#n-reply', { start: 'top 50%', end: 'bottom bottom' }) });
    tl.fromTo('#n-reply .nr-8 .nr-in', { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, ease: 'power2.out', duration: 0.5 })
      .fromTo('#n-reply .nr-8 .nr-lab', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.3)
      .fromTo('#n-reply .nr-37 .nr-in', { scale: 8 / 37, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, ease: 'none' }, 0.45)
      .to('#n-reply .nr-37 .nr-in', { scale: 1, ease: 'power2.inOut', duration: 1.1 }, 0.62)
      .fromTo('#n-reply .nr-37 .nr-lab', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.45)
      .to({}, { duration: 0.6 });
  }

  // <30 min: half a clock face, drawn by the hand
  {
    const tl = gsap.timeline({ scrollTrigger: S('#n-time', { start: 'top 15%', end: 'bottom bottom' }) });
    tl.fromTo('#n-time .nt-arc', { strokeDashoffset: 100 }, { strokeDashoffset: 0, ease: 'none', duration: 1.2 })
      .fromTo('#n-time .nt-fig', { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, ease: 'power2.out', duration: 0.5 }, 0.1)
      .fromTo('#n-time .nt-lab', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.9)
      .to({}, { duration: 0.6 });
  }

  // 250,000+: each glyph rises in turn until the number fills the width
  {
    const tl = gsap.timeline({ scrollTrigger: S('#scale', { start: 'top 60%', end: 'bottom bottom' }) });
    tl.fromTo('#scale .sc-in .ch', { yPercent: 140 }, { yPercent: 0, ease: 'power3.out', stagger: 0.08, duration: 0.6 })
      .fromTo('#scale .sc-copy', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.4 }, 0.75)
      .to({}, { duration: 0.6 });
  }

  // replies: a horizontal run, read right to left
  {
    const run = $('.rp-run'), track = $('.rp-track'), frame = $('.rp-frame');
    const dist = () => Math.max(0, track.scrollWidth - frame.clientWidth);   // the track is LTR: it travels left
    const size = () => { run.style.height = (dist() * 0.9 + window.innerHeight) + 'px'; };
    size();
    ST.addEventListener('refreshInit', size);
    gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: run, start: 'top top', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true } });
  }

  // Elad: three numbers, each owning the screen in turn
  {
    const items = $$('.cn');
    const tl = gsap.timeline({ scrollTrigger: S('.case-run', { start: 'top 60%', end: 'bottom bottom' }) });
    items.forEach((el, i) => {
      const num = $('.cn-in', el), lab = $('.cn-lab', el), at = i * 2.2;
      tl.fromTo(num, { yPercent: 145 }, { yPercent: 0, ease: 'power3.out', duration: 0.8 }, at)
        .fromTo(lab, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4 }, at + 0.35);
      if (i < items.length - 1) {
        tl.to(num, { yPercent: -145, ease: 'power2.inOut', duration: 0.7 }, at + 1.6)
          .to(lab, { autoAlpha: 0, duration: 0.3 }, at + 1.6);
      }
    });
    tl.to({}, { duration: 0.5 });
  }

  // flow sections: headings wipe in once, bodies fade
  $$('.team-head h2, .fit-head h2, .steps h2, .of-head h2, .strategy h2, .faq h2, .rp-head h2').forEach((h) => {
    gsap.fromTo(h, { clipPath: 'inset(-20% 0% -20% 100%)' }, { clipPath: 'inset(-20% -2% -20% -2%)', ease: 'power3.out', duration: 1.1, clearProps: 'clipPath', scrollTrigger: { trigger: h, start: 'top 86%', once: true } });
  });
  $$('.fd, .fit-col, .st-list li, .of-body, .sg-ch, .form.sg-form, .faq-list, .case-quote blockquote, .close-in').forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.7, clearProps: 'transform,opacity,visibility', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });
}

/* ── Boot ── */
async function boot() {
  initNav();
  initDialog();
  initForms();
  initOffers();

  $$('[data-split]').forEach(split);
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 100px Rubik', 'LeadBound סיגנל'),
        document.fonts.load('800 100px Rubik', 'אימות 250,000+'),
        document.fonts.load('400 14px Rubik', 'אבג ABC'),
        document.fonts.load('500 14px Rubik', 'אבג'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fall through with whatever loaded */ }
  fitAll();

  const field = createField({ stage: $('.field-stage'), canvas: $('.field-canvas'), intro: $('.field-intro'), list: $('.sw') });
  field.layout(!motion);
  if (!motion) field.drawStatic();

  if (motion) initMotion(field); else initGentle();

  let w = innerWidth, h = innerHeight, tid = 0;
  addEventListener('resize', () => {
    clearTimeout(tid);
    tid = setTimeout(() => {
      const mobileH = Math.abs(innerHeight - h) < 140 && innerWidth === w;   // URL bar show/hide
      if (mobileH) return;
      w = innerWidth; h = innerHeight;
      fitAll();
      field.layout(!motion);
      if (!motion) field.drawStatic();
      if (motion) ST.refresh();
    }, 160);
  });

  // The 3D "o". If the CDN or WebGL fails, the flat SVG mark stays, never a blank.
  import('./bullseye.js')
    .then((m) => m.initBullseye($('#bullseye'), { reduced }))
    .catch(() => {});
}

boot();
