/* ============================================================================
   machine.js: site B's page controller. No library; one rAF loop reads the
   scroll position and drives the instrument, the pinned method act, the peak
   (real replies rising out of the bullseye as HTML), the stage rail, the
   steps line and the bar. Everything else is plain DOM: the booking dialog,
   the offer tabs that preselect the route, the "try it" panel, the forms.
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const FLOOR = -0.62;

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
const pin = root.classList.contains('pin');
const CFG = window.LB_CONFIG || { bookingEndpoint: '', strategyEndpoint: '' };

const MSG = {
  off: 'בגרסת התצוגה הזו הטופס עוד לא מחובר, אז שום דבר לא נשלח.',
  ok: 'קיבלנו. נחזור אליכם בהקדם.',
  err: 'משהו לא עבד בשליחה. אפשר לנסות שוב, או לכתוב לנו בלינקדאין.',
};

// ------------------------------------------------------------------ elements
const host = $('.instrument');
const canvas = $('canvas', host);
const pingEl = $('.ping', host);
const posterFunnel = $('.poster__funnel', host);
const posterMark = $('.poster__mark', host);
const bar = $('[data-bar]');
const hero = $('#top');
const heroCopy = $('.hero__copy');
const act = $('#method');
const actView = $('.act__view');
const stages = $$('.act__readout .stage');
const repliesHead = $('.stage--replies');
const meeting = $('.meeting');
const cards = $$('.reply');
const repliesBox = $('.replies');
const anchorReplies = $('#replies');
const rail = $('.rail');
const railBtns = $$('.rail button');
const readout = $('.act__readout');
const closeEl = $('#book');
const closeAnchor = $('[data-bullseye-anchor]');
const closeBtn = $('.close__copy .btn');
const foot = $('.foot');
const paper = $('.paper');
const stepsTrack = $('[data-steps]');
const stepEls = $$('.step');

// ------------------------------------------------------------------ camera keys
// cam = camera position, look = target, a = where the target lands on screen.
const KD = {
  hero0: { cam: [0, 10.5, 13.5], look: [0, 2.0, 0], a: [0.30, 0.50] },
  hero1: { cam: [0, 11.2, 12.2], look: [0, 1.8, 0], a: [0.31, 0.50] },
  stage: { cam: [0, 10.8, 12.4], look: [0, 1.7, 0], a: [0.32, 0.53] },
  hush:  { cam: [0, 15.5, 6.2],  look: [0, 0.3, 0], a: [0.35, 0.52] },
  peak:  { cam: [0, 17.5, 2.2],  look: [0, FLOOR, 0], a: [0.36, 0.52] },
  cards: { cam: [0, 15.5, 1.9],  look: [0, FLOOR, 0], a: [0.36, 0.85] },
  meet:  { cam: [0, 13.5, 1.6],  look: [0, FLOOR, 0], a: [0.5, 0.80] },
  close: { cam: [0, 16.5, 5.2],  look: [0, FLOOR, 0] },
};
const KM = {
  hero0: { cam: [0, 12.5, 17.5], look: [0, 2.0, 0], a: [0.5, 0.72] },
  hero1: { cam: [0, 13.2, 16.0], look: [0, 1.8, 0], a: [0.5, 0.70] },
  stage: { cam: [0, 12.8, 16.0], look: [0, 1.8, 0], a: [0.5, 0.37] },
  hush:  { cam: [0, 18, 7.5],    look: [0, 0.3, 0], a: [0.5, 0.40] },
  peak:  { cam: [0, 20, 2.6],    look: [0, FLOOR, 0], a: [0.5, 0.44] },
  cards: { cam: [0, 18, 2.3],    look: [0, FLOOR, 0], a: [0.5, 0.88] },
  meet:  { cam: [0, 16, 2.0],    look: [0, FLOOR, 0], a: [0.5, 0.80] },
  close: { cam: [0, 19, 6.0],    look: [0, FLOOR, 0] },
};
const lerpKey = (A, B, t) => ({
  cam: A.cam.map((v, i) => mix(v, B.cam[i], t)),
  look: A.look.map((v, i) => mix(v, B.look[i], t)),
  a: A.a.map((v, i) => mix(v, B.a[i], t)),
});

// the act's timeline, as fractions of its scroll travel
const TL = {
  cards: [0.59, 0.885],
  railAt: [0.07, 0.16, 0.25, 0.34, 0.90],
};

function keyAt(K, mp, hp) {
  if (mp <= 0) return lerpKey(K.hero0, K.hero1, ss(0, 1, hp));
  if (mp < 0.07) return lerpKey(K.hero1, K.stage, ss(0, 0.07, mp));
  if (mp < 0.42) return K.stage;
  if (mp < 0.48) return lerpKey(K.stage, K.hush, ss(0.42, 0.48, mp));
  if (mp < 0.555) return lerpKey(K.hush, K.peak, ss(0.48, 0.555, mp));
  if (mp < 0.60) return lerpKey(K.peak, K.cards, ss(0.555, 0.60, mp));
  if (mp < 0.885) return K.cards;
  return lerpKey(K.cards, K.meet, ss(0.885, 0.93, mp));
}

// ------------------------------------------------------------------ instrument
let funnel = null;
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
if (webglOK()) {
  import('./funnel.js')
    .then((m) => {
      funnel = m.createFunnel(canvas, pingEl, { small: innerWidth < 860, reduce });
      funnel.resize(innerWidth, innerHeight);
      host.classList.add('is-live');
      host.dataset.points = funnel.N;
    })
    .catch((e) => { console.warn('instrument fell back to the poster:', e && e.message); host.classList.add('is-fallback'); });
} else host.classList.add('is-fallback');

// ------------------------------------------------------------------ layout
const L = { W: 1, H: 1, small: false, travel: 1, actTop: 0, cw: 360, heights: [], offs: [], lanes: [], D: 1, topLimit: 0, barH: 72 };

function layout() {
  L.W = innerWidth; L.H = innerHeight; L.small = L.W < 860;
  L.barH = bar.offsetHeight || 72;
  if (funnel) funnel.resize(L.W, L.H);
  if (!pin) { L.travel = 1; return; }

  const K = L.small ? KM : KD;
  const gutter = parseFloat(getComputedStyle(readout).insetInlineStart) || 20;
  // card width and lanes around the bullseye
  const twoLanes = L.W >= 1100;
  if (L.small) L.cw = Math.min(420, L.W - 2 * Math.max(16, gutter));
  else if (twoLanes) L.cw = clamp(L.W * 0.25, 300, 380);
  else L.cw = Math.min(380, L.W * 0.5 - gutter);
  repliesBox.style.setProperty('--cw', `${Math.round(L.cw)}px`);
  L.heights = cards.map((c) => c.offsetHeight);
  const bx = K.cards.a[0] * L.W;
  const two = twoLanes && !L.small;
  // keep the right lane clear of the readout column
  const rLeft = readout.getBoundingClientRect().left;
  const right = two ? Math.min(bx + L.cw / 2 + 14, rLeft - 40 - L.cw / 2) : Math.min(bx, rLeft - 40 - L.cw / 2);
  const laneX = two ? [right, right - L.cw - 28] : [L.small ? L.W / 2 : right];
  L.offs = []; L.lanes = [];
  const laneLast = [-1e9, -1e9];
  cards.forEach((c, i) => {
    const lane = two ? i % 2 : 0;
    const prev = i ? L.offs[i - 1] : -1e9;
    const gap = two ? 30 : 18;
    let b = i === 0 ? 0 : prev + (two ? Math.max(130, L.heights[i - 1] * 0.5) : 0);
    b = Math.max(b, laneLast[lane] + L.heights[i] + gap);
    L.offs.push(b); laneLast[lane] = b;
    L.lanes.push(laneX[lane]);
  });
  // where cards must have faded by: under the bar on desktop, under the replies title on mobile
  // on phones the replies title opens the stream, then hands the full height to the cards
  repliesHead.dataset.to = L.small ? '0.632' : '0.88';
  if (L.small) {
    L.topLimitA = L.barH + 3.6 * 16 + repliesHead.offsetHeight + 14;
    L.topLimit = L.barH + 52;
  } else { L.topLimit = L.barH + 24; L.topLimitA = L.topLimit; }
  const by = K.cards.a[1] * L.H;
  const last = cards.length - 1;
  const avail = by - (L.small ? 44 : 58) - L.topLimit;
  L.emerge = Math.min(170, avail * 0.22); L.fadeD = Math.min(80, avail * 0.12);
  L.R0 = L.small ? 44 : 58;
  // the conveyor ends with the last replies still on screen; the meeting frame takes over from there
  L.D = L.offs[last] + Math.max(0, by - L.R0 - L.topLimit - L.heights[last]) * 0.62;
  // the act is as long as the peak needs: cards move at most ~0.72px per px scrolled
  const span = TL.cards[1] - TL.cards[0];
  const travel = Math.max(8.2 * L.H, L.D / 0.72 / span);
  act.style.setProperty('--act-h', `${Math.round(travel + L.H)}px`);
  L.travel = travel;
  L.actTop = act.getBoundingClientRect().top + scrollY;
}
addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 120); });

// ------------------------------------------------------------------ pointer
const pointer = { x: -1e4, y: -1e4, last: -1e9, on: false };
addEventListener('pointermove', (e) => {
  if (!fineMQ.matches || reduce || e.pointerType !== 'mouse') return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.last = performance.now();
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.last = -1e9; });

// ------------------------------------------------------------------ the frame
let last = performance.now();
let lastRail = -1, meetingOn = false;
const lastB = { bx: 0, by: 0 };
function stageOpacity(el, mp) {
  const from = +el.dataset.from, to = +el.dataset.to, w = 0.012;
  const i = from < 0 ? 1 : ss(from, from + w, mp);
  const o = to > 1.5 ? 1 : 1 - ss(to - w, to, mp);
  return { o: i * o, y: (1 - i) * 18 - (1 - o) * 18 };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (document.hidden) return;
  const W = L.W, H = L.H;
  const K = L.small ? KM : KD;

  // bar
  bar.classList.toggle('is-solid', scrollY > 8);
  const pr = paper.getBoundingClientRect();
  bar.classList.toggle('on-paper', pr.top <= L.barH / 2 && pr.bottom >= L.barH / 2);

  const hr = hero.getBoundingClientRect();
  const ar = act.getBoundingClientRect();
  const cr = closeEl.getBoundingClientRect();
  const hp = clamp(-hr.top / Math.max(hr.height, 1), 0, 1);
  const mp = pin ? clamp(-ar.top / Math.max(L.travel, 1), 0, 1) : 0;
  const inAct = pin && ar.top <= 0 && ar.bottom > H * 0.5;
  const closeOn = cr.top < H;
  const actShows = pin ? ar.bottom > 0 : hr.bottom > 0;
  const visible = actShows || closeOn;
  host.classList.toggle('is-hidden', !visible);

  // ---- the act's DOM: stage copy, scrim, rail, cards, meeting
  let emit = -1;
  let bx = funnel ? lastB.bx : K.cards.a[0] * W, by = funnel ? lastB.by : K.cards.a[1] * H;
  if (pin && ar.bottom > 0 && ar.top < H) {
    for (const el of stages) {
      const { o, y } = stageOpacity(el, mp);
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }
    const m = stageOpacity(meeting, mp);
    meeting.style.opacity = m.o.toFixed(3);
    meeting.style.transform = `translate3d(0, ${m.y.toFixed(1)}px, 0)`;
    if ((m.o > 0.05) !== meetingOn) { meetingOn = m.o > 0.05; meeting.classList.toggle('is-on', meetingOn); }
    // desktop: the right-hand column scrim also serves the replies title; phones: the bottom band only serves the stage copy
    const scrim = L.small ? 1 - ss(0.425, 0.45, mp) : Math.max(1 - ss(0.425, 0.45, mp), ss(0.57, 0.6, mp)) * (1 - ss(0.885, 0.91, mp));
    actView.style.setProperty('--scrim', scrim.toFixed(3));

    rail.classList.toggle('is-on', inAct);
    let ri = 0; TL.railAt.forEach((t, i) => { if (mp >= t) ri = i + 1; });
    if (ri !== lastRail) { railBtns.forEach((b, i) => (i === ri ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'))); lastRail = ri; }
    rail.style.setProperty('--rail', mp.toFixed(4));
  }

  // ---- the instrument
  let key, st;
  if (!closeOn || cr.top > H * 0.985) {
    key = pin ? keyAt(K, mp, hp) : K.hero0;
    const heroState = pin ? mp <= 0.002 : true;
    const sigState = pin && mp > 0.07 && mp < 0.15;
    let zone;
    if (L.small) {
      const top = heroState ? heroCopy.getBoundingClientRect().bottom + 14 : L.barH + 52;
      const bottom = heroState ? H - 12 : stages[1].getBoundingClientRect().top - 12;
      zone = { x0: 186, x1: W - 12, y0: top, y1: bottom };
    } else zone = { x0: 196, x1: W * (heroState ? 0.55 : 0.58), y0: L.barH + 12, y1: H - (heroState ? 16 : 96) };
    st = {
      key, sig: pin ? ss(0.07, 0.11, mp) : 0, ver: pin ? ss(0.16, 0.20, mp) : 0,
      msg: pin ? ss(0.25, 0.28, mp) * (1 - ss(0.36, 0.40, mp)) : 0,
      rep: pin ? ss(0.34, 0.37, mp) * (1 - ss(0.45, 0.49, mp)) : 0,
      hush: pin ? ss(0.425, 0.47, mp) : 0, col: pin ? ss(0.47, 0.555, mp) : 0,
      take: pin ? ss(0.50, 0.55, mp) * (1 - ss(0.555, 0.60, mp)) : 0,
      shock: pin ? ss(0.535, 0.60, mp) : 0,
      timeScale: pin ? 1 - 0.78 * ss(0.425, 0.47, mp) + 0.6 * ss(0.56, 0.62, mp) : 1,
      dim: 1, plate: pin ? 1 - 0.5 * ss(0.885, 0.93, mp) : 1, near: pin ? 1 - ss(0.42, 0.5, mp) : 1,
      farDim: 1, lean: 1,
      autoPing: heroState || sigState, pointerPing: heroState || sigState, pingZone: zone,
    };
  } else {
    // the close: the market returns, signals lit, the bullseye under the button
    const cp = clamp((H - cr.top) / H, 0, 1);
    const b = closeAnchor.getBoundingClientRect();
    const ax = clamp((b.left + b.width / 2) / W, 0.08, 0.92), ay = clamp((b.top + b.height / 2) / H, 0.05, 1.4);
    key = { cam: K.close.cam.map((v, i) => (i === 1 ? v + (1 - cp) * 5 : v)), look: K.close.look, a: [ax, ay] };
    const btn = closeBtn.getBoundingClientRect(), fr = foot.getBoundingClientRect();
    st = {
      key, sig: 1, ver: 0, msg: 0, rep: 0, hush: 0, col: 0, take: 0, shock: 0, timeScale: 1,
      dim: 0.6, plate: 0.8, near: 0.6, farDim: 1, lean: 0.5,
      autoPing: true, pointerPing: false,
      pingZone: { x0: 196, x1: W - 16, y0: btn.bottom + 30, y1: Math.min(H, fr.top) - 16 },
    };
  }
  if (reduce && !closeOn) st.key = K.hero0;
  pointer.on = now - pointer.last < 2600;

  // ---- the peak: replies rise out of the bullseye
  if (pin && ar.bottom > 0 && ar.top < H) {
    const u = clamp((mp - TL.cards[0]) / (TL.cards[1] - TL.cards[0]), 0, 1);
    const s = u * L.D;
    const topLim = mix(L.topLimitA, L.topLimit, ss(0.615, 0.64, mp));
    let freshest = 1e9;
    cards.forEach((c, i) => {
      const rise = s - L.offs[i];
      if (rise <= 0 || u <= 0) { if (c._o !== 0) { c.style.opacity = '0'; c._o = 0; } return; }
      const h = L.heights[i];
      const top = by - L.R0 - rise - h;
      const e = clamp(rise / L.emerge, 0, 1), eo = easeOut(e);
      const fadeTop = clamp((top - topLim) / L.fadeD, 0, 1);
      const o = e * fadeTop * (1 - ss(0.885, 0.9, mp));
      const x = mix(bx, L.lanes[i], eo) - L.cw / 2;
      const sc = 0.9 + 0.1 * eo;
      c.style.opacity = o.toFixed(3); c._o = o;
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
      if (rise < 240 && rise < freshest) freshest = rise;
    });
    if (freshest < 240) emit = freshest / 240;
  }


  if (visible && funnel) {
    const out = funnel.frame({ ...st, dt, now, emit, pointer: { ...pointer } });
    lastB.bx = out.bx; lastB.by = out.by;
  } else if (visible && !funnel && pin) {
    // fallback poster: the drawn funnel fades at the collapse; its mark carries the peak
    posterFunnel.style.opacity = (0.9 * (1 - ss(0.45, 0.55, mp))).toFixed(3);
    if (mp > 0.45 && !closeOn) {
      bx = st.key.a[0] * W; by = st.key.a[1] * H;
      posterMark.style.transform = `translate3d(${bx}px, ${by}px, 0) scaleY(${mix(0.3, 1, ss(0.47, 0.56, mp)).toFixed(3)})`;
    } else posterMark.style.transform = '';
  }

  // ---- steps line
  if (stepsTrack) {
    const r = stepsTrack.getBoundingClientRect();
    if (r.top < H && r.bottom > 0) {
      const p = L.small ? clamp((H * 0.72 - r.top) / r.height, 0, 1) : clamp((H * 0.86 - r.top) / (H * 0.5), 0, 1);
      stepsTrack.style.setProperty('--p', p.toFixed(4));
      const n = stepEls.length;
      stepEls.forEach((el, i) => el.classList.toggle('is-lit', p >= (L.small ? (i / n) : (i / (n - 1)) * 0.96)));
    }
  }

  host.setAttribute('data-verify-state', [mp.toFixed(3), st.sig.toFixed(2), st.ver.toFixed(2), st.msg.toFixed(2), st.rep.toFixed(2), st.hush.toFixed(2), st.col.toFixed(2), closeOn ? 'c' : 'm', emit.toFixed(2)].join('|'));
}


// ------------------------------------------------------------------ jumps: rail + nav
function jumpAct(p) {
  if (!pin) return false;
  const top = act.getBoundingClientRect().top + scrollY + p * L.travel + 2;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  return true;
}
railBtns.forEach((b) => b.addEventListener('click', () => jumpAct(+b.dataset.goto)));
$$('[data-act-jump]').forEach((a) => a.addEventListener('click', (e) => { if (jumpAct(+a.dataset.actJump)) { e.preventDefault(); closeMenu(); } }));
$$('.bar__nav a').forEach((a) => a.addEventListener('click', () => closeMenu()));

// ------------------------------------------------------------------ mobile menu
const menuBtn = $('[data-menu]');
function closeMenu() { bar.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const open = !bar.classList.contains('is-open');
  bar.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bar.classList.contains('is-open')) { closeMenu(); menuBtn.focus(); } });

// ------------------------------------------------------------------ booking dialog
const dialog = $('#booking');
const routeSelect = $('[data-route-select]', dialog);
let chosenRoute = '';
$$('[data-book]').forEach((b) => b.addEventListener('click', () => {
  const r = b.dataset.route || chosenRoute;
  if (b.dataset.route) chosenRoute = b.dataset.route;
  if (r) routeSelect.value = r;
  const st = $('[data-status]', dialog); st.textContent = ''; delete st.dataset.state;
  closeMenu();
  dialog.showModal();
  $('#b-name').focus();
}));
$('[data-close]', dialog).addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

// ------------------------------------------------------------------ forms (never fake success)
$$('form[data-form]').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('[data-status]', form);
  form.classList.add('was-validated');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const endpoint = form.dataset.form === 'booking' ? CFG.bookingEndpoint : CFG.strategyEndpoint;
  const say = (k) => { status.textContent = MSG[k]; status.dataset.state = k; status.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); };
  if (!endpoint) { say('off'); return; }
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  try {
    const res = await fetch(endpoint, { method: 'POST', body: new FormData(form) });
    say(res.ok ? 'ok' : 'err');
    if (res.ok) form.reset();
  } catch (err) { say('err'); }
  btn.disabled = false;
}));

// ------------------------------------------------------------------ offers tabs
const tabs = $$('[role="tab"]');
function selectTab(t, focus) {
  tabs.forEach((x) => {
    const on = x === t;
    x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
    const p = document.getElementById(x.getAttribute('aria-controls'));
    if (on && p.hidden) { p.hidden = false; p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
    else if (!on) p.hidden = true;
  });
  chosenRoute = t.dataset.route;
  if (focus) t.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t, false));
  t.addEventListener('keydown', (e) => {
    // RTL: the next tab is to the left
    const map = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 };
    let j = null;
    if (e.key in map) j = (i + map[e.key] + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
    if (j !== null) { e.preventDefault(); selectTab(tabs[j], true); }
  });
});

// ------------------------------------------------------------------ try it on your company
const tryForm = $('[data-try]');
const tryInput = $('#try-domain');
const tryHint = $('[data-try-hint]');
const panels = { example: $('[data-try-panel="example"]'), real: $('[data-try-panel="real"]'), idle: $('[data-try-panel="idle"]') };
const typed = $('[data-msg-typed]');
const MESSAGE = [
  { t: 'היי ' }, { t: '{שם}', v: true },
  { t: ', ראיתי שאתם מגייסים שני אנשי מכירות. בדרך כלל זה הרגע שבו צריך יותר פגישות, מהר יותר ממה שהצוות מייצר לבד. אצל Agentic-Dev קבענו 17 פגישות ב-60 יום. שווה לדבר?' },
];
let typeRun = 0;
function show(which) { Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== which; }); }
function typeMessage() {
  const run = ++typeRun;
  typed.textContent = '';
  const nodes = MESSAGE.map((seg) => {
    const n = seg.v ? Object.assign(document.createElement('span'), { className: 'var' }) : document.createTextNode('');
    typed.appendChild(n); return { n, t: seg.t };
  });
  if (reduce) { nodes.forEach(({ n, t }) => { n.textContent = t; }); return; }
  typed.classList.add('is-typing');
  let si = 0, ci = 0;
  const tick = () => {
    if (run !== typeRun) return;
    const seg = nodes[si];
    if (!seg) { typed.classList.remove('is-typing'); return; }
    const step = seg.t === '{שם}' ? seg.t.length : 1;
    ci += step; seg.n.textContent = seg.t.slice(0, ci);
    if (ci >= seg.t.length) { si++; ci = 0; }
    setTimeout(tick, seg.t[ci - 1] === '.' || seg.t[ci - 1] === ',' ? 120 : 16);
  };
  setTimeout(tick, 300);
}
function showExample() {
  show('example');
  const rows = $$('[data-step]', panels.example);
  rows.forEach((r) => r.classList.remove('is-in'));
  rows.forEach((r, i) => setTimeout(() => r.classList.add('is-in'), reduce ? 0 : 140 + i * 280));
  setTimeout(typeMessage, reduce ? 0 : 140 + 2 * 280);
}
$('[data-try-example]').addEventListener('click', showExample);
tryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = tryInput.value.trim();
  const domain = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#\s]/)[0].toLowerCase();
  if (!domain || !/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u.test(domain)) { tryHint.hidden = false; tryInput.focus(); return; }
  tryHint.hidden = true;
  if (domain.includes('the-leadbound')) { showExample(); return; }
  typeRun++;
  show('real');
  $('[data-try-domain-echo]').textContent = domain;
  $('[data-try-domain-echo]').setAttribute('dir', 'ltr');
  $('[data-try-website]').value = domain;
  const st = $('[data-status]', panels.real); st.textContent = ''; delete st.dataset.state;
});

// ------------------------------------------------------------------ reveals + counts
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    en.target.classList.add('is-in');
    io.unobserve(en.target);
    if (!reduce) $$('[data-count]', en.target).forEach(countUp);
  }
}, { threshold: 0.18 });
$$('[data-in]').forEach((el) => io.observe(el));
function countUp(el) {
  const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
  const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
  const t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const k = easeOut(clamp((t - t0) / dur, 0, 1));
    el.textContent = pre + (to * k).toFixed(dec) + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ go
layout();
document.fonts && document.fonts.ready.then(layout);
addEventListener('load', layout);
requestAnimationFrame(frame);
