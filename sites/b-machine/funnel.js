/* ============================================================================
   funnel.js: the LeadBound instrument for site B.

   The market as a vortex (Niv's pick, lab variation 4 "משפך"): ~9,000 companies
   turning and sinking toward the bullseye at the bottom. About 7% of them carry
   a SIGNAL (cyan). machine.js drives it from scroll, stage by stage:

     sig    non-signals dim, signals glow
     ver    failed signals vanish (half of them never reach a decision maker)
     msg    message tracers go out from the bullseye to the verified
     rep    reply pulses come back down
     hush   authored silence: the rest falls away, the survivors spiral
     col    the survivors drain into the bullseye and the rings take them in

   The bullseye is the LeadBound mark exactly (assets/apple-icon.png): a solid
   dot, one closed ring, and an outer ring split into two arcs. Measured from
   the asset: dot r .41, ring .58 to .71, arcs .87 to 1.0 spanning 40-140 and
   220-320 degrees, so the arcs sit above and below the dot and the gaps open
   to the left and right, as in the favicon.

   Signature: on a fine pointer the cursor is a radar. A lens follows it and
   the nearest signal answers with its reason. Without a pointer the scene
   pings signals by itself.
   ========================================================================== */
import * as THREE from 'three';

const SIGNALS = [
  'פתחו משרות מכירות', 'גייסו סבב השקעה', 'השיקו מוצר חדש', 'נכנסו לשוק חדש',
  'רצים עם קמפיין ממומן', 'הגיבו לפוסט של מתחרה', 'החליפו מערכת CRM', 'פתחו משרד בחו״ל',
];
const TAU = Math.PI * 2;
const FLOOR = -0.62;
const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function createFunnel(canvas, ping, { small, reduce }) {
  const pingText = ping.querySelector('.ping__label');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(small ? 46 : 38, 1, 0.1, 400);
  scene.add(camera);
  const INK = new THREE.Color('#dce6ec');
  const ACC = new THREE.Color('#12b7d4');

  let seed = 1365;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

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
    uTime: { value: 0 }, uSpin: { value: 0 }, uPR: { value: DPR }, uSize: { value: small ? 5.6 : 5.2 },
    uLens: { value: new THREE.Vector3(999, 999, 999) }, uLensOn: { value: 0 },
    uSig: { value: 0 }, uVer: { value: 0 }, uMsg: { value: 0 }, uRep: { value: 0 },
    uHush: { value: 0 }, uCol: { value: 0 }, uDim: { value: 1 },
    uInk: { value: INK }, uAcc: { value: ACC },
  };

  const FRAG = /* glsl */`
    varying vec3 vColor; varying float vAlpha;
    void main() {
      float r = length(gl_PointCoord - 0.5);
      float m = smoothstep(0.5, 0.2, r);
      if (m * vAlpha < 0.01) discard;
      gl_FragColor = vec4(vColor, vAlpha * m);
    }`;

  // shared GLSL: where a market point is at time t
  const FUNNEL_GLSL = /* glsl */`
    vec3 funnelPos(float hh0, float tth0, float spin, out float h, out float r, out float th) {
      h = fract(hh0 - uTime * 0.018);
      r = 0.9 + 8.6 * pow(h, 1.7);
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
        float fade = smoothstep(0.0, 0.07, h) * smoothstep(1.0, 0.9, h);
        float md = distance(p, uLens);
        float lens = exp(-md * md * 0.9) * uLensOn;
        p.xz += normalize(p.xz + 1e-4) * lens * 0.7;
        p.y += lens * 0.25;

        // the collapse: survivors drain into the bullseye, staggered, spiralling
        float c = clamp((uCol - aSeed * 0.4) / 0.6, 0.0, 1.0);
        c = c * c * (3.0 - 2.0 * c);
        float ang = th + c * c * 4.2;
        vec3 cp = vec3(cos(ang) * r * (1.0 - c), mix(p.y, ${FLOOR.toFixed(2)}, c), sin(ang) * r * (1.0 - c));
        p = mix(p, cp, isVer);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float bright = 0.46 + 0.26 * aSeed + (1.0 - h) * 0.3 + lens * 0.9;
        float a = mix(fade, 1.0, isVer * c);
        a *= mix(1.0, mix(0.26, 1.0, isSig), uSig);
        a *= mix(1.0, isVer + (1.0 - isSig) * 0.5, uVer);
        a *= mix(1.0, isVer, uHush);
        a *= 1.0 - isVer * smoothstep(0.84, 1.0, c);
        a *= uDim;
        float pulse = isRep * uRep * (0.5 + 0.5 * sin(uTime * 4.0 + aSeed * 20.0));
        float tint = smoothstep(0.16, 0.0, h) * (1.0 - uSig);
        float sl = clamp(max(isSig, tint) + lens * isSig, 0.0, 1.0);
        vColor = mix(uInk * bright, uAcc * (0.95 + lens * 0.4 + uSig * isSig * 0.2), sl) + uAcc * pulse * 0.5;
        vAlpha = clamp(bright + sl * 0.6, 0.0, 1.0) * a;
        float failed = isSig * (1.0 - isVer);
        float s = aSize * (1.0 + isSig * 0.9 + lens * 0.8 + pulse * 0.9 + uSig * isSig * 0.35 + uHush * isVer * 0.45);
        s *= mix(1.0, 0.3, uVer * failed);
        gl_PointSize = s * uSize * uPR * (10.0 / -mv.z);
      }`,
    fragmentShader: FRAG,
  }));
  market.frustumCulled = false;
  scene.add(market);

  // ------------------------------------------------------------ tracers
  // Messages go out from the bullseye to the verified (ink); replies come back (cyan).
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
        vec3 p = mix(vec3(0.0, ${FLOOR.toFixed(2)}, 0.0), tgt, g);
        p.y += sin(g * 3.14159) * 1.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = mix(uMsg, uRep, back) * sin(f * 3.14159) * (1.0 - aMeta.z * 0.22);
        vColor = mix(uInk * 1.15, uAcc * 1.1, back);
        gl_PointSize = (2.4 - aMeta.z * 0.4) * uSize * uPR * (10.0 / -mv.z) * 0.85;
      }`,
    fragmentShader: FRAG,
  }));
  tracers.frustumCulled = false;
  scene.add(tracers);

  // ------------------------------------------------------------ floor plate
  // Faint range rings and a slow sweep under the vortex; at the peak, seen from
  // above, it frames the bullseye like a scope.
  const plateU = { uSweep: { value: 0 }, uFade: { value: 1 }, uR: { value: 9.6 }, uInk: U.uInk, uAcc: U.uAcc };
  const plateMat = new THREE.ShaderMaterial({
    uniforms: plateU, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define TAU 6.28318530718
      varying vec2 vP; uniform float uSweep, uFade, uR; uniform vec3 uInk, uAcc;
      void main() {
        float r = length(vP);
        float a = atan(-vP.y, vP.x); if (a < 0.0) a += TAU;
        float d = mod(uSweep - a, TAU);
        float wedge = exp(-d * 5.0) * smoothstep(uR, 1.6, r) * smoothstep(1.5, 2.2, r) * 0.08;
        float rr = r / 2.4; float w = fwidth(rr);
        float ring = (1.0 - smoothstep(0.0, w * 1.3, abs(fract(rr + 0.5) - 0.5))) * step(2.0, r) * 0.09;
        float cx = (1.0 - smoothstep(0.0, fwidth(vP.x) * 1.3, abs(vP.x))) + (1.0 - smoothstep(0.0, fwidth(vP.y) * 1.3, abs(vP.y)));
        float cross = cx * 0.035 * step(2.2, r);
        float edge = smoothstep(uR, uR - 2.4, r);
        float sum = wedge + ring + cross;
        gl_FragColor = vec4(mix(uInk, uAcc, wedge / (sum + 1e-4)), sum * edge * uFade);
      }`,
  });
  plateMat.extensions = { derivatives: true };
  const plate = new THREE.Mesh(new THREE.CircleGeometry(9.6, 160), plateMat);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = FLOOR - 0.02;
  scene.add(plate);

  // ------------------------------------------------------------ the bullseye (the mark)
  const S = small ? 1.6 : 1.45;
  const mat = (op) => new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  const bull = new THREE.Group();
  bull.position.y = FLOOR;
  scene.add(bull);
  const flat = (m) => { m.rotation.x = -Math.PI / 2; bull.add(m); return m; };
  const deg = Math.PI / 180;
  const dot = flat(new THREE.Mesh(new THREE.CircleGeometry(0.41 * S, 72), mat(1)));
  const ring = flat(new THREE.Mesh(new THREE.RingGeometry(0.58 * S, 0.71 * S, 128), mat(0.95)));
  const arcs = [40, 220].map((a0) => flat(new THREE.Mesh(new THREE.RingGeometry(0.87 * S, 1.0 * S, 72, 1, a0 * deg, 100 * deg), mat(0.9))));
  const shock = flat(new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 200), mat(0)));
  const emitRing = flat(new THREE.Mesh(new THREE.RingGeometry(1, 1.045, 200), mat(0)));

  // ------------------------------------------------------------ far dust + near bokeh (depth planes)
  const softMat = (color, alpha) => new THREE.ShaderMaterial({
    uniforms: { uC: { value: color }, uA: { value: alpha }, uPR: U.uPR }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uPR; attribute float aS; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aS * uPR * (10.0 / -mv.z); }`,
    fragmentShader: `uniform vec3 uC; uniform float uA; void main(){ float r = length(gl_PointCoord - 0.5); float m = smoothstep(0.5, 0.0, r); if (m < 0.01) discard; gl_FragColor = vec4(uC, uA * m); }`,
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
  const farMat = softMat(INK, 0.2);
  const far = new THREE.Points(fg, farMat);
  scene.add(far);

  const NB = small ? 7 : 14;
  const nPos = new Float32Array(NB * 3), nS = new Float32Array(NB);
  for (let i = 0; i < NB; i++) { nPos.set([(rnd() - 0.5) * 9, (rnd() - 0.5) * 5, -3.2 - rnd() * 4], i * 3); nS[i] = 70 + rnd() * 130; }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  ng.setAttribute('aS', new THREE.BufferAttribute(nS, 1));
  const nearMat = softMat(ACC, 0.04);
  const near = new THREE.Points(ng, nearMat);
  near.frustumCulled = false;
  camera.add(near);

  // ------------------------------------------------------------ size
  let W = 1, H = 1;
  function resize(w, h) {
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ CPU mirror of the shader (pings, lens)
  let T = 0, spin = 0;
  const isVerArr = new Uint8Array(N);
  verList.forEach((i) => { isVerArr[i] = 1; });
  const pt = (i, out) => {
    const h = fract(h0[i] - T * 0.018), r = 0.9 + 8.6 * Math.pow(h, 1.7);
    const th = th0[i] + T * (0.05 + 0.5 / (r + 0.6)) + (isVerArr[i] ? spin : 0);
    out.set(Math.cos(th) * r, -0.6 + h * 7.5, Math.sin(th) * r); out.h = h; return out;
  };
  const tv = new THREE.Vector3(), best = new THREE.Vector3(), bullW = new THREE.Vector3(0, FLOOR, 0);
  const toScreen = (v) => { tv.copy(v).project(camera); return [(tv.x + 1) / 2 * W, (1 - tv.y) / 2 * H, tv.z]; };
  const inZone = (x, y, z) => z && x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1;

  let pingIdx = -1, pingUntil = 0, nextAuto = 0;
  function showPing(i, now, hold) {
    if (i !== pingIdx) pingText.textContent = SIGNALS[sigList.indexOf(i) % SIGNALS.length];
    pingIdx = i; pingUntil = now + hold; ping.classList.add('is-on');
  }
  function autoPick(zone) {
    const L = sigList, k0 = Math.floor(rnd() * L.length), o = new THREE.Vector3();
    for (let k = 0; k < L.length; k++) {
      const i = L[(k0 + k) % L.length]; pt(i, o);
      if (o.h < 0.3 || o.h > 0.85 || o.z < 1.0) continue;
      const [x, y, z] = toScreen(o);
      if (z < 1 && inZone(x, y, zone)) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------ frame
  const cam = { pos: new THREE.Vector3(0, 10.5, 13.5), look: new THREE.Vector3(0, 2, 0), ax: 0.3, ay: 0.5, init: false };
  const look = { x: 0, y: 0 };
  let sweep = 2.2;

  function frame(st) {
    const { dt, now, key } = st;
    // time: slows into the silence, never runs under reduced motion
    if (!reduce) { T += dt * (st.timeScale ?? 1); spin += dt * (st.hush || 0) * 1.5; sweep = (sweep + dt * TAU / 11) % TAU; }
    U.uTime.value = T; U.uSpin.value = spin; plateU.uSweep.value = sweep;
    U.uSig.value = st.sig; U.uVer.value = st.ver; U.uMsg.value = st.msg; U.uRep.value = st.rep;
    U.uHush.value = st.hush; U.uCol.value = reduce ? 0 : st.col; U.uDim.value = st.dim;
    plateU.uFade.value = st.plate;
    farMat.uniforms.uA.value = 0.2 * (st.farDim ?? 1);

    // camera: eased toward the scroll key; the pointer leans the world a little
    const k = reduce || !cam.init ? 1 : 1 - Math.exp(-dt * 7);
    cam.init = true;
    cam.pos.x += (key.cam[0] - cam.pos.x) * k; cam.pos.y += (key.cam[1] - cam.pos.y) * k; cam.pos.z += (key.cam[2] - cam.pos.z) * k;
    cam.look.x += (key.look[0] - cam.look.x) * k; cam.look.y += (key.look[1] - cam.look.y) * k; cam.look.z += (key.look[2] - cam.look.z) * k;
    cam.ax += (key.a[0] - cam.ax) * k; cam.ay += (key.a[1] - cam.ay) * k;
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
    nearMat.uniforms.uA.value = 0.04 * (st.near ?? 1);
    far.rotation.y = T * 0.008;

    // bullseye: breathes, swells as it takes the survivors in, pulses as replies leave it
    const breathe = reduce ? 0 : Math.sin(T * 2.0) * 0.025;
    bull.scale.setScalar(1 + breathe + (st.take || 0) * 0.32);
    const ringDim = 1 - 0.3 * st.ver * (1 - (st.take || 0)) * (st.col < 0.01 ? 1 : 0);
    dot.material.opacity = 1; ring.material.opacity = 0.95 * ringDim; arcs.forEach((m) => { m.material.opacity = 0.9 * ringDim; });
    const sh = st.shock || 0;
    shock.scale.setScalar(0.6 + sh * 7.5);
    shock.material.opacity = sh > 0 && sh < 1 && !reduce ? (1 - sh) * 0.75 : 0;
    const em = st.emit;
    if (em >= 0 && em < 1 && !reduce) { emitRing.scale.setScalar(S * (1.05 + em * 1.9)); emitRing.material.opacity = (1 - em) * 0.6; }
    else emitRing.material.opacity = 0;

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

    const [bx, by] = toScreen(bullW);
    return { bx, by };
  }

  // where the bullseye lands for a given key (for layout before the camera has eased there)
  return { resize, frame, N, signals: sigList.length, verified: verList.length };
}
