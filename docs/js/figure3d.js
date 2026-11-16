/* figure3d.js — a small WebGL renderer that plays the Mixamo character's animation clips to act out the demo
   prediction. No libraries. Character data (mesh, skeleton, six clips, texture) comes from data/character.js,
   built from the original .glb files by build_character.py. Units are metres, Y up, the character faces +Z.
   Illustration only: it is not part of the ML model. */
(function () {
  "use strict";

  /* ---------- math (column-major 4x4) ---------- */
  const DEG = Math.PI / 180;
  function mul4(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function trs(t, q, s, o = new Float32Array(16)) {
    const [x, y, z, w] = q;
    o[0] = (1 - 2 * (y * y + z * z)) * s[0]; o[1] = 2 * (x * y + z * w) * s[0]; o[2] = 2 * (x * z - y * w) * s[0]; o[3] = 0;
    o[4] = 2 * (x * y - z * w) * s[1]; o[5] = (1 - 2 * (x * x + z * z)) * s[1]; o[6] = 2 * (y * z + x * w) * s[1]; o[7] = 0;
    o[8] = 2 * (x * z + y * w) * s[2]; o[9] = 2 * (y * z - x * w) * s[2]; o[10] = (1 - 2 * (x * x + y * y)) * s[2]; o[11] = 0;
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  }
  function nlerp(a, b, u) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1;
    const x = a[0] + (s * b[0] - a[0]) * u, y = a[1] + (s * b[1] - a[1]) * u, z = a[2] + (s * b[2] - a[2]) * u, w = a[3] + (s * b[3] - a[3]) * u;
    const l = Math.hypot(x, y, z, w) || 1;
    return [x / l, y / l, z / l, w / l];
  }
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, t, u) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  /* ---------- unpack data/character.js ---------- */
  function unpack(src) {
    const bin = atob(src.bin), buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const T = { float32: Float32Array, int16: Int16Array, uint16: Uint16Array, uint8: Uint8Array };
    const arr = {};
    for (const [k, a] of Object.entries(src.meta.arrays)) arr[k] = new T[a.dtype](buf, a.offset, a.count);
    return arr;
  }

  const ACT2CLIP = { WALKING: "walk", WALKING_UPSTAIRS: "up", WALKING_DOWNSTAIRS: "down", SITTING: "sit", STANDING: "idle", LAYING: "lay" };
  const BED_TOP = 0.46, FADE = 0.45;

  function create(stage, src) {
    const meta = src.meta, A = unpack(src);
    const canvas = document.createElement("canvas");
    canvas.className = "fig3d-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "3D character acting out the prediction");
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    stage.innerHTML = "";
    stage.classList.add("fig3d");
    stage.appendChild(canvas);
    const overlay = document.createElement("div");
    overlay.className = "fig3d-overlay";
    overlay.innerHTML = `<div class="fig3d-bubble" hidden><span class="b1"></span><span class="b2"></span></div>
      <div class="fig3d-zzz" hidden><span>z</span><span>z</span><span>z</span></div>
      <div class="fig3d-hint">drag to turn</div><div class="fig3d-loading">loading…</div>`;
    stage.appendChild(overlay);
    const bubble = overlay.querySelector(".fig3d-bubble"), zzz = overlay.querySelector(".fig3d-zzz"),
          hint = overlay.querySelector(".fig3d-hint"), loading = overlay.querySelector(".fig3d-loading");

    /* ---------- skeleton ---------- */
    const SK = meta.skeleton, NB = SK.length, NJ = A.ibm.length / 16;
    const ARM = new Float32Array(meta.armature);
    const local = SK.map(() => new Float32Array(16)), world = SK.map(() => new Float32Array(16));
    const jointMats = new Float32Array(NJ * 16), tmp = new Float32Array(16);
    const spine2 = SK.findIndex(b => b.name === "Spine2"), head = SK.findIndex(b => b.name === "Head");

    /* ---------- clips ---------- */
    const clips = {};
    for (const [key, c] of Object.entries(meta.clips)) {
      const base = A[`${key}_rb`], tracks = {};
      for (const k of c.animated) tracks[k] = A[`${key}_r${k}`];
      clips[key] = { ...c, base, tracks, hips: A[`${key}_hips`], dur: Math.max(1e-3, (c.frames - 1) / c.fps) };
    }
    function sampleClip(key, t, outQ, outT) {         // fills per-bone rotations and the hips translation
      const c = clips[key];
      let f = c.frames > 1 ? (c.loop ? (t % c.dur) : Math.min(t, c.dur)) * c.fps : 0;
      const i0 = Math.min(c.frames - 1, Math.floor(f)), i1 = Math.min(c.frames - 1, i0 + 1), u = f - i0;
      for (let k = 0; k < NB; k++) {
        const tr = c.tracks[k];
        if (tr) {
          const a = [tr[i0 * 4] / 32767, tr[i0 * 4 + 1] / 32767, tr[i0 * 4 + 2] / 32767, tr[i0 * 4 + 3] / 32767];
          const b = [tr[i1 * 4] / 32767, tr[i1 * 4 + 1] / 32767, tr[i1 * 4 + 2] / 32767, tr[i1 * 4 + 3] / 32767];
          outQ[k] = nlerp(a, b, u);
        } else outQ[k] = [c.base[k * 4], c.base[k * 4 + 1], c.base[k * 4 + 2], c.base[k * 4 + 3]];
      }
      const h = c.hips, n = h.length / 3, j0 = Math.min(n - 1, i0), j1 = Math.min(n - 1, i1);
      outT[0] = h[j0 * 3] + (h[j1 * 3] - h[j0 * 3]) * u; outT[1] = h[j0 * 3 + 1] + (h[j1 * 3 + 1] - h[j0 * 3 + 1]) * u;
      outT[2] = h[j0 * 3 + 2] + (h[j1 * 3 + 2] - h[j0 * 3 + 2]) * u;
    }
    // how far each clip must move up/down so it rests on the floor (or the bed)
    const P = meta.place, ST = meta.stairs;
    const groundOffset = { walk: -P.walk.minY, idle: -P.idle.minY, sit: -P.sit.minY, lay: BED_TOP - P.lay.minY, up: 0, down: 0 };

    /* ---------- GL programs ---------- */
    const maxVec = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    const gpuSkin = maxVec >= NJ * 4 + 24;
    const common = `precision mediump float; varying vec3 vN; varying vec2 vUV;
      uniform vec3 uColor; uniform float uAlpha; uniform float uLit; uniform float uUseTex; uniform sampler2D uTex;
      void main(){ vec3 n = normalize(vN); vec3 L = normalize(vec3(-0.45, 0.85, 0.55));
        float diff = max(dot(n, L), 0.0); float hemi = 0.5 + 0.5 * n.y; float back = max(dot(n, normalize(vec3(0.6, 0.3, -0.7))), 0.0);
        vec3 base = uUseTex > 0.5 ? texture2D(uTex, vUV).rgb : uColor;
        vec3 col = base * (0.45 + 0.2 * hemi + 0.55 * diff + 0.12 * back);
        gl_FragColor = vec4(mix(base, col, uLit), uAlpha); }`;
    const vsSkin = `attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV; attribute vec4 aJ; attribute vec4 aW;
      uniform mat4 uVP; uniform vec3 uOffset; ${gpuSkin ? `uniform mat4 uJ[${NJ}];` : ""} varying vec3 vN; varying vec2 vUV;
      void main(){
        ${gpuSkin ? `mat4 S = aW.x * uJ[int(aJ.x)] + aW.y * uJ[int(aJ.y)] + aW.z * uJ[int(aJ.z)] + aW.w * uJ[int(aJ.w)];
        vec4 p = S * vec4(aPos, 1.0); vN = mat3(S) * aNrm;` : `vec4 p = vec4(aPos, 1.0); vN = aNrm;`}
        vUV = aUV; gl_Position = uVP * vec4(p.xyz + uOffset, 1.0); }`;
    const vsProp = `attribute vec3 aPos; attribute vec3 aNrm; uniform mat4 uVP; uniform mat4 uModel; varying vec3 vN; varying vec2 vUV;
      void main(){ vN = mat3(uModel) * aNrm; vUV = vec2(0.0); gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
    function program(vs, fs) {
      const p = gl.createProgram();
      for (const [type, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const loc = { a: {}, u: {} };
      for (const n of ["aPos", "aNrm", "aUV", "aJ", "aW"]) loc.a[n] = gl.getAttribLocation(p, n);
      for (const n of ["uVP", "uModel", "uOffset", "uJ", "uColor", "uAlpha", "uLit", "uUseTex", "uTex"]) loc.u[n] = gl.getUniformLocation(p, n);
      return { p, ...loc };
    }
    const skinProg = program(vsSkin, common), propProg = program(vsProp, common);
    const buf = (data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };

    // character buffers
    const NV = meta.nv;
    const nrmF = new Float32Array(NV * 3); for (let i = 0; i < NV * 3; i++) nrmF[i] = A.nrm[i] / 32767;
    const uvF = new Float32Array(NV * 2); for (let i = 0; i < NV * 2; i++) uvF[i] = A.uv[i] / 65535;
    const posBase = new Float32Array(A.pos);
    const cpuPos = gpuSkin ? null : new Float32Array(NV * 3), cpuNrm = gpuSkin ? null : new Float32Array(NV * 3);
    const ch = {
      pos: buf(gpuSkin ? posBase : cpuPos, gl.ARRAY_BUFFER, gpuSkin ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW),
      nrm: buf(gpuSkin ? nrmF : cpuNrm, gl.ARRAY_BUFFER, gpuSkin ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW),
      uv: buf(uvF), j: buf(A.joints), w: buf(A.weights), idx: buf(A.idx, gl.ELEMENT_ARRAY_BUFFER), n: meta.ni,
    };
    // texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([230, 190, 60, 255]));
    let texReady = false;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      texReady = true; loading.remove(); if (!running) draw(lastT);
    };
    img.src = src.tex;

    // unit cube and disc for props
    const cP = [], cN = [], cI = [];
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach((n, f) => {
      const u = n[0] ? [0, 1, 0] : [1, 0, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        cP.push(0.5 * (n[0] + a * u[0] + b * v[0]), 0.5 * (n[1] + a * u[1] + b * v[1]), 0.5 * (n[2] + a * u[2] + b * v[2])); cN.push(...n);
      }
      cI.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
    });
    const cube = { pos: buf(new Float32Array(cP)), nrm: buf(new Float32Array(cN)), idx: buf(new Uint16Array(cI), gl.ELEMENT_ARRAY_BUFFER), n: 36 };
    const dP = [0, 0, 0], dN = [0, 1, 0], dI = [];
    for (let k = 0; k <= 32; k++) { dP.push(Math.cos(k / 16 * Math.PI), 0, Math.sin(k / 16 * Math.PI)); dN.push(0, 1, 0); if (k) dI.push(0, k, k + 1); }
    const disc = { pos: buf(new Float32Array(dP)), nrm: buf(new Float32Array(dN)), idx: buf(new Uint16Array(dI), gl.ELEMENT_ARRAY_BUFFER), n: dI.length };

    function attrib(prog, name, b, size, type = gl.FLOAT, norm = false) {
      const l = prog.a[name]; if (l < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, type, norm, 0, 0);
    }
    const modelM = new Float32Array(16);
    function box(x, y, z, sx, sy, sz, color, alpha, lit = 1) {
      if (alpha <= 0.01 || sy <= 0) return;
      modelM.set([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1]);
      gl.uniformMatrix4fv(propProg.u.uModel, false, modelM);
      gl.uniform3fv(propProg.u.uColor, color); gl.uniform1f(propProg.u.uAlpha, alpha); gl.uniform1f(propProg.u.uLit, lit);
      gl.drawElements(gl.TRIANGLES, cube.n, gl.UNSIGNED_SHORT, 0);
    }

    /* ---------- pose: blend previous and current clip, then forward kinematics ---------- */
    const qA = new Array(NB), qB = new Array(NB), hA = [0, 0, 0], hB = [0, 0, 0];
    function computePose(state, t) {
      sampleClip(state.clip, state.time, qB, hB);
      const w = state.prevClip ? Math.min(1, state.fade / FADE) : 1, ws = w * w * (3 - 2 * w);
      if (ws < 1) sampleClip(state.prevClip, state.prevTime, qA, hA);
      for (let k = 0; k < NB; k++) {
        const b = SK[k];
        let q = ws < 1 ? nlerp(qA[k], qB[k], ws) : qB[k];
        if (k === spine2 && state.clip === "sit") q = qmul(q, [Math.sin(0.012 * Math.sin(t * 2.2)), 0, 0, 1]);   // breathing
        const tr = k === meta.hips ? (ws < 1 ? [hA[0] + (hB[0] - hA[0]) * ws, hA[1] + (hB[1] - hA[1]) * ws, hA[2] + (hB[2] - hA[2]) * ws] : hB) : b.t;
        trs(tr, q, b.s, local[k]);
        mul4(b.parent >= 0 ? world[b.parent] : ARM, local[k], world[k]);
      }
      for (let k = 0; k < NB; k++) mul4(world[k], A.ibm.subarray(SK[k].skin * 16, SK[k].skin * 16 + 16), tmp), jointMats.set(tmp, SK[k].skin * 16);
      const offA = state.prevClip ? groundOffset[state.prevClip] : groundOffset[state.clip];
      return offA + (groundOffset[state.clip] - offA) * ws;
    }
    function cpuSkin() {
      const J = jointMats, p = posBase;
      for (let v = 0; v < NV; v++) {
        let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
        const px = p[v * 3], py = p[v * 3 + 1], pz = p[v * 3 + 2], ux = nrmF[v * 3], uy = nrmF[v * 3 + 1], uz = nrmF[v * 3 + 2];
        for (let c = 0; c < 4; c++) {
          const w = A.weights[v * 4 + c] / 255; if (!w) continue;
          const m = A.joints[v * 4 + c] * 16;
          x += w * (J[m] * px + J[m + 4] * py + J[m + 8] * pz + J[m + 12]); y += w * (J[m + 1] * px + J[m + 5] * py + J[m + 9] * pz + J[m + 13]);
          z += w * (J[m + 2] * px + J[m + 6] * py + J[m + 10] * pz + J[m + 14]);
          nx += w * (J[m] * ux + J[m + 4] * uy + J[m + 8] * uz); ny += w * (J[m + 1] * ux + J[m + 5] * uy + J[m + 9] * uz); nz += w * (J[m + 2] * ux + J[m + 6] * uy + J[m + 10] * uz);
        }
        cpuPos[v * 3] = x; cpuPos[v * 3 + 1] = y; cpuPos[v * 3 + 2] = z; cpuNrm[v * 3] = nx; cpuNrm[v * 3 + 1] = ny; cpuNrm[v * 3 + 2] = nz;
      }
    }

    /* ---------- camera (drag to turn) ---------- */
    let yaw = 38, pitch = 10, dragging = null;
    canvas.addEventListener("pointerdown", e => { dragging = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); hint.classList.add("gone"); });
    canvas.addEventListener("pointermove", e => {
      if (!dragging) return;
      yaw = dragging.yaw - (e.clientX - dragging.x) * 0.5;
      pitch = Math.max(-5, Math.min(45, dragging.pitch + (e.clientY - dragging.y) * 0.3));
      if (!running) draw(lastT);
    });
    const endDrag = () => { dragging = null; };
    canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("dblclick", () => { yaw = 38; pitch = 10; if (!running) draw(lastT); });

    /* ---------- scene ---------- */
    const state = { clip: "idle", time: 0, prevClip: null, prevTime: 0, fade: 1 };
    const W8 = { floor: 1, walk: 0, up: 0, down: 0, chair: 0, bed: 0, camY: 0.9 };
    const FLOOR = hex("#e2e8f0"), DASH = hex("#94a3b8"), STEP = hex("#e2e8f0"), WOOD = hex("#94a3b8"), SHEET = hex("#f8fafc"),
          PILLOW = hex("#ffffff"), SHADOW = [0.06, 0.09, 0.16];
    let running = false, visible = true, last = 0, lastT = 0, accentRing = hex("#d97706"), accentTgt = hex("#d97706");
    const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    const t0 = performance.now();

    function resize() {
      const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.width * 0.74 * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function stairBoxes(dir, w, tau, s) {
      for (let k = -7; k <= 9; k++) {
        const top = s.top0 + dir * k * s.rise - s.vy * tau, ball = s.toeZ0 + k * s.run - s.vz * tau;
        const z0 = ball - 0.55 * s.run;
        box(0, (top - 1.6) / 2, z0 + s.run / 2, 1.0, top + 1.6, s.run, STEP, w);
      }
    }

    function draw(t) {
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const dy = computePose(state, t);
      const tgt = [0, W8.camY, 0], dist = 4.5;
      const eye = [tgt[0] - Math.cos(pitch * DEG) * Math.cos(yaw * DEG) * dist, tgt[1] + Math.sin(pitch * DEG) * dist + 0.2,
                   tgt[2] + Math.cos(pitch * DEG) * Math.sin(yaw * DEG) * dist];
      const VP = mul4(perspective(30 * DEG, canvas.width / canvas.height, 0.1, 30), lookAt(eye, tgt, [0, 1, 0]));

      // props
      gl.useProgram(propProg.p);
      gl.uniformMatrix4fv(propProg.u.uVP, false, VP); gl.uniform1f(propProg.u.uUseTex, 0);
      attrib(propProg, "aPos", cube.pos, 3); attrib(propProg, "aNrm", cube.nrm, 3); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cube.idx);
      box(0, -0.01, 0, 2.6, 0.02, 3.2, FLOOR, W8.floor);
      if (W8.walk > 0.01) { const o = (t * P.walk.speed) % 0.4; for (let z = -2.0; z < 2.2; z += 0.4) box(0.42, 0.003, z - o, 0.06, 0.006, 0.2, DASH, W8.walk * W8.floor); }
      if (W8.up > 0.01) stairBoxes(1, W8.up, state.clip === "up" ? state.time % clips.up.dur : 0, ST.up);
      if (W8.down > 0.01) stairBoxes(-1, W8.down, state.clip === "down" ? state.time % clips.down.dur : 0, ST.down);
      if (W8.chair > 0.01) {
        const a = W8.chair, top = P.sit.seatTop + groundOffset.sit, back = P.sit.backZ - 0.05, zc = back + 0.22;
        box(0, top - 0.03, zc, 0.5, 0.06, 0.46, WOOD, a); box(0, top + 0.38, back - 0.025, 0.5, 0.8, 0.05, WOOD, a);
        for (const [lx, lz] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) box(lx, (top - 0.06) / 2, zc + lz, 0.05, top - 0.06, 0.05, WOOD, a);
      }
      if (W8.bed > 0.01) {
        const a = W8.bed, z0 = P.lay.zMin - 0.15, z1 = P.lay.zMax + 0.12, zc = (z0 + z1) / 2, len = z1 - z0, xc = (P.lay.xMin + P.lay.xMax) / 2;
        box(xc, 0.14, zc, 1.05, 0.2, len + 0.06, WOOD, a); box(xc, (0.24 + BED_TOP) / 2, zc, 1.0, BED_TOP - 0.24, len, SHEET, a);
        box(xc, BED_TOP + 0.04, P.lay.headZ - 0.05, 0.6, 0.08, 0.34, PILLOW, a);
      }
      // soft shadow on the floor
      if (W8.floor > 0.05 && W8.bed < 0.5) {
        attrib(propProg, "aPos", disc.pos, 3); attrib(propProg, "aNrm", disc.nrm, 3); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, disc.idx);
        gl.depthMask(false);
        const hx = world[meta.hips][12], hz = world[meta.hips][14];
        modelM.set([0.34, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.26, 0, hx, 0.004, hz + 0.04, 1]);
        gl.uniformMatrix4fv(propProg.u.uModel, false, modelM); gl.uniform3fv(propProg.u.uColor, SHADOW);
        gl.uniform1f(propProg.u.uAlpha, 0.16 * W8.floor * (1 - W8.bed)); gl.uniform1f(propProg.u.uLit, 0);
        gl.drawElements(gl.TRIANGLES, disc.n, gl.UNSIGNED_SHORT, 0);
        gl.depthMask(true);
      }

      // character
      gl.useProgram(skinProg.p);
      gl.uniformMatrix4fv(skinProg.u.uVP, false, VP);
      gl.uniform3f(skinProg.u.uOffset, 0, dy, 0);
      if (gpuSkin) gl.uniformMatrix4fv(skinProg.u.uJ, false, jointMats);
      else { cpuSkin(); gl.bindBuffer(gl.ARRAY_BUFFER, ch.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, cpuPos); gl.bindBuffer(gl.ARRAY_BUFFER, ch.nrm); gl.bufferSubData(gl.ARRAY_BUFFER, 0, cpuNrm); }
      attrib(skinProg, "aPos", ch.pos, 3); attrib(skinProg, "aNrm", ch.nrm, 3); attrib(skinProg, "aUV", ch.uv, 2);
      attrib(skinProg, "aJ", ch.j, 4, gl.UNSIGNED_BYTE, false); attrib(skinProg, "aW", ch.w, 4, gl.UNSIGNED_BYTE, true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(skinProg.u.uTex, 0);
      gl.uniform1f(skinProg.u.uUseTex, 1); gl.uniform1f(skinProg.u.uAlpha, 1); gl.uniform1f(skinProg.u.uLit, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ch.idx);
      gl.drawElements(gl.TRIANGLES, ch.n, gl.UNSIGNED_SHORT, 0);
      for (const n of ["aJ", "aW", "aUV"]) if (skinProg.a[n] >= 0) gl.disableVertexAttribArray(skinProg.a[n]);

      // "z z z" above the head while laying
      const H = world[head], hp = [H[12], H[13] + dy + 0.3, H[14]];
      const cx = VP[0] * hp[0] + VP[4] * hp[1] + VP[8] * hp[2] + VP[12], cy = VP[1] * hp[0] + VP[5] * hp[1] + VP[9] * hp[2] + VP[13],
            cw = VP[3] * hp[0] + VP[7] * hp[1] + VP[11] * hp[2] + VP[15];
      zzz.style.left = `${(cx / cw * 0.5 + 0.5) * 100}%`; zzz.style.top = `${(0.5 - cy / cw * 0.5) * 100}%`;
    }

    function frame(now) {
      if (!visible) { running = false; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = reduce ? 0 : (now - t0) / 1000; lastT = t;
      if (!reduce) { state.time += dt; state.prevTime += dt; }
      if (state.prevClip) { state.fade += dt; if (state.fade >= FADE) state.prevClip = null; }
      const k = 1 - Math.exp(-dt * 6), c = state.clip;
      const tg = { floor: c === "up" || c === "down" ? 0 : 1, walk: c === "walk" ? 1 : 0, up: c === "up" ? 1 : 0, down: c === "down" ? 1 : 0,
                   chair: c === "sit" ? 1 : 0, bed: c === "lay" ? 1 : 0, camY: c === "lay" ? 0.65 : 0.9 };
      for (const key in tg) W8[key] += (tg[key] - W8[key]) * k;
      draw(t);
      requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }).observe(stage);
    window.addEventListener("resize", () => { if (!running) draw(lastT); });
    start();

    return {
      set(pred, conf, second, color, nice) {
        const clip = ACT2CLIP[pred] || "idle";
        if (clip !== state.clip) {
          state.prevClip = state.clip; state.prevTime = state.time; state.fade = 0;
          state.clip = clip; state.time = 0;
        }
        const unsure = conf < 0.6;
        bubble.hidden = !unsure;
        bubble.querySelector(".b1").textContent = unsure ? `${nice[pred]}?` : "";
        bubble.querySelector(".b2").textContent = unsure ? `or ${nice[second]}?` : "";
        zzz.hidden = pred !== "LAYING";
        canvas.setAttribute("aria-label", `3D character acting out the prediction: ${nice[pred]}`);
        start();
      },
      debug: () => ({ gpuSkin, maxVec, texReady }),
    };
  }

  window.HARFigure3D = {
    available() { return !!(window.HAR_CHARACTER && window.WebGLRenderingContext); },
    create(stage) { return create(stage, window.HAR_CHARACTER); },
  };
})();
