'use strict';
/* =====================================================================
   GULLET v1 — "a golden rosary drifting through the dark of a sleeping god"
   Single file, vanilla JS, zero dependencies. Sections:
     UTIL / RNG / SAVE / INPUT / BOOT / AUDIO / GEN / SIM / RENDER / UI / MAIN
   Iron rule: SIM never touches DOM/canvas; RENDER never mutates state.
   Headless: if `document` is undefined, BOOT skips canvas and only the
   GULLET hooks (Sim/newRun/step/state) are exposed for bot harnesses.
   ===================================================================== */

/* ============================ UTIL ================================= */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function smoothstep(t){ t=clamp(t,0,1); return t*t*(3-2*t); }
function dist2(ax,ay,bx,bx2){ var dx=ax-bx,dy=ay-bx2; return dx*dx+dy*dy; }
/* Deterministic RNG streams (mulberry32). Separate streams: gen/cosmetic. */
function mulberry32(seed){
  var a = seed>>>0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a>>>15), 1 | a);
    t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}
function hashStr(s){ /* fnv1a -> uint32, for daily seeds */
  var h = 0x811c9dc5;
  for(var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,0x01000193); }
  return h>>>0;
}
/* Cheap deterministic noise for flocking (sin-hash, no allocation). */
function snoise(x,y,t){
  var s = Math.sin(x*12.9898 + y*78.233 + t*1.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
var IS_NODE = (typeof document === 'undefined');

/* ============================ SAVE ================================= */
/* Key: gullet.save.v1. Versioned; corrupt -> fresh save, never crash. */
var SAVE_KEY = 'gullet.save.v1';
function defaultSave(){
  return {
    v: 1, checksum: 0,
    settings: { music: 0.8, sfx: 0.9, numeric: false, reducedMotion: false },
    unlocks: { appearances: ['gold'], trails: ['ember'], masks: ['needle'] },
    appearance: 'gold', trail: 'ember', mask: 'needle',
    records: { chapters: [0,0,0,0,0,0], runBest: 0, dailyBest: 0, dailyStreak: 0, lastDaily: '', longestStreak: 0, haunts: 0 },
    stats: { runs:0, deaths:0, deathCause:{}, deepest:0, spores:0, unbrokenRooms:0,
             wakeSum:[0,0,0,0,0,0], wakeN:[0,0,0,0,0,0], playtime:0, challenges:[] },
    secrets: { glands:[false,false,false,false,false,false], quiet:[false,false,false,false,false,false],
               messages:[], lullaby: 0, secondPulse:false, stillTag:false },
    sigils: [],                  /* mastery sigils kept (ids) */
    haunt: null,                 /* {depth, score} of the best run — a past self to outrun */
    weekly: null,                /* {seed, dreamSeed, shards, done} — the deep dream */
    furthest: 0,                 /* furthest chapter index unlocked */
    checkpoint: null,            /* {ch, room, motes, wake, score, depth} */
    firstDeathSeen: false,
    preseed: true
  };
}
function saveChecksum(s){
  /* BH-09: checkpoint is part of the checksum (validated on load) */
  var str = JSON.stringify([s.settings,s.unlocks,s.records,s.stats,s.secrets,s.furthest,s.checkpoint]);
  var h = 0;
  for(var i=0;i<str.length;i++){ h = (Math.imul(h,31) + str.charCodeAt(i)) | 0; }
  return h>>>0;
}
var _store = null;
function getStore(){
  if(_store) return _store;
  try{
    if(typeof localStorage !== 'undefined'){ _store = localStorage; return _store; }
  }catch(e){}
  /* memory fallback (private mode / headless) */
  var mem = {};
  _store = {
    getItem: function(k){ return (k in mem) ? mem[k] : null; },
    setItem: function(k,v){ mem[k]=String(v); },
    removeItem: function(k){ delete mem[k]; }
  };
  return _store;
}
function loadSave(){
  var sv = defaultSave();
  try{
    var raw = getStore().getItem(SAVE_KEY);
    if(!raw) return sv;
    var p = JSON.parse(raw);
    if(!p || p.v !== 1) return sv;               /* migrate-or-reset: reset */
    /* shallow-merge known sections so missing fields can't crash */
    for(var k in sv){ if(p[k] !== undefined) sv[k] = p[k]; }
    if(saveChecksum(sv) !== p.checksum){ /* tampered/corrupt -> fresh */
      try{ console.log('[gullet] save checksum mismatch; starting fresh'); }catch(e){}
      return defaultSave();
    }
    /* normalize retention fields added after v1 saves existed (post-checksum:
       checksum-covered objects must validate exactly as stored) */
    if(!sv.records) sv.records = {};
    if(sv.records.haunts === undefined) sv.records.haunts = 0;
    if(sv.records.longestStreak === undefined) sv.records.longestStreak = 0;
    if(!sv.sigils) sv.sigils = [];
    if(sv.haunt === undefined) sv.haunt = null;
    if(sv.weekly === undefined) sv.weekly = null;
  }catch(e){
    try{ console.log('[gullet] save parse failed; starting fresh'); }catch(e2){}
    return defaultSave();
  }
  return sv;
}
var _saveTimer = 0;
function writeSave(sv){
  try{
    sv.checksum = saveChecksum(sv);
    getStore().setItem(SAVE_KEY, JSON.stringify(sv));
  }catch(e){ /* storage full/blocked: play on, saves just don't persist */ }
}
function requestSave(sv){ _saveTimer = 1; }   /* debounced 250ms in MAIN */
/* Pre-seeded nerve messages (the god's past selves). */
var PRESEED_MSGS = [
  'IT DREAMS OF RAIN', 'SOMEONE ELSE WAS GOLD', 'THE THROAT REMEMBERS SWALLOWING', 'SHE SANG FIRST',
  'YOUR LIGHT TICKLES', 'IT MISSES THE RAIN', 'THE EYE DREAMS OF OPENING', 'IT WAS SMALL ONCE',
  'IT IS ALMOST MORNING', 'YOU WERE THE DREAM IT NEEDED', 'THE GOLD REMEMBERS BEING HELD',
  'IT KNOWS YOUR WEIGHT NOW', 'SOMEONE LEFT LIGHT HERE'
];

/* ============================ INPUT ================================= */
/* One touch, one axis. `held` = constrict; position = swarm target.
   touchstart sets held synchronously (worst case <16ms touch-to-sim). */
var input = {
  held: false, tx: 0, ty: 0,   /* target in world pt (set from screen) */
  sx: 0, sy: 0,                /* last screen pt */
  hasTouch: false,             /* finger currently down */
  justTouched: false,          /* consumed by UI for audio unlock */
  flickT: -10,                 /* last constrict-direction change time */
  touchId: null                /* tracked touch identifier (multi-touch safe) */
};
var _touchStartT = 0;
var _twoFingerT = 0;   /* P2-10: two-finger DOWN timestamp; 0 = no two-finger gesture in flight */
function screenToWorld(sx, sy){
  /* camera lives in view; view provides worldFromScreen */
  return view.worldFromScreen(sx, sy);
}
function bindInput(canvas){
  function posOf(t){
    var r = canvas.getBoundingClientRect();
    return [t.clientX - r.left, t.clientY - r.top];
  }
  canvas.addEventListener('touchstart', function(e){
    e.preventDefault();
    /* P2-10: two-finger DOWN starts the tap window — the pause fires only on the
       matching two-finger UP within 300ms (see end()); a held press never pauses */
    if(e.touches.length >= 2){
      if(_twoFingerT === 0) _twoFingerT = performance.now();
      input.touchId = null; input.hasTouch = false; setHeld(false);
      return;
    }
    var t = e.changedTouches[0];
    if(input.touchId !== null && t.identifier !== input.touchId) return;  /* track one finger */
    input.touchId = t.identifier;
    var p = posOf(t);
    if(typeof routeTouch === 'function' && routeTouch(p[0], p[1])) return;
    input.sx = p[0]; input.sy = p[1];
    var w = screenToWorld(p[0], p[1]);
    input.tx = w[0]; input.ty = w[1];
    input.hasTouch = true; input.justTouched = true;
    _touchStartT = performance.now();
    setHeld(true);

  }, {passive:false});
  canvas.addEventListener('touchstart', function(e){
    if(gameMode === 'custom' || gameMode === 'records'){
      var tt = e.changedTouches[0], pp = posOf(tt);
      customStartY = pp[1];
      customStartScroll = (gameMode === 'custom') ? customScroll : recordsScroll;
    }
  }, {passive:true});
  canvas.addEventListener('touchmove', function(e){
    e.preventDefault();
    var t = e.changedTouches[0];
    if(input.touchId !== null && t.identifier !== input.touchId) return;  /* ignore stray fingers */
    var p = posOf(t);
    if(gameMode === 'custom'){
      customScroll = Math.max(0, Math.min(customMax, customStartScroll - (p[1]-customStartY)));
      return;
    }
    if(gameMode === 'records'){
      recordsScroll = Math.max(0, Math.min(recordsMax, customStartScroll - (p[1]-customStartY)));
      return;
    }
    input.sx = p[0]; input.sy = p[1];
    var w = screenToWorld(p[0], p[1]);
    input.tx = w[0]; input.ty = w[1];
    input.hasTouch = true;
  }, {passive:false});
  function end(e){
    e.preventDefault();
    /* P2-10: two-finger tap = pause — both fingers must lift within 300ms of the
       two-finger down; a held two-finger press cancels instead of pausing */
    if(_twoFingerT > 0){
      if(e.touches.length === 0){
        var tapMs = performance.now() - _twoFingerT;
        _twoFingerT = 0;
        input.touchId = null; input.hasTouch = false; setHeld(false);
        if(tapMs < 300 && gameMode === 'play') pauseGame(false);
      }
      return;   /* a finger is still down: wait for the other — no pause, no nudge */
    }
    var t = e.changedTouches[0];
    if(input.touchId !== null && t && t.identifier !== input.touchId) return;
    /* tap-to-nudge: quick tap (<200ms) while bloomed moves the disc to the tap point, no flicker */
    var dur = _touchStartT > 0 ? (performance.now() - _touchStartT)/1000 : 1;
    if(dur < 0.2 && sim && sim.s && sim.s.c < 0.3 && gameMode === 'play'){
      sim.s.cx = input.tx;
      sim.s.crossT = sim.s.time;   /* suppress the flicker rule for this release */
    }
    _touchStartT = 0;
    input.touchId = null;
    input.hasTouch = false;
    setHeld(false);
  }
  canvas.addEventListener('touchend', end, {passive:false});
  /* touchcancel = the OS took the gesture (call, notification): pause, don't drop */
  canvas.addEventListener('touchcancel', function(e){
    e.preventDefault();
    _twoFingerT = 0;   /* P2-10: a cancelled two-finger gesture is not a tap */
    input.touchId = null; input.hasTouch = false; setHeld(false);
    if(gameMode === 'play') pauseGame(true);
  }, {passive:false});
  /* mouse for desktop testing */
  var mouseDown = false;
  canvas.addEventListener('mousedown', function(e){
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    if(typeof routeTouch === 'function' && routeTouch(mx, my)) return;
    mouseDown = true;
    var r = canvas.getBoundingClientRect();
    input.sx = e.clientX - r.left; input.sy = e.clientY - r.top;
    var w = screenToWorld(input.sx, input.sy);
    input.tx = w[0]; input.ty = w[1];
    input.hasTouch = true; input.justTouched = true;
    setHeld(true);
  });
  canvas.addEventListener('mousemove', function(e){
    if(!mouseDown) return;
    var r = canvas.getBoundingClientRect();
    input.sx = e.clientX - r.left; input.sy = e.clientY - r.top;
    var w = screenToWorld(input.sx, input.sy);
    input.tx = w[0]; input.ty = w[1];
  });
  window.addEventListener('mouseup', function(){
    if(mouseDown){ mouseDown = false; input.hasTouch = false; setHeld(false); }
  });
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
  document.addEventListener('dblclick', function(e){ e.preventDefault(); }, {passive:false});
}
function setHeld(h){
  if(input.held === h) return;
  input.held = h;
  /* P1-9: ghost disc — on touch-begin while bloomed, the disc leaves a 300ms ghost */
  if(h && sim && sim.s && sim.s.mode === 'play' && smoothstep(sim.s.c) < 0.5){
    var gr = 0;
    for(var gi=0; gi<64; gi++){
      var gm = sim.s.motes[gi]; if(!gm.alive) continue;
      var gdx = gm.x - sim.s.cx, gdy = gm.y - sim.s.cy;
      var gd = Math.sqrt(gdx*gdx + gdy*gdy);
      if(gd > gr) gr = gd;
    }
    sim.s.ghostR = Math.max(20, Math.min(90, gr + 8));
    sim.s.ghostT = 0.3;
  }
  /* flicker tracking lives in SIM (needs sim time); UI/audio notified via hooks */
  if(typeof onHeldChange === 'function') onHeldChange(h);
}

/* ============================ BOOT ================================== */
var canvas = null, ctx = null;
var view = {
  W: 390, H: 844, dpr: 1,
  camY: 0, camX: 0,
  safeTop: 0, safeBottom: 0,
  worldFromScreen: function(sx, sy){ return [sx - this.W/2, sy + this.camY]; }
};
var save = null;
var landscapeHold = false;   /* mobile M8: landscape = overlay + soft-pause */
/* P0-16: the drawing buffer has ONE choke point. Both the boot resize and the
   thermal-degrade path go through here, so lowering view.dpr always re-fits
   the backing store (v2 rasterized into 75% of the buffer after throttling). */
function resizeBacking(){
  if(!canvas) return;
  canvas.width = Math.round(view.W * view.dpr);
  canvas.height = Math.round(view.H * view.dpr);
}
/* P0-17: render gating state — on 120Hz displays rAF fires 2x per sim step */
var _lastRender = 0;
function boot(){
  save = loadSave();
  if(IS_NODE) return;
  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d', { alpha: false });
  function resize(){
    var w = window.innerWidth, h = window.innerHeight;
    view.W = w; view.H = h;
    landscapeHold = w > h;   /* the god sleeps upright */
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);   /* DPR clamp 2 */
    resizeBacking();
    probeSafeArea();
    onResize();
  }
  /* mobile M9: safe-area probe is standalone + re-probed; transient 0 can never park UI */
  function probeSafeArea(){
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var st = parseFloat(cs.paddingTop) || 0, sb = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(probe);
    /* keep the last good reading through transient 0s; clamp safeTop>=20 */
    if(st > 0) view.safeTop = st;
    if(sb > 0) view.safeBottom = sb;
    if(view.safeTop < 20) view.safeTop = 20;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function(){
    setTimeout(resize, 120);
    setTimeout(probeSafeArea, 800);   /* M9: re-probe after the rotation transient */
  });
  resize();
  setTimeout(probeSafeArea, 800);   /* M9: insets may not be settled on first paint */
  bindInput(canvas);
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){ onHidden(); } else { onVisible(); }
  });
  audioInit();
}
/* Screen Wake Lock: the OS must not sleep mid-descent (mobile M6/M7) */
var _wakeLock = null;
function wakeLockAcquire(){
  try{
    if('wakeLock' in navigator && navigator.wakeLock && navigator.wakeLock.request){
      if(_wakeLock) return;
      navigator.wakeLock.request('screen').then(function(l){
        _wakeLock = l;
        l.addEventListener('release', function(){ _wakeLock = null; });
      }).catch(function(){});
    }
  }catch(e){}
}
function wakeLockRelease(){
  try{ if(_wakeLock){ _wakeLock.release(); _wakeLock = null; } }catch(e){}
}
function onResize(){ /* RENDER caches rebuilt lazily */ }
function onHidden(){
  wakeLockRelease();
  if(gameMode === 'play' || gameMode === 'dying'){ pauseGame(true); }
  audioSuspend();
}
function onVisible(){ audioResume(); wakeLockAcquire(); }

/* ============================ AUDIO ================================= */
/* Web Audio, all synthesized. Heartbeat is a scheduled oscillator (not a
   loop) so BPM changes are seamless; visuals read audio.beatPhase().
   M1: master clock + core SFX. M3 adds per-chamber motifs/layers. */
var audio = null;
function audioInit(){
  audio = makeAudio();
}
function makeAudio(){
  var A = {
    ctx: null, master: null, musicBus: null, sfxBus: null,
    bpm: 52, beatT: 0, nextBeat: 0, beatCount: 0, timer: 0,
    unlocked: false, suspended: false, activeNodes: 0,
    ducked: 0, _duckTarget: 0,   /* deliberate-silence duck, slewed ~0.6s */
    chapter: 0, wake: 0, immuneProx: 0, nearDeath: false, pbPace: false,
    secondBeat: { on:false, next: 0 }   /* 58 BPM under-pulse (Heart secret) */
  };
  function ensure(){
    if(A.ctx) return true;
    try{
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return false;
      A.ctx = new AC();
      A.master = A.ctx.createGain(); A.master.gain.value = 1;
      A.master.connect(A.ctx.destination);
      A.musicBus = A.ctx.createGain(); A.musicBus.gain.value = 0.8;
      A.musicBus.connect(A.master);
      A.sfxBus = A.ctx.createGain(); A.sfxBus.gain.value = 0.9;
      A.sfxBus.connect(A.master);
      A.beatT = A.ctx.currentTime + 0.1;
      A.nextBeat = A.beatT;
      A.motifNext = A.beatT;
      A.timer = setInterval(schedule, 25);
      return true;
    }catch(e){ return false; }
  }
  A.unlock = function(){
    if(A.unlocked) return;
    if(ensure()){
      A.unlocked = true;
      if(A.ctx.state === 'suspended') A.ctx.resume();
    }
  };
  function schedule(){
    if(!A.ctx || A.suspended) return;
    /* duck slew: ~0.6s tau — silence arrives as a fade, never a cut */
    if(A.ducked !== A._duckTarget){
      A.ducked += (A._duckTarget - A.ducked) * (1 - Math.exp(-0.025/0.6));
      if(Math.abs(A._duckTarget - A.ducked) < 0.001) A.ducked = A._duckTarget;
    }
    var ahead = A.ctx.currentTime + 0.15;
    while(A.nextBeat < ahead){
      thump(A.nextBeat, 1.0, 55, A._heartImmune);   /* dawn ramp: heartbeat rides through the layer duck */
      A.beatCount++;
      A.nextBeat += 60 / A.bpm;
    }
    _schedMotif(ahead);
    /* second heartbeat 58 BPM (Heart secret), faint woody thump */
    if(A.secondBeat.on){
      while(A.secondBeat.next < ahead){
        thump(A.secondBeat.next, 0.18, 180);
        A.secondBeat.next += 60 / 58;
      }
    } else {
      A.secondBeat.next = ahead;
    }
  }
  function thump(t, vol, freq, noDuck){
    /* the heartbeat bypasses the node cap: it must never drop out */
    var c = A.ctx, f = freq || 55;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    var v = vol * (noDuck ? 1 : (1 - A.ducked)) * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(A.musicBus);
    o.start(t); o.stop(t + 0.32);
    /* chest harmonic: 110 Hz at 0.18x */
    var o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine'; o2.frequency.value = 110;
    var v2 = Math.max(vol * (noDuck ? 1 : (1 - A.ducked)) * 0.5 * 0.18, 0.0001);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(v2, t + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o2.connect(g2); g2.connect(A.musicBus);
    o2.start(t); o2.stop(t + 0.32);
    /* lub-dub: filtered noise click just after */
    noiseBurst(t + 0.02, 0.05, 300, vol * 0.25, noDuck);
    A.activeNodes += 2;
    var done = 0;
    function one(){ if(++done === 2) A.activeNodes -= 2; }
    o.onended = one; o2.onended = one;
  }
  var _noiseBuf = null;
  function noiseBuf(){
    if(_noiseBuf) return _noiseBuf;
    var c = A.ctx, len = c.sampleRate * 1;
    _noiseBuf = c.createBuffer(1, len, c.sampleRate);
    var d = _noiseBuf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
    return _noiseBuf;
  }
  function noiseBurst(t, dur, cutoff, vol, noDuck){
    var c = A.ctx;
    var src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    var g = c.createGain();
    var v = vol * (noDuck ? 1 : (1 - A.ducked));
    g.gain.setValueAtTime(Math.max(v,0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t + dur + 0.05);
    A.activeNodes++;
    src.onended = function(){ A.activeNodes--; };
    return src;
  }
  /* ================= M3: chamber motifs, beds, dynamic layers ============= */
  A.motifStep = 0; A.motifNext = 0; A.streak = 0; A.eyeCalm = false;
  var HYMN = [220, 196, 164.81, 146.83];          /* A G E D: the Swallow's Hymn */
  var HYMN_INV = [146.83, 164.81, 196, 220];      /* D E G A: Valve Canticle */
  var HYMN_FRAG = [196, 146.83, 220, 164.81];     /* fragmented: Brain */
  var HYMN_MAJOR = [220, 246.94, 277.18, 329.63]; /* A B C# E: Dawn */
  var LULLABY = [659.25, 783.99, 880, 783.99, 659.25]; /* E G A G E: music box */
  function mNote(t, freq, dur, type, vol, pan){
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    var v = Math.max(vol * (1 - A.ducked), 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + dur*0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if(pan !== undefined && c.createStereoPanner){
      var p = c.createStereoPanner(); p.pan.value = clamp(pan,-1,1);
      g.connect(p); p.connect(A.musicBus);
    } else g.connect(A.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
    A.activeNodes++;
    o.onended = function(){ A.activeNodes--; };
  }
  function choirNote(t, freq, dur, vol){
    mNote(t, freq, dur, 'sine', vol);
    mNote(t, freq*2.01, dur*0.85, 'sine', vol*0.32);
    mNote(t, freq*0.5, dur, 'sine', vol*0.45);
  }
  function organStab(t, freq, vol){
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 850;
    var v = Math.max(vol * (1 - A.ducked), 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f); f.connect(g); g.connect(A.musicBus);
    o.start(t); o.stop(t + 0.65);
    A.activeNodes++;
    o.onended = function(){ A.activeNodes--; };
  }
  function pluck(t, freq, pan, vol){
    /* pizzicato-ish: triangle, fast decay, positioned in stereo */
    mNote(t, freq, 0.22, 'triangle', vol, pan);
    mNote(t, freq*2, 0.12, 'sine', vol*0.4, pan);
  }
  /* one motif step per heartbeat; lead drops out when near death */
  function motifStep(t, step){
    var ch = A.chapter, lead = !A.nearDeath;
    if(A._dreamOn || A.ducked >= 0.9) return;   /* deliberate silence: no lead, no bed;
       P1-9: dream ending (lullaby+wind only) and the 0.9 dream-event duck both gate motifs */
    if(ch === 0){                                    /* THROAT: Swallow's Hymn */
      if(lead && step % 2 === 0) choirNote(t, HYMN[(step/2)%4|0], 1.6, 0.16);
      if(step % 4 === 0) breathBed(t);
    } else if(ch === 1){                             /* HEART: Valve Canticle */
      if(lead) organStab(t, HYMN_INV[step%4], 0.20);
      if(step % 2 === 1) organStab(t, HYMN_INV[(step+2)%4]*0.5, 0.10);
    } else if(ch === 2){                             /* STOMACH: Hunger Drone */
      if(lead && step % 4 === 0){
        mNote(t, 55, 2.2, 'sawtooth', 0.10);
        mNote(t, 55*1.005 + 3, 2.2, 'sawtooth', 0.10);  /* 3 Hz beating */
      }
      if(step % 8 === 0){
        /* tolled hymn kernel: the Swallow's Hymn dragged through the drone */
        var bf = HYMN[(step/8)%4|0] * 0.5;
        mNote(t, bf, 3.0, 'sine', 0.08);
        mNote(t, bf*2.4, 2.5, 'sine', 0.03);
      }
      if(Math.random() < 0.5) bubbleBed(t);
    } else if(ch === 3){                             /* EYE: the Quiet Choir */
      if(lead && A.eyeCalm && step % 8 === 0) mNote(t, 1318.5, 3.0, 'sine', 0.07);
      if(step % 4 === 0){
        /* beating pair 82.4 + 110 Hz (≈27.6 Hz shimmer) + E5 ghost above */
        mNote(t, 82.4, 2.5, 'sine', 0.10);
        mNote(t, 110, 2.5, 'sine', 0.10);
        mNote(t, 659.25, 3.5, 'sine', 0.025);
      }
    } else if(ch === 4){                             /* BRAIN: Thought Weather */
      if(lead && step % 2 === 0){
        var f = HYMN_FRAG[(step/2)%4|0];
        mNote(t, f, 1.4, 'sine', 0.10);               /* reversed-swell pad */
        mNote(t, f*1.5, 1.1, 'sine', 0.05);
      }
      if(step % 2 === 0) crackleBed(t);
    } else if(ch === 5){                             /* WAKING: Dawn */
      if(lead){
        var n = HYMN_MAJOR[step%4];
        mNote(t, n, 0.4, 'sawtooth', 0.14);
        mNote(t, n*2, 0.35, 'sawtooth', 0.07);
      }
    }
    /* dynamic layers */
    if(A.wake >= 70){
      /* tension cluster, re-voiced: sine (not saw), every 2nd beat, 4-beat swell-in */
      if(step % 2 === 0){
        A._tenseBeats = (A._tenseBeats||0)+1;
        var tsw = Math.min(1, A._tenseBeats/4);
        var tv = (0.05 + 0.09*(A.wake-70)/30) * tsw;
        mNote(t, 1244.5, 0.9, 'sine', tv*0.5);
        mNote(t, 1318.5, 0.9, 'sine', tv*0.5);
      }
    } else { A._tenseBeats = 0; }
    if(A.wake >= 85){
      /* sub-bass dread: 40 Hz under the heartbeat */
      mNote(t, 40, 0.9, 'sine', 0.10);
    }
    if(A.immuneProx > 0){                            /* white-cell plucks, proximity-mapped */
      var pp = (step % 2 === 0) ? -0.7 : 0.7;
      pluck(t, 523.25 * (step%4===0?1:1.335), pp, 0.12 * A.immuneProx);
    }
    if(A.streak >= 3 && lead){                       /* UNBROKEN descant */
      var base = ch===5 ? HYMN_MAJOR : (ch===1 ? HYMN_INV : HYMN);
      mNote(t, base[step%4]*1.5, 1.2, 'sine', 0.05);
    }
    if(A.pbPace){                                   /* P2-6: personal-best daily shaker */
      if(step % 2 === 1) shakerTick(t, 0.055);      /* off-beat tick, subtle — tension you earned */
    }
  }
  function breathBed(t){
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=600; f.Q.value=0.8;
    var g = c.createGain();
    var v = Math.max(0.10*(1-A.ducked), 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t+0.8);
    g.gain.linearRampToValueAtTime(0.0001, t+1.8);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t+2);
    A.activeNodes++;
    src.onended = function(){ A.activeNodes--; };
  }
  function bubbleBed(t){
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type='bandpass'; f.Q.value=3;
    f.frequency.setValueAtTime(300+Math.random()*600, t);
    var g = c.createGain();
    var v = Math.max(0.08*(1-A.ducked), 0.0001);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t+0.25);
  }
  function crackleBed(t){
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type='highpass'; f.frequency.value=4000;
    var g = c.createGain();
    var v = Math.max(0.05*(1-A.ducked), 0.0001);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.09);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t+0.15);
  }
  function shakerTick(t, vol){
    /* P2-6: personal-best daily shaker — a short highpassed noise tick,
       the AUDIO_DIRECTION §3 layer: subtle rhythmic shaker, tension earned */
    if(!A.ctx || A.activeNodes > 24) return;
    var c = A.ctx, src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
    var g = c.createGain();
    var v = Math.max(vol * (1 - A.ducked), 0.0001);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t + 0.12);
    A.activeNodes++;
    src.onended = function(){ A.activeNodes--; };
  }
  /* extend the heartbeat scheduler: motifs + near-death echo */
  var _schedMotif = function(ahead){
    while(A.motifNext < ahead){
      motifStep(A.motifNext, A.motifStep);
      A.motifStep++;
      A.motifNext += 60 / A.bpm;
    }
    if(A.nearDeath && A.ctx){
      var period = 60 / A.bpm;
      var echoT = A.nextBeat - period/2;
      /* once-per-beat guard: the 25ms scheduler must not stack echoes on one beat */
      if(echoT > A.ctx.currentTime && echoT < ahead && A.echoFor !== A.beatCount){
        A.echoFor = A.beatCount;
        thump(echoT, 0.5, 48);
      }
    }
  };
  /* --- public API --- */
  A.setBPM = function(b){ A.bpm = b; };
  A.setDuck = function(d){ A._duckTarget = clamp(d,0,1); if(!A.ctx || A.suspended) A.ducked = A._duckTarget; };
  A.setChapter = function(ch){ A.chapter = ch; A.motifStep = 0; A._dreamOn = false; };
  A.setWake = function(w){ A.wake = w; };
  A.setImmune = function(b){ A.immuneProx = b ? 1 : 0; };
  A.setImmuneProximity = function(p){ A.immuneProx = clamp(p||0, 0, 1); };
  A.setNearDeath = function(b){ A.nearDeath = b; };
  A.setStreak = function(s){ A.streak = s||0; };
  A.setPbPace = function(b){ A.pbPace = !!b; };   /* P2-6: daily personal-best pace — the shaker layer's gate */
  A.setEyeCalm = function(b){ A.eyeCalm = !!b; };
  A.setSecondBeat = function(on){
    A.secondBeat.on = on;
    if(on && A.ctx) A.secondBeat.next = A.ctx.currentTime + 0.05;
  };
  A.beatPhase = function(){  /* 0..1 within current beat (for visuals) */
    if(!A.ctx) return 0;
    var period = 60 / A.bpm;
    var t = A.ctx.currentTime;
    var since = t - (A.nextBeat - period);
    return clamp(since / period, 0, 1);
  };
  /* 58 BPM under-pulse phase for the visual ring; -1 when off */
  A.secondBeatPhase = function(){
    if(!A.ctx || !A.secondBeat.on) return -1;
    var period = 60/58;
    var t = A.ctx.currentTime;
    var since = t - (A.secondBeat.next - period);
    return clamp(since / period, 0, 1);
  };
  A.suspend = function(){
    if(A.ctx && !A.suspended){ A.suspended = true; A._suspendT = Date.now(); A.ctx.suspend(); }
  };
  A.resume = function(){
    if(A.ctx && A.suspended){
      A.suspended = false; A.ctx.resume();
      /* the audio clock froze with the context: phase survives short hides.
         only restart the bar after a long absence (>30s). */
      if(Date.now() - (A._suspendT||0) > 30000){
        A.nextBeat = A.ctx.currentTime + 0.1;
        A.motifNext = A.nextBeat;
      }
    }
  };
  /* --- SFX (synthesis recipes per AUDIO_DIRECTION §4) --- */
  var _sfxPlayer = false;   /* player-action sounds bypass most deliberate silence */
  function duckF(){ return 1 - A.ducked * (_sfxPlayer ? 0.15 : 1); }
  function env(g, t, peak, dur){
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0001), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function sweep(t, f0, f1, dur, type, vol){
    var c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1,1), t + dur);
    env(g, t, vol * duckF(), dur);
    o.connect(g); g.connect(A.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noiseSweep(t, f0, f1, dur, vol, type){
    var c = A.ctx, src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(f1,10), t + dur);
    var g = c.createGain();
    env(g, t, vol * duckF(), dur);
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }
  A.sfx = function(name, opt){
    if(!A.ctx || !A.unlocked || A.suspended) return;
    if(name.indexOf('lullaby') === 0){ A.sfxLullaby(parseInt(name.slice(7),10) || 1); return; }
    _sfxPlayer = (name==='constrict' || name==='bloom' || name==='spore' || !!(opt && opt.noDuck));
    if(A.activeNodes > 24){ _sfxPlayer = false; return; }
    var c = A.ctx, t = c.currentTime + 0.001, o = opt || {};
    A.activeNodes++;
    try{
      switch(name){
        case 'constrict':  /* drawing in */
          noiseSweep(t, 800, 200, 0.35, 0.25); sweep(t, 300, 120, 0.35, 'sine', 0.18); break;
        case 'bloom':      /* exhale */
          noiseSweep(t, 200, 800, 0.5, 0.2); sweep(t, 120, 300, 0.5, 'sine', 0.14); break;
        case 'spore': {    /* pitch rises with chain */
          var ch = o.chain || 0;
          sweep(t, 1320 + ch*40, 1320 + ch*40, 0.15, 'sine', 0.22);
          sweep(t, 1980 + ch*60, 1980 + ch*60, 0.12, 'sine', 0.12);
          noiseSweep(t, 3000, 5000, 0.05, 0.08, 'highpass'); break; }
        case 'moteLoss':
          sweep(t, 140, 70, 0.18, 'sine', 0.3); noiseSweep(t, 5000, 8000, 0.06, 0.1, 'highpass'); break;
        case 'scrape':
          noiseSweep(t, 400, 350, 0.2, 0.3); sweep(t, 90, 60, 0.2, 'sine', 0.2); break;
        case 'checkpoint':
          sweep(t, 660, 660, 0.4, 'sine', 0.2); sweep(t + 0.09, 990, 990, 0.5, 'sine', 0.18); break;
        case 'death':
          noiseSweep(t, 800, 200, 1.6, 0.2); sweep(t, 120, 40, 1.6, 'sine', 0.25); break;
        case 'immuneTelegraph': { /* deep organ swell, 1.5s */
          var c2 = A.ctx, oo;
          for(var k=0;k<2;k++){
            oo = c2.createOscillator(); oo.type='sawtooth'; oo.frequency.value = k?103:98;
            var f2 = c2.createBiquadFilter(); f2.type='lowpass'; f2.frequency.value=400;
            var g2 = c2.createGain();
            g2.gain.setValueAtTime(0.0001,t);
            g2.gain.linearRampToValueAtTime(0.22*(1-A.ducked), t+0.4);
            g2.gain.linearRampToValueAtTime(0.0001, t+1.5);
            oo.connect(f2); f2.connect(g2); g2.connect(A.sfxBus);
            oo.start(t); oo.stop(t+1.6);
          } break; }
        case 'uiValve': noiseSweep(t, 500, 1200, 0.25, 0.18); break;
        case 'secret':   /* music-box fragment, intimate */
          sweep(t, 1318, 1318, 0.5, 'sine', 0.15); sweep(t+0.18, 1568, 1568, 0.5, 'sine', 0.15); break;
        case 'bell': {   /* Hunger bell: sine 90 + partials */
          var parts = [1, 2.4, 5.1], pv=[0.3,0.12,0.05];
          for(var p=0;p<3;p++) sweep(t, 90*parts[p], 88*parts[p], 4.0, 'sine', pv[p]);
          break; }
        case 'gaze': sweep(t, 2400, 3600, 2.0, 'sine', 0.1); break;
        case 'snap': noiseSweep(t, 2000, 500, 0.12, 0.35, 'highpass'); sweep(t, 180, 90, 0.15, 'sine', 0.3); break;
        case 'record': { /* gold arpeggio E-G-B-E */
          var ns=[659,784,988,1318];
          for(var n=0;n<4;n++) sweep(t+n*0.09, ns[n], ns[n], 0.4, 'sine', 0.16);
          break; }
        case 'valveSlam': sweep(t, 110, 55, 0.3, 'sawtooth', 0.25); sweep(t, 60, 40, 0.4, 'sine', 0.3); break;
        case 'valveInhale': sweep(t, 80, 160, 1.2, 'sine', 0.1); break;
        /* ---- M3: chamber-event SFX ---- */
        case 'offbeat': sweep(t, 220, 110, 0.25, 'square', 0.15); break;
        case 'hiddenOpen': { /* tissue iris: low grind + airy release */
          noiseSweep(t, 300, 900, 0.8, 0.2); sweep(t, 70, 140, 0.8, 'sine', 0.2); break; }
        case 'bladderPop': /* membrane burst + release sigh */
          sweep(t, 200, 60, 0.3, 'sine', 0.3); noiseSweep(t, 1200, 300, 0.4, 0.12);
          noiseSweep(t+0.15, 800, 200, 0.8, 0.08); break;
        case 'geyserBulge': sweep(t, 60, 120, 1.0, 'sine', 0.12); break;
        case 'geyser': noiseSweep(t, 500, 2500, 0.5, 0.25); sweep(t, 150, 400, 0.4, 'sine', 0.2); break;
        case 'static': noiseSweep(t, 3000, 6000, 0.4, 0.15, 'highpass'); break;
        case 'stillness': noiseSweep(t, 900, 300, 2.5, 0.1); sweep(t, 400, 800, 2.0, 'sine', 0.05); break;
        case 'flash': /* memory surfaces: bright bloom */
          sweep(t, 880, 1760, 0.8, 'sine', 0.15); sweep(t+0.2, 1320, 2640, 0.8, 'sine', 0.1); break;
        case 'echo': sweep(t, 1568, 1568, 0.4, 'sine', 0.12); break;
        case 'skipbeat': /* 2s of nothing, then the double-thump on the audio clock */
          (function(){
            var was = _sfxPlayer; _sfxPlayer = true;
            sweep(t+2.0, 55, 40, 0.35, 'sine', 0.4);
            sweep(t+2.28, 55, 40, 0.35, 'sine', 0.3);
            _sfxPlayer = was;
          })(); break;
        case 'lid': noiseSweep(t, 2000, 100, 1.5, 0.08); break;
        case 'zerowake': sweep(t, 110, 55, 1.2, 'sine', 0.2); sweep(t+0.3, 220, 110, 1.0, 'sine', 0.1); break;
        case 'dawn': { /* gold chime */
          var dn=[659,784,988,1318,1568];
          for(var di=0;di<5;di++) sweep(t+di*0.12, dn[di], dn[di], 1.2, 'sine', 0.14);
          break; }
        case 'dawnThump': /* the Waking landing: one heavy heartbeat */
          sweep(t, 55, 35, 0.5, 'sine', 0.5); sweep(t+0.02, 110, 70, 0.4, 'sine', 0.2); break;
        case 'lateBeat': /* dream event: a single heartbeat arrives late, quietly */
          sweep(t, 55, 42, 0.3, 'sine', 0.15); break;
        case 'bellFar': { /* dream event: a distant bell — quarter volume, no acid follows */
          var bp = [1, 2.4, 5.1], bv=[0.075,0.03,0.012];
          for(var bi=0;bi<3;bi++) sweep(t, 90*bp[bi], 88*bp[bi], 4.0, 'sine', bv[bi]);
          break; }
        case 'exhale': /* chain 8: the god felt something pleasant */
          noiseSweep(t, 800, 200, 1.2, 0.12); sweep(t, 160, 90, 1.0, 'sine', 0.08); break;
        case 'settle': /* clean tide evasion: the organ swell resolves to a single low tone */
          sweep(t, 98, 98, 1.5, 'sine', 0.18); sweep(t, 196, 196, 1.2, 'sine', 0.06); break;
        case 'streakBreak': /* streak >=3 breaks: a tone that falls and dissolves */
          sweep(t, 660, 330, 0.8, 'sine', 0.15); noiseSweep(t, 2000, 500, 1.0, 0.06); break;
        case 'gateChime': /* chapter threshold: the way folds shut behind you */
          sweep(t, 523.25, 523.25, 1.6, 'sine', 0.16);
          sweep(t+0.18, 784, 784, 1.4, 'sine', 0.12);
          sweep(t+0.36, 1046.5, 1046.5, 1.8, 'sine', 0.10); break;
        case 'challenge': sweep(t, 988, 988, 0.3, 'sine', 0.15); sweep(t+0.12, 1318, 1318, 0.5, 'sine', 0.15); break;
        case 'key': sweep(t, 2093, 2093, 0.2, 'sine', 0.1); sweep(t+0.05, 2637, 2637, 0.2, 'sine', 0.08); break;
        case 'hiss': noiseSweep(t, 5000, 3000, 0.25, 0.15, 'highpass'); break;
      }
    }catch(e){}
    setTimeout(function(){ A.activeNodes = Math.max(0, A.activeNodes - 1); }, 300);
  };
  /* lullaby voices: 'lullaby1'..'lullaby6' — music-box round, E G A G E.
     6-voice round (all glands): the tail extends D5 -> D6. No per-note LFO. */
  A.sfxLullaby = function(n, volMul){
    if(!A.ctx || !A.unlocked || A.suspended) return;
    /* DECISION F (v4): the lullaby round is EXEMPT from the 24-node cap. The cap
       bounds unbounded scheduler layers (motifs/beds/dynamics); the lullaby is a
       finite pre-scheduled composition — 32 notes max, every note with a bounded
       1.5s envelope and an onended decrement, so the node count self-limits.
       Counting pre-scheduled notes against the cap synchronously truncated the
       round to 13 notes, killing voices 4-6 and the D5->D6 tail — the game's
       most hummable asset (AUDIO_DIRECTION §2: "protect it"). Peak concurrent
       load is ~48 cheap sine oscs, well within iPhone Web Audio capacity. */
    var c = A.ctx, t = c.currentTime + 0.05;
    var vm = volMul || 1;
    n = Math.max(1, Math.min(6, n));
    for(var v=0; v<n; v++){
      var vt = t + v*0.55;   /* the round: each voice enters a breath later */
      var mel = LULLABY;
      if(n === 6 && v === n-1) mel = LULLABY.concat([587.33, 1174.66]);  /* D5 -> D6 tail */
      for(var i2=0;i2<mel.length;i2++){
        (function(f, nt){
          /* no cap check here: pre-scheduled lullaby notes must not be counted
             against the live 24-node cap synchronously (see DECISION F above) */
          var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
          o.type='sine'; o.frequency.value=f;
          o2.type='sine'; o2.frequency.value=f*3;   /* 3rd harmonic: the box */
          var vv = 0.11*vm*(1-A.ducked);
          g.gain.setValueAtTime(0.0001, nt);
          g.gain.linearRampToValueAtTime(Math.max(vv,0.0001), nt+0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, nt+1.4);
          o.connect(g); o2.connect(g); g.connect(A.musicBus);
          o.start(nt); o.stop(nt+1.5); o2.start(nt); o2.stop(nt+1.5);
          A.activeNodes += 2;
          var done = 0;
          function one(){ if(++done === 2) A.activeNodes -= 2; }
          o.onended = one; o2.onended = one;
        })(mel[i2], vt + i2*0.42);
      }
    }
  };
  /* dawn sequence — the keystone beat (CHAMBERS §6: "the heartbeat slows from 120
     to 52 to *nothing* — then one final thump"):
     1. layers drop as a fade (setDuck(1)); the heartbeat is IMMUNE to that duck
        so the slowdown stays audible, and ramps 120 -> 52 BPM over ~6s in timed
        steps on the audio clock;
     2. ~2s of true nothing (heartbeat scheduler parked, motifs parked);
     3. one final unducked thump that punches through the silence;
     4. the gold chime, routed through the noDuck envelope (P1-3: the old code
        baked the duck into the chime's envelope at schedule time, so the
        cathartic resolution peaked at 0.0018 — inaudible).
     The 10s visual inversion (drawDawn) runs in parallel and resolves as the
     chime decays. */
  A.dawn = function(){
    if(!A.ctx || !A.unlocked) return;
    var c = A.ctx, t = c.currentTime;
    var from = A.bpm || 120;
    A._heartImmune = true;   /* the heartbeat rides through the layer duck */
    A.setDuck(1);            /* layers drop as a fade, never a cut */
    var steps = 12, dur = 6.0;
    for(var i=1;i<=steps;i++){
      (function(i){
        setTimeout(function(){
          if(!A.ctx) return;
          A.setBPM(from + (52 - from) * (i/steps));
          if(i === steps){
            /* the heartbeat has reached 52: ~2s of nothing, then the final thump */
            A._heartImmune = false;
            A.nextBeat = A.ctx.currentTime + 2.0;   /* park the scheduled heartbeat */
            A.motifNext = A.nextBeat;               /* park the motif grid with it */
            setTimeout(function(){
              if(!A.ctx) return;
              var tt = A.ctx.currentTime + 0.05;
              thump(tt, 1.0, 55, true);        /* the final thump: punches through silence */
              A.nextBeat = tt + 60/52;         /* the pulse resumes one quiet 52-BPM bar later */
              A.motifNext = A.nextBeat;        /* motif grid resumes with it */
              A.setDuck(0.25);                /* sound returns quietly, not a swell */
              A.sfx('dawn', {noDuck:true});   /* the gold chime, audible */
            }, 2000);
          }
        }, (dur/steps)*1000*i);
      })(i);
    }
  };
  /* dream: only lullaby + wind */
  A.dream = function(){
    if(!A.ctx || !A.unlocked) return;
    A._dreamOn = true;   /* P1-9: motif scheduler stays silent for the whole dream */
    A.setDuck(0.75);
    A.sfxLullaby(Math.max(1, 3));
    var c = A.ctx, t = c.currentTime + 0.1;
    var src = c.createBufferSource(); src.buffer = noiseBuf();
    var f = c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=0.6;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t+3);
    g.gain.linearRampToValueAtTime(0.0001, t+14);
    src.connect(f); f.connect(g); g.connect(A.musicBus);
    src.start(t); src.stop(t+15);
  };
  return A;
}
function audioSuspend(){ if(audio) audio.suspend(); }
function audioResume(){ if(audio) audio.resume(); }
var onHeldChange = null;   /* wired in MAIN: plays constrict/bloom sfx */
/* P1-10: reduced motion — the in-game setting OR the OS preference freezes
   every purely-visual oscillation. Gameplay state signaling keeps a static value. */
var OS_REDUCED = false;
try{ OS_REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}
function RM(){
  return OS_REDUCED || !!(save && save.settings && save.settings.reducedMotion);
}
function RT(t){ return RM() ? 0 : t; }   /* render time: frozen under reduced motion */

/* ============================ GEN ================================== */
/* Room templates are handcrafted data; spore scatter uses a seeded stream.
   Every room passes the 7 validation rules (TECH_ARCHITECTURE §4) or it
   is regenerated / falls back to a known-good template. */
var WALL_STEP = 16;   /* wall sampling resolution (pt) */
/* deterministic spore cluster helper: ring of n spores around (cx,cy) */
function cluster(cx, cy, n, r, seed){
  var rnd = mulberry32(seed), out = [];
  for(var i=0;i<n;i++){
    var a = (i/n)*Math.PI*2 + rnd()*0.5;
    var rr = r*(0.55 + rnd()*0.45);
    out.push([cx + Math.cos(a)*rr, cy + Math.sin(a)*rr*0.8, 1]); /* 1 = field spore */
  }
  return out;
}
function stringSpores(x0,y0,x1,y1,n){ /* risky line, not a "field" */
  var out = [];
  for(var i=0;i<n;i++){
    var t = n===1?0.5:i/(n-1);
    out.push([lerp(x0,x1,t), lerp(y0,y1,t), 0]);
  }
  return out;
}
/* ---- Throat room definitions (chapter 0) ---- */
/* walls: [y, leftX, rightX] control points, y strictly increasing.
   Open zones are +/-170..185 so field-spore clusters (r<=52) keep the
   120pt bloom clearance required by validation rule 2. */
var ROOMS_T = [
{ n:0, safe:true, len:1900, peristalsis:false, events:[],
  walls:[[0,-175,175],[300,-180,175],[600,-175,180],[900,-180,175],[1200,-175,180],[1500,-180,175],[1900,-175,175]],
  spores: cluster(0,600,6,44,11).concat(cluster(0,1100,5,40,12)),
  nerves:[], onboard:true },
{ n:1, safe:false, len:1900, peristalsis:false, events:[],
  /* P1-19a: the exit pinch is 70pt wide — a tutorial teaches, it does not punish */
  walls:[[0,-170,170],[400,-170,170],[700,-70,70],[820,-35,35],[900,-35,35],[980,-35,35],[1100,-70,70],[1400,-170,170],[1900,-170,170]],
  spores: cluster(0,250,5,40,21).concat(stringSpores(0,780,0,1020,4)).concat(cluster(0,1450,5,40,22)),
  nerves:[{x:90,y:1250,msg:0}] },
{ n:2, safe:false, len:2000, peristalsis:true, waveTick:0.45, events:[],   /* P1-1: crush tick 0.35->0.45s — beginner band overshoot on the third screen */
  /* P1-19b: an offset spore alcove at y≈1050 — the gold sits sideways,
     so the hand learns lateral drag before the peristalsis teaches fear.
     (bulge widened to 310 so the whole cluster keeps 120pt bloom clearance) */
  walls:[[0,-170,170],[350,-170,170],[550,-75,75],[640,-30,30],[700,-25,25],[760,-30,30],[850,-75,75],[1000,-170,170],[1015,-170,310],[1085,-170,310],[1100,-170,170],[1300,-170,170],[1380,-40,40],[1450,-25,25],[1520,-40,40],[1590,-170,170],[1750,-170,170],[2000,-170,170]],
  spores: cluster(0,300,5,40,31).concat(cluster(140,1050,6,40,32)).concat(cluster(0,1820,4,36,33)),
  nerves:[] },
{ n:3, safe:false, len:2000, peristalsis:true, events:[],
  walls:[[0,-165,165],[400,-165,165],[540,-70,70],[600,-28,28],[650,-23,23],[700,-28,28],[760,-70,70],[1000,-165,165],[1170,-70,70],[1230,-28,28],[1280,-23,23],[1330,-28,28],[1390,-70,70],[1650,-165,165],[2000,-165,165]],
  spores: stringSpores(0,450,0,600,2).concat(cluster(0,1000,3,40,41)).concat(cluster(0,1800,3,36,42)),  /* P0-4: 15->8 */
  nerves:[{x:-80,y:1600,msg:1}], quiet:{x:100,y:1000,r:60} },
{ n:4, safe:false, len:1900, peristalsis:true, events:[], garden:true,
  walls:[[0,-185,185],[400,-190,185],[800,-185,190],[1200,-190,185],[1900,-185,185]],
  spores: [[0,450,1],[20,470,1],[-20,430,1],[15,460,1],[-15,440,1],[120,900,0],[100,920,0],[-120,1350,0],[-100,1370,0]],  /* P0-2: the garden's price — 5 safe center fruit + 4 edge fruit near the teeth (non-field: risky by design) */
  nerves:[], gland:{x:0,y:1350} },
{ n:5, safe:false, len:2100, peristalsis:true, waveCount:5, events:[{type:'swallow', y:1750},{type:'swallow', y:2000}],  /* P0-2: the throat takes its toll TWICE after the gauntlet — past the last gate (P0-4 removed the swallow for interfering with the wave gauntlet; past the gates it cannot) */
  walls:[[0,-170,170],[300,-170,170],[450,-150,150],[510,-27,27],[550,-22,22],[590,-27,27],[650,-150,150],[850,-170,170],[980,-60,60],[1040,-25,25],[1080,-20,20],[1120,-25,25],[1180,-150,150],[1380,-170,170],[1530,-65,65],[1590,-27,27],[1630,-22,22],[1670,-27,27],[1730,-65,65],[1900,-170,170],[2100,-170,170]],
  spores: cluster(0,200,2,36,61).concat(cluster(0,800,2,36,62)).concat(cluster(0,1280,2,36,63)),  /* P0-4: 12->6 */
  nerves:[{x:70,y:1900,msg:2}] },
{ n:6, safe:false, len:1700, peristalsis:true, events:[],  /* P0-2: the throat's farewell squeeze — the finale is not free (was: peristalsis false, zero threat). P2-18: the last swallow — the throat's own waves carry you out. */
  walls:[[0,-175,175],[500,-180,175],[900,-175,180],[1300,-180,175],[1700,-175,175]],
  spores: cluster(0,600,3,40,71).concat(cluster(0,1200,3,40,72)).concat(cluster(0,350,2,36,73)).concat(cluster(0,1450,2,36,74)).concat([[0,200,1],[0,300,1],[0,1550,1],[0,1650,1]]),  /* P0-2: 6->14, a last meal calibrates the new peristalsis into the band */
  nerves:[], banner:true }
];
/* ---- room build: sample walls, place entities ---- */
function buildRoom(def, ch){
  var len = def.len, n = Math.ceil(len / WALL_STEP) + 1;
  var wallL = new Float32Array(n), wallR = new Float32Array(n);
  var pts = def.walls, pi = 0;
  for(var i=0;i<n;i++){
    var y = i * WALL_STEP;
    while(pi < pts.length-2 && pts[pi+1][0] <= y) pi++;
    var a = pts[pi], b = pts[pi+1];
    var t = (y - a[0]) / Math.max(1, b[0] - a[0]);
    t = clamp(t, 0, 1);
    wallL[i] = lerp(a[1], b[1], t);
    wallR[i] = lerp(a[2], b[2], t);
  }
  /* difficulty retune: spore density thins with depth, deterministically per room */
  var keep = 1 - 0.12*Math.max(0, ch-1);
  var spores = [];
  for(var si=0; si<def.spores.length; si++){
    var h = ((si*2654435761 + ch*40503 + def.n*9631) >>> 0) % 1000 / 1000;
    if(h < keep){
      var s0 = def.spores[si];
      spores.push({x:s0[0], y:s0[1], field:!!s0[2], taken:false});
    }
  }
  var room = {
    def: def, ch: ch, n: def.n, len: len, wallL: wallL, wallR: wallR,
    spores: spores, banner: !!def.banner,
    peristalsis: !!def.peristalsis, safe: !!def.safe,
    waveCount: def.waveCount || 5,   /* P0-2: def waveCount now reaches the room (was dropped) */
    waveDmg: def.waveDmg || 6,     /* P1-1: per-room wave damage reaches the room */
    waveTick: def.waveTick || 0.35, /* P1-1: per-room crush tick reaches the room */
    events: (def.events||[]).map(function(e){ return {type:e.type, y:e.y, done:false}; }),
    nerves: (def.nerves||[]).map(function(nv){ return {x:nv.x, y:nv.y, msg:nv.msg, read:false}; })
  };
  if(globalThis.buildRoomPost) globalThis.buildRoomPost(room, def);
  return room;
}
function wallAt(room, y){
  var i = clamp(Math.round(y / WALL_STEP), 0, room.wallL.length - 1);
  return [room.wallL[i], room.wallR[i]];
}
function roomWidthAt(room, y){ var w = wallAt(room, y); return w[1] - w[0]; }
/* ---- the 7 validation rules (TECH_ARCHITECTURE §4) ---- */
function validateRoom(room){
  var fails = [];
  var n = room.wallL.length;
  /* 1. min gate width >= 34 */
  for(var i=0;i<n;i++){
    if(room.wallR[i] - room.wallL[i] < 34 - 1e-6){ fails.push('rule1:minwidth@'+(i*WALL_STEP)); break; }
  }
  /* 2. bloom clearance: field spores need 120pt open radius */
  for(var s=0;s<room.spores.length;s++){
    var sp = room.spores[s];
    if(!sp.field) continue;
    var w = wallAt(room, sp.y);
    var clear = Math.min(sp.x - w[0], w[1] - sp.x);
    if(clear < 120){ fails.push('rule2:bloomclear@'+s); break; }
  }
  /* 3. reachability: flood fill on 16pt grid, entry -> exit */
  (function(){
    var gx0=-320, gx1=320, gw=Math.ceil((gx1-gx0)/16), gh=Math.ceil(room.len/16);
    var seen = new Uint8Array(gw*gh);
    var qx=[Math.floor((0-gx0)/16)], qy=[2], qh=0;
    function open(gx,gy){
      if(gx<0||gy<0||gx>=gw||gy>=gh) return false;
      var wx=gx0+gx*16, wy=gy*16, w=wallAt(room,wy);
      return wx>w[0]+4 && wx<w[1]-4;
    }
    if(!open(qx[0],qy[0])){ fails.push('rule3:entryblocked'); return; }
    seen[qy[0]*gw+qx[0]]=1;
    var reached=false;
    while(qh<qx.length){
      var cx=qx[qh], cy=qy[qh]; qh++;
      if(cy*16 >= room.len-48){ reached=true; break; }
      var nb=[[1,0],[-1,0],[0,1],[0,-1]];
      for(var k=0;k<4;k++){
        var nx=cx+nb[k][0], ny=cy+nb[k][1];
        if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
        if(seen[ny*gw+nx]||!open(nx,ny)) continue;
        seen[ny*gw+nx]=1; qx.push(nx); qy.push(ny);
      }
    }
    if(!reached) fails.push('rule3:nopath');
  })();
  /* 4. telegraph space: pinches <70 and events >= 180 from entry */
  for(var i2=0;i2<n;i2++){
    if(room.wallR[i2]-room.wallL[i2] < 70 && i2*WALL_STEP < 180){ fails.push('rule4:gate@'+(i2*WALL_STEP)); break; }
  }
  for(var e=0;e<room.events.length;e++){
    if(room.events[e].y < 200){ fails.push('rule4:event@'+room.events[e].y); break; }
  }
  /* 5. no spawn-kill: no narrow pinch <60 within 200 of entry fold */
  for(var i3=0;i3<n && i3*WALL_STEP<200;i3++){
    if(room.wallR[i3]-room.wallL[i3] < 60){ fails.push('rule5:spawnkill'); break; }
  }
  /* 6. wake feasibility: analytic calm-bot using the real wake table */
  (function(){
    var wake=0, peak=0, y=0, t=0, dt=1/60;
    var speed=120;
    while(y < room.len && t < 240){
      var wAhead = roomWidthAt(room, y+150);
      var c = wAhead < 80 ? 1 : 0;         /* calm bot: constrict near gates */
      var src = c>0.5 ? 9 : 1.5;
      wake += (src - 6) * dt;              /* decay always applies */
      wake = clamp(wake, 0, 100);
      if(wake>peak) peak=wake;
      var sp = lerp(90,192,smoothstep(c));
      y += sp*dt; t += dt;
    }
    if(peak >= 100) fails.push('rule6:wakepeak'+peak.toFixed(1));
  })();
  /* 7. (build-time aggregate) — single-room hook always passes here */
  return fails;
}
/* daily Descent room builder (M2 campaign data plugs in here) */
function genDailyRoom(ch, idx, rng, muts){
  /* procedural corridor honoring all 7 fairness rules; hazards by chapter.
     Returns a DEF (loadRoom builds it); validated before return. */
  for(var attempt=0; attempt<20; attempt++){
    var len = 1900 + Math.floor(rng()*400);
    var half = 150 + Math.floor(rng()*20);
    var gates = [];
    var ng = 2 + Math.floor(rng()*2);
    for(var g=0; g<ng; g++){
      gates.push({ y: 500 + g*Math.floor((len-800)/ng) + Math.floor(rng()*160), w: 40 + Math.floor(rng()*40) });
    }
    var def = {
      n: idx, safe: idx===0, len: len, peristalsis: ch===0 && rng()<0.5,
      events: [], walls: corrWalls(len, half, gates), daily: true,
      spores: cluster(0, 400+rng()*300, 5, 40, 900+attempt*10).concat(cluster(0, len-400-rng()*200, 5, 40, 950+attempt*10)),
      nerves: []
    };
    if(ch === 1) def.valves = gates.slice(0,2).map(function(gt){ return {y:gt.y, w:90, phase:0}; });
    if(ch === 2) def.acids = [{ y0: len*0.55, y1: len*0.7, x0:-half+10, x1:half-10 }];
    if(ch === 3) def.watchers = [{x:-half+12, y:len*0.4, side:-1}];
    if(ch === 4) def.arcs = [{y:len*0.5, gapX:0, gapW:90, phase:0}];
    if(ch === 5) def.valves = gates.slice(0,1).map(function(gt){ return {y:gt.y, w:40, phase:0, arrhythmic:true}; });
    /* P1-18: the daily dreams its own secrets — glands, quiet rooms, spore caches */
    var sroll = rng();
    if(sroll < 0.14 && ch >= 1){
      def.gland = { x: 0, y: Math.floor(len*0.5) };            /* answer it: secrets.glands[ch] */
    } else if(sroll < 0.28){
      var qx = (rng() < 0.5 ? -1 : 1) * (half - 30);
      def.quiet = { x: qx, y: Math.floor(len*0.55), r: 60 };   /* quiet rooms feed the 'still' challenge */
    } else if(sroll < 0.42){
      var ccx = (rng() < 0.5 ? -1 : 1) * (half - 46);          /* spore cache, off the main path */
      var ccy = Math.floor(len*0.6);
      /* P1-7: a cache is a secret stash, not a field — field spores demand
         120pt bloom clearance (validator rule 2), which an off-path cache can
         never satisfy. Marked non-field like quiet-room spores. */
      var ccl = cluster(ccx, ccy, 8, 30, 5000+attempt*7);
      for(var cci=0; cci<ccl.length; cci++) ccl[cci][2] = 0;
      def.spores = def.spores.concat(ccl);
      def.cache = { x: ccx, y: ccy };
    }
    /* mutators */
    if(muts){
      if(muts.indexOf('bright') >= 0) def.dark = false;
      if(muts.indexOf('hunger') >= 0) def.spores = def.spores.slice(0, Math.ceil(def.spores.length*0.7));
    }
    var room = buildRoom(def, ch);
    if(validateRoom(room).length === 0) return def;
  }
  return { n:idx, safe:true, len:1900, peristalsis:false, events:[], daily:true,
    walls: corrWalls(1900,165,[]), spores: cluster(0,900,6,44,999), nerves:[] };
}
var ROOMS_BY_CHAPTER = [ROOMS_T];   /* M2 appends chapters 1..5 */

/* ============================ SIM ================================== */
/* Fixed 60Hz. Pure logic: no DOM, no canvas, no audio calls except via
   the `sfx` hook (a no-op in headless). RENDER reads, never writes. */
var DT = 1/60;
/* P1-22: scratch buffer for the alive-mote index list (no per-frame allocation) */
var _aliveScratch = new Int32Array(64);
function Sim(inputRef, saveRef, sfxFn){
  var input = inputRef;
  /* ---- state ---- */
  var S = {
    mode: 'title',            /* title|play|dying|paused|complete */
    paused: false,
    time: 0, runTime: 0,
    ch: 0, roomIdx: 0, room: null,
    motes: [], alive: 48, maxAlive: 64,
    cx: 0, cy: 60, cvx: 0, cvy: 0, fx: 0, fy: 60,
    c: 0,                     /* constriction 0..1 (raw), sc = smoothstep */
    wake: 0, immuneLock: 0, tide: null,
    immuneEverTriggered: false,   /* P1-2: run-scoped — the Gentle Dream dies if the god ever fully wakes */
    score: 0, depth: 0, roomBase: 0, roomLost: 0, streak: 0,
    chain: 0, chainT: 0,
    iframes: 0, grace: 0,
    waveId: -1, hitWaveId: -1, crushTeleId: -1, waveDmgT: 0,
    swallow: null, debris: [],
    checkpoint: { ch:0, room:0 },
    dyingT: 0, deathCause: '',
    surplusT: 0,
    chWakeSum: 0, chWakeN: 0,
    crossT: -10,              /* last 0.5-crossing time (flicker) */
    crossWakeT: -10,          /* P1-4: last time the flicker penalty actually fired */
    whisper: '', whisperT: 0,
    ob: { stage:0, t:0 },
    gateFoldT: 0,              /* chapter-gate fold ring timer */
    inhaleSwellT: 0,           /* run-start inhale swell */
    nerveMsg: '', nerveT: 0,
    banner: '', bannerT: 0, bannerSub: '',
    stillT: 0,
    stats: { spores:0, deaths:0 },
    firstRun: true,
    /* spatial hash (rebuilt per step) */
    hashHead: new Int32Array(1024), hashNext: new Int32Array(64),
    /* ambient particles handled by RENDER; SIM owns debris only */
    rngCos: mulberry32(1234)
  };
  for(var i=0;i<64;i++) S.motes.push({x:0,y:60,vx:0,vy:0,phase:Math.random()*6.28,alive:i<48});
  for(var d=0;d<40;d++) S.debris.push({x:0,y:0,vx:0,vy:0,on:false});
  function sfx(n,o){ if(sfxFn) sfxFn(n,o); }
  S._sfx = sfx;   /* M2 chapter systems call S._sfx (they're outside the Sim closure) */

  /* ---- room loading ---- */
  function loadRoom(ch, idx){
    var defs = ROOMS_BY_CHAPTER[ch];
    S.room = buildRoom(defs[idx % defs.length], ch);
    S.cx = 0; S.cy = 60; S.fx = 0; S.fy = 60;
    S.cvx = 0; S.cvy = 0;
    S.roomBase = 0; S.roomLost = 0;
    S.chain = 0; S.chainT = 0;
    S.swallow = null; S.tide = null;
    S.waveId = -1; S.hitWaveId = -1; S.crushTeleId = -1; S.waveDmgT = 0;
    S.scout = null; S.scoutUsed = false;
    for(var _cp=0;_cp<_cellPool.length;_cp++){ _cellPool[_cp].on=false; _cellPool[_cp].scout=false; }
    S.dreamDone = false;
    S.calmPause = 0;
    S.swallowInhale = 0;
    S._inNarrow = false;
    for(var k=0;k<S.debris.length;k++) S.debris[k].on = false;
    placeMotesDisc();
    /* BH-04: quiet rooms and nerve reads persist per run (no re-farm via death/checkpoint) */
    if(!S._visited) S._visited = {};
    var vk = ch+':'+(idx % defs.length), vv = S._visited[vk];
    if(vv){
      if(vv.quiet && S.room.quiet) S.room.quiet.done = true;
      if(vv.nerves) for(var ni=0; ni<S.room.nerves.length; ni++) if(vv.nerves[ni]) S.room.nerves[ni].read = true;
    }
    /* second heartbeat: reset phase + audio in the same frame (level-design §4) */
    if(S.room.secondBeat){
      S.b2T = 0; S.b2Consec = 0;
      if(typeof A !== 'undefined' && A && A.setSecondBeat) A.setSecondBeat(true);
    } else {
      if(typeof A !== 'undefined' && A && A.setSecondBeat) A.setSecondBeat(false);
    }
    /* banner rooms: a sting marks the threshold */
    if(S.room.banner && typeof A !== 'undefined' && A) A.sfx('bellFar');
  }
  function placeMotesDisc(){
    for(var i=0;i<64;i++){
      var m = S.motes[i];
      if(!m.alive) continue;
      var r = 30*Math.sqrt((i+0.5)/64), a = i*2.39996;
      m.x = S.cx + Math.cos(a)*r; m.y = S.cy + Math.sin(a)*r;
      m.vx = 0; m.vy = 0;
    }
  }
  function newRun(ch){
    S.mode = 'play'; S.paused = false;
    S.ch = ch||0; S.roomIdx = 0; S.time = 0; S.runTime = 0;
    S.alive = 48 + (saveRef ? saveRef.secrets.glands.filter(Boolean).length : 0);
    if(S.alive > 54) S.alive = 54;
    for(var i=0;i<64;i++) S.motes[i].alive = i < S.alive;
    S.score = 0; S.depth = 0; S.streak = 0;
    S.wake = 0; S.immuneLock = 0; S.tide = null;
    S.immuneEverTriggered = false;   /* P1-2: each campaign run starts with the god fully asleep */
    S.iframes = 0; S.grace = 0;
    S.checkpoint = { ch: S.ch, room: 0 };
    S.chWakeSum = 0; S.chWakeN = 0;
    S.runMotesLost = 0;   /* full-run loss tally (Warden) */
    S.quietThisChapter = 0;
    S._visited = {};      /* per-run room memory: quiet rooms, nerve reads */
    S.ob = { stage:0, t:0 };
    S.firstRun = !(saveRef && saveRef.stats.runs > 0);
    S.stats = { spores:0, deaths:0 };
    m2_resetChapterState(S);
    S.whisper=''; S.whisperT=0; S.banner=''; S.bannerT=0;
    loadRoom(S.ch, 0);
    /* first-run room 0: no banner — the dark teaches before the names do */
    if(!(S.firstRun && S.ch===0)){
      S.banner = CHAPTERS[S.ch].name; S.bannerSub = CHAPTERS[S.ch].sub; S.bannerT = 4;
    }
    if(saveRef){ saveRef.stats.runs++; requestSave(saveRef); }
  }
  function loadCheckpoint(){
    var cp = saveRef && saveRef.checkpoint;
    if(!cp){ newRun(0); return; }
    /* BH-06/BH-09 (+BH-06b): validate chapter/room ranges AND integrality;
       a corrupt checkpoint (incl. non-integer) starts fresh */
    var ch = cp.ch, room = cp.room;
    if(!Number.isInteger(ch) || !Number.isInteger(room) || ch < 0 || ch > 5 || room < 0 || room > 6){
      newRun(0); return;
    }
    S.mode = 'play'; S.paused = false;
    S.ch = ch; S.roomIdx = room;
    S.checkpoint = { ch: ch, room: room };
    loadRoom(S.ch, S.roomIdx);
    S.alive = clamp(cp.motes, 1, 64);
    for(var i=0;i<64;i++) S.motes[i].alive = i < S.alive;
    S.wake = clamp(cp.wake, 0, 100);
    S.immuneEverTriggered = !!cp.immune;   /* P1-2: checkpoint restore must NOT erase the flag */
    /* E1: the fold stores score + spore counters; resume restores them exactly */
    S.score = cp.score||0; S.depth = cp.depth||cp.score||0;
    S.grace = 1.2; S.iframes = 0; S.tide = null; S.immuneLock = 8;
    S.streak = 0;
    S.stats = S.stats || { spores:0, deaths:0 };
    S.stats.sporesRun = cp.sporesRun||0;
    m2_resetChapterState(S);
    S.whisper=''; S.whisperT=0;
  }
  function startFromCheckpoint(){ loadCheckpoint(); }

  /* ---- constriction ---- */
  function updateConstrict(dt){
    var prev = S.c;
    if(input.held) S.c += dt/0.35; else S.c -= dt/0.50;
    S.c = clamp(S.c, 0, 1);
    var scPrev = smoothstep(prev), sc = smoothstep(S.c);
    /* flicker: crossing 0.5 in either direction within 0.4s */
    if((scPrev < 0.5 && sc >= 0.5) || (scPrev > 0.5 && sc <= 0.5)){
      /* P1-4: the flicker penalty is itself rate-limited — at most one +4 per
         0.4s window, so frame-rate flicker spam stays inside the 25/s wake
         budget (0->100 never <4s, for any input pattern). Human-rate flicker
         is unaffected (a 0.4s window admits at most one human flip anyway). */
      if(S.time - S.crossT < 0.4 && S.time - S.crossWakeT >= 0.4){ addWake(4); S.crossWakeT = S.time; }
      S.crossT = S.time;
    }
    /* constriction ends: wake decay pauses for 2s */
    if(scPrev > 0.5 && sc <= 0.5) S.calmPause = 2;
    /* onboarding stage advance */
    if(S.ch===0 && S.roomIdx===0 && S.firstRun){
      if(S.ob.stage===0 && S.c > 0.8) S.ob.stage = 1;
      else if(S.ob.stage===1 && S.c < 0.2) S.ob.stage = 2;
    }
  }

  /* ---- swarm movement + flocking ---- */
  function updateSwarm(dt){
    var sc = smoothstep(S.c);
    /* finger target -> world (input.tx/ty already world pt) */
    if(input.hasTouch){ S.fx = input.tx; S.fy = input.ty; }
    /* P0-15: finger-shadow offset — while constricted, the ribbon's follow point
       sits 70pt above the touch point (the 20pt ribbon hides under the finger
       inside 34pt gates). Bloomed needs no offset: the disc is visible around it. */
    if(input.hasTouch && sc > 0.5){ S.fy = input.ty - 70; }
    if(S.scrambleT > 0) S.fx = 2*S.cx - S.fx;   /* thought-static mirrors intent */
    var speed = lerp(90, 192, sc);
    /* peristalsis ride boost */
    var boost = 0;
    if(S.room.peristalsis && !S.swallow){
      var wy = waveY();
      if(Math.abs(S.cy - wy) < 60 && sc > 0.7) boost = 40;
      /* P0-4: the wave GRABS bloomed discs — speed drops to 30, trapping
         them for the crush. Constrict or be ground down. */
      if(Math.abs(S.cy - wy) < 120 && sc < 0.5) speed = Math.min(speed, 30);
    }
    if(S.swallow) speed = 400/3;   /* the fall: shape is yours, speed isn't */
    speed += boost;
    /* P0-15: lateral smoothing tau — 40ms constricted (precision inside 34pt
       gates), 90ms bloomed (lag is forgiving); blended by sc so the rate never
       jumps mid-crossing. Steady-state lag = v*tau. */
    var TAU_C = 0.040, TAU_B = 0.090;
    var k = Math.min(1, dt/(TAU_C + (TAU_B - TAU_C)*(1 - sc)));
    var px = S.cx, py = S.cy;
    S.cx += (S.fx - S.cx) * k;
    S.cy += speed * dt;
    S.cvx = (S.cx - px)/dt; S.cvy = (S.cy - py)/dt;
    /* clamp inside walls (center) */
    var w = wallAt(S.room, S.cy), half = lerp(46, 10, sc);
    S.cx = clamp(S.cx, w[0]+half*0.5, w[1]-half*0.5);
    /* depth + score */
    var dy = Math.max(0, S.cy - py);
    S.depth += dy/50; S.score += dy/50; S.roomBase += dy/50;
    /* idle drift: slow spiral when untouched (retune: ±10, half the old reach) */
    if(!input.hasTouch && S.runTime > 5 && !RM()){
      S.fx = S.cx + Math.cos(S.time*0.5)*10;
    }
    /* flocking */
    buildHash();
    var dirX = 0, dirY = 1;
    var sp2 = S.cvx*S.cvx + S.cvy*S.cvy;
    if(sp2 > 1){ var il = 1/Math.sqrt(sp2); dirX = S.cvx*il; dirY = S.cvy*il; }
    var perX = -dirY, perY = dirX;
    /* P1-22: reuse a scratch buffer — no per-frame aliveList allocation */
    var an = 0;
    for(var i=0;i<64;i++) if(S.motes[i].alive) _aliveScratch[an++] = i;
    for(var j=0;j<an;j++){
      var mi = _aliveScratch[j], m = S.motes[mi];
      var tx, ty;
      if(sc < 1){
        var rr = 46*Math.sqrt((j+0.5)/Math.max(1,an));
        var aa = j*2.39996 + m.phase;
        tx = S.cx + Math.cos(aa)*rr; ty = S.cy + Math.sin(aa)*rr*0.92;
      } else { tx = S.cx; ty = S.cy; }
      var s = an<=1 ? 0 : j/(an-1);
      var rx = S.cx - dirX*s*110 + perX*Math.sin(s*9 + S.time*3.2)*10*(1-s);
      var ry = S.cy - dirY*s*110 + perY*Math.sin(s*9 + S.time*3.2)*10*(1-s);
      var gx = lerp(tx, rx, sc), gy = lerp(ty, ry, sc);
      /* spring + noise */
      var nz = snoise(m.x*0.05, m.y*0.05, S.time);
      var nz2 = snoise(m.y*0.05, m.x*0.05, S.time+7.3);
      m.vx += ((gx-m.x)*18 - m.vx*6 + nz*10) * dt;
      m.vy += ((gy-m.y)*18 - m.vy*6 + nz2*10) * dt;
      /* separation: up to 3 neighbors via hash */
      var checked = 0;
      var cell = hashCell(m.x, m.y);
      var o = S.hashHead[cell];
      while(o !== -1 && checked < 3){
        if(o !== mi){
          var om = S.motes[o];
          if(om.alive){
            var dx = m.x-om.x, dyy = m.y-om.y, d2 = dx*dx+dyy*dyy;
            if(d2 > 0.01 && d2 < 144){
              var dd = Math.sqrt(d2), push = (12-dd)/dd*30*dt;
              m.vx += dx/dd*push*dd*0.1; m.vy += dyy/dd*push*dd*0.1;
            }
            checked++;
          }
        }
        o = S.hashNext[o];
      }
      m.x += m.vx*dt; m.y += m.vy*dt;
      /* wall collision per mote */
      collideMote(m, sc);
    }
  }
  function hashCell(x, y){
    var cx = Math.floor(x/64), cy = Math.floor(y/64);
    return ((cx*73856093) ^ (cy*19349663)) & 1023;
  }
  function buildHash(){
    var h = S.hashHead;
    for(var i=0;i<1024;i++) h[i] = -1;
    for(var m=0;m<64;m++){
      if(!S.motes[m].alive) continue;
      var c = hashCell(S.motes[m].x, S.motes[m].y);
      S.hashNext[m] = h[c]; h[c] = m;
    }
  }
  var _scrapeCool = 0;
  function collideMote(m, sc){
    var w = wallAt(S.room, m.y), r = 3;
    var hit = 0;
    if(m.x < w[0]+r){ m.x = w[0]+r; if(m.vx < -30) hit = -1; m.vx = Math.abs(m.vx)*0.3; }
    else if(m.x > w[1]-r){ m.x = w[1]-r; if(m.vx > 30) hit = 1; m.vx = -Math.abs(m.vx)*0.3; }
    if(hit !== 0 && _scrapeCool <= 0 && S.grace <= 0){
      _scrapeCool = 0.6;
      S._scrapeT = S.time;   /* Threadneedle: marks the pinch window dirty */
      /* difficulty retune: scrape cost scales with chapter */
      var scN = S.ch <= 1 ? 2 : (S.ch <= 3 ? 3 : 4);
      var scW = S.ch <= 2 ? 8 : 10;
      loseMotes(scN, 'wall');
      addWake(scW);
      sfx('scrape');
      /* first scrape ever: the god notices — wake jumps to 70, once */
      if(saveRef && !saveRef.stats.firstScrapeWake){
        saveRef.stats.firstScrapeWake = true; requestSave(saveRef);
        S.wake = Math.max(S.wake, 70);
        setWhisper('it felt that', 3);
      }
      /* P1-19c: scrape no longer opens the way down (see spore-drink site) */
    }
  }
  function waveY(){
    /* P0-4: returns the nearest wave (of 5 interleaved) behind the player,
       or the primary wave if none behind. Bots use this for dodge logic. */
    var span = S.room.len + 400;
    var best = null, bestDist = 1e9;
    for(var wi=0;wi<(S.room.waveCount||5);wi++){
      var wy = ((S.time*300 + wi*span/(S.room.waveCount||5)) % span) - 200;
      var d = S.cy - wy;
      if(d > 0 && d < bestDist){ bestDist = d; best = wy; }
    }
    if(best === null) best = ((S.time*300) % span) - 200;
    return best;
  }

  /* ---- wake ---- */
  function addWake(v){ S.wake = clamp(S.wake + v, 0, 100); }
  function updateWake(dt){
    var sc = smoothstep(S.c);
    var src = sc > 0.5 ? 9 : 1.5;
    /* calm decay per chapter (retune); Brain bloomed RISES at +3.5/s net —
       v1 board: quiet must be earned by stillness, not blooming */
    var DECAY = [6.0, 5.5, 5.0, 4.5, 4.0, 3.0];
    var decay = S.tide ? 2 : (DECAY[S.ch] || 6);
    if(S.ch === 4 && sc <= 0.5) src = 7.5;   /* 7.5 - 4.0 = +3.5/s net */
    /* mutator: heavy — wake decays 20% slower */
    if(S.mutHeavy) decay *= 0.8;
    /* wake decay pauses 2s after constriction ends (decremented in update()) */
    if(S.calmPause > 0) decay = 0;
    var d = (src - decay) * dt;
    d = clamp(d, -25*dt, 25*dt);            /* rate limit: 0->100 takes >=4s */
    S.wake = clamp(S.wake + d, 0, 100);
    if(S.immuneLock > 0) S.immuneLock -= dt;
    /* scout cell: ch4-5, wake>=85, one per room, 1.5s telegraph */
    if((S.ch === 4 || S.ch === 5) && S.wake >= 85 && !S.tide && !S.scout && !S.scoutUsed && S.mode === 'play'){
      S.scoutUsed = true;
      S.scout = { phase:'telegraph', t:1.5, x:S.cx + (S.cx > 0 ? -1 : 1)*120, y:S.cy + 350, cell:null };
      setWhisper('something stirs in the dark', 2.5);
      sfx('immuneTelegraph');
    }
    var trig = S.ch >= 4 ? 90 : 100;   /* immune trigger lowered in Brain/Waking */
    /* P0-4: don't start a tide on top of an active scout (15-hunter overlap) */
    if(S.wake >= trig && S.immuneLock <= 0 && !S.tide && !S.scout){
      /* P1-2: the actual immune-response trigger (trig is 90 in ch4/5, 100
         elsewhere — this hooks the real threshold, never a hardcoded 100).
         The god has fully woken: the Gentle Dream is lost for this run. */
      S.immuneEverTriggered = true;
      S.tide = { phase:'telegraph', t:1.5, wave:0, waveT:0, tTotal:0, lost:0, cells:[] };
      for(var i=0;i<24;i++) S.tide.cells.push({x:0,y:0,vx:0,vy:0,on:false,cool:0,miss:0});
      S.wake = 55;
      S.immuneLock = 20;
      sfx('immuneTelegraph');
      setWhisper('the god stirs', 2.5);
    }
    /* chapter wake sampling for end bonus */
    S.chWakeSum += S.wake*dt; S.chWakeN += dt;
  }
  function setWhisper(t, dur){ S.whisper = t; S.whisperT = dur||3; }

  /* ---- spores & chains ---- */
  function updateSpores(dt){
    if(S.chainT > 0){ S.chainT -= dt; if(S.chainT <= 0) S.chain = 0; }
    var sc = smoothstep(S.c);
    if(sc >= 0.6) return;   /* must be bloomed to drink */
    var spores = S.room.spores;
    for(var i=0;i<spores.length;i++){
      var sp = spores[i];
      if(sp.taken) continue;
      if(!RM()) sp.x += Math.sin(S.time*0.8 + i*1.7)*4*dt;   /* drift (frozen under reduced motion) */
      var dx = sp.x - S.cx, dy = sp.y - S.cy;
      if(dx*dx + dy*dy > 90*90) continue;
      /* within 90pt of center: check a mote is close */
      var drunk = false;
      for(var m=0;m<64 && !drunk;m++){
        var mo = S.motes[m];
        if(!mo.alive) continue;
        var ddx = sp.x-mo.x, ddy = sp.y-mo.y;
        if(ddx*ddx + ddy*ddy < 256) drunk = true;
      }
      if(drunk) drinkSpore(sp);
    }
  }
  function drinkSpore(sp){
    sp.taken = true;
    S.chain++; S.chainT = 3;
    if(S.chain === 8){ sfx('exhale'); }   /* the god felt something pleasant */
    var val = 10 + 2*Math.max(0, S.chain-4);
    S.score += val; S.roomBase += val;
    S.stats.spores++;
    S.stats.sporesRun++;
    if(saveRef) saveRef.stats.spores++;
    /* mutator: hunger — spores give half relief */
    var relief = S.wake >= 70 ? -0.15 : -0.3;
    if(S.mutHunger) relief *= 0.5;
    addWake(relief);   /* restless water gives less relief */
    S.surplusT = 0;
    if(S.alive < 56){   /* spores heal up to 56; score-only above */
      for(var m=0;m<64;m++){
        if(!S.motes[m].alive){
          var mo = S.motes[m];
          mo.alive = true; mo.x = S.cx; mo.y = S.cy; mo.vx = 0; mo.vy = 0;
          S.alive++;
          break;
        }
      }
    }
    sfx('spore', {chain: Math.min(S.chain,12)});
    if(S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage===2){
      /* P1-19c: the way down opens on drinking, not on scraping */
      S.ob.stage = 3;
      setWhisper('+1 mote — the swarm grows · the way down opens', 3);
    }
  }

  /* ---- damage / death / respawn ---- */
  function loseMotes(n, cause){
    if(S.mode !== 'play' || S.grace > 0) return;
    if(S.iframes > 0) return;   /* P0-4: acid respects iframes (was exempt, enabling -7 bursts) */
    n = Math.min(n, 6);                       /* per-event cap (rule 1) */
    if(n <= 0) return;
    /* outer motes die first: sort alive by dist desc (insertion, no alloc) */
    var order = [];
    for(var m=0;m<64;m++){
      if(!S.motes[m].alive) continue;
      var dx = S.motes[m].x-S.cx, dy = S.motes[m].y-S.cy;
      order.push([dx*dx+dy*dy, m]);
    }
    order.sort(function(a,b){ return b[0]-a[0]; });
    for(var k=0;k<Math.min(n, order.length);k++) S.motes[order[k][1]].alive = false;
    S.alive -= Math.min(n, order.length);
    S.roomLost += n;
    S.chapterMotesLost += Math.min(n, order.length);   /* BH-01: Unbroken accounting */
    S.runMotesLost = (S.runMotesLost||0) + Math.min(n, order.length);
    S.iframes = (cause === 'the throat') ? 0.25 : 0.6;   /* P0-4: throat grind bypasses long iframes */
    sfx('moteLoss');
    if(saveRef){
      saveRef.stats.deaths += 0; /* deaths counted on full dissolve only */
    }
    if(S.alive <= 0) startDeath(cause);
  }
  function startDeath(cause){
    S.mode = 'dying'; S.dyingT = 1.6; S.deathCause = cause;
    S.chapterMotesLost += Math.max(S.alive, 1);   /* death voids Unbroken */
    S.runMotesLost = (S.runMotesLost||0) + Math.max(S.alive, 1);
    sfx('death');
    if(saveRef){
      saveRef.stats.deaths++;
      var dc = saveRef.stats.deathCause;
      dc[cause] = (dc[cause]||0)+1;
      checkSigils();
    }
    S.stats.deaths++;
  }
  function finishDeath(){
    /* respawn at last resting fold */
    var cp = S.checkpoint;
    S.ch = cp.ch; S.roomIdx = cp.room;
    loadRoom(S.ch, S.roomIdx);
    S.alive = 24;
    for(var m=0;m<64;m++) S.motes[m].alive = m < 24;
    S.wake = 40; S.grace = 1.2; S.iframes = 0;
    S.tide = null; S.immuneLock = 8;
    S.mode = 'play';
    S.streak = 0;
    /* the fold re-opens: a ring marks where you returned */
    S.gateFoldT = 2;
    sfx('gateChime');
    /* E1/BH-04: death is not a farm — score and spore counters return to the fold */
    S.score = (cp.score !== undefined) ? cp.score : S.score;
    S.stats.sporesRun = 0;
    /* P2-15: causes that already carry an article ('the throat') must not
       gain a second one — never 'the the throat took you' */
    var line = (/^(the|a|an)\s/i.test(S.deathCause) ? '' : 'the ') + S.deathCause + ' took you';
    if(saveRef && !saveRef.firstDeathSeen){
      saveRef.firstDeathSeen = true;
      /* first death: the doc's line, then the cause (rule 9: the cause is never suppressed) */
      S._deathQueue = [ ['The god did not notice you. Drift again.', 5], [line, 3] ];
      setWhisper(S._deathQueue[0][0], S._deathQueue[0][1]);
    } else {
      setWhisper(line, 3);
    }
    if(saveRef){
      saveRef.checkpoint = { ch:S.ch, room:S.roomIdx, motes:24, wake:40, score:Math.floor(S.score), depth:Math.floor(S.depth),
                             immune:(S.immuneEverTriggered?1:0) };   /* P1-2: the flag survives death */
      requestSave(saveRef);
    }
  }

  /* ---- immune tide: white-cell AI ---- */
  var _cellPool = [];
  for(var cp0=0;cp0<24;cp0++) _cellPool.push({x:0,y:0,vx:0,vy:0,on:false,cool:0,miss:0});
  S._cells = _cellPool;   /* read-only for RENDER */
  function startTide(forced){
    if(S.tide || S.mode !== 'play') return;
    /* P1-8: forced (Waking timer) tides are the god's pacing, not a response to
       player wake — they don't count toward wake-triggered tide challenges. */
    S.tide = { phase:'telegraph', t:1.5, wave:0, waveT:0, tTotal:0, lost:0, cells:[], forced:!!forced };
    for(var i=0;i<24;i++) S.tide.cells.push({x:0,y:0,vx:0,vy:0,on:false,cool:0,miss:0});
    S.wake = 55;
    S.immuneLock = 20;
    sfx('immuneTelegraph');
    setWhisper('the god stirs', 2.5);
  }
  function updateTide(dt){
    var T = S.tide;
    if(!T) return;
    if(T.phase === 'telegraph'){
      T.t -= dt;
      if(T.t <= 0){ T.phase = 'waves'; T.tTotal = 12; T.waveT = 0; T.wave = 0; }
      return;
    }
    T.tTotal -= dt; T.waveT -= dt;
    var speed = 140 + 5*S.ch;   /* P0-4: design spec 140->165 (was 180+8*ch=220, overshoot) */   /* retune: faster cells, faster in deep chapters */
    if(T.wave < 3 && T.waveT <= 0 && !T.pending){
      /* P0-4: 1.2s spawn telegraph — positions are fixed and shown as ghost
         rings before cells activate. No hazard spawns without telegraph (rule 2). */
      var pcount = 4 + (T.wave % 3 === 2 ? 2 : 0);
      var padapt = Math.min(120, Math.max(0, (S.tideCount-1))*30);
      var pspots = [];
      for(var pi=0;pi<pcount;pi++){
        var pside = (pi % 2 === 0) ? -1 : 1;
        var pwy = S.cy + 350 - padapt + pi*40;
        var pw = wallAt(S.room, pwy);
        pspots.push({x: pside < 0 ? pw[0]-30 : pw[1]+30, y: pwy});
      }
      T.pending = { t:1.2, spots:pspots };
      sfx('immuneTelegraph');
    }
    if(T.pending){
      T.pending.t -= dt;
      if(T.pending.t <= 0){
        /* spawn wave of 4-6 at the telegraphed wall points */
        var spawned = 0;
        for(var i=0;i<_cellPool.length && spawned<T.pending.spots.length;i++){
          var cl = _cellPool[i];
          if(cl.on) continue;
          var sp = T.pending.spots[spawned];
          cl.x = sp.x; cl.y = sp.y; cl.vx = 0; cl.vy = 0;
          cl.on = true; cl.cool = 0; cl.miss = 0;
          spawned++;
        }
        T.pending = null;
        T.wave++; T.waveT = 4;
      }
    }
    var px = S.cx + S.cvx*0.5, py = S.cy + S.cvy*0.5;   /* predicted pos */
    var minD = 1e9;
    for(var j=0;j<_cellPool.length;j++){
      var c2 = _cellPool[j];
      if(!c2.on) continue;
      var dx = px-c2.x, dy = py-c2.y, d = Math.sqrt(dx*dx+dy*dy)||1;
      if(d < minD) minD = d;
      var want = speed;
      if(d < 60) want = speed * (d/60);                 /* arrive-slow */
      c2.vx += ((dx/d)*want - c2.vx) * Math.min(1, dt*3);
      c2.vy += ((dy/d)*want - c2.vy) * Math.min(1, dt*3);
      /* separation */
      for(var k2=0;k2<_cellPool.length;k2++){
        if(k2===j) continue;
        var o = _cellPool[k2];
        if(!o.on) continue;
        var sx = c2.x-o.x, sy = c2.y-o.y, sd = Math.sqrt(sx*sx+sy*sy);
        if(sd > 0.01 && sd < 40){ c2.vx += sx/sd*60*dt; c2.vy += sy/sd*60*dt; }
      }
      c2.x += c2.vx*dt; c2.y += c2.vy*dt;
      if(c2.cool > 0) c2.cool -= dt;
      /* miss -> despawn */
      if(d > 500){ c2.miss += dt; if(c2.miss > 3){ c2.on = false; continue; } }
      else c2.miss = 0;
      /* contact with any mote */
      if(c2.cool <= 0){
        for(var m=0;m<64;m++){
          var mo = S.motes[m];
          if(!mo.alive) continue;
          var mx = mo.x-c2.x, my = mo.y-c2.y;
          if(mx*mx + my*my < 196){
            loseMotes(3, 'white cell');
            c2.cool = 0.5; T.lost += 3;
            break;
          }
        }
      }
    }
    /* audio: immune plucks map to nearest-cell proximity 0..1 */
    S.cellNear = minD < 400 ? clamp(1 - minD/400, 0, 1) : 0;
    if(T.tTotal <= 0){
      var clean = T.lost === 0;
      for(var q=0;q<_cellPool.length;q++) _cellPool[q].on = false;
      S.tide = null;
      if(clean){
        addWake(-5); S.score += 150;
        setWhisper('clean evasion — the tide passes', 2.5);
        sfx('settle');   /* the organ swell resolves to a single low tone; it settles */
        S.blushRecede = 1;
      }
    }
  }

  /* ---- scout cell: single white cell, 1.5s telegraph, hunts briefly ---- */
  function updateScout(dt){
    var sc2 = S.scout;
    if(!sc2) return;
    if(sc2.phase === 'telegraph'){
      sc2.t -= dt;
      if(sc2.t <= 0){
        for(var i=0;i<_cellPool.length;i++){
          var cl = _cellPool[i];
          if(cl.on) continue;
          var w = wallAt(S.room, sc2.y);
          cl.x = sc2.x; cl.y = sc2.y; cl.vx = 0; cl.vy = 0;
          cl.on = true; cl.cool = 0; cl.miss = 0; cl.scout = true;
          sc2.cell = cl;
          break;
        }
        sc2.phase = 'hunt'; sc2.t = 6;
        sfx('immuneTelegraph');
      }
      return;
    }
    sc2.t -= dt;
    var c2 = sc2.cell;
    if(c2 && c2.on){
      var speed = 140 + 5*S.ch;   /* P0-4: design spec 140->165 (was 180+8*ch=220, overshoot) */
      var dx = S.cx-c2.x, dy = S.cy-c2.y, d = Math.sqrt(dx*dx+dy*dy)||1;
      /* audio: scout cell also drives immune proximity */
      if(!S.tide) S.cellNear = 1 - clamp(d/400, 0, 1);
      var want = d < 60 ? speed*(d/60) : speed;
      c2.vx += ((dx/d)*want - c2.vx)*Math.min(1, dt*3);
      c2.vy += ((dy/d)*want - c2.vy)*Math.min(1, dt*3);
      c2.x += c2.vx*dt; c2.y += c2.vy*dt;
      if(c2.cool > 0) c2.cool -= dt;
      if(c2.cool <= 0){
        for(var m=0;m<64;m++){
          var mo = S.motes[m]; if(!mo.alive) continue;
          var mx = mo.x-c2.x, my = mo.y-c2.y;
          if(mx*mx+my*my < 196){ loseMotes(3, 'white cell'); c2.cool = 0.5; break; }
        }
      }
    }
    if(sc2.t <= 0){ if(c2){ c2.on = false; c2.scout = false; } S.scout = null; }
  }

  /* ---- peristalsis & scripted events ---- */
  function updatePeristalsis(dt){
    if(!S.room.peristalsis || S.swallow) return;
    var span = S.room.len + 400;
    var sc = smoothstep(S.c);
    S.waveDmgT = Math.max(0, (S.waveDmgT || 0) - dt);
    /* P0-4: 5 interleaved waves (every ~2.5s in a 2000pt room). The Throat is
       a gauntlet: constrict to slip through, bloom to be crushed. */
    for(var wi=0;wi<(S.room.waveCount||5);wi++){
      var wtime = S.time*300 + wi*span/(S.room.waveCount||5);
      var wid = wi*1000 + Math.floor(wtime/span);
      var wy = (wtime % span) - 200;
      var distBehind = S.cy - wy;
      /* crush telegraph — wave within 1.5s and player bloomed (vulnerable) */
      if(distBehind > 0 && distBehind < 210 && sc < 0.5 && wid !== S.crushTeleId && S.grace <= 0){
        S.crushTeleId = wid;
        setWhisper('the throat tightens', 2);
        sfx('valveInhale');
      }
      /* P0-4: crush damage. Constricted (sc>0.5) slip through (-4, once per
         wave). Bloomer discs (sc<0.5) are GROUND DOWN (-8 every 0.5s)
         — the death spiral that teaches constriction. Rule 1 cap: 8. */
      if(Math.abs(S.cy - wy) < 60 && S.grace <= 0){
        if(sc < 0.5){
          if(S.waveDmgT <= 0){
            S.waveDmgT = S.room.waveTick || 0.35;   /* P1-1: per-room crush tick (0:2 gentled) */
            loseMotes(S.room.waveDmg || 6, 'the throat');   /* P0-4: rule 1 cap (6) */
            addWake(8);
            sfx('scrape');
            setWhisper('crushed by the throat', 2);
          }
        } else if(wid !== S.hitWaveId){
          S.hitWaveId = wid;
          loseMotes(4, 'the throat');
          addWake(8);
          sfx('scrape');
        }
      }
    }
  }
  function updateEvents(dt){
    var evs = S.room.events;
    for(var i=0;i<evs.length;i++){
      var e = evs[i];
      if(e.done) continue;
      if(S.cy >= e.y){
        e.done = true;
        if(e.type === 'swallow'){
          S.swallow = { t: 3 };
          sfx('valveSlam');
          setWhisper('THE FIRST SWALLOW', 3);
        } else {
          m2_handleEvent(S, e);
        }
      }
      if(e.type === 'swallow' && !e.done && !e.inhaled && S.cy >= e.y - 250){
        /* the god inhales: 1.2s telegraph before the peristalsis wave (render §3) */
        e.inhaled = true;
        S.swallowInhale = 1.2;
        setWhisper('the god swallows', 2);
        sfx('valveInhale');
      }
    }
    if(S.swallow){
      S.swallow.t -= dt;
      /* debris */
      for(var d=0;d<S.debris.length;d++){
        var db = S.debris[d];
        if(!db.on){
          if(Math.random() < 0.25){
            db.on = true;
            db.x = S.cx + (Math.random()*300-150);
            db.y = S.cy - 200 - Math.random()*200;
            db.vx = (Math.random()*40-20); db.vy = 260;
          }
        } else {
          db.x += db.vx*dt; db.y += db.vy*dt;
          if(db.y > S.cy + 300) db.on = false;
          else {
            for(var m=0;m<64;m++){
              var mo = S.motes[m];
              if(!mo.alive) continue;
              var dx = db.x-mo.x, dy = db.y-mo.y;
              if(dx*dx+dy*dy < 100){
                db.on = false;
                loseMotes(2, 'rubble'); addWake(4);
                break;
              }
            }
          }
        }
      }
      if(S.swallow.t <= 0){ S.swallow = null; for(var z=0;z<S.debris.length;z++) S.debris[z].on=false; }
    }
  }

  /* ---- nerves ---- */
  function updateNerves(dt){
    var sc = smoothstep(S.c);
    for(var i=0;i<S.room.nerves.length;i++){
      var nv = S.room.nerves[i];
      if(nv.read) continue;
      var dx = nv.x-S.cx, dy = nv.y-S.cy;
      if(dx*dx+dy*dy < 2500 && sc < 0.5){
        nv.read = true;
        /* BH-04: nerve reads are per-run; death cannot re-farm the +4 motes */
        if(!S._visited) S._visited = {};
        var nvk = S.ch+':'+S.room.n;
        if(!S._visited[nvk]) S._visited[nvk] = {};
        if(!S._visited[nvk].nerves) S._visited[nvk].nerves = [];
        S._visited[nvk].nerves[i] = true;
        var msg = PRESEED_MSGS[nv.msg % PRESEED_MSGS.length];
        /* your own past message at this knot takes precedence: remembered (+4 motes) */
        var mine = null;
        if(saveRef && saveRef.secrets.messages){
          for(var mm=saveRef.secrets.messages.length-1; mm>=0; mm--){
            var pm = saveRef.secrets.messages[mm];
            if(pm.ch === S.ch){ mine = pm; break; }
          }
        }
        if(mine){
          msg = '\u201c' + mine.text + '\u201d \u2014 you, once';
          if(S.alive < S.maxAlive){
            for(var q=0;q<4 && S.alive<S.maxAlive;q++){
              for(var m2=0;m2<64;m2++) if(!S.motes[m2].alive){ S.motes[m2].alive=true; break; }
              S.alive++;
            }
          }
        }
        S.nerveMsg = msg; S.nerveT = 5;
        sfx('secret');
      }
    }
    if(S.nerveT > 0) S.nerveT -= dt;
  }

  /* ---- dream events: the god acts unprompted (horror §1c) ----
     ambient, harmless, untelegraphed, never damaging; max once per room,
     never during tides/silences/set-pieces, never repeated identically in a run. */
  function updateDreamEvents(dt){
    if(S.dreamT === undefined || S.dreamT === null) S.dreamT = 60 + Math.random()*60;
    if(S.dreamDone || S.mode !== 'play') return;
    if(S.tide || S.skipT > 0 || S.lidT > 0 || S.swallow || S.flash) return;
    S.dreamT -= dt;
    if(S.dreamT > 0) return;
    S.dreamT = 60 + Math.random()*60;
    S.dreamDone = true;
    if(!S._dreamUsed) S._dreamUsed = [];
    var pool = [0,1,2,3,4].filter(function(i){ return S._dreamUsed.indexOf(i) < 0; });
    if(!pool.length){ S._dreamUsed = []; pool = [0,1,2,3,4]; }
    var pick = pool[Math.floor(Math.random()*pool.length)];
    S._dreamUsed.push(pick);
    if(pick === 0){
      /* a single heartbeat arrives ~300ms late, quietly */
      if(typeof A !== 'undefined' && A && A.lateBeat) A.lateBeat();
    } else if(pick === 1){
      /* rose blush washes across the walls and recedes — no tide follows */
      S.blushT = 4; S.blushHarmless = true;
    } else if(pick === 2){
      /* a distant bell-tone at quarter volume — no acid follows */
      sfx('bellFar');
    } else if(pick === 3){
      /* all cilia lean downstream for 4s, then relax */
      S.ciliaLeanT = 4;
    } else {
      /* music drops to heartbeat-only for 3s, then returns quietly */
      S.duckDreamT = 3;
    }
  }

  /* ---- room / chapter transitions ---- */
  function clearRoom(){
    /* BH-12: grace guard on room clear — the next room's mouth cannot bite on entry */
    S.grace = Math.max(S.grace, 1);
    var bonus = 0;
    if(S.roomLost === 0){
      bonus = S.roomBase * 0.5;
      S.score += bonus;
      S.streak++;
      if(saveRef){
        saveRef.stats.unbrokenRooms++;
        if(S.streak > (saveRef.records.longestStreak||0)) saveRef.records.longestStreak = S.streak;
      }
      setWhisper('UNBROKEN', 2.5);
    } else {
      /* breaking a streak >=3 is grieved, not punished (horror §1e) */
      if(S.streak >= 3){ sfx('streakBreak'); S.streakRingT = 2; }
      S.streak = 0;
    }
    sfx('checkpoint');
    /* P2-16: the resting fold — a gold ring on EVERY room clear, reusing the
       gateFoldT fold-ring renderer. Purely visual, so it is suppressed under
       reduced motion (P1-10). The chapter gate keeps its chime. */
    if(!RM()) S.gateFoldT = 2;
    /* P1-12: the deep dream is one room per chapter */
    var roomsThisChapter = S.dream ? 1 : 7;
    if(S.roomIdx >= roomsThisChapter - 1){
      if(typeof A !== 'undefined' && A) A.sfx('gateChime');
    }
    S.roomIdx++;
    if(S.roomIdx >= roomsThisChapter){
      /* chapter complete */
      var avg = S.chWakeN > 0 ? S.chWakeSum/S.chWakeN : 0;
      var wbonus = (100 - avg) * 5;
      S.score += wbonus;
      if(saveRef && !S.daily && !S.dream){
        saveRef.stats.wakeSum[S.ch] += S.chWakeSum;
        saveRef.stats.wakeN[S.ch] += S.chWakeN;
        var sc2 = Math.floor(S.score);
        if(sc2 > (saveRef.records.chapters[S.ch]||0)) saveRef.records.chapters[S.ch] = sc2;
        if(S.ch + 1 > saveRef.furthest && S.ch + 1 < 6) saveRef.furthest = S.ch + 1;
      }
      S.doneCh = S.ch;
      checkChallenges('chapter');   /* BH-02: chapter-gated grants only at chapter-clear */
      /* per-chapter counters reset for the next chapter */
      S.chConstr = 0; S.chapterMotesLost = 0; S.chTides = 0; S.quietThisChapter = 0;
      S.stats.offbeat = 0; S.stats.watcherAlerts = 0;
      if(S.daily && S.ch >= 2){
        S.mode = 'complete';
        finishDaily();
        if(saveRef) requestSave(saveRef);
        return;
      }
      S.ch++;
      A.setChapter(S.ch);   /* motif follows the chamber */
      if(S.ch >= ROOMS_BY_CHAPTER.length){
        S.mode = 'complete';
        if(saveRef && Math.floor(S.score) > saveRef.records.runBest){
          saveRef.records.runBest = Math.floor(S.score);
          /* the best run leaves a haunt — a past self to outrun */
          saveRef.haunt = { depth: Math.floor(S.depth), score: Math.floor(S.score) };
          sfx('record');
        }
        if(saveRef) requestSave(saveRef);
        return;
      }
      if(S.ch === 5){
        S.wakingTime = 0;
        /* UX D4: the Waking arrives as a 3s fiction, not a teleport.
           wake lerps from arrival value to 85; no hazard may strike during the ramp. */
        S.wakeRampT = 3; S.wakeRampFrom = S.wake;
        S.grace = Math.max(S.grace, 3);
        S.banner = 'THE WAKING'; S.bannerSub = 'it is waking'; S.bannerT = 4;
        setWhisper('do not let it notice', 2.5);
      }
      S.roomIdx = 0;
      S.chWakeSum = 0; S.chWakeN = 0;
      if(S.ch !== 5){ S.banner = CHAPTERS[S.ch].name; S.bannerSub = CHAPTERS[S.ch].sub; S.bannerT = 4; }
    }
    S.checkpoint = { ch: S.ch, room: S.roomIdx, score: Math.floor(S.score), sporesRun: S.stats.sporesRun };
    if(saveRef){
      saveRef.checkpoint = { ch:S.ch, room:S.roomIdx, motes:S.alive, wake:Math.round(S.wake),
                             score:Math.floor(S.score), depth:Math.floor(S.depth),
                             immune:(S.immuneEverTriggered?1:0) };   /* P1-2: the flag survives chapter transitions */
      requestSave(saveRef);
    }
    checkSigils();
    loadRoom(S.ch, S.roomIdx);
  }

  /* ---- main step ---- */
  function update(){
    var dt = DT;
    if(S.mode !== 'play'){
      if(S.mode === 'dying'){
        S.dyingT -= dt;
        /* scatter motes visually (render reads dyingT) */
        if(S.dyingT <= 0) finishDeath();
      }
      return;
    }
    /* mutator: haste — the dream runs 10% faster */
    if(S.mutHaste) dt *= 1.1;
    S.time += dt; S.runTime += dt;
    if(S.flash){ m2_updateFlash(S, dt); return; }
    S.prevCy = S.cy;
    if(S.iframes > 0) S.iframes -= dt;
    if(S.grace > 0) S.grace -= dt;
    if(_scrapeCool > 0) _scrapeCool -= dt;
    if(S.whisperT > 0){ S.whisperT -= dt; if(S.whisperT <= 0 && S._deathQueue && S._deathQueue.length){ S._deathQueue.shift(); if(S._deathQueue.length) setWhisper(S._deathQueue[0][0], S._deathQueue[0][1]); } }
    if(S.bannerT > 0) S.bannerT -= dt;
    if(S.stillT > 0){ S.stillT -= dt; dt *= 0.3; }   /* BH-03: single decrement + scale here; m2 must not re-scale */
    if(S.calmPause > 0) S.calmPause -= dt;
    if(S.swallowInhale > 0) S.swallowInhale -= dt;
    if(S.duckDreamT > 0) S.duckDreamT -= dt;
    if(S.blushT > 0) S.blushT -= dt;
    if(S.gateFoldT > 0) S.gateFoldT -= dt;
    if(S.ghostT > 0) S.ghostT = Math.max(0, S.ghostT - dt);   /* P1-9: ghost disc fade (clamped) */
    if(S.streakRingT > 0) S.streakRingT -= dt;
    if(S.inhaleSwellT > 0) S.inhaleSwellT -= dt;
    if(S.ciliaLeanT > 0) S.ciliaLeanT -= dt;
    if(S.blushRecede > 0) S.blushRecede -= dt;
    updateConstrict(dt);
    updateSwarm(dt);
    updateWake(dt);
    if(!S._m2) S._m2 = { s:S, input:input, loseMotes:loseMotes, addWake:addWake, startDeath:startDeath, startTide:startTide };
    m2_updateChapter(S._m2, dt);
    updateSpores(dt);
    updateTide(dt);
    updateScout(dt);
    updatePeristalsis(dt);
    updateEvents(dt);
    updateNerves(dt);
    updateDreamEvents(dt);
    /* surplus mote decay */
    if(S.alive > 48){
      S.surplusT += dt;
      if(S.surplusT > 12){   /* retune: -1 per 12s above 48 */
        S.surplusT = 0;
        /* kill outermost */
        var bi=-1, bd=-1;
        for(var m=0;m<64;m++){
          if(!S.motes[m].alive) continue;
          var dx=S.motes[m].x-S.cx, dy=S.motes[m].y-S.cy, d2=dx*dx+dy*dy;
          if(d2>bd){ bd=d2; bi=m; }
        }
        if(bi>=0){ S.motes[bi].alive=false; S.alive--; }
      }
    }
    /* ---- Threadneedle: clean constricted passes through pinches <=70pt ---- */
    var scT = smoothstep(S.c);
    var wT = roomWidthAt(S.room, S.cy);
    if(wT < 70 && scT > 0.5 && !S._inNarrow){
      S._inNarrow = true; S._narrowScrapeT = S._scrapeT || -10;
    }
    if(S._inNarrow && wT >= 70){
      S._inNarrow = false;
      if((S._scrapeT || -10) <= S._narrowScrapeT && scT > 0.5){
        S.stats.threaded = (S.stats.threaded||0)+1;
        if((S.stats.threaded%5) === 0) setWhisper('a thread is kept', 2);
      }
    }
    /* room-0 gate: the way down stays folded until the onboarding is kept (stage 3) */
    var gated = (S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage < 3);
    if(gated && S.cy >= S.room.len - 60){
      S.cy = S.room.len - 60;
      if(!S._gateWhisperT || S.time - S._gateWhisperT > 6){
        S._gateWhisperT = S.time;
        setWhisper(S.ob.stage < 2 ? 'hold, then release' : 'seek the seeds', 2.5);
      }
    }
    /* room clear */
    if(S.cy >= S.room.len && !gated) clearRoom();
    /* deep stat */
    if(saveRef && S.depth > saveRef.stats.deepest) saveRef.stats.deepest = Math.floor(S.depth);
  }

  /* ---- public ---- */
  return {
    s: S, input: input,
    newRun: newRun,
    loadCheckpoint: loadCheckpoint,
    startFromCheckpoint: startFromCheckpoint,
    update: update,
    loseMotes: loseMotes,   /* test hook */
    addWake: addWake,
    startDeath: startDeath,
    startTide: startTide,
    waveY: waveY,   /* P0-4: exposed for bot dodge logic (peristalsis wave) */
    state: function(){
      return { mode:S.mode, ch:S.ch, room:S.roomIdx, cy:Math.round(S.cy*10)/10,
               cx:Math.round(S.cx*10)/10, motes:S.alive, wake:Math.round(S.wake*100)/100,
               score:Math.floor(S.score), depth:Math.floor(S.depth), c:Math.round(S.c*1000)/1000,
               streak:S.streak, chain:S.chain, time:Math.round(S.time*100)/100,
               tide: !!S.tide, whisper: S.whisper };
    }
  };
}

/* ============================ RENDER ================================ */
/* Reads sim state; never mutates it (view/camera are render-owned). */
var render = {
  bgGrad: null, bgH: 0, grain: null, glowGold: null, glowPale: null, glowRose: null,
  frameTimes: [], degraded: 0, lastT: 0
};
function SX(x){ return x + view.W/2; }
function SY(y){ return y - view.camY; }
function makeGlowSprite(color, edge){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0, color);
  gr.addColorStop(0.35, color.replace('1)', '0.5)'));
  /* hot rim: the swarm's edge burns */
  gr.addColorStop(0.72, (edge||color).replace('1)', '0.35)'));
  gr.addColorStop(1, color.replace('1)', '0)'));
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  return c;
}
function renderInit(){
  render.glowGold = makeGlowSprite('rgba(255,217,138,1)', 'rgba(255,157,77,1)');
  render.glowPale = makeGlowSprite('rgba(232,240,255,1)', 'rgba(255,157,77,1)');
  render.glowRose = makeGlowSprite('rgba(196,61,90,1)', 'rgba(255,157,77,1)');
  var gc = document.createElement('canvas'); gc.width = gc.height = 128;
  var gg = gc.getContext('2d');
  var id = gg.createImageData(128,128);
  var rnd = mulberry32(99);
  for(var i=0;i<id.data.length;i+=4){
    var v = Math.floor(rnd()*255);
    id.data[i]=v; id.data[i+1]=v*0.9; id.data[i+2]=v*0.8; id.data[i+3]=10;
  }
  gg.putImageData(id,0,0);
  render.grain = gc;
  /* white-cell occlusion sprite: a pale-rimmed dark core that eats the swarm's light */
  var cc = document.createElement('canvas'); cc.width = cc.height = 64;
  var cx = cc.getContext('2d');
  var cg2 = cx.createRadialGradient(32,32,4,32,32,30);
  cg2.addColorStop(0, 'rgba(10,6,8,0.95)');
  cg2.addColorStop(0.55, 'rgba(40,26,24,0.85)');
  cg2.addColorStop(0.8, 'rgba(203,185,168,0.9)');
  cg2.addColorStop(1, 'rgba(160,120,110,0)');
  cx.fillStyle = cg2;
  cx.fillRect(0,0,64,64);
  render.cellSprite = cc;
}
function drawTissue(S){
  var W = view.W, H = view.H;
  var pal = (CHAPTERS[S.ch] && CHAPTERS[S.ch].pal) || { tissue:['#241009','#1a0d07','#140a08'], rib:'rgba(90,44,26,0.5)' };
  var palKey = S.ch + 'x' + H;
  if(!render.bgGrad || render.bgKey !== palKey){
    var g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, pal.tissue[0]); g.addColorStop(0.5, pal.tissue[1]); g.addColorStop(1, pal.tissue[2]);
    render.bgGrad = g; render.bgKey = palKey;
  }
  ctx.fillStyle = render.bgGrad;
  ctx.fillRect(0,0,W,H);
  var beat = audio ? audio.beatPhase() : 0;
  var breathe = RM() ? 1 : 1 + 0.01*Math.sin(beat*Math.PI*2);
  /* Heart: the tissue itself pulses crimson; Waking: dawn lerps the dark out */
  if(pal.pulse){
    var hp = RM() ? 0.75 : 0.5 + 0.5*Math.sin(beat*Math.PI*2);
    ctx.fillStyle = 'rgba(160,40,55,'+(0.06+0.05*hp)+')';
    ctx.fillRect(0,0,W,H);
  }
  if(pal.dawn && S.wakeRampT > 0){
    var dp = 1 - S.wakeRampT/3;
    ctx.fillStyle = 'rgba(255,190,120,'+(0.22*dp)+')';
    ctx.fillRect(0,0,W,H);
  }
  /* Brain: violet aurora wash */
  if(pal.violet){
    ctx.fillStyle = 'rgba(90,60,160,0.07)';
    ctx.fillRect(0,0,W,H);
  }
  /* rib arches: slow asymmetric curves receding into dark */
  ctx.lineWidth = 10;
  var y0 = Math.floor(view.camY/260)*260;
  for(var y=y0-260; y<view.camY+H+260; y+=260){
    var wob = Math.sin(y*0.013)*60;
    var yy = SY(y) + (RM() ? 0 : Math.sin(beat*Math.PI*2 + y*0.01)*2);
    ctx.strokeStyle = pal.rib;
    ctx.beginPath();
    ctx.moveTo(-20, yy);
    ctx.quadraticCurveTo(W*0.3 + wob, yy-70*breathe, W*0.62 + wob*0.5, yy+10);
    ctx.quadraticCurveTo(W*0.8, yy+60, W+20, yy-30);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,66,36,0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, yy-14);
    ctx.quadraticCurveTo(W*0.3 + wob, yy-84*breathe, W*0.62 + wob*0.5, yy-4);
    ctx.quadraticCurveTo(W*0.8, yy+46, W+20, yy-44);
    ctx.stroke();
    ctx.lineWidth = 10;
  }
  /* film grain: warm fog, alive */
  ctx.globalAlpha = 0.5;
  var gs = 128;
  for(var gx=0; gx<W; gx+=gs) for(var gy=0; gy<H; gy+=gs)
    ctx.drawImage(render.grain, gx, gy);
  ctx.globalAlpha = 1;
}
function drawWalls(S){
  var room = S.room, W = view.W, H = view.H;
  var yTop = view.camY - 60, yBot = view.camY + H + 60;
  var i0 = clamp(Math.floor(yTop/WALL_STEP), 0, room.wallL.length-1);
  var i1 = clamp(Math.ceil(yBot/WALL_STEP), 0, room.wallL.length-1);
  /* immune blush */
  var blush = 0;
  if(S.tide) blush = S.tide.phase==='telegraph' ? 0.45 : 0.7;
  /* P1-21: clean evasion — the rose blush visibly recedes instead of vanishing */
  if(S.blushRecede > 0) blush = Math.max(blush, 0.45*S.blushRecede);
  /* P1-21: the god inhales — the walls tense inward across the 1.2s telegraph */
  var tense = 0;
  if(S.swallowInhale > 0){
    var iprog = 1 - S.swallowInhale/1.2;
    tense = (RM() ? 1 : Math.sin(iprog*Math.PI)) * 10;
  }
  var palW = (CHAPTERS[S.ch] && CHAPTERS[S.ch].pal) || {};
  var wallBase = palW.wall || '#2b1409';
  /* harmless dream blush (dream event): the walls warm, nothing hunts */
  if(S.blushT > 0) wallBase = mixColor(wallBase, '#4a2028', 0.35*clamp(S.blushT,0,1));
  /* left bank */
  ctx.beginPath();
  ctx.moveTo(0, SY(i0*WALL_STEP));
  for(var i=i0;i<=i1;i++) ctx.lineTo(SX(room.wallL[i] + tense), SY(i*WALL_STEP));
  ctx.lineTo(0, SY(i1*WALL_STEP));
  ctx.closePath();
  ctx.fillStyle = blush>0 ? mixColor(wallBase,'#5a1e2b',blush) : wallBase;
  ctx.fill();
  /* right bank */
  ctx.beginPath();
  ctx.moveTo(W, SY(i0*WALL_STEP));
  for(var j=i0;j<=i1;j++) ctx.lineTo(SX(room.wallR[j] - tense), SY(j*WALL_STEP));
  ctx.lineTo(W, SY(i1*WALL_STEP));
  ctx.closePath();
  ctx.fill();
  /* edge blush: immune cells near the rim paint the walls' edges */
  if(S.edgeBlush > 0){
    ctx.strokeStyle = 'rgba(220,90,110,'+(0.6*clamp(S.edgeBlush,0,1))+')';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for(var e0=i0;e0<=i1;e0++){ var ex=SX(room.wallL[e0]), ey=SY(e0*WALL_STEP); if(e0===i0)ctx.moveTo(ex,ey); else ctx.lineTo(ex,ey); }
    ctx.stroke();
    ctx.beginPath();
    for(var e1=i0;e1<=i1;e1++){ var fx=SX(room.wallR[e1]), fy=SY(e1*WALL_STEP); if(e1===i0)ctx.moveTo(fx,fy); else ctx.lineTo(fx,fy); }
    ctx.stroke();
  }
  /* wet edge highlights */
  ctx.strokeStyle = blush>0 ? 'rgba(196,61,90,0.55)' : 'rgba(150,84,44,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for(var k=i0;k<=i1;k++){ var px=SX(room.wallL[k]), py=SY(k*WALL_STEP); if(k===i0)ctx.moveTo(px,py); else ctx.lineTo(px,py); }
  ctx.stroke();
  ctx.beginPath();
  for(var m=i0;m<=i1;m++){ var qx=SX(room.wallR[m]), qy=SY(m*WALL_STEP); if(m===i0)ctx.moveTo(qx,qy); else ctx.lineTo(qx,qy); }
  ctx.stroke();
  /* cilia: fine swaying hairs along walls (set dressing, never threat) */
  var t = S.time;
  /* attention cue: wake≥80 — the cilia lean toward the swarm; dream event — a wave passes */
  var lean = S.wake >= 80 ? 10 : 0;
  if(S.ciliaLeanT > 0) lean += RM() ? 26 : 26*Math.sin(S.ciliaLeanT*Math.PI/3);
  ctx.strokeStyle = 'rgba(140,80,50,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(var c2=i0;c2<=i1;c2+=3){
    var wyy = c2*WALL_STEP, syy = SY(wyy);
    if(syy < -20 || syy > H+20) continue;
    var lx = SX(room.wallL[c2]), rx = SX(room.wallR[c2]);
    var sw = RM() ? 0 : Math.sin(t*2.1 + wyy*0.05)*6;
    ctx.moveTo(lx, syy); ctx.lineTo(lx+14+sw+lean, syy-16);
    ctx.moveTo(rx, syy); ctx.lineTo(rx-14-sw-lean, syy-16);
  }
  ctx.stroke();
  /* peristalsis ripple: visible 2s before the wave reaches you */
  if(room.peristalsis && !S.swallow){
    var span = room.len + 400;
    for(var wri=0;wri<(room.waveCount||5);wri++){   /* P0-4: interleaved waves */
      var wy2 = ((S.time*300 + wri*span/(room.waveCount||5)) % span) - 200;
      drawRipple(wy2, 0.30, S);
      drawRipple(wy2 + 280, 0.10, S);   /* pre-ripple: the 2s readable warning */
    }
  }
}
function drawRipple(wy, alpha, S){
  var sy = SY(wy), W = view.W;
  if(sy < -120 || sy > view.H+120) return;
  var w = wallAt(S.room, wy);
  ctx.fillStyle = 'rgba(196,120,80,'+alpha+')';
  ctx.beginPath();
  var steps = 24;
  for(var i=0;i<=steps;i++){
    var y = wy-90 + (180*i/steps);
    var pinch = Math.sin((i/steps)*Math.PI)*22;
    var x = SX(w[0]+pinch), yy = SY(y);
    if(i===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
  }
  for(var j=steps;j>=0;j--){
    var y2 = wy-90 + (180*j/steps);
    var pinch2 = Math.sin((j/steps)*Math.PI)*22;
    ctx.lineTo(SX(w[1]-pinch2), SY(y2));
  }
  ctx.closePath(); ctx.fill();
}
function mixColor(a, b, t){
  /* a,b are #rrggbb */
  var ar=parseInt(a.substr(1,2),16), ag=parseInt(a.substr(3,2),16), ab=parseInt(a.substr(5,2),16);
  var br=parseInt(b.substr(1,2),16), bg=parseInt(b.substr(3,2),16), bb=parseInt(b.substr(5,2),16);
  return 'rgb('+Math.round(lerp(ar,br,t))+','+Math.round(lerp(ag,bg,t))+','+Math.round(lerp(ab,bb,t))+')';
}
/* the swarm is the only light source: one fullscreen radial mask */
function drawLightMask(S){
  var W = view.W, H = view.H;
  var sx = SX(S.cx), sy = SY(S.cy);
  var sc = smoothstep(S.c);
  var beat = audio ? audio.beatPhase() : 0;
  var swell = RM() ? 1 : 1 + 0.06*Math.sin(beat*Math.PI*2);
  var r = lerp(230, 130, sc) * swell;
  if(S.room && S.room.dark) r *= 0.45;
  if(S.flash) r *= 0.7;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(lerp(1, 0.62, sc), 1);   /* constricted light elongates along ribbon */
  /* gradient cache: rebuild only when the radius bucket changes */
  var rBucket = Math.round(r/8);
  if(!render.lmGrad || render.lmBucket !== rBucket){
    var g = ctx.createRadialGradient(0,0,0,0,0,rBucket*8);
    g.addColorStop(0, 'rgba(20,10,8,0)');
    g.addColorStop(0.55, 'rgba(20,10,8,0.55)');
    g.addColorStop(1, 'rgba(20,10,8,0.96)');
    render.lmGrad = g; render.lmBucket = rBucket;
  }
  ctx.fillStyle = render.lmGrad;
  ctx.fillRect(-W, -H, W*2, H*2);
  ctx.restore();
}

function drawEntities(S){
  var room = S.room, W = view.W, H = view.H;
  /* spores: pale moonlight seeds with tail-drift */
  ctx.globalCompositeOperation = 'lighter';
  for(var i=0;i<room.spores.length;i++){
    var sp = room.spores[i];
    if(sp.taken) continue;
    var sx = SX(sp.x), sy = SY(sp.y);
    if(sx<-30||sx>W+30||sy<-30||sy>H+30) continue;
    var wob = Math.sin(RT(S.time)*2 + i*1.7)*2;
    var sz = 14 + wob;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(render.glowPale, sx-sz/2, sy-sz/2, sz, sz);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#9db8dd'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy+4); ctx.quadraticCurveTo(sx+3, sy+12, sx-2+wob, sy+20); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  /* nerve knots: glowing knots of nerve tissue */
  for(var n=0;n<room.nerves.length;n++){
    var nv = room.nerves[n];
    var nx = SX(nv.x), ny = SY(nv.y);
    if(nx<-40||nx>W+40||ny<-40||ny>H+40) continue;
    var pulse = 1 + 0.25*Math.sin(RT(S.time)*3 + n*2);
    var ns = 26*pulse;
    ctx.globalAlpha = nv.read ? 0.35 : 0.9;
    ctx.drawImage(render.glowRose, nx-ns/2, ny-ns/2, ns, ns);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = nv.read ? '#8a5a6a' : '#e8a0b0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(nx, ny, 8*pulse, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  /* white cells: too-perfect pale spheres; they occlude light */
  /* tide cells: occlusion sprites — they eat the swarm's light */
  if(S.tide && S.tide.phase === 'waves'){
    /* P0-4: pending wave spawn telegraph — ghost rings at fixed positions */
    if(S.tide.pending){
      var ptp = 1 - S.tide.pending.t/1.2;
      for(var pp=0;pp<S.tide.pending.spots.length;pp++){
        var psp = S.tide.pending.spots[pp];
        var ppx = SX(psp.x), ppy = SY(psp.y);
        if(ppx<-60||ppx>W+60||ppy<-60||ppy>H+60) continue;
        ctx.strokeStyle = 'rgba(196,61,90,'+(0.25+0.45*ptp)+')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ppx, ppy, 16+3*Math.sin(RT(S.time)*8), 0, 6.283); ctx.stroke();
        ctx.strokeStyle = 'rgba(196,61,90,'+(0.12+0.2*ptp)+')';
        ctx.beginPath(); ctx.arc(ppx, ppy, 24, 0, 6.283); ctx.stroke();
      }
    }
    for(var c2=0;c2<24;c2++){
      var cl = tideCellAt(S, c2);
      if(!cl || !cl.on) continue;
      var cx2 = SX(cl.x), cy2 = SY(cl.y);
      if(cx2<-60||cx2>W+60||cy2<-60||cy2>H+60) continue;
      var cr = 16;
      ctx.drawImage(render.cellSprite, cx2-cr*2, cy2-cr*2, cr*4, cr*4);
      ctx.strokeStyle = 'rgba(196,61,90,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, cr+3+Math.sin(RT(S.time)*6)*1.5, 0, 6.283); ctx.stroke();
    }
  }
  /* scout cell: 1.5s telegraph ring, then the hunter */
  if(S.scout){
    var sx2 = SX(S.scout.x), sy2 = SY(S.scout.y);
    if(!(sx2<-60||sx2>W+60||sy2<-60||sy2>H+60)){
      if(S.scout.phase === 'telegraph'){
        var stp = 1 - S.scout.t/1.5;
        ctx.strokeStyle = 'rgba(220,120,140,'+(0.3+0.5*stp)+')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx2, sy2, 40*(1-stp)+10, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = 'rgba(220,120,140,0.25)';
        ctx.beginPath(); ctx.arc(sx2, sy2, 40, 0, 6.283); ctx.stroke();
      } else {
        ctx.drawImage(render.cellSprite, sx2-32, sy2-32, 64, 64);
        ctx.strokeStyle = 'rgba(220,80,100,0.7)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx2, sy2, 20+Math.sin(RT(S.time)*8)*2, 0, 6.283); ctx.stroke();
      }
    }
  }
  /* swallow debris */
  if(S.swallow){
    ctx.fillStyle = 'rgba(120,70,50,0.8)';
    for(var d=0;d<S.debris.length;d++){
      var db = S.debris[d];
      if(!db.on) continue;
      var dx = SX(db.x), dy = SY(db.y);
      ctx.fillRect(dx-3, dy-8, 6, 16);
    }
    /* motion streaks */
    ctx.strokeStyle = 'rgba(200,140,100,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for(var s2=0;s2<20;s2++){
      var lx = (s2*97 + S.time*400) % W;
      ctx.moveTo(lx, 0); ctx.lineTo(lx, H);
    }
    ctx.stroke();
  }
}
/* tide cells live in SIM closure; expose read-only accessor via sim */
function tideCellAt(S, i){ return S._cells ? S._cells[i] : null; }
function drawSwarm(S){
  var W = view.W, H = view.H;
  var sc = smoothstep(S.c);
  ctx.globalCompositeOperation = 'lighter';
  drawTrailsInner(S);   /* P1-23: trails batch inside the swarm's 'lighter' block */
  var shimmer = 1;
  if(S.iframes > 0) shimmer = RM() ? 0.55 : 0.55 + 0.45*Math.sin(S.time*40);
  if(S.grace > 0) shimmer *= RM() ? 0.8 : 0.6 + 0.4*Math.sin(S.time*12);
  if(S.mode === 'dying'){
    var dt2 = 1 - S.dyingT/1.6;
    shimmer *= (1-dt2);
  }
  var sz = lerp(9, 6, sc);
  var moteSprite = glowFor(save.appearance || 'gold');
  for(var i=0;i<64;i++){
    var m = S.motes[i];
    if(!m.alive) continue;
    var sx = SX(m.x), sy = SY(m.y);
    if(sx<-20||sx>W+20||sy<-20||sy>H+20) continue;
    var tw = 0.75 + 0.25*Math.sin(RT(S.time)*7 + m.phase*3);
    ctx.globalAlpha = shimmer * tw;
    ctx.drawImage(moteSprite, sx-sz/2, sy-sz/2, sz, sz);
  }
  ctx.globalAlpha = 1;
  /* constricted ribbon core: shape follows the worn mask */
  if(sc > 0.5){
    var gx = SX(S.cx), gy = SY(S.cy);
    ctx.globalAlpha = 0.35*sc*shimmer;
    var mask = save.mask || 'needle';
    /* P1-23: cache the ribbon gradient — rebuild only when the anchor moves */
    var ggKey = Math.round(gy/4);
    if(!render.ribbonGrad || render.ribbonKey !== ggKey){
      var gg = ctx.createLinearGradient(0, ggKey*4-70, 0, ggKey*4+30);
      gg.addColorStop(0, 'rgba(255,217,138,0)');
      gg.addColorStop(1, 'rgba(255,180,100,0.8)');
      render.ribbonGrad = gg; render.ribbonKey = ggKey;
    }
    ctx.strokeStyle = render.ribbonGrad; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    if(mask === 'knot'){
      ctx.moveTo(gx, gy-70*sc);
      ctx.quadraticCurveTo(gx+18, gy-30*sc, gx, gy-10);
      ctx.quadraticCurveTo(gx-18, gy+10, gx, gy+10);
    } else if(mask === 'halo'){
      ctx.arc(gx, gy, 26*sc, 0, 6.283);
    } else if(mask === 'maw'){
      ctx.moveTo(gx-14, gy-70*sc); ctx.lineTo(gx, gy+10); ctx.lineTo(gx+14, gy-70*sc);
    } else {
      ctx.moveTo(gx, gy-70*sc); ctx.lineTo(gx, gy+10);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  /* 58 BPM under-pulse: a faint ring that breathes with the second heartbeat */
  var sbp = audio ? audio.secondBeatPhase() : -1;
  if(sbp >= 0){
    var sbr = RM() ? 30 : 30 + sbp*50;
    ctx.globalAlpha = RM() ? 0.22 : 0.22*(1-sbp);
    ctx.strokeStyle = '#e8d8c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(SX(S.cx), SY(S.cy), sbr, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* P1-9: ghost disc — the bloom's afterimage on touch-begin, 300ms */
  if(S.ghostT > 0 && S.ghostR > 0){
    var ga = Math.max(0, S.ghostT/0.3) * 0.32;
    ctx.globalAlpha = ga;
    ctx.strokeStyle = '#ffd9a8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(SX(S.cx), SY(S.cy), S.ghostR, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
}
/* ============================ HUD ================================== */
function drawHUD(S){
  var W = view.W, H = view.H;
  var top = view.safeTop + 8;   /* eyelid-line sits below the Dynamic Island */
  /* wake: a tapered lid-curve, not a bar */
  var lw = W*0.72, lx = (W-lw)/2, ly = top+6;
  var tremble = (S.wake >= 70 && !RM()) ? Math.sin(S.time*30)*2 : 0;
  var lidOpen = 2.5 + (S.wake/100)*6;   /* the lid parts as wake rises */
  ctx.save();
  ctx.translate(lx + tremble, ly);
  /* the curve: a lid's arc that widens with wake */
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lw/2, lidOpen*2.4, lw, 0);
  ctx.quadraticCurveTo(lw/2, -lidOpen*0.6, 0, 0);
  ctx.closePath();
  /* P2-14: the lid tint only changes when wake changes — cache on rounded wake */
  var wakeQ = Math.round(S.wake);
  if(render.hudWakeQ !== wakeQ || !render.hudWc){
    render.hudWakeQ = wakeQ;
    render.hudWc = mixColor('#5a2c1a', '#c43d5a', wakeQ/100);
  }
  var wc = render.hudWc;
  ctx.fillStyle = 'rgba(60,30,25,0.8)';
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = wc;
  ctx.fillRect(0, -lidOpen, lw*(S.wake/100), lidOpen*3);
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,120,100,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(lw/2, lidOpen*2.4, lw, 0);
  ctx.stroke();
  /* at 100: a cold slit of light — the lid is fully open */
  if(S.wake >= 99.5){
    ctx.fillStyle = 'rgba(190,220,245,'+(0.5+0.3*Math.sin(RT(S.time)*12))+')';
    ctx.fillRect(lw*0.2, -1, lw*0.6, 2);
  }
  ctx.restore();
  if(save.settings.numeric){
    var _wk = Math.round(S.wake);
    if(render._hudWk !== _wk){ render._hudWk = _wk; render._hudWkStr = String(_wk); }
    ctx.fillStyle = 'rgba(255,220,170,0.75)';
    ctx.font = '600 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(render._hudWkStr, W/2, ly+18);
  }
  /* score / depth — P1-23: strings rebuilt only when the values change */
  var _sc = Math.floor(S.score), _dp = Math.floor(S.depth);
  if(render._hudSc !== _sc){ render._hudSc = _sc; render._hudScStr = String(_sc).padStart(6,'0'); }
  if(render._hudDp !== _dp){ render._hudDp = _dp; render._hudDpStr = _dp + 'm'; }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,217,138,0.92)';
  ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(render._hudScStr, 16, top+22);
  ctx.fillStyle = 'rgba(198,173,135,0.8)';
  ctx.font = '400 11px -apple-system, sans-serif';
  ctx.fillText(render._hudDpStr, 16, top+38);
  /* the haunt: a past self, outrun once per run (never in the daily) */
  if(!S.daily && save.haunt && save.haunt.depth > 0 && !S._hauntDone && S.depth > save.haunt.depth){
    S._hauntDone = true;
    S.score += 40;
    save.records.haunts = (save.records.haunts||0)+1;
    S.whisper = 'you outran yourself'; S.whisperT = 3;
    requestSave(save);
  }
  /* UNBROKEN streak ring */
  if(S.streak > 0 || S.streakRingT > 0){
    var sra = S.streakRingT > 0 ? clamp(S.streakRingT/2, 0, 1) : 1;   /* breaking: dissolves */
    var srr = S.streakRingT > 0 ? 9 + (2-S.streakRingT)*14 : 9;       /* ...and expands */
    ctx.globalAlpha = 0.85*sra;
    ctx.strokeStyle = 'rgba(255,217,138,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(30, top+58, srr, 0, 6.283); ctx.stroke();
    if(S.streak > 0){
      if(render._hudSt !== S.streak){ render._hudSt = S.streak; render._hudStStr = String(S.streak); }
      ctx.fillStyle = 'rgba(255,217,138,0.9)';
      ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText(render._hudStStr, 30, top+62);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }
  /* chain */
  if(S.chain >= 5){
    ctx.fillStyle = 'rgba(255,180,100,0.9)';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('CHAIN ×'+S.chain, W-16, top+22);
    ctx.textAlign = 'left';
  }
  /* whisper: a voice, not an interface */
  if(S.whisperT > 0){
    var a = clamp(S.whisperT, 0, 1) * 0.85;
    ctx.fillStyle = 'rgba(232,220,200,'+a+')';
    ctx.font = 'italic 15px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(S.whisper, W/2, H*0.68);
    ctx.textAlign = 'left';
  }
  /* nerve message */
  if(S.nerveT > 0){
    var a2 = clamp(S.nerveT/2, 0, 1) * 0.9;
    ctx.fillStyle = 'rgba(200,180,200,'+a2+')';
    ctx.font = 'italic 15px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('“'+S.nerveMsg+'”', W/2, H*0.60);
    ctx.textAlign = 'left';
  }
  /* chapter banner: carved, not printed */
  if(S.bannerT > 0){
    var ba = S.bannerT > 3 ? (4-S.bannerT) : clamp(S.bannerT/1.5, 0, 1);
    ctx.fillStyle = 'rgba(255,230,180,'+(ba*0.95)+')';
    ctx.font = '500 30px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    try{ ctx.letterSpacing = '8px'; }catch(e){}
    ctx.fillText(S.banner, W/2, H*0.40);
    try{ ctx.letterSpacing = '2px'; }catch(e){}
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.fillStyle = 'rgba(200,170,140,'+(ba*0.8)+')';
    ctx.fillText(S.bannerSub, W/2, H*0.40+30);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.textAlign = 'left';
  }
  /* onboarding HOLD ring: progress, not pulse */
  if(S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage===0){
    var hp = clamp(S.c/0.8, 0, 1);
    ctx.strokeStyle = 'rgba(255,217,138,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W/2, H*0.55, 34, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.9)';
    ctx.beginPath(); ctx.arc(W/2, H*0.55, 34, -Math.PI/2, -Math.PI/2 + hp*6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(255,217,138,0.85)';
    ctx.font = '600 13px -apple-system, sans-serif'; ctx.textAlign = 'center';
    try{ ctx.letterSpacing = '4px'; }catch(e){}
    ctx.fillText('HOLD', W/2, H*0.55+5);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.textAlign = 'left';
  } else if(S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage===1){
    ctx.fillStyle = 'rgba(255,217,138,0.7)';
    ctx.font = '600 13px -apple-system, sans-serif'; ctx.textAlign = 'center';
    try{ ctx.letterSpacing = '4px'; }catch(e){}
    ctx.fillText('RELEASE', W/2, H*0.55);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.textAlign = 'left';
  } else if(S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage===2){
    /* the objective, once the hands know: SEEK THE SEEDS (pale seeds, not gold — gold is the swarm) */
    ctx.fillStyle = 'rgba(255,217,138,'+(0.6+0.3*Math.sin(RT(S.time)*3))+')';
    ctx.font = '600 15px -apple-system, sans-serif'; ctx.textAlign = 'center';
    try{ ctx.letterSpacing = '6px'; }catch(e){}
    ctx.fillText('SEEK THE SEEDS', W/2, H*0.42);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.textAlign = 'left';
  }
  /* dying veil */
  if(S.mode === 'dying'){
    var dv = 1 - S.dyingT/1.6;
    ctx.fillStyle = 'rgba(10,5,4,'+(dv*0.5)+')';
    ctx.fillRect(0,0,W,H);
  }
}