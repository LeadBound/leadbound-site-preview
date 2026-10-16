// field.js : the signature move of site C.
// The market is a dense field of letters. Scrolling filters it: the real signal
// labels light up in cyan, every other letter drops out, and the 23 letters that
// survive travel across the screen and lock into the five stage words.
// The words they land in are the real DOM list (#method .sw), measured per glyph,
// so the hand-off from canvas to text is pixel-matched.

const HEB = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIG = '0123456789@.';
const SIGNALS = [
  'פתחו משרות מכירות', 'גייסו סבב השקעה', 'השיקו מוצר חדש', 'נכנסו לשוק חדש',
  'רצים עם קמפיין ממומן', 'הגיבו לפוסט של מתחרה', 'החליפו מערכת CRM', 'פתחו משרד בחו״ל',
];
const PREFIX = 'סיגנל · ';
const BONE = [238, 240, 235];
const CYAN = [18, 183, 212];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cell order for a label written right to left; Latin runs keep their LTR order.
function rtlCells(str) {
  const out = []; let run = [];
  const flush = () => { if (run.length) { out.push(...run.reverse()); run = []; } };
  for (const ch of str) { if (/[A-Za-z0-9]/.test(ch)) run.push(ch); else { flush(); out.push(ch); } }
  flush();
  return out;
}

export function createField({ stage, canvas, intro, list }) {
  const ctx = canvas.getContext('2d');
  const wordEls = [...list.querySelectorAll('.sw-w')];
  let W = 0, H = 0, dpr = 1, cw = 20, chh = 26, fs = 14, ox = 0, oy = 0;
  let cells = [], survivors = [], atlas = null, tileW = 0, tileH = 0, idx = new Map();
  let cur = 0, target = 0, raf = 0, ready = false;

  function layout() {
    W = stage.clientWidth; H = stage.clientHeight;
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const small = W < 760;
    cw = small ? 13 : 20; chh = Math.round(cw * 1.32); fs = small ? 10.5 : 14;
    const cols = Math.floor(W / cw), rows = Math.floor(H / chh);
    ox = (W - cols * cw) / 2; oy = (H - rows * chh) / 2;

    const sr = stage.getBoundingClientRect();
    const ir = intro.getBoundingClientRect();
    const ex = { l: ir.left - sr.left - cw * 1.2, r: ir.right - sr.left + cw * 1.2, t: ir.top - sr.top - chh * 0.8, b: ir.bottom - sr.top + chh * 0.8 };
    const inEx = (x, y) => x > ex.l && x < ex.r && y > ex.t && y < ex.b;

    const R = rng(1729);
    cells = [];
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        const x = ox + c * cw, y = oy + r * chh;
        const u = R();
        const pool = u < 0.6 ? HEB : u < 0.9 ? LAT : DIG;
        const g = { x, y, cx: x + cw / 2, by: y + chh * 0.5 + fs * 0.36, c: pool[(R() * pool.length) | 0], t: 0.1 + R() * 0.24, k: 0, s: -1, lt: 0, ex: inEx(x + cw / 2, y + chh / 2), r, col: c };
        grid[r][c] = g; cells.push(g);
      }
    }

    // Plant the real signal labels in the noise, one per row band.
    const bands = SIGNALS.length;
    SIGNALS.forEach((label, i) => {
      const seq = rtlCells(PREFIX + label);
      if (seq.length > cols - 2) return;
      for (let attempt = 0; attempt < 60; attempt++) {
        const r0 = Math.floor((i + 0.15 + R() * 0.7) * rows / bands);
        const r = Math.min(rows - 1, Math.max(0, r0));
        const startCol = cols - 1 - Math.floor(R() * (cols - seq.length));   // rightmost cell
        let ok = true;
        for (let j = 0; j < seq.length; j++) { const g = grid[r][startCol - j]; if (!g || g.ex || g.k) { ok = false; break; } }
        if (!ok) continue;
        seq.forEach((ch, j) => { const g = grid[r][startCol - j]; g.k = 1; g.s = i; g.c = ch; g.lt = 0.05 + i * 0.026; });
        break;
      }
    });

    // Targets: every glyph of the five words, measured from the DOM.
    const targets = [];
    const range = document.createRange();
    wordEls.forEach((el, wi) => {
      const node = el.firstChild; if (!node) return;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const font = `${cs.fontWeight} ${size}px Rubik`;
      ctx.font = font;
      const asc = ctx.measureText('א').fontBoundingBoxAscent || size * 0.935;
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i); range.setEnd(node, i + 1);
        const rr = range.getBoundingClientRect();
        targets.push({ ch: text[i], tx: rr.left - sr.left + rr.width / 2, ty: rr.top - sr.top + asc, size, weight: cs.fontWeight, wi, li: i });
      }
    });

    // Survivors: random noise cells, spread apart, outside the intro.
    const cand = cells.filter((g) => !g.ex && g.k === 0 && g.y > chh && g.y < H - chh * 2);
    for (let i = cand.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
    survivors = [];
    const minD = Math.min(W, H) * 0.09;
    let ci = 0;
    for (const t of targets) {
      let pick = null;
      for (; ci < cand.length; ci++) {
        const g = cand[ci];
        if (survivors.every((s) => Math.hypot(s.g.cx - g.cx, s.g.y - g.y) > minD)) { pick = g; ci++; break; }
      }
      if (!pick) pick = cand[(R() * cand.length) | 0];
      pick.k = 2; pick.c = t.ch;
      const order = survivors.length;
      survivors.push({ g: pick, ...t, f0: 0.4 + order * 0.0065, bend: (R() - 0.5) * Math.min(W, H) * 0.35 });
    }

    buildAtlas();
    ready = true;
  }

  function buildAtlas() {
    const chars = [...new Set(cells.map((g) => g.c).filter((c) => c && c !== ' '))];
    tileW = Math.ceil(cw * dpr); tileH = Math.ceil(chh * dpr);
    idx = new Map(chars.map((c, i) => [c, i]));
    atlas = {};
    for (const [key, col] of [['b', BONE], ['c', CYAN]]) {
      const a = document.createElement('canvas');
      a.width = tileW * chars.length; a.height = tileH;
      const x = a.getContext('2d');
      x.fillStyle = rgb(col); x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      chars.forEach((c, i) => {
        x.setTransform(dpr, 0, 0, dpr, i * tileW, 0);
        x.font = `${key === 'c' ? 500 : 400} ${fs}px Rubik`;
        x.fillText(c, cw / 2, chh * 0.5 + fs * 0.36);
      });
      atlas[key] = a;
    }
  }

  function blit(g, key) {
    const i = idx.get(g.c); if (i === undefined) return;
    ctx.drawImage(atlas[key], i * tileW, 0, tileW, tileH, g.x, g.y, tileW / dpr, tileH / dpr);
  }

  function draw(p) {
    if (!ready) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const NOISE = 0.15;

    for (const g of cells) {
      if (g.ex || g.k === 2 || g.c === ' ') continue;
      if (g.k === 0) {
        const a = NOISE * (1 - sm(g.t, g.t + 0.07, p));
        if (a < 0.004) continue;
        ctx.globalAlpha = a; blit(g, 'b');
      } else {
        const lit = sm(g.lt, g.lt + 0.05, p);
        const out = 1 - sm(0.5 + g.s * 0.006, 0.63, p);
        const ab = NOISE * (1 - lit) * out, ac = lit * out;
        if (ab > 0.004) { ctx.globalAlpha = ab; blit(g, 'b'); }
        if (ac > 0.004) { ctx.globalAlpha = ac; blit(g, 'c'); }
      }
    }

    const hand = sm(0.885, 0.93, p);              // DOM words take over
    if (hand < 1) {
      const glow = sm(0.26, 0.36, p);
      for (const s of survivors) {
        const u = ease(sm(s.f0, s.f0 + 0.3, p));
        const x = lerp(s.g.cx, s.tx, u) + Math.sin(u * Math.PI) * s.bend;
        const y = lerp(s.g.by, s.ty, u) + Math.sin(u * Math.PI) * s.bend * 0.25;
        const size = lerp(fs, s.size, u);
        const k = sm(0.55, 1, u);
        const col = [lerp(CYAN[0], BONE[0], k), lerp(CYAN[1], BONE[1], k), lerp(CYAN[2], BONE[2], k)];
        const a = u > 0 ? 1 : lerp(NOISE, 1, glow);
        const c = u > 0 || glow > 0.5 ? col : BONE;
        ctx.globalAlpha = a;
        ctx.fillStyle = rgb(c);
        ctx.font = `${u > 0 ? s.weight : 500} ${size}px Rubik`;
        ctx.fillText(s.ch, x, y);
      }
    }
    ctx.globalAlpha = 1;

    intro.style.opacity = String(1 - sm(0.28, 0.38, p));
    intro.style.visibility = p > 0.39 ? 'hidden' : '';
    list.style.opacity = String(sm(0.86, 0.9, p));
    list.style.visibility = p < 0.855 ? 'hidden' : '';
  }

  function tick() {
    raf = 0;
    const d = target - cur;
    cur = Math.abs(d) < 0.0005 ? target : cur + d * 0.16;
    draw(cur);
    if (cur !== target) raf = requestAnimationFrame(tick);
  }

  return {
    layout(staticMode) { layout(); if (!staticMode) draw(cur); },
    set(p, immediate) {
      target = clamp01(p);
      if (immediate) { cur = target; draw(cur); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    },
    // Reduced motion / no scroll engine: the market as a still texture, signals faintly lit,
    // and the DOM (intro + five words) left exactly as the stylesheet lays it out.
    drawStatic() {
      if (!ready) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const g of cells) {
        if (g.ex || g.c === ' ') continue;
        ctx.globalAlpha = g.k === 1 ? 0.42 : 0.07;
        blit(g, g.k === 1 ? 'c' : 'b');
      }
      ctx.globalAlpha = 1;
    },
  };
}
