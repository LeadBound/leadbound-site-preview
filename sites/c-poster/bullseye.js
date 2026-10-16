// bullseye.js : the "o" of the hero wordmark, built as a real 3D LeadBound mark.
// Proportions measured from assets/apple-icon.png (180px icon, outer radius = 1):
//   centre dot r 0.40 · one closed ring 0.56–0.70 · outer ring 0.857–1.00 split into two arcs.
// In that file the arcs span 38°–142° and 218°–322° (present straight up and straight down,
// open on the horizontal axis). ARC_CENTER is the one constant that orients them.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DOT = 0.40, RING = [0.56, 0.70], ARC = [0.857, 1.0];
const ARC_HALF = THREE.MathUtils.degToRad(52);   // each arc spans 104°
const ARC_CENTER = Math.PI / 2;                    // arcs centred on +90° and −90° (top and bottom)
const BEVEL = 0.02, DEPTH = 0.1;

function disc(r) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; }
function ring(r0, r1) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, r0, 0, Math.PI * 2, true); s.holes.push(h);
  return s;
}
function arc(r0, r1, a0, a1) {
  const s = new THREE.Shape();
  s.moveTo(r1 * Math.cos(a0), r1 * Math.sin(a0));
  s.absarc(0, 0, r1, a0, a1, false);
  s.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
  s.absarc(0, 0, r0, a1, a0, true);
  s.closePath();
  return s;
}
function extrude(shape) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.03, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 96 });
  g.translate(0, 0, -DEPTH / 2);
  return g;
}

export function initBullseye(slot, { reduced = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'bx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;                                   // the flat SVG mark stays in place
  }
  slot.appendChild(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const HALF = 1.7;                                // canvas is 1.7× the slot; R = 1 maps to the slot edge
  cam.position.set(0, 0, HALF / Math.tan(THREE.MathUtils.degToRad(13)));

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.6, 2.2, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8f8ff, 1.2); rim.position.set(3, -2, -1); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#12B7D4'), roughness: 0.34, metalness: 0.0,
    clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.6,
  });

  const group = new THREE.Group();
  const mDot = new THREE.Mesh(extrude(disc(DOT - BEVEL)), mat);
  const mRing = new THREE.Mesh(extrude(ring(RING[0] + BEVEL, RING[1] - BEVEL)), mat);
  const a0 = ARC[0] + BEVEL, a1 = ARC[1] - BEVEL;
  const arcs = new THREE.Group();
  arcs.add(new THREE.Mesh(extrude(arc(a0, a1, ARC_CENTER - ARC_HALF, ARC_CENTER + ARC_HALF)), mat));
  arcs.add(new THREE.Mesh(extrude(arc(a0, a1, ARC_CENTER + Math.PI - ARC_HALF, ARC_CENTER + Math.PI + ARC_HALF)), mat));
  group.add(mDot, mRing, arcs);
  scene.add(group);

  // ── state: idle sway + drag with inertia + a spring that always brings the mark home ──
  let rotX = -0.1, rotY = 0.3, velX = 0, velY = 0;
  let dragging = false, lastX = 0, lastY = 0, lastT = 0;
  let spread = 0, spreadT = 0;                     // layers pull apart while held
  let t = 0, last = performance.now(), raf = 0, visible = true, alive = true, shown = false;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => { resize(); if (reduced || !raf) render(); });
  ro.observe(canvas);

  function render() {
    group.rotation.set(rotX, rotY, 0);
    mDot.position.z = 0.07 + spread * 0.55;
    mRing.position.z = 0.0;
    arcs.position.z = -0.07 - spread * 0.45;
    renderer.render(scene, cam);
    if (!shown) { shown = true; slot.classList.add('bx-live'); }
  }

  function step(dt) {
    t += dt;
    const k = (r) => 1 - Math.pow(1 - r, dt * 60);
    const idleY = 0.12 + Math.sin(t * 0.42) * 0.42;
    const idleX = -0.08 + Math.sin(t * 0.31) * 0.07;
    if (!dragging) {
      rotY += velY * dt * 60; rotX += velX * dt * 60;
      velY *= Math.pow(0.95, dt * 60); velX *= Math.pow(0.9, dt * 60);
      const homeY = idleY + Math.PI * 2 * Math.round((rotY - idleY) / (Math.PI * 2));
      const calm = Math.abs(velY) < 0.03 ? 0.045 : 0.006;
      rotY += (homeY - rotY) * k(calm);
      rotX += (idleX - rotX) * k(0.05);
    }
    spread += (spreadT - spread) * k(dragging ? 0.14 : 0.09);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); render();
    if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !reduced && alive && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(slot);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  // Fine pointers drag it; touch stays a page scroll, and a tap flicks it.
  canvas.addEventListener('pointerdown', (e) => {
    if (reduced || e.pointerType === 'touch') return;
    dragging = true; spreadT = 1; canvas.classList.add('is-drag');
    canvas.setPointerCapture(e.pointerId);
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); velX = velY = 0;
    start();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, dy = e.clientY - lastY;
    const f = 0.011;
    rotY += dx * f; rotX = THREE.MathUtils.clamp(rotX + dy * f * 0.8, -1.2, 1.2);
    const span = Math.max(8, now - lastT) / 16.7;
    velY = (dx * f) / span; velX = (dy * f * 0.8) / span;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
  });
  const end = () => { if (!dragging) return; dragging = false; spreadT = 0; canvas.classList.remove('is-drag'); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('click', (e) => {
    if (reduced || e.pointerType === 'mouse') return;
    velY += 0.28; start();
  });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; stop(); slot.classList.remove('bx-live'); });

  resize();
  render();
  if (!reduced) start();
  return { stop, start };
}
