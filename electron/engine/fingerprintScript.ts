import type { Profile } from '@shared/types'

/**
 * Builds the JS injected into every page via Page.addScriptToEvaluateOnNewDocument.
 * This is the JS-level layer, covering what CDP emulation cannot:
 * WebGL vendor/renderer, canvas + audio noise, navigator extras, fonts,
 * WebRTC policy and media device counts. Deterministic noise seeded per
 * profile keeps fingerprints stable across launches (like Incogniton's
 * per-profile canvas hash).
 */
export function buildFingerprintScript(profile: Profile): string {
  const cfg = JSON.stringify({
    seed: hashTo32(profile.id),
    platform: profile.navigator.platform,
    languages: profile.navigator.languages,
    hardwareConcurrency: profile.navigator.hardwareConcurrency,
    deviceMemory: profile.navigator.deviceMemory,
    screen: profile.screen,
    webgl: profile.webgl,
    canvas: profile.canvas,
    audio: profile.audio,
    webrtc: profile.webrtc,
    media: profile.media,
    fonts: profile.fonts
  })
  return `(function(){try{
const cfg = ${cfg};
// ---- deterministic PRNG seeded per profile ----
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const rand = mulberry32(cfg.seed);

// ---- navigator ----
const navProps = {
  platform: cfg.platform,
  hardwareConcurrency: cfg.hardwareConcurrency,
  deviceMemory: cfg.deviceMemory
};
for (const [k, v] of Object.entries(navProps)) {
  try { Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true }); } catch (e) {}
}
try {
  Object.defineProperty(Navigator.prototype, 'languages', { get: () => Object.freeze([...cfg.languages]), configurable: true });
} catch (e) {}

// ---- screen ----
try {
  const sp = { width: cfg.screen.width, height: cfg.screen.height };
  Object.defineProperty(screen, 'width', { get: () => sp.width, configurable: true });
  Object.defineProperty(screen, 'height', { get: () => sp.height, configurable: true });
  Object.defineProperty(screen, 'availWidth', { get: () => sp.width, configurable: true });
  Object.defineProperty(screen, 'availHeight', { get: () => sp.height - 40, configurable: true });
  Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
  Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
} catch (e) {}

// ---- canvas noise (deterministic per profile) ----
if (cfg.canvas === 'noise') {
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  function noiseCanvas(canvas){
    try {
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const w = canvas.width, h = canvas.height; if (!w || !h) return;
      const img = origGetImageData.call(ctx, 0, 0, w, h);
      const d = img.data;
      // subtle per-pixel perturbation of the alpha-channel LSB region;
      // invisible to humans, changes every fingerprint hash, stable per profile
      for (let i = 0; i < d.length; i += 4) {
        d[i] = (d[i] + ((rand() * 2) | 0)) & 0xff;
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) {}
  }
  HTMLCanvasElement.prototype.toDataURL = function(...args){
    noiseCanvas(this); return origToDataURL.apply(this, args);
  };
  HTMLCanvasElement.prototype.toBlob = function(...args){
    noiseCanvas(this); return origToBlob.apply(this, args);
  };
}

// ---- WebGL vendor/renderer + extension filtering ----
const UNMASKED_VENDOR = 0x9245, UNMASKED_RENDERER = 0x9246;
for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
  const orig = proto.getParameter;
  proto.getParameter = function(p){
    if (p === UNMASKED_VENDOR) return cfg.webgl.vendor;
    if (p === UNMASKED_RENDERER) return cfg.webgl.renderer;
    if (p === 0x1F00) return cfg.webgl.vendor;   // VENDOR
    if (p === 0x1F01) return cfg.webgl.renderer; // RENDERER
    return orig.call(this, p);
  };
}

// ---- audio context noise ----
if (cfg.audio === 'noise') {
  const origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
  AnalyserNode.prototype.getFloatFrequencyData = function(array){
    origGetFloat.call(this, array);
    for (let i = 0; i < array.length; i++) array[i] += (rand() - 0.5) * 1e-7;
  };
}

// ---- WebRTC policy ----
if (cfg.webrtc === 'disabled') {
  window.RTCPeerConnection = undefined;
  window.webkitRTCPeerConnection = undefined;
} else if (cfg.webrtc === 'public-only') {
  const Orig = window.RTCPeerConnection;
  if (Orig) {
    window.RTCPeerConnection = function(...args){
      const pc = new Orig(...args);
      const origCreate = pc.createOffer.bind(pc);
      pc.createOffer = function(...a){
        return origCreate(...a).then(desc => {
          if (desc && desc.sdp) {
            desc.sdp = desc.sdp.split('\\r\\n').filter(l => !l.includes('.local') && !/typ host/.test(l) || l.includes('raddr 0.0.0.0')).join('\\r\\n');
          }
          return desc;
        });
      };
      return pc;
    };
  }
}

// ---- media devices ----
try {
  const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async function(){
    const devs = await origEnum();
    const out = [];
    let vi = 0, ai = 0, ao = 0;
    for (const d of devs) {
      if (d.kind === 'videoinput' && vi < cfg.media.videoInputs) { out.push(d); vi++; }
      if (d.kind === 'audioinput' && ai < cfg.media.audioInputs) { out.push(d); ai++; }
      if (d.kind === 'audiooutput' && ao < cfg.media.audioOutputs) { out.push(d); ao++; }
    }
    return out;
  };
} catch (e) {}

// ---- fonts (best-effort: patch document.fonts.check) ----
if (cfg.fonts.mode === 'custom' && cfg.fonts.list.length) {
  const allowed = new Set(cfg.fonts.list);
  const origCheck = document.fonts.check.bind(document.fonts);
  document.fonts.check = (font, text) => allowed.has(font) ? origCheck(font, text) : false;
}
}catch(e){}})();`
}

function hashTo32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
