// LeadBound site A: the archery stage.
// One transparent WebGL canvas behind the copy. The piece is the LeadBound mark built as a
// physical target (dot, closed ring, two outer arcs open at the left and right, exactly like
// assets/apple-icon.png) on a thick dark disc. Arrows fly in and stick; the ring an arrow hits
// lights up from the hit point outward.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEG = Math.PI / 180;
const CYAN = new THREE.Color('#12B7D4');
const OFF = new THREE.Color('#A3AEB0');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// ---- mark geometry, measured from the favicon (outer radius = 0.5) ----
const G = {
  dot: 0.200,
  ringIn: 0.278, ringOut: 0.350,
  arcIn: 0.4335, arcOut: 0.500,
  arcFrom: 37 * DEG, arcTo: 143 * DEG,   // top arc; bottom arc is the same + 180deg
  disc: 0.565,
  front: 0.05,                           // z of the cyan faces
};
const BS = 0.008; // bevel size, subtracted so the silhouette stays true to the mark

function enamel(radial, maxR, hitAngle) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.3, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.24, envMapIntensity: 0.42,
  });
  const u = {
    uLit: { value: 1 }, uHit: { value: hitAngle }, uRadial: { value: radial ? 1 : 0 }, uMaxR: { value: maxR },
    uFlash: { value: 0 }, uOn: { value: CYAN.clone() }, uOff: { value: OFF.clone() },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLP;
uniform float uLit; uniform float uHit; uniform float uRadial; uniform float uMaxR; uniform float uFlash;
uniform vec3 uOn; uniform vec3 uOff;
float lbMask() {
  if (uLit >= 0.999) return 1.0;
  if (uLit <= 0.001) return 0.0;
  float a = atan(vLP.y, vLP.x);
  float d = abs(mod(a - uHit + PI, PI2) - PI) / PI;
  float r = clamp(length(vLP.xy) / uMaxR, 0.0, 1.0);
  float m = mix(d, r, uRadial) * 0.94 + 0.03;
  return 1.0 - smoothstep(uLit - 0.03, uLit + 0.03, m);
}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'float lbM = lbMask();\nvec4 diffuseColor = vec4( mix(uOff, uOn, lbM), opacity );')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uOn * (uFlash * lbM * 0.5);');
  };
  m.customProgramCacheKey = () => 'lb-enamel-1';
  return m;
}

function buildTarget() {
  const piece = new THREE.Group();
  const ex = { depth: 0.03, bevelEnabled: true, bevelThickness: 0.014, bevelSize: BS, bevelSegments: 4, curveSegments: 128 };

  const discShape = new THREE.Shape(); discShape.absarc(0, 0, G.disc - 0.02, 0, Math.PI * 2, false);
  const discGeo = new THREE.ExtrudeGeometry(discShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 6, curveSegments: 128 });
  discGeo.translate(0, 0, -0.09).rotateZ(-Math.PI / 2);
  const discMat = new THREE.MeshPhysicalMaterial({ color: '#141B1F', roughness: 0.36, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 1.0 });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.castShadow = true;
  piece.add(disc);

  const els = {};
  const place = (geo) => { geo.translate(0, 0, 0.006); return geo; };

  const arc = (a0, a1) => {
    const s = new THREE.Shape();
    const ro = G.arcOut - BS, ri = G.arcIn + BS;
    const da = BS / G.arcOut;
    s.absarc(0, 0, ro, a0 + da, a1 - da, false);
    s.absarc(0, 0, ri, a1 - da, a0 + da, true);
    s.closePath();
    return place(new THREE.ExtrudeGeometry(s, ex));
  };
  const ringS = new THREE.Shape(); ringS.absarc(0, 0, G.ringOut - BS, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, G.ringIn + BS, 0, Math.PI * 2, true); ringS.holes.push(hole);
  const dotS = new THREE.Shape(); dotS.absarc(0, 0, G.dot - BS, 0, Math.PI * 2, false);

  els.arcTop = new THREE.Mesh(arc(G.arcFrom, G.arcTo), enamel(false, 1, 72 * DEG));
  els.arcBot = new THREE.Mesh(arc(G.arcFrom + Math.PI, G.arcTo + Math.PI), enamel(false, 1, 248 * DEG));
  els.ring = new THREE.Mesh(place(new THREE.ExtrudeGeometry(ringS, ex)), enamel(false, 1, 158 * DEG));
  els.dot = new THREE.Mesh(place(new THREE.ExtrudeGeometry(dotS, ex)), enamel(true, G.dot + 0.012, 0));
  for (const k in els) { els[k].castShadow = true; piece.add(els[k]); }
  return { piece, els, disc };
}

function buildArrowParts() {
  const L = 0.74, r = 0.0062;
  const geo = {
    shaft: new THREE.CylinderGeometry(r, r, L, 12, 1).rotateX(Math.PI / 2).translate(0, 0, L / 2),
    head: new THREE.ConeGeometry(0.0135, 0.075, 4, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).translate(0, 0, -0.022),
    collar: new THREE.CylinderGeometry(0.0085, 0.0085, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0, 0.022),
    nock: new THREE.CylinderGeometry(0.0078, 0.0068, 0.032, 12).rotateX(Math.PI / 2).translate(0, 0, L + 0.012),
  };
  const vs = new THREE.Shape();
  vs.moveTo(0, 0);
  vs.quadraticCurveTo(0.06, 0.003, 0.115, 0.03);
  vs.lineTo(0.15, 0.034);
  vs.lineTo(0.156, 0.0);
  vs.closePath();
  geo.vane = new THREE.ShapeGeometry(vs, 12).rotateY(-Math.PI / 2).translate(0, r * 0.6, L - 0.185);
  const mats = {
    shaft: new THREE.MeshPhysicalMaterial({ color: '#11171A', roughness: 0.3, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: '#C7D0D3', roughness: 0.2, metalness: 1.0 }),
    vane: new THREE.MeshStandardMaterial({ color: CYAN, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide }),
  };
  return { geo, mats, L };
}

function makeArrow(P) {
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  add(P.geo.shaft, P.mats.shaft);
  add(P.geo.head, P.mats.steel);
  add(P.geo.collar, P.mats.steel);
  add(P.geo.nock, P.mats.vane);
  for (let i = 0; i < 3; i++) { const v = add(P.geo.vane, P.mats.vane); v.rotation.z = i * (Math.PI * 2 / 3) + 0.5; }
  g.visible = false;
  return g;
}

// piece-local hit points, outside in: top arc, bottom arc, ring (half), ring (other half), centre
const HITS = [
  { el: 'arcTop', a: 72 * DEG, r: 0.467 },
  { el: 'arcBot', a: 250 * DEG, r: 0.467 },
  { el: 'ring', a: 158 * DEG, r: 0.314 },
  { el: 'ring', a: 338 * DEG, r: 0.314 },
  { el: 'dot', a: 40 * DEG, r: 0.03 },
];

export function createStage(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const reduced = !!opts.reduced;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const FOV = 30;
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  cam.position.set(0, 0, 12);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd6d4, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 12; key.shadow.blurSamples = 20; key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xd9f6ff, 0.9);
  scene.add(rim, rim.target);

  // rig (screen placement) > tilt (pointer + impacts) > piece (section pose)
  const rig = new THREE.Group(); scene.add(rig);
  const shadowMat = new THREE.ShadowMaterial({ color: new THREE.Color('#0D2B32'), opacity: 0.2, transparent: true, depthWrite: false });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), shadowMat);
  shadowPlane.position.z = -0.34; shadowPlane.receiveShadow = true;
  rig.add(shadowPlane);
  const tilt = new THREE.Group(); rig.add(tilt);
  const T = buildTarget(); tilt.add(T.piece);
  const piece = T.piece;

  const AP = buildArrowParts();
  const shots = HITS.map((h, i) => {
    const arrow = makeArrow(AP); scene.add(arrow);
    return {
      i, ...h, arrow, state: 'idle', t: 0, lit: 0, wob: 0, flash: 0,
      hit: V(Math.cos(h.a) * h.r, Math.sin(h.a) * h.r, h.el === 'disc' ? 0 : G.front),
      dir: V(0, 0, 1), S: V(), C1: V(), q0: new THREE.Quaternion(),
    };
  });

  // ---------- sizing ----------
  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
  }
  resize();
  const wpp = (z) => (2 * (cam.position.z - z) * Math.tan(FOV * DEG / 2)) / H;
  const toWorld = (px, py, z) => { const k = wpp(z); return V((px - W / 2) * k, -(py - H / 2) * k, z); };

  // ---------- state ----------
  const tiltRot = V(), tiltVel = V(), ptr = { x: 0, y: 0 };
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), eul = new THREE.Euler();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = V(), tmpV2 = V();
  let time = 0, scaleNow = 0.001, first = true, lastVisible = true;

  function poseQuat(p, out) { eul.set(p[0] * DEG, p[1] * DEG, (p[2] || 0) * DEG, 'YXZ'); return out.setFromEuler(eul); }

  function startPoint(sh) {
    // arrows come from the visitor's side: off the left edge, in front of the page, so each
    // flight reads in profile instead of end-on
    const F = [[-0.14, 0.6, 3.0], [-0.12, 0.95, 3.0], [-0.14, 0.42, 3.0], [-0.1, 1.04, 3.4], [-0.12, 0.7, 3.2]][sh.i];
    return toWorld(W * F[0], H * F[1], F[2]);
  }

  function computeDir(sh, S) {
    rig.updateMatrixWorld(true);
    const Sl = piece.worldToLocal(S.clone());
    const to = Sl.sub(sh.hit).normalize();
    const d = to.multiplyScalar(0.42).add(V(0, 0, 0.58)).normalize();
    if (d.z < 0.7) { d.z = 0.7; d.normalize(); }
    sh.dir.copy(d);
  }

  function stick(sh, animate) {
    piece.add(sh.arrow);
    sh.arrow.position.copy(sh.hit);
    tmpM.lookAt(tmpV.copy(sh.hit).add(sh.dir), sh.hit, V(0, 1, 0));
    sh.arrow.quaternion.setFromRotationMatrix(tmpM);
    sh.q0.copy(sh.arrow.quaternion);
    sh.arrow.scale.setScalar(1);
    sh.arrow.visible = true;
    sh.state = 'stuck';
    sh.wob = animate && !reduced ? 1e-4 : -1;
    if (animate) {
      sh.flash = 1;
      if (!reduced) { tiltVel.x += -sh.dir.y * 1.6 - 0.4; tiltVel.y += sh.dir.x * 1.6; }
    } else {
      sh.lit = 1;
    }
  }

  function fire(sh, instant) {
    const S = startPoint(sh);
    computeDir(sh, S);
    if (instant || reduced) { stick(sh, !instant); return; }
    scene.add(sh.arrow);
    sh.arrow.visible = true;
    sh.arrow.scale.setScalar(scaleNow);
    sh.S.copy(S); sh.t = 0; sh.state = 'flying';
  }

  function unfire(sh) {
    if (sh.state === 'flying' || reduced) { sh.arrow.visible = false; sh.state = 'idle'; scene.add(sh.arrow); return; }
    sh.state = 'out'; sh.t = 0;
  }

  const bez3 = (a, b, c, d, t, out) => {
    const u = 1 - t;
    return out.set(0, 0, 0)
      .addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t)
      .addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  };
  const bez3d = (a, b, c, d, t, out) => {
    const u = 1 - t;
    return out.set(0, 0, 0)
      .addScaledVector(V().subVectors(b, a), 3 * u * u)
      .addScaledVector(V().subVectors(c, b), 6 * u * t)
      .addScaledVector(V().subVectors(d, c), 3 * t * t);
  };

  function updateShots(dt, want) {
    rig.updateMatrixWorld(true);
    for (const sh of shots) {
      const on = !!want[sh.i];
      if (on && (sh.state === 'idle' || sh.state === 'out')) {
        if (sh.state === 'out') { sh.state = 'idle'; }
        fire(sh, first);
      } else if (!on && (sh.state === 'flying' || sh.state === 'stuck')) {
        unfire(sh);
      }

      if (sh.state === 'flying') {
        sh.t += dt;
        const dur = 0.62;
        const u = clamp(sh.t / dur);
        const e = u * (0.72 + 0.28 * u);
        const Hw = piece.localToWorld(sh.hit.clone());
        const dW = sh.dir.clone().transformDirection(piece.matrixWorld);
        const dist = sh.S.distanceTo(Hw);
        const P1 = sh.S.clone().lerp(Hw, 0.33).add(V(0, dist * 0.16, 0));
        const P2 = Hw.clone().addScaledVector(dW, dist * 0.3);
        const pos = bez3(sh.S, P1, P2, Hw, e, V());
        const tan = bez3d(sh.S, P1, P2, Hw, Math.max(e, 0.001), V()).normalize();
        sh.arrow.position.copy(pos);
        sh.arrow.scale.setScalar(scaleNow);
        sh.arrow.lookAt(tmpV2.copy(pos).sub(tan));
        sh.arrow.rotateZ(sh.t * 16);
        if (u >= 1) stick(sh, true);
      } else if (sh.state === 'stuck') {
        if (sh.wob > 0) {
          sh.wob += dt;
          const amp = 0.085 * Math.exp(-sh.wob * 4.2);
          tmpQ.setFromEuler(eul.set(amp * Math.sin(sh.wob * 36), amp * 0.7 * Math.cos(sh.wob * 31), 0));
          sh.arrow.quaternion.copy(sh.q0).multiply(tmpQ);
          if (sh.wob > 2.2) { sh.wob = -1; sh.arrow.quaternion.copy(sh.q0); }
        }
        sh.lit = damp(sh.lit, 1, reduced ? 30 : 3.2, dt);
      } else if (sh.state === 'out') {
        sh.t += dt;
        const u = clamp(sh.t / 0.22);
        sh.arrow.position.copy(sh.hit).addScaledVector(sh.dir, u * 0.35);
        sh.arrow.scale.setScalar(Math.max(0.001, 1 - u));
        if (u >= 1) { sh.arrow.visible = false; sh.state = 'idle'; scene.add(sh.arrow); }
      }
      if (sh.state !== 'stuck') sh.lit = damp(sh.lit, 0, 9, dt);
      sh.flash = damp(sh.flash, 0, 3.2, dt);
    }
  }

  function updateLit(drain) {
    const base = 1 - drain;
    const L = (v) => Math.max(base, v);
    const E = T.els;
    E.arcTop.material.userData.u.uLit.value = L(shots[0].lit);
    E.arcBot.material.userData.u.uLit.value = L(shots[1].lit);
    E.ring.material.userData.u.uLit.value = L(0.5 * shots[2].lit + 0.5 * shots[3].lit);
    E.dot.material.userData.u.uLit.value = L(shots[4].lit);
    E.arcTop.material.userData.u.uFlash.value = shots[0].flash;
    E.arcBot.material.userData.u.uFlash.value = shots[1].flash;
    E.ring.material.userData.u.uFlash.value = Math.max(shots[2].flash, shots[3].flash);
    E.dot.material.userData.u.uFlash.value = shots[4].flash;
  }

  function placeRig(tg) {
    // tg: { x, y, w } in CSS px (centre + width of the anchor box)
    const k = wpp(0);
    const s = Math.max(0.001, (tg.w * k) / (G.disc * 2));
    scaleNow = s;
    rig.position.copy(toWorld(tg.x, tg.y, 0));
    rig.scale.setScalar(s);
    // light rides with the piece so the contact shadow stays put
    key.position.copy(rig.position).add(V(-2.6 * s, 3.6 * s, 6 * s));
    key.target.position.copy(rig.position);
    const c = key.shadow.camera; const b = 1.6 * s;
    c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 0.1; c.far = 14 * s + 2; c.updateProjectionMatrix();
    rim.position.copy(rig.position).add(V(3 * s, 1.5 * s, -3 * s));
    rim.target.position.copy(rig.position);
  }

  function update(st, dt) {
    dt = Math.min(dt, 1 / 20);
    time += dt;
    const tg = st.target;
    placeRig(tg);

    // section pose, travel swing, idle drift
    poseQuat(tg.poseA, qA); poseQuat(tg.poseB || tg.poseA, qB);
    piece.quaternion.slerpQuaternions(qA, qB, tg.t || 0);
    if (tg.swing) piece.rotateY(tg.swing * 1.1).rotateZ(tg.swing * 0.22);
    if (!reduced) piece.rotateY(Math.sin(time * 0.55) * 0.045).rotateX(Math.sin(time * 0.43) * 0.02);

    // pointer tilt with inertia + impact spring
    if (!reduced) {
      ptr.x = damp(ptr.x, st.pointer.x, 3, dt); ptr.y = damp(ptr.y, st.pointer.y, 3, dt);
      tiltVel.x += (-70 * tiltRot.x - 8 * tiltVel.x) * dt; tiltVel.y += (-70 * tiltRot.y - 8 * tiltVel.y) * dt;
      tiltRot.x += tiltVel.x * dt; tiltRot.y += tiltVel.y * dt;
    }
    tilt.rotation.set(ptr.y * 0.22 + tiltRot.x * 0.06, ptr.x * 0.32 + tiltRot.y * 0.06, 0);

    shadowMat.opacity = 0.2 * (1 - (tg.dark || 0));
    rim.intensity = 0.9 + (tg.dark || 0) * 1.6;

    updateShots(dt, st.shots);
    updateLit(st.drain || 0);
    first = false;

    // render only when something can be seen
    const half = tg.w * 0.95;
    let visible = tg.visible !== false && tg.x + half > 0 && tg.x - half < W && tg.y + half > 0 && tg.y - half < H;
    if (shots.some((s) => s.state === 'flying')) visible = true;
    if (visible || lastVisible) renderer.render(scene, cam);
    lastVisible = visible;
    return visible;
  }

  // static frame of the piece for reduced motion: a still image per anchor
  function snapshot(wPx, hPx, pose, nShots, dark) {
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setSize(wPx, hPx, false);
    W = wPx; H = hPx; cam.aspect = wPx / hPx; cam.updateProjectionMatrix();
    placeRig({ x: wPx / 2, y: hPx / 2, w: Math.min(wPx, hPx) * 0.8 });
    tilt.rotation.set(0, 0, 0);
    poseQuat(pose, piece.quaternion);
    rig.updateMatrixWorld(true);
    shots.forEach((sh, i) => {
      if (i < nShots) { computeDir(sh, startPoint(sh)); stick(sh, false); }
      else { sh.arrow.visible = false; sh.state = 'idle'; sh.lit = 0; scene.add(sh.arrow); }
    });
    updateLit(0);
    shadowMat.opacity = 0.2 * (1 - (dark || 0));
    rim.intensity = 0.9 + (dark || 0) * 1.6;
    renderer.render(scene, cam);
    const url = canvas.toDataURL('image/png');
    renderer.setSize(size.x, size.y, false);
    resize();
    return url;
  }

  return { update, resize, snapshot, renderer, get visible() { return lastVisible; } };
}
