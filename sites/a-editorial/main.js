// LeadBound site A: page logic. UI (dialog, tabs, forms, menu) first, so it works even if the
// 3D or GSAP never load; then scroll choreography; then the archery stage.
const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const isPhone = () => innerWidth <= 720;
const gsap = window.gsap;
const ST = window.ScrollTrigger;
if (!gsap || !ST) root.classList.add('rm'); // no motion library: static, complete layout
const reduced = root.classList.contains('rm');

const MSG = {
  off: 'בגרסת התצוגה הזו הטופס עוד לא מחובר, אז שום דבר לא נשלח.',
  ok: 'קיבלנו. נחזור אליכם בהקדם.',
  err: 'משהו לא עבד בשליחה. אפשר לנסות שוב, או לכתוב לנו בלינקדאין.',
};

/* ---------------- header + menu ---------------- */
const head = $('#siteHead');
const menuBtn = $('#menuBtn');
const nav = $('#nav');
const onScrollHead = () => head.classList.toggle('is-scrolled', scrollY > 8);
addEventListener('scroll', onScrollHead, { passive: true }); onScrollHead();
function setMenu(open) {
  menuBtn.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
}
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });

// in-page links: smooth unless reduced, and close the phone menu
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  e.preventDefault();
  setMenu(false);
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#' + id);
});

/* ---------------- booking dialog ---------------- */
const dlg = $('#book');
const routeSel = $('#b-route');
let selectedRoute = '';
let opener = null;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-book]');
  if (!b) return;
  e.preventDefault();
  opener = b;
  const route = b.dataset.route || selectedRoute;
  if (route) routeSel.value = route;
  const st = $('.status', dlg); st.textContent = ''; st.className = 'status';
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => $('#b-name').focus(), 30);
});
$$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { if (opener && document.contains(opener)) opener.focus(); });

/* ---------------- offers: tabs; the choice waits in the form ---------------- */
const tabs = $$('.offer-tabs [role="tab"]');
function selectTab(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  selectedRoute = tab.dataset.route;
  routeSel.value = selectedRoute;
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t, false));
  t.addEventListener('keydown', (e) => {
    const rtl = getComputedStyle(t).direction === 'rtl';
    let n = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) n = (i + 1) % tabs.length;
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'ArrowDown' && isPhone()) n = (i + 1) % tabs.length;
    if (e.key === 'ArrowUp' && isPhone()) n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n !== null) { e.preventDefault(); selectTab(tabs[n], true); }
  });
});

/* ---------------- forms: never fake a success ---------------- */
function normaliseUrl(input) {
  const v = input.value.trim();
  if (v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) input.value = 'https://' + v;
}
function showStatus(el, kind, text) { el.className = 'status is-' + kind; el.textContent = text; }
$$('form[data-endpoint-key]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('input[type="url"]', form).forEach(normaliseUrl);
    const st = $('.status', form);
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const ep = (window.LB_CONFIG || {})[form.dataset.endpointKey];
    if (!ep) { showStatus(st, 'info', MSG.off); return; }
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (!res.ok) throw new Error(String(res.status));
      showStatus(st, 'ok', MSG.ok);
      form.reset();
    } catch (err) {
      showStatus(st, 'error', MSG.err);
    } finally { btn.disabled = false; }
  });
});

/* ---------------- method stages ---------------- */
const THR = [0, 0.17, 0.37, 0.57, 0.77];
const stageEls = $$('.stage');
const railEls = $$('.rail-i');
let methodP = 0, curStage = 0;
function stageOf(p) { let k = 1; for (let i = 1; i < 5; i++) if (p >= THR[i]) k = i + 1; return k; }
function renderStage() {
  const k = stageOf(methodP);
  if (k === curStage) return;
  curStage = k;
  stageEls.forEach((el, i) => { el.classList.toggle('is-active', i + 1 === k); el.classList.toggle('is-past', i + 1 < k); });
  railEls.forEach((el, i) => { el.classList.toggle('is-active', i + 1 === k); el.classList.toggle('is-done', i + 1 < k); });
}
renderStage();

/* ---------------- fallback mark (WebGL unavailable) ---------------- */
const MARK_SVG = `<svg class="fallback-mark" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
  <defs><radialGradient id="fbD" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#26323A"/><stop offset="1" stop-color="#0F1518"/></radialGradient></defs>
  <ellipse cx="7" cy="9" rx="55" ry="55" fill="#0D2B32" opacity=".16"/>
  <circle r="56.5" fill="url(#fbD)"/>
  <path fill="#12B7D4" d="M39.93-30.09A50 50 0 0 0-39.93-30.09L-34.62-26.09A43.35 43.35 0 0 1 34.62-26.09Z M-39.93 30.09A50 50 0 0 0 39.93 30.09L34.62 26.09A43.35 43.35 0 0 1-34.62 26.09Z"/>
  <circle r="31.4" fill="none" stroke="#12B7D4" stroke-width="7.2"/>
  <circle r="20" fill="#12B7D4"/>
</svg>`;
function useFallback() {
  root.classList.add('no-webgl');
  $$('[data-anchor]').forEach((a) => { if (!a.querySelector('.fallback-mark')) a.insertAdjacentHTML('beforeend', MARK_SVG); });
}

/* ---------------- scroll choreography ---------------- */
let methodST = null;
if (!reduced) {
  ST.config({ ignoreMobileResize: true });

  // hero intro
  gsap.from('.mega-l', { yPercent: 55, opacity: 0, duration: 1.1, ease: 'power4.out', stagger: 0.07, delay: 0.05 });
  gsap.from(['.hero-micro', '.hero h1', '.lead', '.hero-act'], { y: 18, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.3 });

  // hero depth: far rings slowest, type at scroll speed, piece in between (in the scene plan)
  gsap.to('.hero-far', { y: () => innerHeight * 0.55, rotation: 9, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  if (!isPhone()) gsap.to('.mega', { y: () => -innerHeight * 0.06, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // method: pin and step through five stages
  methodST = ST.create({
    trigger: '#methodPin', start: 'top top', end: () => '+=' + Math.round(innerHeight * 4.2),
    pin: true, pinSpacing: true, anticipatePin: 1, invalidateOnRefresh: true,
    onUpdate: (s) => { methodP = s.progress; renderStage(); },
  });

  // reveals: short, ease-out, once
  const rv = (sel, extra = {}) => $$(sel).forEach((el) => gsap.from(el, {
    opacity: 0, y: 26, duration: 0.9, ease: 'power3.out', ...extra,
    scrollTrigger: { trigger: el, start: 'top 88%', once: true },
  }));
  rv('.clients .wrap');
  rv('.method-head > *');
  rv('.scale-line');
  rv('.replies-head > div:first-child');
  rv('.case-quote');
  rv('.case-nums > div');
  rv('.case-link');
  rv('.team-head > *');
  rv('.founder');
  rv('.fit-head > *');
  rv('.fit-col');
  rv('.steps-h');
  rv('.timeline li');
  rv('.offers-head > *');
  rv('.offer-tabs');
  rv('.offer-panels');
  rv('.strategy-copy > *');
  rv('.strategy-form');
  rv('.faq-grid > *');
  rv('.close-copy > *');
  rv('.replies-cta');

  // replies: paper notes drop onto the board with the scroll
  $$('.note').forEach((n, i) => {
    const r = parseFloat(getComputedStyle(n).getPropertyValue('--r')) || 0;
    const rr = isPhone() ? r * 0.6 : r;
    gsap.fromTo(n, { y: 90, rotation: rr + (i % 2 ? 7 : -7), opacity: 0 }, {
      y: 0, rotation: rr, opacity: 1, ease: 'power2.out',
      scrollTrigger: { trigger: n, start: 'top 100%', end: 'top 66%', scrub: 0.6 },
    });
  });

  // steps: the line draws with the scroll (horizontal on desktop, vertical on narrow)
  const mm = gsap.matchMedia();
  mm.add('(min-width: 961px)', () => {
    gsap.fromTo('.tl-line span', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 82%', end: 'top 40%', scrub: true } });
  });
  mm.add('(max-width: 960px)', () => {
    gsap.fromTo('.tl-line span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 80%', end: 'bottom 60%', scrub: true } });
  });

  // case numbers count up once
  $$('[data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count), fmt = el.dataset.fmt, o = { v: 0 };
    const paint = () => {
      el.textContent = fmt === 'x' ? '×' + o.v.toFixed(1) : fmt === 'k' ? '$' + Math.round(o.v) + 'K+' : String(Math.round(o.v));
    };
    ST.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => { paint(); gsap.to(o, { v: to, duration: 1.4, ease: 'power3.out', onUpdate: paint }); } });
  });
} else {
  stageEls.forEach((el) => el.classList.add('is-active'));
}

/* ---------------- the archery stage ---------------- */
const canvas = $('#stage');
const anchorEl = {
  hero: $('[data-anchor="hero"]'), method: $('[data-anchor="method"]'),
  replies: $('[data-anchor="replies"]'), close: $('[data-anchor="close"]'),
};
const poseOf = (el) => el.dataset.pose.split(/\s+/).map(Number);
const S = {
  target: { x: 0, y: 0, w: 0, poseA: [0, 0, 0], poseB: null, t: 0, swing: 0, dark: 0, visible: false },
  shots: [false, false, false, false, false], drain: 0, pointer: { x: 0, y: 0 },
};
let plan = null;
let shot0Latched = false;
const t0 = performance.now();

function rectDoc(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, yDoc: r.top + scrollY + r.height / 2, w: r.width };
}
function buildPlan() {
  const vh = innerHeight;
  const hero = rectDoc(anchorEl.hero), rep = rectDoc(anchorEl.replies), clo = rectDoc(anchorEl.close);
  const pinEl = $('#methodPin');
  const pr = pinEl.getBoundingClientRect(), mr = anchorEl.method.getBoundingClientRect();
  const pinStart = methodST ? methodST.start : pr.top + scrollY;
  const pinEnd = methodST ? methodST.end : pinStart;
  const mDock = { x: mr.left + mr.width / 2, y: (methodST ? mr.top - pr.top : mr.top + scrollY - pinStart) + mr.height / 2, w: mr.width };
  plan = {
    vh, hero, rep, clo, mDock, pinStart, pinEnd,
    heroHold: vh * 0.3, heroRate: isPhone() ? 1 : 0.4,
    glue: vh * 0.12,
    repArrive: rep.yDoc - vh * 0.36,
    pose: { hero: poseOf(anchorEl.hero), method: poseOf(anchorEl.method), replies: poseOf(anchorEl.replies), close: poseOf(anchorEl.close) },
    travel: !isPhone(),
  };
}

function setT(x, y, w, poseA, poseB = null, t = 0, swing = 0, dark = 0) {
  Object.assign(S.target, { x, y, w, poseA, poseB, t, swing, dark, visible: true });
}

function frameTarget() {
  const p = plan; const s = scrollY; const vh = p.vh;
  const heroAt = (sc) => p.hero.yDoc - sc * p.heroRate;
  const mGlued = (sc) => sc < p.pinStart ? p.mDock.y + (p.pinStart - sc) : sc <= p.pinEnd ? p.mDock.y : p.mDock.y - (sc - p.pinEnd);

  if (!p.travel) {
    // phone: every anchor carries the piece with its own section, one at a time
    const cand = [
      { x: p.hero.x, y: heroAt(s), w: p.hero.w, pose: p.pose.hero },
      { x: p.mDock.x, y: mGlued(s), w: p.mDock.w, pose: p.pose.method },
      { x: p.rep.x, y: p.rep.yDoc - s, w: p.rep.w, pose: p.pose.replies },
      { x: p.clo.x, y: p.clo.yDoc - s, w: p.clo.w, pose: p.pose.close, dark: 1 },
    ];
    let pick = cand.find((c) => c.y + c.w * 0.7 > 0 && c.y - c.w * 0.7 < vh) || cand[0];
    setT(pick.x, pick.y, pick.w, pick.pose, null, 0, 0, pick.dark || 0);
    return;
  }

  if (s <= p.heroHold) { setT(p.hero.x, heroAt(s), p.hero.w, p.pose.hero); return; }
  if (s < p.pinStart) {
    const t = clamp((s - p.heroHold) / Math.max(1, p.pinStart - p.heroHold));
    const e = easeIO(t);
    const ax = p.hero.x, ay = heroAt(p.heroHold), aw = p.hero.w;
    const x = ax + (p.mDock.x - ax) * e;
    const y = ay + (p.mDock.y - ay) * e + Math.sin(Math.PI * e) * vh * 0.06;
    const w = aw + (p.mDock.w - aw) * e;
    setT(x, y, w, p.pose.hero, p.pose.method, e, Math.sin(Math.PI * e));
    return;
  }
  if (s <= p.pinEnd + p.glue || p.repArrive <= p.pinEnd + p.glue) {
    if (s <= p.pinEnd + p.glue || s < p.repArrive) { setT(p.mDock.x, mGlued(s), p.mDock.w, p.pose.method); return; }
  }
  if (s < p.repArrive) {
    const s0 = p.pinEnd + p.glue;
    const t = clamp((s - s0) / Math.max(1, p.repArrive - s0));
    const e = easeIO(t);
    const ay = mGlued(s0);
    const by = p.rep.yDoc - p.repArrive;
    const x = p.mDock.x + (p.rep.x - p.mDock.x) * e;
    const y = ay + (by - ay) * e - Math.sin(Math.PI * e) * vh * 0.04;
    const w = p.mDock.w + (p.rep.w - p.mDock.w) * e;
    setT(x, y, w, p.pose.method, p.pose.replies, e, -Math.sin(Math.PI * e) * 0.8);
    return;
  }
  const ry = p.rep.yDoc - s, cy = p.clo.yDoc - s;
  if (ry + p.rep.w > -vh * 0.2 && cy > vh * 1.2) { setT(p.rep.x, ry, p.rep.w, p.pose.replies); return; }
  setT(p.clo.x, cy, p.clo.w, p.pose.close, null, 0, 0, 1);
}

function frameShots() {
  const since = (performance.now() - t0) / 1000;
  if (!shot0Latched && (scrollY > innerHeight * 0.1 || since > 1.5)) shot0Latched = true;
  S.shots[0] = shot0Latched;
  for (let k = 1; k < 5; k++) S.shots[k] = methodP >= THR[k];
  S.drain = methodP > 0 && methodP < 1 ? smooth(clamp(methodP / 0.05)) : 0;
}

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}

async function bootStage() {
  if (!webglOK()) { useFallback(); return; }
  let mod;
  try { mod = await import('./scene.js'); } catch (e) { console.warn('[stage] scene failed to load', e); useFallback(); return; }
  const stage = mod.createStage(canvas, { reduced });
  if (!stage) { useFallback(); return; }

  if (reduced) {
    // a still frame per anchor, no motion, no pinned scroll space
    canvas.style.visibility = 'hidden';
    const shotsFor = { hero: 1, method: 5, replies: 5, close: 5 };
    for (const name of Object.keys(anchorEl)) {
      const el = anchorEl[name];
      const r = el.getBoundingClientRect();
      if (r.width < 2) continue;
      const url = stage.snapshot(Math.round(r.width), Math.round(r.height || r.width), poseOf(el), shotsFor[name], name === 'close' ? 1 : 0);
      const img = new Image(); img.className = 'frame'; img.alt = ''; img.src = url; img.decoding = 'async';
      el.appendChild(img);
    }
    canvas.style.display = 'none';
    return;
  }

  buildPlan();
  ST.addEventListener('refresh', () => { buildPlan(); stage.resize(); });
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; } stage.resize(); });
  if (finePointer) {
    addEventListener('pointermove', (e) => { S.pointer.x = (e.clientX / innerWidth) * 2 - 1; S.pointer.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
    document.addEventListener('pointerleave', () => { S.pointer.x = 0; S.pointer.y = 0; });
  }
  gsap.ticker.add((time, deltaMs) => {
    if (document.hidden || !plan) return;
    frameTarget();
    frameShots();
    stage.update(S, deltaMs / 1000);
  });
  window.__lbStage = { S, stage, get plan() { return plan; } };
}

if (document.readyState === 'complete') bootStage();
else addEventListener('load', bootStage, { once: true });
