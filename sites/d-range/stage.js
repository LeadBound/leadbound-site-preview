/* ============================================================================
   stage.js: site D's instrument. Site B's market funnel, drawn in ink on
   site A's paper, with site A's physical target lying at the funnel's throat
   and site A's arrows flying into it, one per stage.

   The market: ~9,000 companies as graphite dots turning and sinking toward the
   target. About 7% carry a SIGNAL (cyan). range.js drives it from scroll:

     sig    non-signals fade, signals turn cyan
     ver    failed signals fall away (half never reach a decision maker)
     msg    ink tracers go out from the target to the verified
     rep    cyan tracers come back
     hush   authored silence: the rest falls away, the survivors spiral
     col    the survivors drain into the target; the last arrow takes the centre

   The target is the LeadBound mark exactly (assets/apple-icon.png): a solid
   dot, one closed ring, and an outer ring split into two arcs ABOVE and BELOW
   the dot, gaps LEFT and RIGHT. It lies flat, so seen from the camera the top
   arc is the far one and the logo reads upright from above.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SIGNALS = [
  'פתחו משרות מכירות', 'גייסו סבב השקעה', 'השיקו מוצר חדש', 'נכנסו לשוק חדש',
  'רצים עם קמפיין ממומן', 'הגיבו לפוסט של מתחרה', 'החליפו מערכת CRM', 'פתחו משרד בחו״ל',
];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FLOOR = -0.62;
const fract = (x) => x - Math.floor(x);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const CYAN = new THREE.Color('#12B7D4');
const OFF = new THREE.Color('#A3AEB0');

// ---- mark geometry, measured from the favicon (outer radius = 0.5) ----
const G = {
  dot: 0.200,
  ringIn: 0.278, ringOut: 0.350,
  arcIn: 0.4335, arcOut: 0.500,
  arcFrom: 37 * DEG, arcTo: 143 * DEG,   // top arc; the bottom arc is the same + 180deg
  disc: 0.565,
  front: 0.05,                           // z of the cyan faces
  back: 0.11,                            // depth of the disc behind z = 0
};
const BS = 0.008; // bevel size, subtracted so the silhouette stays true to the mark

// ------------------------------------------------------------ the target (site A)
function enamel(radial, maxR, hitAngle) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.36, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.22,
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
  m.customProgramCacheKey = () => 'lb-enamel-d';
  return m;
}

function buildTarget() {
  const piece = new THREE.Group();
  const ex = { depth: 0.03, bevelEnabled: true, bevelThickness: 0.014, bevelSize: BS, bevelSegments: 4, curveSegments: 128 };

  const discShape = new THREE.Shape(); discShape.absarc(0, 0, G.disc - 0.02, 0, TAU, false);
  const discGeo = new THREE.ExtrudeGeometry(discShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 6, curveSegments: 128 });
  discGeo.translate(0, 0, -0.09).rotateZ(-Math.PI / 2);
  const discMat = new THREE.MeshPhysicalMaterial({ color: '#0E1417', roughness: 0.52, metalness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.34, envMapIntensity: 0.42 });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.castShadow = true;
  piece.add(disc);

  const els = {};
  const place = (geo) => { geo.translate(0, 0, 0.006); return geo; };
  const arc = (a0, a1) => {
    const s = new THREE.Shape();
    const ro = G.arcOut - BS, ri = G.arcIn + BS, da = BS / G.arcOut;
    s.absarc(0, 0, ro, a0 + da, a1 - da, false);
    s.absarc(0, 0, ri, a1 - da, a0 + da, true);
    s.closePath();
    return place(new THREE.ExtrudeGeometry(s, ex));
  };
  const ringS = new THREE.Shape(); ringS.absarc(0, 0, G.ringOut - BS, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, G.ringIn + BS, 0, TAU, true); ringS.holes.push(hole);
  const dotS = new THREE.Shape(); dotS.absarc(0, 0, G.dot - BS, 0, TAU, false);

  els.arcTop = new THREE.Mesh(arc(G.arcFrom, G.arcTo), enamel(false, 1, 72 * DEG));
  els.arcBot = new THREE.Mesh(arc(G.arcFrom + Math.PI, G.arcTo + Math.PI), enamel(false, 1, 248 * DEG));
  els.ring = new THREE.Mesh(place(new THREE.ExtrudeGeometry(ringS, ex)), enamel(false, 1, 158 * DEG));
  els.dot = new THREE.Mesh(place(new THREE.ExtrudeGeometry(dotS, ex)), enamel(true, G.dot + 0.012, 0));
  for (const k in els) { els[k].castShadow = true; piece.add(els[k]); }
  return { piece, els };
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
  for (let i = 0; i < 3; i++) { const v = add(P.geo.vane, P.mats.vane); v.rotation.z = i * (TAU / 3) + 0.5; }
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
// where each arrow is loosed from: to the left of the target along the camera's right axis,
// up, and a little in front or behind, so every flight crosses the frame in profile
const ENTRY = [[14, 6, 1.2], [13, 8.5, -1.5], [15, 4.5, 2.2], [12.5, 9.5, -2.4], [14, 7, 0.4]];
const GIRTH = 1.6; // arrows are thickened for the distance the camera keeps

// ink on paper: shader output goes through the renderer's colour space, like the meshes
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float m = smoothstep(0.5, 0.26, r);
    if (m * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, vAlpha * m);
    #include <colorspace_fragment>
  }`;

export function createStage(canvas, ping, { small, reduce }) {
  const pingText = ping.querySelector('.ping__label');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(small ? 46 : 38, 1, 0.1, 400);
  scene.add(camera);

  const INK = new THREE.Color('#23323A');
  const ACC = new THREE.Color('#0FA6C2');

  let seed = 1365;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ------------------------------------------------------------ the target, lying flat at the throat
  const PS = small ? 3.15 : 2.9;              // piece scale: outer arc radius = PS / 2
  const R0 = PS * G.disc + 0.85;              // the funnel's throat clears the disc
  const TOPY = FLOOR + (G.back + G.front + 0.014) * PS; // the cyan face, in world y
  const holder = new THREE.Group();
  holder.position.set(0, FLOOR + G.back * PS, 0);
  holder.rotation.x = -Math.PI / 2;
  holder.scale.setScalar(PS);
  scene.add(holder);
  const tilt = new THREE.Group(); holder.add(tilt);
  const T = buildTarget(); tilt.add(T.piece);
  const piece = T.piece;

  // light: soft key from the upper left, so the arrows throw long shadows across the paper
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd6d4, 0.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-5.5, 11, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  key.shadow.radius = 10; key.shadow.blurSamples = 20; key.shadow.bias = -0.0004;
  const sc = key.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xd9f6ff, 0.9);
  rim.position.set(6, 3, -6);
  scene.add(rim, rim.target);

  // the paper takes the shadow (and only the shadow)
  const shadowMat = new THREE.ShadowMaterial({ color: new THREE.Color('#0D2B32'), opacity: 0.2, transparent: true, depthWrite: false });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = FLOOR - 0.005;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = 1;
  scene.add(shadowPlane);

  const AP = buildArrowParts();
  const shots = HITS.map((h, i) => {
    const arrow = makeArrow(AP); scene.add(arrow);
    return {
      i, ...h, arrow, state: 'idle', t: 0, lit: 0, wob: 0, flash: 0,
      hit: V(Math.cos(h.a) * h.r, Math.sin(h.a) * h.r, G.front),
      dir: V(0, 0, 1), S: V(), q0: new THREE.Quaternion(),
    };
  });

  // ------------------------------------------------------------ the market
  const N = small ? 4200 : 9000;
  const h0 = new Float32Array(N), th0 = new Float32Array(N), size = new Float32Array(N);
  const sd = new Float32Array(N), sig = new Float32Array(N), rank = new Float32Array(N);
  const sigList = [], verList = [];
  for (let i = 0; i < N; i++) {
    h0[i] = rnd(); th0[i] = rnd() * TAU; size[i] = 0.6 + rnd() * 0.8; sd[i] = rnd(); rank[i] = rnd();
    if (rnd() < 0.07) { sig[i] = 1; sigList.push(i); if (rank[i] <= 0.5) verList.push(i); }
  }

  const U = {
    uTime: { value: 0 }, uSpin: { value: 0 }, uPR: { value: DPR }, uSize: { value: small ? 4.9 : 4.5 },
    uLens: { value: V(999, 999, 999) }, uLensOn: { value: 0 },
    uSig: { value: 0 }, uVer: { value: 0 }, uMsg: { value: 0 }, uRep: { value: 0 },
    uHush: { value: 0 }, uCol: { value: 0 }, uDim: { value: 1 },
    uInk: { value: INK }, uAcc: { value: ACC },
  };

  const FUNNEL_GLSL = /* glsl */`
    vec3 funnelPos(float hh0, float tth0, float spin, out float h, out float r, out float th) {
      h = fract(hh0 - uTime * 0.018);
      r = ${R0.toFixed(3)} + 8.2 * pow(h, 1.7);
      th = tth0 + uTime * (0.05 + 0.5 / (r + 0.6)) + spin;
      return vec3(cos(th) * r, -0.6 + h * 7.5, sin(th) * r);
    }`;

  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  mg.setAttribute('aH0', new THREE.BufferAttribute(h0, 1));
  mg.setAttribute('aTh0', new THREE.BufferAttribute(th0, 1));
  mg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  mg.setAttribute('aSig', new THREE.BufferAttribute(sig, 1));
  mg.setAttribute('aRank', new THREE.BufferAttribute(rank, 1));
  const market = new THREE.Points(mg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uSpin, uPR, uSize, uLensOn, uSig, uVer, uRep, uHush, uCol, uDim;
      uniform vec3 uLens, uInk, uAcc;
      attribute float aH0, aTh0, aSize, aSeed, aSig, aRank;
      varying vec3 vColor; varying float vAlpha;
      ${FUNNEL_GLSL}
      void main() {
        float isSig = aSig;
        float isVer = isSig * step(aRank, 0.5);
        float isRep = isVer * step(aSeed, 0.5);
        float h, r, th;
        vec3 p = funnelPos(aH0, aTh0, uSpin * isVer, h, r, th);
        float fade = smoothstep(0.04, 0.3, h) * smoothstep(1.0, 0.9, h);
        float md = distance(p, uLens);
        float lens = exp(-md * md * 0.9) * uLensOn;
        p.xz += normalize(p.xz + 1e-4) * lens * 0.7;
        p.y += lens * 0.25;

        // the collapse: survivors drain into the target's centre, staggered, spiralling
        float c = clamp((uCol - aSeed * 0.4) / 0.6, 0.0, 1.0);
        c = c * c * (3.0 - 2.0 * c);
        float ang = th + c * c * 4.2;
        vec3 cp = vec3(cos(ang) * r * (1.0 - c), mix(p.y, ${(TOPY + 0.05).toFixed(3)}, c), sin(ang) * r * (1.0 - c));
        p = mix(p, cp, isVer);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // ink density: varies per company; the throat stays light so the target reads clean
        float ink = 0.44 + 0.3 * aSeed + smoothstep(0.1, 0.5, h) * 0.12 + lens * 0.3;
        ink *= mix(1.0, 0.5, smoothstep(14.0, 30.0, -mv.z));
        float a = mix(fade, 1.0, isVer * c);
        a *= mix(1.0, mix(0.3, 1.0, isSig), uSig);
        a *= mix(1.0, isVer + (1.0 - isSig) * 0.45, uVer);
        a *= mix(1.0, isVer, uHush);
        a *= 1.0 - isVer * smoothstep(0.84, 1.0, c);
        a *= uDim;
        float pulse = isRep * uRep * (0.5 + 0.5 * sin(uTime * 4.0 + aSeed * 20.0));
        float tint = smoothstep(0.2, 0.0, h) * (1.0 - uSig);
        float sl = clamp(max(isSig, tint) + lens * isSig, 0.0, 1.0);
        vColor = mix(uInk, uAcc, sl);
        vAlpha = clamp(ink + sl * 0.3 + pulse * 0.2, 0.0, 1.0) * a;
        float failed = isSig * (1.0 - isVer);
        float s = aSize * (1.0 + isSig * 0.8 + lens * 0.7 + pulse * 0.8 + uSig * isSig * 0.3 + uHush * isVer * 0.4);
        s *= mix(1.0, 0.3, uVer * failed);
        gl_PointSize = s * uSize * uPR * (10.0 / -mv.z);
      }`,
    fragmentShader: FRAG,
  }));
  market.frustumCulled = false;
  market.renderOrder = 3;
  scene.add(market);

  // ------------------------------------------------------------ tracers
  // Messages go out from the target to the verified (ink); replies come back (cyan).
  const TC = small ? 70 : 150, TL = 4;
  const tc = TC * TL;
  const tH0 = new Float32Array(tc), tTh0 = new Float32Array(tc), tMeta = new Float32Array(tc * 3);
  for (let k = 0; k < TC; k++) {
    const i = verList[k % verList.length];
    const off = rnd(), back = k % 2;
    for (let j = 0; j < TL; j++) {
      const q = k * TL + j;
      tH0[q] = h0[i]; tTh0[q] = th0[i];
      tMeta.set([off, back, j], q * 3);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tc * 3), 3));
  tg.setAttribute('aH0', new THREE.BufferAttribute(tH0, 1));
  tg.setAttribute('aTh0', new THREE.BufferAttribute(tTh0, 1));
  tg.setAttribute('aMeta', new THREE.BufferAttribute(tMeta, 3));
  const tracers = new THREE.Points(tg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uSpin, uPR, uSize, uMsg, uRep;
      uniform vec3 uInk, uAcc;
      attribute float aH0, aTh0; attribute vec3 aMeta;
      varying vec3 vColor; varying float vAlpha;
      ${FUNNEL_GLSL}
      void main() {
        float h, r, th;
        vec3 tgt = funnelPos(aH0, aTh0, uSpin, h, r, th);
        float f = clamp(fract(uTime * 0.21 + aMeta.x) - aMeta.z * 0.022, 0.0, 1.0);
        float back = aMeta.y;
        float g = mix(f, 1.0 - f, back);
        vec3 p = mix(vec3(0.0, ${TOPY.toFixed(3)}, 0.0), tgt, g);
        p.y += sin(g * 3.14159) * 1.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = mix(uMsg, uRep, back) * sin(f * 3.14159) * (1.0 - aMeta.z * 0.22) * 0.95;
        vColor = mix(uInk, uAcc, back);
        gl_PointSize = (2.4 - aMeta.z * 0.4) * uSize * uPR * (10.0 / -mv.z) * 0.8;
      }`,
    fragmentShader: FRAG,
  }));
  tracers.frustumCulled = false;
  tracers.renderOrder = 4;
  scene.add(tracers);

  // ------------------------------------------------------------ floor plate: a technical drawing
  const plateU = { uSweep: { value: 0 }, uFade: { value: 1 }, uR: { value: 9.6 }, uInk: U.uInk, uAcc: U.uAcc, uIn: { value: R0 - 0.1 } };
  const plateMat = new THREE.ShaderMaterial({
    uniforms: plateU, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define TAU 6.28318530718
      varying vec2 vP; uniform float uSweep, uFade, uR, uIn; uniform vec3 uInk, uAcc;
      void main() {
        float r = length(vP);
        float a = atan(-vP.y, vP.x); if (a < 0.0) a += TAU;
        float d = mod(uSweep - a, TAU);
        float wedge = exp(-d * 5.0) * smoothstep(uR, uIn + 1.0, r) * smoothstep(uIn, uIn + 0.6, r) * 0.07;
        float rr = r / 2.4; float w = fwidth(rr);
        float ring = (1.0 - smoothstep(0.0, w * 1.3, abs(fract(rr + 0.5) - 0.5))) * step(uIn, r) * 0.13;
        float onAxis = (1.0 - smoothstep(0.0, fwidth(vP.y) * 1.3, abs(vP.y))) + (1.0 - smoothstep(0.0, fwidth(vP.x) * 1.3, abs(vP.x)));
        float cross = onAxis * 0.07 * step(uIn, r);
        float edge = smoothstep(uR, uR - 2.4, r);
        float sum = wedge + ring + cross;
        gl_FragColor = vec4(mix(uInk, uAcc, wedge / (sum + 1e-4)), sum * edge * uFade);
        #include <colorspace_fragment>
      }`,
  });
  plateMat.extensions = { derivatives: true };
  const plate = new THREE.Mesh(new THREE.CircleGeometry(9.6, 160), plateMat);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = FLOOR - 0.02;
  plate.renderOrder = 0;
  scene.add(plate);

  // the take: a ring that runs out across the paper when the survivors land, and one per reply that leaves
  const ringMat = () => new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const shock = new THREE.Mesh(new THREE.RingGeometry(1, 1.025, 200), ringMat());
  const emitRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 200), ringMat());
  [shock, emitRing].forEach((m) => { m.rotation.x = -Math.PI / 2; m.position.y = FLOOR + 0.01; m.renderOrder = 2; scene.add(m); });

  // ------------------------------------------------------------ far dust + near haze (depth planes)
  const softMat = (color, alpha) => new THREE.ShaderMaterial({
    uniforms: { uC: { value: color }, uA: { value: alpha }, uPR: U.uPR }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uPR; attribute float aS; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aS * uPR * (10.0 / -mv.z); }`,
    fragmentShader: `uniform vec3 uC; uniform float uA; void main(){ float r = length(gl_PointCoord - 0.5); float m = smoothstep(0.5, 0.0, r); if (m < 0.01) discard; gl_FragColor = vec4(uC, uA * m);
      #include <colorspace_fragment>
    }`,
  });
  const FD = small ? 600 : 1400;
  const fPos = new Float32Array(FD * 3), fS = new Float32Array(FD);
  for (let i = 0; i < FD; i++) {
    const r = 13 + rnd() * 34, a = rnd() * TAU;
    fPos.set([Math.cos(a) * r, -9 + rnd() * 16, Math.sin(a) * r], i * 3);
    fS[i] = 2 + rnd() * 3;
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fg.setAttribute('aS', new THREE.BufferAttribute(fS, 1));
  const farMat = softMat(INK, 0.14);
  const far = new THREE.Points(fg, farMat);
  scene.add(far);

  const NB = small ? 7 : 14;
  const nPos = new Float32Array(NB * 3), nS = new Float32Array(NB);
  for (let i = 0; i < NB; i++) { nPos.set([(rnd() - 0.5) * 9, (rnd() - 0.5) * 5, -3.2 - rnd() * 4], i * 3); nS[i] = 70 + rnd() * 130; }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  ng.setAttribute('aS', new THREE.BufferAttribute(nS, 1));
  const nearMat = softMat(CYAN, 0.035);
  const near = new THREE.Points(ng, nearMat);
  near.frustumCulled = false;
  near.renderOrder = 9;
  camera.add(near);

  // ------------------------------------------------------------ size
  let W = 1, H = 1;
  function resize(w, h) {
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ arrows (site A, retimed to the funnel)
  const tiltRot = V(), tiltVel = V();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = V(), tmpV2 = V(), eul = new THREE.Euler();
  const tgtW = V(0, TOPY, 0);

  function startPoint(sh) {
    // off the left edge of the frame, about halfway between the eye and the target,
    // so every flight crosses the picture instead of coming straight at the camera
    const F = ENTRY[sh.i];
    const right = V().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
    const fwd = V(-right.z, 0, right.x);
    return tgtW.clone().addScaledVector(right, -F[0]).add(V(0, F[1], 0)).addScaledVector(fwd, F[2]);
  }
  function computeDir(sh, S) {
    holder.updateMatrixWorld(true);
    const Sl = piece.worldToLocal(S.clone());
    const d = Sl.sub(sh.hit).normalize().multiplyScalar(0.55).add(V(0, 0, 0.45)).normalize();
    if (d.z < 0.62) { d.z = 0.62; d.normalize(); }
    sh.dir.copy(d);
  }
  function stick(sh, animate) {
    piece.add(sh.arrow);
    sh.arrow.position.copy(sh.hit);
    tmpM.lookAt(tmpV.copy(sh.hit).add(sh.dir), sh.hit, V(0, 1, 0));
    sh.arrow.quaternion.setFromRotationMatrix(tmpM);
    sh.q0.copy(sh.arrow.quaternion);
    sh.arrow.scale.set(GIRTH, GIRTH, 1);
    sh.arrow.visible = true;
    sh.state = 'stuck';
    sh.wob = animate && !reduce ? 1e-4 : -1;
    if (animate) {
      sh.flash = 1;
      if (!reduce) { tiltVel.x += -sh.dir.y * 1.2 - 0.3; tiltVel.y += sh.dir.x * 1.2; }
    } else sh.lit = 1;
  }
  function fire(sh, instant) {
    const S = startPoint(sh);
    computeDir(sh, S);
    if (instant || reduce) { stick(sh, false); return; }
    scene.add(sh.arrow);
    sh.arrow.visible = true;
    sh.arrow.scale.set(PS * GIRTH, PS * GIRTH, PS);
    sh.S.copy(S); sh.t = 0; sh.state = 'flying';
  }
  function unfire(sh) {
    if (sh.state === 'flying' || reduce) { sh.arrow.visible = false; sh.state = 'idle'; scene.add(sh.arrow); return; }
    sh.state = 'out'; sh.t = 0;
  }
  const bez3 = (a, b, c, d, t, out) => {
    const u = 1 - t;
    return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  };
  const bez3d = (a, b, c, d, t, out) => {
    const u = 1 - t;
    return out.set(0, 0, 0)
      .addScaledVector(V().subVectors(b, a), 3 * u * u)
      .addScaledVector(V().subVectors(c, b), 6 * u * t)
      .addScaledVector(V().subVectors(d, c), 3 * t * t);
  };
  let first = true;
  const hitsNow = [];
  function updateShots(dt, want) {
    holder.updateMatrixWorld(true);
    hitsNow.length = 0;
    for (const sh of shots) {
      const on = !!want[sh.i];
      if (on && (sh.state === 'idle' || sh.state === 'out')) {
        if (sh.state === 'out') sh.state = 'idle';
        fire(sh, first);
      } else if (!on && (sh.state === 'flying' || sh.state === 'stuck')) unfire(sh);

      if (sh.state === 'flying') {
        sh.t += dt;
        const u = clamp(sh.t / 0.66);
        const e = u * (0.72 + 0.28 * u);
        const Hw = piece.localToWorld(sh.hit.clone());
        const dW = sh.dir.clone().transformDirection(piece.matrixWorld);
        const dist = sh.S.distanceTo(Hw);
        const P1 = sh.S.clone().lerp(Hw, 0.33).add(V(0, dist * 0.16, 0));
        const P2 = Hw.clone().addScaledVector(dW, dist * 0.3);
        const pos = bez3(sh.S, P1, P2, Hw, e, V());
        const tan = bez3d(sh.S, P1, P2, Hw, Math.max(e, 0.001), V()).normalize();
        sh.arrow.position.copy(pos);
        sh.arrow.lookAt(tmpV2.copy(pos).sub(tan));
        sh.arrow.rotateZ(sh.t * 16);
        if (u >= 1) { stick(sh, true); hitsNow.push(sh.i); }
      } else if (sh.state === 'stuck') {
        if (sh.wob > 0) {
          sh.wob += dt;
          const amp = 0.085 * Math.exp(-sh.wob * 4.2);
          tmpQ.setFromEuler(eul.set(amp * Math.sin(sh.wob * 36), amp * 0.7 * Math.cos(sh.wob * 31), 0));
          sh.arrow.quaternion.copy(sh.q0).multiply(tmpQ);
          if (sh.wob > 2.2) { sh.wob = -1; sh.arrow.quaternion.copy(sh.q0); }
        }
        sh.lit = damp(sh.lit, 1, reduce ? 30 : 3.2, dt);
      } else if (sh.state === 'out') {
        sh.t += dt;
        const u = clamp(sh.t / 0.22);
        sh.arrow.position.copy(sh.hit).addScaledVector(sh.dir, u * 0.35);
        const k = Math.max(0.001, 1 - u); sh.arrow.scale.set(GIRTH * k, GIRTH * k, k);
        if (u >= 1) { sh.arrow.visible = false; sh.state = 'idle'; scene.add(sh.arrow); }
      }
      if (sh.state !== 'stuck') sh.lit = damp(sh.lit, 0, 9, dt);
      sh.flash = damp(sh.flash, 0, 3.2, dt);
    }
    first = false;
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

  // ------------------------------------------------------------ CPU mirror of the shader (pings, lens)
  let TT = 0, spin = 0;
  const isVerArr = new Uint8Array(N);
  verList.forEach((i) => { isVerArr[i] = 1; });
  const pt = (i, out) => {
    const h = fract(h0[i] - TT * 0.018), r = R0 + 8.2 * Math.pow(h, 1.7);
    const th = th0[i] + TT * (0.05 + 0.5 / (r + 0.6)) + (isVerArr[i] ? spin : 0);
    out.set(Math.cos(th) * r, -0.6 + h * 7.5, Math.sin(th) * r); out.h = h; return out;
  };
  const tv = V(), best = V();
  const toScreen = (v) => { tv.copy(v).project(camera); return [(tv.x + 1) / 2 * W, (1 - tv.y) / 2 * H, tv.z]; };
  const inZone = (x, y, z) => z && x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1;

  let pingIdx = -1, pingUntil = 0, nextAuto = 0;
  function showPing(i, now, hold) {
    if (i !== pingIdx) pingText.textContent = SIGNALS[sigList.indexOf(i) % SIGNALS.length];
    pingIdx = i; pingUntil = now + hold; ping.classList.add('is-on');
  }
  function autoPick(zone) {
    const L = sigList, k0 = Math.floor(rnd() * L.length), o = V();
    for (let k = 0; k < L.length; k++) {
      const i = L[(k0 + k) % L.length]; pt(i, o);
      if (o.h < 0.3 || o.h > 0.85 || o.z < 1.0) continue;
      const [x, y, z] = toScreen(o);
      if (z < 1 && inZone(x, y, zone)) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------ frame
  const cam = { pos: V(0, 10.5, 13.5), look: V(0, 2, 0), ax: 0.3, ay: 0.5, init: false };
  const look = { x: 0, y: 0 };
  let sweep = 2.2;

  function frame(st) {
    const { dt: rawDt, now, key: k0 } = st;
    const dt = Math.min(rawDt, 1 / 20);
    if (!reduce) { TT += dt * (st.timeScale ?? 1); spin += dt * (st.hush || 0) * 1.5; sweep = (sweep + dt * TAU / 11) % TAU; }
    U.uTime.value = TT; U.uSpin.value = spin; plateU.uSweep.value = sweep;
    U.uSig.value = st.sig; U.uVer.value = st.ver; U.uMsg.value = st.msg; U.uRep.value = st.rep;
    U.uHush.value = st.hush; U.uCol.value = reduce ? 0 : st.col; U.uDim.value = st.dim;
    plateU.uFade.value = st.plate;
    farMat.uniforms.uA.value = 0.14 * (st.farDim ?? 1);

    // camera: eased toward the scroll key; the pointer leans the world a little
    const k = reduce || !cam.init ? 1 : 1 - Math.exp(-dt * 7);
    cam.init = true;
    cam.pos.x += (k0.cam[0] - cam.pos.x) * k; cam.pos.y += (k0.cam[1] - cam.pos.y) * k; cam.pos.z += (k0.cam[2] - cam.pos.z) * k;
    cam.look.x += (k0.look[0] - cam.look.x) * k; cam.look.y += (k0.look[1] - cam.look.y) * k; cam.look.z += (k0.look[2] - cam.look.z) * k;
    cam.ax += (k0.a[0] - cam.ax) * k; cam.ay += (k0.a[1] - cam.ay) * k;
    const p = st.pointer;
    const tx = p.on ? p.x / W - 0.5 : 0, ty = p.on ? p.y / H - 0.5 : 0;
    const kl = reduce ? 0 : 1 - Math.exp(-dt * 3);
    look.x += (tx - look.x) * kl; look.y += (ty - look.y) * kl;
    const lean = st.lean ?? 1;
    camera.position.set(cam.pos.x + look.x * 1.1 * lean, cam.pos.y - look.y * 0.6 * lean, cam.pos.z);
    camera.lookAt(cam.look);
    camera.setViewOffset(W, H, -(cam.ax - 0.5) * W, -(cam.ay - 0.5) * H, W, H);
    camera.updateMatrixWorld();
    near.position.set(-look.x * 1.6, look.y * 0.9, 0);
    nearMat.uniforms.uA.value = 0.035 * (st.near ?? 1);
    far.rotation.y = TT * 0.008;

    // the target: a slow breath, swells as it takes the survivors in, a kick on each impact
    if (!reduce) {
      tiltVel.x += (-70 * tiltRot.x - 8 * tiltVel.x) * dt; tiltVel.y += (-70 * tiltRot.y - 8 * tiltVel.y) * dt;
      tiltRot.x += tiltVel.x * dt; tiltRot.y += tiltVel.y * dt;
    }
    tilt.rotation.set(tiltRot.x * 0.05, tiltRot.y * 0.05, 0);
    const breathe = reduce ? 0 : Math.sin(TT * 2.0) * 0.012;
    holder.scale.setScalar(PS * (1 + breathe + (st.take || 0) * 0.14));
    updateShots(dt, st.shots || []);
    updateLit(st.drain || 0);
    const sh = st.shock || 0;
    shock.scale.setScalar(PS * 0.5 * (1 + sh * 6.5));
    shock.material.opacity = sh > 0 && sh < 1 && !reduce ? (1 - sh) * 0.85 : 0;
    const em = st.emit;
    if (em >= 0 && em < 1 && !reduce) { emitRing.scale.setScalar(PS * 0.5 * (1.12 + em * 1.9)); emitRing.material.opacity = (1 - em) * 0.7; }
    else emitRing.material.opacity = 0;
    shadowMat.opacity = 0.22;

    // pointer lens + pings
    const allowPointer = st.pointerPing && p.on && !reduce;
    if (allowPointer) {
      let bd = 140 * 140, found = false;
      for (let i = 0; i < N; i += 3) {
        pt(i, tv); const [sx, sy, sz] = toScreen(tv);
        if (sz > 1) continue;
        const d = (sx - p.x) ** 2 + (sy - p.y) ** 2;
        if (d < bd) { bd = d; pt(i, best); found = true; }
      }
      if (found) U.uLens.value.lerp(best, 0.25);
      U.uLensOn.value += ((found ? 1 : 0) - U.uLensOn.value) * 0.1;
      let si = -1, sd2 = 80 * 80;
      for (const i of sigList) {
        pt(i, tv); const [sx, sy, sz] = toScreen(tv);
        if (sz > 1 || !inZone(sx, sy, st.pingZone)) continue;
        const d = (sx - p.x) ** 2 + (sy - p.y) ** 2;
        if (d < sd2) { sd2 = d; si = i; }
      }
      if (si >= 0) showPing(si, now, 700);
    } else {
      U.uLensOn.value += (0 - U.uLensOn.value) * 0.08;
      if (st.autoPing && now > nextAuto) {
        const i = autoPick(st.pingZone);
        if (i >= 0) { showPing(i, now, reduce ? 1e9 : 1800); nextAuto = now + (reduce ? 1e9 : 2300); }
      }
    }
    const pingAllowed = st.autoPing || allowPointer;
    if (!pingAllowed || now > pingUntil) ping.classList.remove('is-on');
    if (pingIdx >= 0) {
      pt(pingIdx, tv);
      const [x, y] = toScreen(tv);
      if (st.pingZone && !inZone(x, y, st.pingZone)) ping.classList.remove('is-on');
      ping.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    renderer.render(scene, camera);
    const [bx, by] = toScreen(tgtW);
    return { bx, by, hits: hitsNow.slice(), flying: shots.some((s) => s.state === 'flying') };
  }

  return { resize, frame, N, signals: sigList.length, verified: verList.length };
}
