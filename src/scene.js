// KIER WebGL scene — engine ported from a scroll-driven WebGL template.
// Only two functional changes from the source: CONFIG.palette (below) and
// the Lenis import (npm package instead of a global CDN script). Everything
// else — shader math, the scroll clock, the reveal system, the loader — is
// unchanged per the brief to keep this exact foundation.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Lenis from 'lenis';

export function initMeridian(){

/* ═══════════════════════════════════════════════════════════════════════
   CONFIG — everything a buyer needs to change lives here.
   Palette, copy timings, scene tuning, performance tiers.
   You should never need to edit the shaders below to rebrand this.
   ═══════════════════════════════════════════════════════════════════════ */
const CONFIG = {

  palette: {
    base:  '#050505',   // page background (near-black, matches the rest of the site)
    ink:   '#f2f2f2',   // text (chrome-100)
    amber: '#f2f2f2',   // gradient — top of each form (bright chrome highlight)
    coral: '#8a8a90',   // gradient — middle (steel gray)
    rose:  '#3a1216',   // gradient — depths (dark oxblood)
    gold:  '#7a2028',   // accent: bloom, CTA hover, focus ring (oxblood-bright)
  },

  scene: {
    fov: 50,
    introMs: 2600,          // camera dolly-in + form assembly
    clockLerp: 0.075,       // how far the eased clock closes per 1/60s (lower = more lag)
    bloom: { strength: 0.62, radius: 0.34, threshold: 0.55 },
  },

  field: {                  // ACT 1 — the rippling plane
    span: 9,                // world-units across
    lift: 1.15,             // how far it domes upward
    flowSpeed: 0.16,
    flowScale: 0.42,
    wakeRadius: 1.9,        // cursor influence radius
    wakeDepth: 0.55,
    cameraZ: 6.2,
  },

  vortex: {                 // ACT 2 — the funnel
    radius: 16,
    depth: 46,
    twist: 2.35,
    spin: 0.13,
    cameraZ: 26,
    dive: 22,               // camera travels cameraZ -> cameraZ - dive (into the mouth)
  },

  lattice: {                // ACT 3 — the crystalline shell
    radius: 2.5,
    jitter: 0.05,           // radial scatter, breaks the perfect shell
    facets: 2.6,            // scale of the crystalline banding (higher = finer)
    spin: 1.9,              // radians swept across the act
    breathe: 0.035,
  },

  loader: {
    minMs: 900, holdMs: 260, exitMs: 900, introDelayMs: 90,
    streaks: 150, angle: -0.3, warp: 2.6,
  },

  // Point sprites are fill-rate bound: cost ≈ count × size² × dpr².
  // These four rows are the entire performance story. Resolved once on load.
  tiers: [
    { maxWidth: Infinity, field: 26000, vortex: 60000, lattice: 34000, motes: 260, dpr: 2,    fps: 60, bloom: true,  pointer: true,  lerp: 0.075 },
    { maxWidth: 1440,     field: 19000, vortex: 44000, lattice: 24000, motes: 200, dpr: 1.75, fps: 60, bloom: true,  pointer: true,  lerp: 0.085 },
    { maxWidth: 1024,     field: 12000, vortex: 26000, lattice: 14000, motes: 140, dpr: 1.25, fps: 45, bloom: true,  pointer: false, lerp: 0.13  },
    { maxWidth: 640,      field:  7000, vortex: 14000, lattice:  8000, motes:  80, dpr: 1.1,  fps: 30, bloom: false, pointer: false, lerp: 0.15  },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   BOOT — palette → CSS, tier resolution, capability checks
   ═══════════════════════════════════════════════════════════════════════ */
const root = document.documentElement;
for (const [k, v] of Object.entries(CONFIG.palette)) root.style.setProperty(`--${k}`, v);

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Tuning aid: add ?debug to the URL, then read `window.MERIDIAN` in the console.
const DEBUG = new URLSearchParams(location.search).has('debug');

// Last row whose maxWidth the viewport fits under wins.
const TIER = CONFIG.tiers.reduce((best, t) => innerWidth <= t.maxWidth ? t : best, CONFIG.tiers[0]);

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const clamp   = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp    = (a, b, t) => a + (b - a) * t;
const smoothstep   = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Shared gradient-across-the-palette helper — originally built for the
// loader's streak effect (since removed in favor of a video background),
// but also used by a card visual further down, so kept as a general
// utility rather than removed along with the streak system.
const PALETTE_STOPS = [CONFIG.palette.amber, CONFIG.palette.coral, CONFIG.palette.rose].map(h => {
  const c = new THREE.Color(h);
  // THREE.Color gamma-decodes on construction; for 2D canvas we want the
  // original sRGB bytes back — re-encode.
  const toSRGB = v => Math.round(Math.pow(clamp01(v), 1 / 2.2) * 255);
  return [toSRGB(c.r), toSRGB(c.g), toSRGB(c.b)];
});
const streakColor = s => {
  const t = s * (PALETTE_STOPS.length - 1);
  const i = Math.min(Math.floor(t), PALETTE_STOPS.length - 2);
  const f = t - i;
  const a = PALETTE_STOPS[i], b = PALETTE_STOPS[i + 1];
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ];
};
const smootherstep = x => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
// Frame-rate-independent easing: closes `base` of the gap per 1/60s, whatever dt is.
const ease = (base, dt) => 1 - Math.pow(1 - base, dt * 60);

/* ═══════════════════════════════════════════════════════════════════════
   TEXT REVEAL — split into letters/words, animate on a trigger
   ═══════════════════════════════════════════════════════════════════════ */
const REVEALS = [];

function splitLetters(el) {
  // Preserve authored line breaks: a literal <br> in the source becomes a "//"
  // token here (textContent drops the tag), and we honour it as a flex break.
  const raw = (el.innerHTML || '').replace(/<br\s*\/?>/gi, ' // ');
  const tmp = document.createElement('div'); tmp.innerHTML = raw;
  const words = (tmp.textContent || '').trim().split(/\s+/);
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const chars = [];
  for (const word of words) {
    if (word === '//') {                         // hard line break
      const br = document.createElement('span');
      br.style.flexBasis = '100%'; br.style.height = '0';
      frag.appendChild(br);
      continue;
    }
    const w = document.createElement('span');
    w.className = 'w';
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      w.appendChild(c);
      chars.push(c);
    }
    frag.appendChild(w);
  }
  el.appendChild(frag);
  el.classList.add('split');
  return chars;
}

function splitWords(el) {
  const words = (el.textContent || '').trim().split(/\s+/);
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const inners = [];
  for (const word of words) {
    const outer = document.createElement('span');
    outer.className = 'w';
    const inner = document.createElement('span');
    inner.className = 'c';
    inner.textContent = word;
    outer.appendChild(inner);
    frag.appendChild(outer);
    inners.push(inner);
  }
  el.appendChild(frag);
  el.classList.add('split');
  return inners;
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// A reveal is a list of nodes plus in/out styles. `play(true)` runs it in,
// `play(false)` reverses it — so `always` triggers can play both ways.
function makeReveal(nodes, { stagger, duration, out, into, delay = 0 }) {
  for (const n of nodes) Object.assign(n.style, out);
  let state = null;
  return {
    play(forward) {
      if (state === forward) return;
      state = forward;
      const styles = forward ? into : out;
      nodes.forEach((n, i) => {
        const d = forward ? delay + i * stagger : i * stagger * 0.4;
        n.style.transition = REDUCED ? 'none'
          : `opacity ${duration}ms ${EASE_OUT} ${d}ms, filter ${duration}ms ${EASE_OUT} ${d}ms, transform ${duration}ms ${EASE_OUT} ${d}ms, clip-path ${duration}ms ${EASE_OUT} ${d}ms`;
        Object.assign(n.style, styles);
      });
    },
  };
}

const PRESETS = {
  letter: { stagger: 26, duration: 1000, out:  { opacity: '0', filter: 'blur(12px)' },
                                          into: { opacity: '1', filter: 'blur(0px)' } },
  word:   { stagger: 42, duration: 1100, out:  { opacity: '0', filter: 'blur(8px)',  transform: 'translateY(16px)' },
                                          into: { opacity: '1', filter: 'blur(0px)', transform: 'translateY(0)' } },
  unit:   { stagger: 0,  duration: 1000, out:  { opacity: '0', filter: 'blur(10px)', transform: 'translateY(20px)' },
                                          into: { opacity: '1', filter: 'blur(0px)', transform: 'translateY(0)' } },
  mask:   { stagger: 0,  duration: 1200, out:  { clipPath: 'inset(0 0 100% 0)' },
                                          into: { clipPath: 'inset(0 0 0% 0)' } },
  card:   { stagger: 0,  duration: 1200, out:  { opacity: '0', filter: 'blur(14px)', transform: 'scale(0.94) rotateX(12deg)' },
                                          into: { opacity: '1', filter: 'blur(0px)', transform: 'scale(1) rotateX(0deg)' } },
};

// Build every declared reveal in the document.
function buildReveals(scope, register) {
  scope.querySelectorAll('[data-split]').forEach(el => {
    const kind = el.dataset.split;                      // 'letter' | 'word'
    const nodes = kind === 'letter' ? splitLetters(el) : splitWords(el);
    register(el, makeReveal(nodes, { ...PRESETS[kind], delay: +(el.dataset.delay || 0) }));
  });
  scope.querySelectorAll('[data-unit]').forEach(el => {
    register(el, makeReveal([el], { ...PRESETS.unit, delay: +(el.dataset.delay || 0) }));
  });
  scope.querySelectorAll('[data-mask]').forEach(el => {
    register(el, makeReveal([el], { ...PRESETS.mask, delay: +(el.dataset.delay || 0) }));
  });
  scope.querySelectorAll('[data-card]').forEach(el => {
    register(el, makeReveal([el], { ...PRESETS.card, delay: 0 }));
  });
}

// Fixed overlays never leave the viewport, so IntersectionObserver can't gate
// them — they read the scroll clock instead. In-flow content uses IO.
const clockGated = [];   // { reveal, from, to }
const ioGated    = [];   // handled by IntersectionObserver

for (const [id, from, to] of [['ov1', -1, 0.28], ['ov3', 1.55, 2.75]]) {
  const scope = document.getElementById(id);
  buildReveals(scope, (el, reveal) => {
    // The hero plays once (gated on intro, not the clock) — everything else reverses.
    const once = id === 'ov1';
    clockGated.push({ reveal, from, to, once, played: false });
  });
}

buildReveals(document.querySelector('.content'), (el, reveal) => {
  const once = el.hasAttribute('data-once');
  ioGated.push({ el, reveal, once, played: false });
});

// Map elements to records directly — a linear `find` over every entry is both
// slower and fragile if an element is ever registered twice.
const ioMap = new Map(ioGated.map(r => [r.el, r]));

// threshold:0 — fire as soon as ANY part of the element crosses the margin.
// A fractional threshold (say 0.18) silently never fires for elements taller than
// the viewport, which is exactly what the big cards and the FAQ panel are.
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    const rec = ioMap.get(e.target);
    if (!rec) continue;
    if (e.isIntersecting) { rec.reveal.play(true); rec.played = true; }
    else if (!rec.once && rec.played) rec.reveal.play(false);
  }
}, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
for (const r of ioGated) io.observe(r.el);

/* ═══════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
   ═══════════════════════════════════════════════════════════════════════ */
const faqItems = [...document.querySelectorAll('.faq-item')];
function setFaq(item, open) {
  const panel = item.querySelector('.faq-a');
  const btn   = item.querySelector('.faq-q');
  item.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  panel.style.height = open ? panel.scrollHeight + 'px' : '0px';
}
faqItems.forEach(item => {
  item.querySelector('.faq-q').addEventListener('click', () => {
    const open = !item.classList.contains('open');
    faqItems.forEach(i => setFaq(i, i === item && open));
  });
});
// Measure before first paint so the initially-open item never flashes.
requestAnimationFrame(() => faqItems.forEach(i => setFaq(i, i.classList.contains('open'))));
addEventListener('resize', () => faqItems.forEach(i => { if (i.classList.contains('open')) setFaq(i, true); }));

document.getElementById('contact-form').addEventListener('submit', e => e.preventDefault());

/* ═══════════════════════════════════════════════════════════════════════
   SHADER CHUNKS — shared GLSL
   ═══════════════════════════════════════════════════════════════════════ */

// Value-noise + fbm. Cheaper than simplex and plenty for a displacement field;
// the hash is the classic sin-dot trick, which is stable enough for our scales.
const NOISE = /* glsl */`
  float hash13(vec3 p){
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0,0,0)), n100 = hash13(i + vec3(1,0,0));
    float n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
    float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1));
    float n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 2.0 - 1.0;
  }
  float fbm(vec3 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

// A round, soft point sprite with a hot centre. Returns 0 outside the disc so
// we can `discard` — square sprites over additive blending look like confetti.
const SPRITE = /* glsl */`
  float sprite(vec2 pc, out float core){
    vec2 d = pc - 0.5;
    float r = length(d);
    if (r > 0.5) return -1.0;
    core = smoothstep(0.16, 0.0, r);
    float s = smoothstep(0.5, 0.0, r);
    return s * s;
  }
`;

// THREE.Color converts sRGB → linear on construction; the renderer re-encodes on
// output. Handing raw hex bytes to a shader double-encodes and washes out.
const linear = hex => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

const COL = {
  amber: linear(CONFIG.palette.amber),
  coral: linear(CONFIG.palette.coral),
  rose:  linear(CONFIG.palette.rose),
  gold:  linear(CONFIG.palette.gold),
  base:  linear(CONFIG.palette.base),
};

/* ═══════════════════════════════════════════════════════════════════════
   RENDERER
   ═══════════════════════════════════════════════════════════════════════ */
const canvas   = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TIER.dpr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.palette.base);
const camera = new THREE.PerspectiveCamera(CONFIG.scene.fov, innerWidth / innerHeight, 0.1, 400);
const INTRO_DOLLY = 9;
camera.position.set(0, 0, CONFIG.field.cameraZ + INTRO_DOLLY);

// The point-cloud systems (field/vortex) don't need lighting at all — they
// compute color entirely in their own shaders. The PSP model previously
// used a procedural environment map (RoomEnvironment) so its metallic
// material had something to reflect, but that environment's internal
// brightness is a black box I can't see or verify — scaling it down by a
// fraction was a guessing game that kept failing. Removed entirely.
// Metalness is reduced instead (see the material setup below), so the
// model's brightness comes entirely from the three lights below, which are
// fully predictable and directly controllable.

let composer = null;
if (TIER.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const b = CONFIG.scene.bloom;
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), b.strength, b.radius, b.threshold));
}

const POINT_MAT = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

/* ═══════════════════════════════════════════════════════════════════════
   BACKDROP — a slow warm wash. Clip-space quad, ignores the camera.
   ═══════════════════════════════════════════════════════════════════════ */
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uWarm: { value: COL.coral.clone() },
      uCool: { value: COL.rose.clone() },
      uAmt:  { value: 0.34 },
      uAspect: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uAmt, uAspect;
      uniform vec3 uWarm, uCool;
      varying vec2 vUv;
      void main(){
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uAspect;

        // Two drifting fbm lobes at different speeds — the interference between
        // them is what stops it reading as a static gradient.
        float a = fbm(vec3(uv * 0.9, uTime * 0.045));
        float b = fbm(vec3(uv * 1.7 + 4.0, uTime * 0.028));
        float wash = smoothstep(-0.35, 0.75, a * 0.68 + b * 0.32);

        // Push the glow to the lower corners so the hero copy stays clean.
        float pool = smoothstep(1.35, 0.15, length(uv - vec2(0.0, 0.55)));

        vec3 col = mix(uCool, uWarm, wash);
        col *= wash * pool * uAmt;

        // A faint vignette keeps the frame from feeling flat.
        col *= 1.0 - 0.35 * smoothstep(0.5, 1.6, length(uv));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
backdrop.frustumCulled = false;
backdrop.renderOrder = -1;
scene.add(backdrop);

/* ═══════════════════════════════════════════════════════════════════════
   ACT 1 — THE FIELD
   A jittered grid of points on a plane. fbm lifts it into a shallow dome and
   ripples it; the cursor drags a wake through it; it tears loose on the way out.
   ═══════════════════════════════════════════════════════════════════════ */
function buildField() {
  const n = TIER.field;
  const side = Math.round(Math.sqrt(n));
  const count = side * side;
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 3);
  const span = CONFIG.field.span;

  let i = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++, i++) {
      // Jitter each sample inside its cell — a perfect lattice moirés badly
      // once the points get within a pixel of each other.
      const u = (x + Math.random()) / side - 0.5;
      const v = (y + Math.random()) / side - 0.5;
      pos[i * 3]     = u * span;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = v * span;
      rnd[i * 3]     = Math.random();
      rnd[i * 3 + 1] = Math.random();
      rnd[i * 3 + 2] = Math.random();
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRandom',  new THREE.BufferAttribute(rnd, 3));

  const mat = new THREE.ShaderMaterial({
    ...POINT_MAT, depthTest: false,
    uniforms: {
      uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() },
      uSize: { value: 15.0 },
      uAssemble: { value: 0 }, uOut: { value: 0 }, uAlpha: { value: 1 },
      uLift: { value: CONFIG.field.lift },
      uFlowScale: { value: CONFIG.field.flowScale },
      uFlowSpeed: { value: CONFIG.field.flowSpeed },
      uCursor: { value: new THREE.Vector3(0, 0, 99) },
      uWake: { value: CONFIG.field.wakeRadius },
      uWakeDepth: { value: CONFIG.field.wakeDepth },
      uEnergy: { value: 0 },
      uTop: { value: COL.amber.clone() },
      uMid: { value: COL.coral.clone() },
      uBot: { value: COL.rose.clone() },
      uHot: { value: COL.gold.clone() },
    },
    vertexShader: NOISE + /* glsl */`
      uniform float uTime, uSize, uPR, uAssemble, uOut, uLift, uFlowScale, uFlowSpeed;
      uniform float uWake, uWakeDepth, uEnergy;
      uniform vec3  uCursor;
      attribute vec3 aRandom;
      varying float vH, vWake, vFade, vRnd;

      void main(){
        vec3 p = position;
        vRnd = aRandom.x;

        // --- the surface -------------------------------------------------
        // Two fbm octaves drifting at different rates. The second is scaled by
        // the first so crests get detail and troughs stay calm — that asymmetry
        // is what makes it read as a *surface* and not as noise.
        float t = uTime * uFlowSpeed;
        float base = fbm(vec3(p.xz * uFlowScale, t));
        float fine = fbm(vec3(p.xz * uFlowScale * 2.7, t * 1.6 + 9.0));
        float h = base + fine * 0.34 * (0.5 + base * 0.5);

        // Dome the whole plane so it has a silhouette from the side.
        float radial = length(p.xz) / ${(CONFIG.field.span * 0.5).toFixed(2)};
        float dome = 1.0 - smoothstep(0.0, 1.15, radial);
        p.y = h * uLift * (0.35 + dome * 0.65);
        vH = h;

        // --- the wake ----------------------------------------------------
        // A depression that follows the cursor, with a raised rim. Distance is
        // measured in the XZ plane only, so it tracks along the surface.
        float d = length(p.xz - uCursor.xz);
        float fall = smoothstep(uWake, 0.0, d);
        float rim  = smoothstep(uWake, uWake * 0.55, d) * (1.0 - fall);
        p.y -= (fall * fall * uWakeDepth - rim * uWakeDepth * 0.35) * uEnergy;
        vWake = fall * uEnergy;

        // --- assembly ----------------------------------------------------
        // Points rise from far below on their own delays.
        float delay = aRandom.z * 0.5;
        float at = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);
        float aEase = 1.0 - pow(1.0 - at, 3.0);
        vec3 spawn = p + vec3(0.0, -7.0 - aRandom.y * 5.0, 0.0);
        p = mix(spawn, p, aEase);

        // --- dissolve ----------------------------------------------------
        // On the way out the sheet tears: each point drifts along its own vector,
        // biased upward and outward, accelerating as uOut squares.
        float o2 = uOut * uOut;
        vec3 tear = normalize(vec3(aRandom.x - 0.5, 0.65, aRandom.z - 0.5));
        p += tear * o2 * (11.0 + aRandom.y * 7.0);
        p.xz += vec2(fine, base) * uOut * 1.4;

        vFade = aEase * (1.0 - smoothstep(0.0, 0.9, uOut));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (1.0 / max(0.1, -mv.z));
      }`,
    fragmentShader: SPRITE + /* glsl */`
      precision highp float;
      uniform vec3 uTop, uMid, uBot, uHot;
      uniform float uAlpha;
      varying float vH, vWake, vFade, vRnd;

      void main(){
        float core;
        float s = sprite(gl_PointCoord, core);
        if (s < 0.0) discard;

        // Height drives the gradient: crests amber, mid coral, troughs rose.
        float t = clamp(vH * 0.85 + 0.5, 0.0, 1.0);
        vec3 col = t < 0.5
          ? mix(uBot, uMid, t * 2.0)
          : mix(uMid, uTop, (t - 0.5) * 2.0);

        // Crests catch a hot rim; the bloom pass turns this into glow.
        col += uHot * smoothstep(0.55, 1.0, t) * core * 0.7;
        // The wake glows gold — the cursor reads as a light source, not a hole.
        col = mix(col, uHot, vWake * 0.55);

        // A little per-point brightness variance stops it looking printed.
        col *= 0.82 + vRnd * 0.36;

        float a = s * vFade * uAlpha * (0.42 + vWake * 0.5);
        gl_FragColor = vec4(col, a);
      }`,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.rotation.x = -0.32;      // tilt toward the camera so the dome reads
  return pts;
}

/* ═══════════════════════════════════════════════════════════════════════
   ACT 3 — THE PSP MODEL
   Was a procedural point-cloud lattice; replaced with a loaded glTF model.
   Loading is async, so it just fades in whenever it finishes — everything
   else in the scene runs immediately regardless of load time.

   Stripped back to basics on request — no screen photo system, no button
   clicks, no camera flash. Just loading, positioning, and drag-to-inspect,
   so position/scale/orientation can be nailed down before anything else
   gets layered back on top.
   ═══════════════════════════════════════════════════════════════════════ */
let pspModel = null;
let pspBaseScale = 1;
let pspScreenMesh = null;
const pspMaterials = [];
const pspButtonMeshes = [];

// TEMPORARY: 5 procedurally-generated "Nokia LCD" screens, numbered
// [01]-[05], standing in for real photos while the button-click cycling
// gets tested. No files needed — swap this out for the real photo-loading
// version (TextureLoader + placeholder fallback) whenever real images are
// ready; that version is straightforward to restore.
const PSP_SCREEN_COUNT = 5;
let pspScreenTextures = [];
let pspScreenIndex = 0;

function makeNokiaScreenTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288; // roughly the screen's own aspect ratio
  const ctx = canvas.getContext('2d');

  // Classic Nokia LCD backlight — pale cyan-blue, brighter toward centre.
  const grad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 20,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.7
  );
  grad.addColorStop(0, '#c3edf0');
  grad.addColorStop(0.6, '#8fd0d6');
  grad.addColorStop(1, '#4f9aa2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Faint scanlines for the retro LCD feel.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1);

  ctx.fillStyle = '#0a2e33';
  ctx.font = '700 68px "Special Elite", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`[ ${String(number).padStart(2, '0')} ]`, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Must match flipY=false — the screen's UVs are authored to glTF
  // convention. Leaving this at its default (true) is what made a
  // placeholder texture specifically show up rotated/mirrored before.
  tex.flipY = false;
  return tex;
}

function buildScreenTextures() {
  pspScreenTextures = [];
  for (let i = 1; i <= PSP_SCREEN_COUNT; i++) pspScreenTextures.push(makeNokiaScreenTexture(i));
}

function setScreenIndex(index) {
  if (!pspScreenMesh || pspScreenTextures.length === 0) return;
  pspScreenIndex = ((index % pspScreenTextures.length) + pspScreenTextures.length) % pspScreenTextures.length;
  pspScreenMesh.material.map = pspScreenTextures[pspScreenIndex];
  pspScreenMesh.material.needsUpdate = true;
}

function nextScreenPhoto() {
  setScreenIndex(pspScreenIndex + 1);
}

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  '/models/sony_psp.glb',
  (gltf) => {
    const model = gltf.scene;

    // The Sketchfab export includes a ground/shadow-catcher plane that isn't
    // part of the actual device — left in, it skews both the bounding-box
    // center and the scale calculation below.
    const ground = model.getObjectByName('ground');
    if (ground) ground.removeFromParent();

    // Scale FIRST, then recenter based on the now-scaled bounding box.
    // Three.js composes an object's transform as scale-then-translate, so
    // computing the recenter offset from the UNSCALED box and applying it
    // after scaling throws the result off by a factor of the scale itself.
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    const targetSize = 6.0;
    pspBaseScale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z);
    model.scale.setScalar(pspBaseScale);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material.transparent = true;
      child.material.opacity = 0;
      // The source file's material has emissive:[1,1,1] baked in — reset to
      // zero, or it self-illuminates at full brightness regardless of
      // lighting, which combined with bloom was blowing out into a glow.
      child.material.emissive = new THREE.Color(0x000000);
      child.material.emissiveIntensity = 0;
      // Original is metalness:1 (zero diffuse reflectance) — reduced so
      // the three lights below actually produce visible, controllable
      // brightness. Same treatment for every mesh, no special-casing.
      child.material.metalness = 0.35;
      child.material.roughness = 0.6;

      if (child.name.startsWith('screen_low')) {
        // Every mesh on this model — screen, body, all 15 buttons — shares
        // ONE material. Swapping .map directly would retexture the entire
        // model, not just the screen. Clone a dedicated material so only
        // the screen is affected.
        child.material = child.material.clone();

        // The screen's UVs only occupy a small sub-rectangle of the shared
        // texture atlas (roughly u:0.008–0.399, v:0.370–0.590) — a
        // standalone image assigned as-is would only show through that
        // same tiny cropped slice. Remap the UVs to the full 0–1 range so
        // a new texture fits edge-to-edge across the visible screen.
        const uv = child.geometry.attributes.uv;
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          if (u < uMin) uMin = u;
          if (u > uMax) uMax = u;
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
        const uRange = uMax - uMin || 1;
        const vRange = vMax - vMin || 1;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, (uv.getX(i) - uMin) / uRange, (uv.getY(i) - vMin) / vRange);
        }
        uv.needsUpdate = true;

        pspScreenMesh = child;
      } else if (child.name.startsWith('button')) {
        pspButtonMeshes.push(child);
      }

      pspMaterials.push(child.material);
    });

    if (pspScreenMesh) {
      buildScreenTextures();
      setScreenIndex(0);
    }

    model.visible = false;
    scene.add(model);
    pspModel = model;
  },
  undefined,
  (err) => console.error('Failed to load /models/sony_psp.glb', err)
);

// The point systems compute color entirely in their own shaders and never
// needed scene lights. The PSP model uses standard PBR materials, which
// render black without real lights — these only affect the model.
const pspKeyLight = new THREE.DirectionalLight(0xffffff, 1.0);
pspKeyLight.position.set(3, 4, 5);
scene.add(pspKeyLight);
const pspRimLight = new THREE.DirectionalLight(CONFIG.palette.gold, 0.6);
pspRimLight.position.set(-4, 1.5, -3);
scene.add(pspRimLight);
const pspAmbient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(pspAmbient);

/* ═══════════════════════════════════════════════════════════════════════
   ATMOSPHERE — motes that ride with the camera
   ═══════════════════════════════════════════════════════════════════════ */
function buildMotes() {
  const count = TIER.motes;
  const pos  = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = Math.random() * 2 - 1;
    pos[i * 3 + 1] = Math.random() * 2 - 1;
    pos[i * 3 + 2] = Math.random() * 2 - 1;
    size[i] = 18 * (0.4 + Math.random());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(size, 1));

  const mat = new THREE.ShaderMaterial({
    ...POINT_MAT, depthTest: false,
    uniforms: {
      uTime: { value: 0 }, uResY: { value: innerHeight },
      uSpread: { value: 2.4 }, uNear: { value: 2.0 }, uFar: { value: 3.4 },
      uAlpha: { value: 0.45 },
      uColor: { value: COL.amber.clone() },
    },
    vertexShader: NOISE + /* glsl */`
      attribute float aSize;
      uniform float uTime, uResY, uSpread, uNear, uFar;
      varying float vA;
      void main(){
        vec3 p = position * uSpread;
        p += vec3(
          fbm(position * 1.3 + vec3(uTime * 0.05, 0.0, 0.0)),
          fbm(position * 1.3 + vec3(0.0, uTime * 0.04, 5.0)),
          fbm(position * 1.3 + vec3(9.0, 0.0, uTime * 0.05))
        ) * uSpread * 0.3;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float r = length(p);
        vA = (1.0 - smoothstep(uNear, uFar, r)) * smoothstep(0.0, 0.35, -mv.z);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(aSize * uResY / 900.0 / -mv.z, 1.0);
      }`,
    fragmentShader: SPRITE + /* glsl */`
      uniform vec3 uColor; uniform float uAlpha;
      varying float vA;
      void main(){
        float core;
        float s = sprite(gl_PointCoord, core);
        if (s < 0.0) discard;
        gl_FragColor = vec4(uColor, s * vA * uAlpha);
      }`,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

const field   = buildField();
const motes   = buildMotes();
scene.add(field, motes);

/* ═══════════════════════════════════════════════════════════════════════
   CEMETERY MODEL — replaces Field's point-cloud plane as Act 1's visual.
   Field itself is kept fully intact under the hood (camera-distance math
   and the cursor-wake raycasting both still reference it) — it's just
   never made visible anymore. This model fades in/out on the exact same
   curve Field used to (fieldAlpha/fieldOut), so the Act 1 → Act 2 timing
   is unaffected.

   All 8 of this model's materials are metalness:0 (no PBR-lighting issue
   like the PSP/emerge models had), and only 3 have any emissive baked in
   (Hazes, Luna the moon, Luz_Haz a light beam) — those look like genuine
   atmospheric design choices at modest values, not accidental full-bright
   materials, so they're left as-authored rather than reset to zero.
   ═══════════════════════════════════════════════════════════════════════ */
let cemeteryModel = null;
// Can't move the shared camera without also affecting Acts 2-3, so this
// shifts the model itself right instead, achieving the same visual effect
// as panning the camera left.
const CEMETERY_OFFSET_X = 5;
const cemeteryMaterials = [];

const cemeteryKeyLight = new THREE.DirectionalLight(0xdce8ff, 0.9); // cool moonlight tone
cemeteryKeyLight.position.set(-3, 6, 4);
scene.add(cemeteryKeyLight);
const cemeteryAmbient = new THREE.AmbientLight(0x2a3348, 0.5); // dim blue-grey night fill
scene.add(cemeteryAmbient);

new GLTFLoader().load(
  '/models/cemetery.glb',
  (gltf) => {
    const model = gltf.scene;

    // The Hazes/Luz_Haz/Luna meshes (light beam + moon) span an enormous
    // vertical range compared to the actual ground-level cemetery — using
    // the whole model's bounding box for scale/recenter put the ground
    // (where the gravestones are) far below where the camera looks,
    // which is why the beam was dominating the frame instead of the
    // graveyard. Scale and recenter on the structural meshes only.
    const ATMOSPHERIC_MATERIALS = new Set(['Hazes', 'Luz_Haz', 'Luna']);
    function groundOnlyBox(obj) {
      const b = new THREE.Box3();
      obj.traverse((child) => {
        if (child.isMesh && !ATMOSPHERIC_MATERIALS.has(child.material?.name)) {
          b.expandByObject(child);
        }
      });
      return b;
    }

    const rawBox = groundOnlyBox(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const targetSize = 16; // sized for the Act 1 camera distance (~6.2 * framing)
    const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z);
    model.scale.setScalar(scale);

    const box = groundOnlyBox(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);
    model.position.x += CEMETERY_OFFSET_X;

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material.transparent = true;
      child.material.opacity = 0;
      cemeteryMaterials.push(child.material);
    });

    model.visible = false;
    scene.add(model);
    cemeteryModel = model;
  },
  undefined,
  (err) => console.error('Failed to load /models/cemetery.glb', err)
);

/* ═══════════════════════════════════════════════════════════════════════
   THE SCROLL CLOCK — 0 → 2, one unit per act.
   ═══════════════════════════════════════════════════════════════════════ */
const tracks = [document.getElementById('t1'), document.getElementById('t3')];
const cardA  = document.getElementById('cardA');
const ov1El  = document.getElementById('ov1');
const ov3El  = document.getElementById('ov3');

/* ═══════════════════════════════════════════════════════════════════════
   HEADER — hides while actively scrolling, reappears once scrolling stops.
   Tracked per-frame against actual scrollY change rather than a native
   'scroll' listener, so it stays correct regardless of how Lenis is
   smoothing the underlying scroll position.
   ═══════════════════════════════════════════════════════════════════════ */
const headerEl = document.querySelector('.header');
let headerLastY = scrollY;
let headerIdleMs = 0;
const HEADER_IDLE_DELAY = 160; // ms of no scroll movement before it reappears

const scrollProgressFill = document.getElementById('scroll-progress-fill');

function setOverlay(el, o) {
  el.style.opacity = String(o);
  el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
}

let clock = 0, clockTarget = 0;
let intro = 0, introStart = 0, introRunning = false;
let outro = 0;

function readScroll() {
  const vh = innerHeight;
  const T1 = tracks[0].offsetHeight || vh * 2;
  const T2 = tracks[1].offsetHeight || vh * 2;
  const y = scrollY;

  // Two tracks now, each with its own height — previously this assumed a
  // uniform T across all three segments, which doesn't hold now that
  // there are only two and they're not guaranteed to match.
  clockTarget = clamp01(y / T1) + clamp01((y - T1) / T2);

  const cardTop = cardA.getBoundingClientRect().top + y;
  outro = clamp01((y + vh * 0.75 - cardTop) / (vh * 0.75));
}

const fieldOut     = c => smootherstep(smoothstep(0.15, 0.85, c));
const fieldAlpha   = c => 1 - fieldOut(c);
// PSP/lattice now occupies the second (not third) track — its thresholds
// are the originals shifted down by 1.0, preserving the same relative
// lead-in overlap the codebase already used elsewhere (content starting
// to reveal slightly before its "own" track begins).
const latticeIn    = c => smootherstep(smoothstep(0.80, 1.45, c));

/* ═══════════════════════════════════════════════════════════════════════
   POINTER
   ═══════════════════════════════════════════════════════════════════════ */
const pointer     = new THREE.Vector2(0, 0);   // NDC, eased
const pointerRaw  = new THREE.Vector2(0, 0);
let pointerEnergy = 0, pointerIdle = 0;
const POINTER_ON  = TIER.pointer && !REDUCED;

/* ═══════════════════════════════════════════════════════════════════════
   PSP INTERACTION — drag to inspect, springs back on release.
   Desktop/fine-pointer only: touch devices need drag gestures for
   scrolling, and TIER.pointer is already false below the 1024px tier for
   the same reason other pointer-driven effects are.
   ═══════════════════════════════════════════════════════════════════════ */
const pspRaycaster = new THREE.Raycaster();
const pspDragRot = { x: 0, y: 0 };      // eases back to (0,0) whenever not dragging
let pspDragging = false;
let pspLastPointer = { x: 0, y: 0 };
let pspHoverFade = 0; // eases toward 1 while actively dragging, 0 otherwise

function pspIntersectAt(clientX, clientY) {
  if (!pspModel) return null;
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -((clientY / innerHeight) * 2 - 1));
  pspRaycaster.setFromCamera(ndc, camera);
  const hits = pspRaycaster.intersectObject(pspModel, true);
  return hits.length ? hits[0] : null;
}

if (POINTER_ON) {
  addEventListener('pointerdown', (e) => {
    if (!pspModel || !pspModel.visible) return;
    const hit = pspIntersectAt(e.clientX, e.clientY);
    if (!hit) return;

    if (pspButtonMeshes.includes(hit.object)) {
      // Logged so the D-pad's specific mesh names can be identified by
      // testing — all 15 buttons trigger "next" for now since they're
      // generically named in the source file with no way to tell which
      // are the arrows without seeing the render.
      console.log('PSP button clicked:', hit.object.name);
      nextScreenPhoto();
      return;
    }

    pspDragging = true;
    pspLastPointer = { x: e.clientX, y: e.clientY };
  });

  addEventListener('pointermove', (e) => {
    if (!pspDragging) return;
    const dx = e.clientX - pspLastPointer.x;
    const dy = e.clientY - pspLastPointer.y;
    pspLastPointer = { x: e.clientX, y: e.clientY };
    pspDragRot.y += dx * 0.008;
    pspDragRot.x = clamp(pspDragRot.x + dy * 0.008, -1.1, 1.1);
  }, { passive: true });

  addEventListener('pointerup', () => { pspDragging = false; });
  addEventListener('pointercancel', () => { pspDragging = false; });
}

addEventListener('pointermove', e => {
  pointerRaw.x = (e.clientX / innerWidth) * 2 - 1;
  pointerRaw.y = -((e.clientY / innerHeight) * 2 - 1);
}, { passive: true });

const _ray = new THREE.Ray();
const _planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const fieldCursor = new THREE.Vector3(0, 0, 99);
const _hit = new THREE.Vector3();

const _planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const vortexCursor = new THREE.Vector3(0, 0, 0);

function stepPointer(dt) {
  pointer.lerp(pointerRaw, ease(0.12, dt));

  const moved = pointerRaw.distanceTo(pointer);
  pointerIdle = moved < 0.0008 ? pointerIdle + dt : 0;

  const drive = POINTER_ON ? clamp01(moved * 26) : 0;
  if (drive > pointerEnergy) pointerEnergy += (drive - pointerEnergy) * ease(0.1, dt);
  else pointerEnergy *= Math.pow(0.965, dt * 60);
  if (pointerIdle > 2.2 || !POINTER_ON) pointerEnergy *= Math.pow(0.9, dt * 60);

  if (!POINTER_ON) return;

  _ray.origin.copy(camera.position);
  _ray.direction.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();

  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(field.quaternion);
  _planeY.set(n, 0);
  if (_ray.intersectPlane(_planeY, _hit)) {
    field.worldToLocal(_hit);
    fieldCursor.lerp(_hit, ease(0.14, dt));       // viscous lag — the wake drags
  }

  if (_ray.intersectPlane(_planeZ, _hit)) vortexCursor.lerp(_hit, ease(0.12, dt));
}


/* ═══════════════════════════════════════════════════════════════════════
   LOADER — a streak field accelerating into warp
   ═══════════════════════════════════════════════════════════════════════ */
const loaderEl  = document.getElementById('loader');
const barEl     = document.getElementById('bar');
const pctEl     = document.getElementById('pct');
const loaderVideoEl = document.getElementById('loader-video');

if (loaderVideoEl) {
  if (REDUCED) {
    loaderVideoEl.pause();
  } else {
    loaderVideoEl.play().catch(() => {}); // autoplay can still be blocked in some browsers — harmless if so
  }
}

const { minMs, exitMs, introDelayMs } = CONFIG.loader;
let loaderDone = false, loaderReady = false, loaderExiting = false, loaderExitAt = 0;
const bootAt = performance.now();

const enterBtn = document.getElementById('loader-enter');
const loaderStatusEl = document.getElementById('loader-status');

function beginLoaderExit() {
  if (loaderExiting || !loaderReady) return;
  loaderExiting = true;
  // No extra hold here — clicking Enter is itself the "ready to proceed"
  // moment, unlike the old purely-automatic version which paused briefly
  // at 100% before continuing on its own.
  loaderExitAt = performance.now();
  enterBtn.classList.remove('is-ready');
}
enterBtn?.addEventListener('click', beginLoaderExit);

function stepLoader(now, dt) {
  if (loaderDone) return;

  if (!loaderExiting) {
    const pct = clamp01((now - bootAt) / minMs) * 100;
    barEl.style.width = pct + '%';
    pctEl.textContent = String(Math.floor(pct)).padStart(3, '0');

    if (pct >= 100 && !loaderReady) {
      loaderReady = true;
      if (loaderStatusEl) loaderStatusEl.textContent = 'Ready';
      enterBtn?.classList.add('is-ready');
    }
  } else if (now >= loaderExitAt) {
    const t = clamp01((now - loaderExitAt) / exitMs);
    loaderEl.style.opacity = String(1 - t);
    loaderEl.style.transform = `scale(${1 + t * 0.06})`;

    if (!introRunning && now - loaderExitAt >= introDelayMs) {
      introRunning = true;
      introStart = now;
    }
    if (t >= 1) {
      loaderDone = true;
      loaderEl.remove();
      return;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   LENIS — smooth scroll. Driven from OUR raf, called FIRST each frame.
   ═══════════════════════════════════════════════════════════════════════ */
const lenis = REDUCED ? null : new Lenis({ smoothWheel: true, autoRaf: false });

/* ═══════════════════════════════════════════════════════════════════════
   CARD VISUAL — a small standalone canvas so the card isn't dead space
   ═══════════════════════════════════════════════════════════════════════ */
const cardVisuals = [
  { canvasId: 'card-canvas', triggerId: 'cardA' },
  { canvasId: 'card-canvas-2', triggerId: 'cardSkillBridge' },
].map(({ canvasId, triggerId }) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const entry = { canvas, ctx, visible: false };
  const trigger = document.getElementById(triggerId);
  if (trigger) {
    new IntersectionObserver(([e]) => { entry.visible = e.isIntersecting; }, { threshold: 0 }).observe(trigger);
  }
  return entry;
}).filter(Boolean);

function drawCardInto(entry, elapsed) {
  if (!entry.visible || REDUCED) return;
  const { canvas, ctx } = entry;
  const dpr = Math.min(devicePixelRatio, 1.5);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = CONFIG.palette.base;
  ctx.fillRect(0, 0, w, h);

  const rows = 26;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y0 = h * (0.18 + t * 0.72);
    const [r, g, b] = streakColor(1 - t);
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.1 + (1 - t) * 0.35})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const u = x / w;
      const amp = h * 0.06 * (0.35 + t);
      const y = y0
        + Math.sin(u * 6.0 + elapsed * 0.5 + i * 0.35) * amp
        + Math.sin(u * 13.0 - elapsed * 0.32 + i * 0.6) * amp * 0.4;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawCard(elapsed) {
  for (const entry of cardVisuals) drawCardInto(entry, elapsed);
}

/* ═══════════════════════════════════════════════════════════════════════
   EMERGE — was a 2D-canvas dot-sphere; replaced with a loaded glTF model.
   This canvas was always separate from the main WebGL scene, so this runs
   its own dedicated Three.js renderer/scene/camera targeting it — no
   scroll-clock choreography needed here, just fade-in-when-visible and a
   slow idle spin.
   ═══════════════════════════════════════════════════════════════════════ */
const emergeCanvas = document.getElementById('emerge-canvas');
let emergeVisible = false;
new IntersectionObserver(([e]) => { emergeVisible = e.isIntersecting; }, { threshold: 0 })
  .observe(document.getElementById('about'));

const emergeRenderer = new THREE.WebGLRenderer({ canvas: emergeCanvas, alpha: true, antialias: true });
emergeRenderer.setPixelRatio(Math.min(devicePixelRatio, TIER.dpr));
emergeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
emergeRenderer.outputColorSpace = THREE.SRGBColorSpace;

const emergeScene = new THREE.Scene();
const emergeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
emergeCamera.position.set(0, 0, 9);

// Same lesson as the PSP model: the point systems compute color in their
// own shaders and never needed lights, but a loaded glTF with a metallic
// material renders black without them.
const emergeKeyLight = new THREE.DirectionalLight(0xffffff, 1.0);
emergeKeyLight.position.set(3, 4, 5);
emergeScene.add(emergeKeyLight);
const emergeRimLight = new THREE.DirectionalLight(CONFIG.palette.gold, 0.6);
emergeRimLight.position.set(-4, 1.5, -3);
emergeScene.add(emergeRimLight);
const emergeAmbient = new THREE.AmbientLight(0xffffff, 0.35);
emergeScene.add(emergeAmbient);

let emergeModel = null;
const emergeModelMaterials = [];

// Best-effort orientation — the 180° Z-flip is a confident change (rotating
// around the axis pointing at the camera flips top/bottom while keeping the
// same face toward the viewer, which is what "hang it from the ceiling"
// needs). The X/Y corrections are guesses on top of that for straightening
// it into a direct front view — "facing sideways" means we're seeing an
// edge/profile rather than the face, which is a Y-axis (turning left/right)
// problem rather than X (tilting up/down). I can't render this to verify,
// so these may need further adjusting once actually seen.
const EMERGE_FLIP_Z = Math.PI - 0.08; // was exactly Math.PI — small delta added for "tilt left a bit"
const EMERGE_FRONT_CORRECTION_X = -0.06; // small delta added for "tilt up a bit"
const EMERGE_FRONT_CORRECTION_Y = Math.PI / 2 - 0.2; // nudged further to face more left, per request — flip the sign on the "- 0.2" if it turned the wrong way
// Nudge on top of the automatic recentering — positive X moves it right on
// screen, negative Y moves it down (camera looks straight down -Z by
// default, so world axes map directly to screen directions here).
// The canvas now spans the full grid width (text + gap + visual columns),
// but the "blank space" we want the model centered in is really just the
// visual column's portion of that — roughly the right ~54% of the total
// width, centered around ~74% across. At the current frustum width (~13.2
// units, from a 16:9 aspect at this camera distance/FOV), that works out
// to about 3.2 units right of the whole box's center.
const EMERGE_OFFSET_X = 4.1;
const EMERGE_OFFSET_Y = -1.8;

// Screen content is now the real video the user provided, via a hidden
// <video> element feeding a THREE.VideoTexture. Its UVs occupy a
// sub-rectangle of the shared texture atlas (roughly u:0.35-1.0,
// v:0.001-0.367), so — same lesson as the PSP's screen — the UVs get
// remapped to the full 0-1 range below so the video fits edge-to-edge
// instead of showing through a small cropped slice.
//
// Visually hidden rather than display:none — some browsers pause video
// decode/texture updates on fully display:none elements, so this uses an
// off-screen-but-still-"rendered" approach instead.
const emergeVideoEl = document.createElement('video');
emergeVideoEl.src = '/videos/screen-video.mp4';
emergeVideoEl.muted = true;      // required for autoplay in every browser
emergeVideoEl.loop = true;
emergeVideoEl.playsInline = true;
emergeVideoEl.autoplay = true;
emergeVideoEl.style.cssText = 'position:fixed; width:1px; height:1px; opacity:0; pointer-events:none;';
document.body.appendChild(emergeVideoEl);
if (!REDUCED) {
  emergeVideoEl.play().catch(() => {}); // autoplay can still be blocked in some browsers — harmless if so
}

const emergeScreenTexture = new THREE.VideoTexture(emergeVideoEl);
emergeScreenTexture.colorSpace = THREE.SRGBColorSpace;
emergeScreenTexture.flipY = false; // matches glTF UV convention, same lesson as the PSP screen
// The screen mesh itself is physically upside-down (the whole model is
// flipped 180° for the ceiling-mounted look), so the video reads upside
// down too unless counter-rotated here at the texture level.
emergeScreenTexture.center.set(0.5, 0.5);
emergeScreenTexture.rotation = Math.PI;

const emergeLoader = new GLTFLoader();
emergeLoader.load(
  '/models/futuristic_screen_v2.glb',
  (gltf) => {
    const model = gltf.scene;

    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const targetSize = 21; // a little bigger, per request
    const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z);
    model.scale.setScalar(scale);

    // Rotation BEFORE recentering — Three.js composes an object's transform
    // as scale, then rotate, then translate. Computing the recenter offset
    // first and rotating afterward (the previous order) doesn't account for
    // the rotation at all, throwing the result off by a real, calculable
    // amount — this is what was pushing it down to the bottom instead of
    // centered. Same category of bug as the earlier PSP scale-order issue.
    model.rotation.z = EMERGE_FLIP_Z;
    model.rotation.x = EMERGE_FRONT_CORRECTION_X;
    model.rotation.y = EMERGE_FRONT_CORRECTION_Y;

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);
    model.position.x += EMERGE_OFFSET_X;
    model.position.y += EMERGE_OFFSET_Y;

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material.transparent = true;
      child.material.opacity = 0;
      // Source file has emissive:[1,1,1] and metalness:1 baked in — same
      // pattern as the PSP model, same fix, applied to every mesh.
      child.material.emissive = new THREE.Color(0x000000);
      child.material.emissiveIntensity = 0;
      child.material.metalness = 0.35;
      child.material.roughness = 0.6;

      if (child.name === 'screen') {
        // Shares its material with the stand — clone a dedicated one so
        // only the screen gets the glow texture, same lesson as the PSP.
        child.material = child.material.clone();
        child.material.color = new THREE.Color(0xffffff);
        child.material.map = emergeScreenTexture;
        child.material.emissive = new THREE.Color(0xffffff);
        child.material.emissiveMap = emergeScreenTexture;
        child.material.emissiveIntensity = 0.5;

        // UVs occupy roughly u:0.35-1.0, v:0.001-0.367 of the shared atlas
        // — remap to the full 0-1 range so the texture fits edge-to-edge
        // rather than showing through a small cropped slice.
        const uv = child.geometry.attributes.uv;
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          if (u < uMin) uMin = u;
          if (u > uMax) uMax = u;
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
        const uRange = uMax - uMin || 1;
        const vRange = vMax - vMin || 1;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, (uv.getX(i) - uMin) / uRange, (uv.getY(i) - vMin) / vRange);
        }
        uv.needsUpdate = true;
      }

      emergeModelMaterials.push(child.material);
    });

    model.visible = false;
    emergeScene.add(model);
    emergeModel = model;
  },
  undefined,
  (err) => console.error('Failed to load /models/futuristic_screen.glb', err)
);

let emergeLastW = 0, emergeLastH = 0;
function resizeEmergeRenderer() {
  const w = emergeCanvas.clientWidth, h = emergeCanvas.clientHeight;
  if (!w || !h || (w === emergeLastW && h === emergeLastH)) return;
  emergeLastW = w; emergeLastH = h;
  emergeRenderer.setSize(w, h, false);
  emergeCamera.aspect = w / h;
  emergeCamera.updateProjectionMatrix();
}

/* --- drag to inspect — clamped to a limited range, springs back on release,
   desktop/fine-pointer only (same reasoning as the PSP: touch needs drag
   gestures for scrolling). Scoped directly to the emerge canvas element,
   which is a normal small DOM box rather than a full-viewport overlay, so
   no raycasting is needed to tell "did this click land on the model." --- */
const emergeDragRot = { x: 0, y: 0 };
let emergeDragging = false;
let emergeLastPointer = { x: 0, y: 0 };
const EMERGE_DRAG_LIMIT = 0.12; // radians — reverted per request

if (TIER.pointer && !REDUCED) {
  emergeCanvas.style.cursor = 'grab';
  emergeCanvas.addEventListener('pointerdown', (e) => {
    if (!emergeModel || !emergeModel.visible) return;
    // Without this, a click-drag over the canvas also kicks off the
    // browser's native text-selection drag gesture across the whole page —
    // this is what was highlighting the About text in blue during drag.
    e.preventDefault();
    emergeDragging = true;
    emergeLastPointer = { x: e.clientX, y: e.clientY };
    emergeCanvas.style.cursor = 'grabbing';
  });
  addEventListener('pointermove', (e) => {
    if (!emergeDragging) return;
    const dx = e.clientX - emergeLastPointer.x;
    const dy = e.clientY - emergeLastPointer.y;
    emergeLastPointer = { x: e.clientX, y: e.clientY };
    emergeDragRot.y = clamp(emergeDragRot.y + dx * 0.006, -EMERGE_DRAG_LIMIT, EMERGE_DRAG_LIMIT);
    emergeDragRot.x = clamp(emergeDragRot.x + dy * 0.006, -EMERGE_DRAG_LIMIT, EMERGE_DRAG_LIMIT);
  }, { passive: true });
  addEventListener('pointerup', () => {
    emergeDragging = false;
    emergeCanvas.style.cursor = 'grab';
  });
  addEventListener('pointercancel', () => { emergeDragging = false; });
}

function drawEmerge(elapsed, dt) {
  if (!emergeModel) return;
  emergeModel.visible = emergeVisible;
  if (!emergeVisible) return;

  resizeEmergeRenderer();

  const fadeTarget = 1;
  for (const m of emergeModelMaterials) {
    m.opacity += (fadeTarget - m.opacity) * 0.05;
  }

  // No auto-rotation — holds its fixed front-facing orientation. Drag
  // offset eases back to zero whenever not actively dragging.
  if (!emergeDragging) {
    emergeDragRot.x += (0 - emergeDragRot.x) * ease(0.1, dt);
    emergeDragRot.y += (0 - emergeDragRot.y) * ease(0.1, dt);
  }
  emergeModel.rotation.x = EMERGE_FRONT_CORRECTION_X + emergeDragRot.x;
  emergeModel.rotation.y = EMERGE_FRONT_CORRECTION_Y + emergeDragRot.y;
  emergeModel.rotation.z = EMERGE_FLIP_Z;

  emergeRenderer.render(emergeScene, emergeCamera);
}

/* ═══════════════════════════════════════════════════════════════════════
   RESIZE
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   POINTER TRACER — a fading white line trail following the cursor.
   Desktop/fine-pointer only, same reasoning as other pointer-driven effects
   (touch has no persistent hover cursor to trace), and respects reduced
   motion since a moving trail is decorative animation.
   ═══════════════════════════════════════════════════════════════════════ */
const tracerCanvas = document.getElementById('pointer-tracer');
const tracerCtx = tracerCanvas.getContext('2d');
const tracerPoints = []; // { x, y, t }
const TRACER_LIFETIME = 260; // ms — how long a point stays in the trail

const clickFlashes = []; // { x, y, t }
const FLASH_LIFETIME = 380; // ms

function resizeTracer() {
  const dpr = Math.min(devicePixelRatio, 2);
  tracerCanvas.width = Math.round(innerWidth * dpr);
  tracerCanvas.height = Math.round(innerHeight * dpr);
  tracerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

if (TIER.pointer && !REDUCED) {
  addEventListener('pointermove', (e) => {
    tracerPoints.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  }, { passive: true });
}

// Click flash — works for touch taps too, not just mouse, since it's
// feedback for the click itself rather than a continuous hover effect.
if (!REDUCED) {
  addEventListener('pointerdown', (e) => {
    clickFlashes.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  }, { passive: true });
}

function drawClickFlashes(now) {
  while (clickFlashes.length && now - clickFlashes[0].t > FLASH_LIFETIME) clickFlashes.shift();
  for (const f of clickFlashes) {
    const age = clamp01((now - f.t) / FLASH_LIFETIME); // 0 = just clicked, 1 = fully faded
    const radius = 4 + age * 22;
    const alpha = (1 - age) * 0.8;
    const grad = tracerCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
    grad.addColorStop(0, `rgba(242,242,242,${alpha})`);
    grad.addColorStop(1, 'rgba(242,242,242,0)');
    tracerCtx.fillStyle = grad;
    tracerCtx.beginPath();
    tracerCtx.arc(f.x, f.y, radius, 0, 6.2832);
    tracerCtx.fill();
  }
}

function drawPointerTracer(now) {
  tracerCtx.clearRect(0, 0, innerWidth, innerHeight);
  drawClickFlashes(now);

  if (!TIER.pointer || REDUCED) return;
  while (tracerPoints.length && now - tracerPoints[0].t > TRACER_LIFETIME) tracerPoints.shift();
  if (tracerPoints.length < 2) return;

  tracerCtx.lineCap = 'round';
  tracerCtx.lineJoin = 'round';
  for (let i = 1; i < tracerPoints.length; i++) {
    const p0 = tracerPoints[i - 1], p1 = tracerPoints[i];
    const age = clamp01((now - p1.t) / TRACER_LIFETIME); // 0 = fresh, 1 = about to expire
    const alpha = (1 - age) * 0.8;
    const width = (1 - age) * 2.2 + 0.3;
    tracerCtx.strokeStyle = `rgba(242,242,242,${alpha})`;
    tracerCtx.lineWidth = width;
    tracerCtx.beginPath();
    tracerCtx.moveTo(p0.x, p0.y);
    tracerCtx.lineTo(p1.x, p1.y);
    tracerCtx.stroke();
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  backdrop.material.uniforms.uAspect.value = w / h;
  motes.material.uniforms.uResY.value = h;
  lenis?.resize();
  resizeTracer();
}
addEventListener('resize', resize);
resize();

/* ═══════════════════════════════════════════════════════════════════════
   THE FRAME
   ═══════════════════════════════════════════════════════════════════════ */
const frameBudget = 1000 / TIER.fps;
let lastFrame = 0, lastTime = performance.now();
const start = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  lenis?.raf(now);

  if (document.hidden) { lastTime = now; return; }

  if (now - lastFrame < frameBudget - 1) return;
  lastFrame = now;

  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const elapsed = (now - start) / 1000;

  stepLoader(now, dt);
  drawPointerTracer(now);

  if (introRunning) {
    const t = clamp01((now - introStart) / CONFIG.scene.introMs);
    intro = 1 - Math.pow(1 - t, 3);                 // easeOutCubic
  }
  if (REDUCED) intro = 1;

  readScroll();
  const d = clockTarget - clock;
  clock = Math.abs(d) < 0.00005 ? clockTarget : clock + d * ease(TIER.lerp, dt);

  if (scrollProgressFill) {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollProgressFill.style.transform = `scaleX(${clamp01(scrollY / maxScroll)})`;
  }

  if (!REDUCED && headerEl) {
    if (emergeDragging) {
      headerEl.classList.add('header-hidden');
      headerIdleMs = 0;
    } else if (Math.abs(scrollY - headerLastY) > 0.5) {
      headerEl.classList.add('header-hidden');
      headerIdleMs = 0;
    } else {
      headerIdleMs += dt * 1000;
      if (headerIdleMs > HEADER_IDLE_DELAY) headerEl.classList.remove('header-hidden');
    }
    headerLastY = scrollY;
  }

  stepPointer(dt);

  for (const g of clockGated) {
    if (g.once) {
      // The very first reveal waits for the intro timer, not the clock.
      // After that, it behaves like any other clock-gated section — otherwise
      // scrolling back up leaves the text permanently hidden even though the
      // overlay's own opacity has faded back in.
      if (!g.played) {
        if (intro > 0.02) { g.reveal.play(true); g.played = true; }
      } else {
        g.reveal.play(clock > g.from && clock < g.to);
      }
    } else {
      g.reveal.play(clock > g.from && clock < g.to);
    }
  }

  pspHoverFade += ((pspDragging ? 1 : 0) - pspHoverFade) * ease(0.15, dt);

  const ov3Opacity = smoothstep(1.1, 1.6, clock) * (1 - smoothstep(0.0, 0.45, outro)) * (1 - pspHoverFade * 0.85);
  setOverlay(ov1El, intro * (1 - smoothstep(0.06, 0.3, clock)));
  setOverlay(ov3El, ov3Opacity);

  const fOut   = fieldOut(clock);
  const fAlpha = fieldAlpha(clock) * intro * (1 - outro);
  const lIn    = latticeIn(clock);
  const latOut = smoothstep(0.3, 1.0, outro);

  const bd = backdrop.material.uniforms;
  bd.uTime.value = elapsed;
  bd.uAmt.value  = lerp(0.34, 0.16, lIn); // was vortex-driven; substituted with PSP's own presence curve

  field.visible = false; // visuals replaced by the cemetery model — wake/camera logic below still runs
  {
    const u = field.material.uniforms;
    u.uTime.value = elapsed;
    u.uAssemble.value = intro;
    u.uOut.value = fOut;
    u.uAlpha.value = fAlpha;
    u.uEnergy.value = pointerEnergy;
    u.uCursor.value.copy(fieldCursor);
    field.position.y = -2.4 + fOut * 2.4;
    field.rotation.x = -0.5 + fOut * 0.3;
    field.rotation.y = Math.sin(elapsed * 0.08) * 0.06;
  }

  if (cemeteryModel) {
    cemeteryModel.visible = fAlpha > 0.002;
    if (cemeteryModel.visible) {
      for (const m of cemeteryMaterials) m.opacity += (fAlpha - m.opacity) * 0.15;
      cemeteryModel.rotation.y = Math.sin(elapsed * 0.05) * 0.03; // faint idle drift, matching field's subtlety
    }
  }

  if (pspModel) {
    pspModel.visible = lIn > 0.002 && outro < 0.995;

    // Only accept clicks/drags on the model itself, and only while it's
    // actually the thing on screen — otherwise this would swallow pointer
    // events meant for the Field/Vortex acts or the page content beneath.
    canvas.style.pointerEvents = pspModel.visible && POINTER_ON ? 'auto' : 'none';

    if (pspModel.visible) {
      const alpha = lIn * (1 - smoothstep(0.6, 1.0, outro));
      for (const m of pspMaterials) m.opacity = alpha;

      // Ease the drag offset back to zero whenever the pointer isn't
      // actively dragging — this is the "springs back to start" behavior.
      if (!pspDragging) {
        pspDragRot.x += (0 - pspDragRot.x) * ease(0.1, dt);
        pspDragRot.y += (0 - pspDragRot.y) * ease(0.1, dt);
      }

      pspModel.rotation.y = pointer.x * 0.18 + pspDragRot.y;
      pspModel.rotation.x = -pointer.y * 0.12 + pspDragRot.x;
      // Position is set once at load time (recentered on its bounding-box
      // middle) and deliberately left alone here — this used to get reset
      // to (0,0,0) every frame, which silently undid that recentering and
      // is what was actually causing the off-center appearance.
      pspModel.scale.setScalar(pspBaseScale);
    }
  }

  motes.position.copy(camera.position);
  const mu = motes.material.uniforms;
  mu.uTime.value = elapsed * 6;
  mu.uSpread.value = 2.4;
  mu.uNear.value   = 2.0;
  mu.uFar.value    = 3.4;
  mu.uAlpha.value  = 0.45 * intro;

  const introEase = 1 - Math.pow(1 - intro, 2);
  const framing = clamp(1.5 / Math.max(camera.aspect, 0.45), 1.0, 1.9);
  const targetZ   = CONFIG.field.cameraZ * framing + (1 - introEase) * INTRO_DOLLY;
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 7);

  const sway = 0.4;
  camera.position.x += (pointer.x * sway * introEase - camera.position.x) * Math.min(1, dt * 3);
  camera.position.y += (pointer.y * sway * 0.5 * introEase - camera.position.y) * Math.min(1, dt * 3);
  camera.lookAt(0, 0, 0);

  drawCard(elapsed);
  drawEmerge(elapsed, dt);

  if (DEBUG) {
    window.MERIDIAN = {
      clock: +clock.toFixed(3), outro: +outro.toFixed(3), intro: +intro.toFixed(3),
      field:   { visible: field.visible,   alpha: +fAlpha.toFixed(3), out: +fOut.toFixed(3) },
      lattice: pspModel ? { visible: pspModel.visible, alpha: +(pspMaterials[0]?.opacity ?? 0).toFixed(3) } : { visible: false, loaded: false },
      cameraZ: +camera.position.z.toFixed(2),
    };
  }

  composer ? composer.render() : renderer.render(scene, camera);
}

requestAnimationFrame(frame);

// Start at the top — a reload mid-page with a scroll-driven scene is disorienting.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);
}
