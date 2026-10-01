
/* ============================ UI =================================== */
/* Menus are anatomy: valves that iris open on touch. All canvas-drawn,
   hit-tested at 44pt minimum. gameMode: title|select|records|custom|
   settings|play|paused|complete */
var gameMode = 'title';
var sim = null;                 /* the live Sim */
var valves = [];                /* current menu hit targets */
var attract = null;
var uiMsg = '', uiMsgT = 0;
function newAttract(){
  var a = { motes: [], t: 0 };
  var rnd = mulberry32(7);
  for(var i=0;i<48;i++){
    a.motes.push({ x:(rnd()-0.5)*200, y:(rnd()-0.5)*300, p:rnd()*6.28, s:0.5+rnd()*0.8 });
  }
  return a;
}
function updateAttract(dt){
  var a = attract; a.t += dt;
  var W = view.W, H = view.H;
  for(var i=0;i<a.motes.length;i++){
    var m = a.motes[i];
    m.p += dt*m.s*0.4;
    if(!RM()){ m.x += Math.cos(m.p)*12*dt; m.y += Math.sin(m.p*1.3)*10*dt + 6*dt; }
    if(m.y > H*0.7) m.y = -H*0.1;
    if(m.x > W/2+120) m.x = -W/2-120; if(m.x < -W/2-120) m.x = W/2+120;
  }
}
function drawAttract(){
  var W = view.W, H = view.H;
  ctx.globalCompositeOperation = 'lighter';
  var a = attract;
  for(var i=0;i<a.motes.length;i++){
    var m = a.motes[i];
    var sx = W/2 + m.x, sy = H*0.32 + m.y;
    var tw = 0.5 + 0.3*Math.sin(RT(a.t)*3 + m.p*4);
    ctx.globalAlpha = tw*0.8;
    var sz = 8;
    ctx.drawImage(render.glowGold, sx-sz/2, sy-sz/2, sz, sz);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
/* valve button */
function drawValve(v){
  var pulse = RM() ? 1 : 1 + 0.03*Math.sin((audio?audio.beatPhase():0)*6.283 + v.y*0.01);
  var r = v.r * pulse;
  ctx.save();
  ctx.translate(v.x, v.y);
  /* four petals */
  ctx.strokeStyle = v.locked ? 'rgba(120,80,70,0.5)' : 'rgba(255,200,130,0.75)';
  ctx.fillStyle = v.locked ? 'rgba(40,20,16,0.6)' : 'rgba(60,28,18,0.55)';
  ctx.lineWidth = 2;
  for(var p=0;p<4;p++){
    ctx.save();
    ctx.rotate(p*Math.PI/2 + Math.PI/4);
    ctx.beginPath();
    ctx.ellipse(0, -r*0.52, r*0.30, r*0.52, 0, 0, 6.283);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  /* growth rings */
  ctx.strokeStyle = v.locked ? 'rgba(120,80,70,0.3)' : 'rgba(255,190,120,0.25)';
  ctx.lineWidth = 1;
  for(var rr=r*0.25; rr<r*0.7; rr+=r*0.18){
    ctx.beginPath(); ctx.arc(0,0,rr,0,6.283); ctx.stroke();
  }
  ctx.restore();
  /* labels */
  ctx.textAlign = 'center';
  ctx.fillStyle = v.locked ? 'rgba(160,120,110,0.6)' : 'rgba(255,225,180,0.95)';
  ctx.font = '600 14px -apple-system, sans-serif';
  try{ ctx.letterSpacing = '3px'; }catch(e){}
  ctx.fillText(v.label, v.x, v.y + r + 24);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  if(v.sub){
    ctx.fillStyle = 'rgba(180,150,130,0.6)';
    ctx.font = '400 11px -apple-system, sans-serif';
    ctx.fillText(v.sub, v.x, v.y + r + 42);
  }
  ctx.textAlign = 'left';
}
function setValves(list){ valves = list; }
var customScroll = 0, customMax = 0, customStartY = 0, customStartScroll = 0;
var recordsScroll = 0, recordsMax = 0;
function uiTouchStart(sx, sy){
  if(gameMode === 'custom') sy += customScroll;
  /* pause glyph during play */
  if(gameMode === 'play' && sim && !sim.s.paused){
    var px = view.W - 34, py = view.safeTop + 34;
    if((sx-px)*(sx-px) + (sy-py)*(sy-py) < 44*44){ pauseGame(false); return true; }
    return false;
  }
  for(var i=0;i<valves.length;i++){
    var v = valves[i];
    var dx = sx-v.x, dy = sy-v.y;
    if(dx*dx + dy*dy < v.r*v.r){
      if(audio) audio.sfx('uiValve');
  
      v.action();
      return true;
    }
  }
  return false;
}
function showTitle(){
  gameMode = 'title';
  wakeLockRelease();
  if(audio) audio._menuLullaby = false;   /* menu arrangement re-arms on entry */
  if(audio) audio.setDuck(0);            /* P2-5: the dawn keystone parks duck at 0.25 — the menu lullaby must play unducked */
  attract = newAttract();
  checkSigils();   /* long-tail grants surface on return to the dark */
  var W = view.W, H = view.H, cy = H*0.50;
  var list = [];
  var n = 0;
  function addValve(label, sub, action, locked){
    list.push({ x: W/2, y: cy + n*70, r: 38, label: label, sub: sub, action: action, locked: !!locked });
    n++;
  }
  if(save.checkpoint) addValve('CONTINUE', 'the descent waits', function(){ continueRun(); });
  addValve('BEGIN THE DESCENT', save.checkpoint ? 'a new pilgrimage' : 'hold to constrict · release to bloom', function(){ showChapterSelect(); });
  addValve('THE DESCENT', function(){
    var ds = (save.daily && save.daily.streak) || 0;
    var bm = Math.min(6, ds);
    return 'today\'s seeded pilgrimage' + (bm > 0 ? ' · +'+bm+' motes' : '');
  }(), function(){ startDaily(); });
  /* P1-12: the weekly deep dream — seven shards earn one shared descent */
  (function(){
    var wk = save.weekly || {};
    var ready = wk.shards >= 7 && !wk.dreamDone;
    addValve('DEEP DREAM',
      ready ? 'the week\'s shared dream awaits' : ('shards ' + (wk.shards||0) + '/7 · descend daily'),
      function(){
        if(ready) startDeepDream();
        else { uiMsg = 'Seven shards of one week open the deep dream.'; uiMsgT = 3; if(audio) audio.sfx('uiValve'); }
      }, !ready);
  })();
  addValve('MOTES & MASKS', 'appearances', function(){ showCustom(); });
  addValve('WHISPERS', 'records of past selves', function(){ showRecords(); });
  addValve('SETTINGS', '', function(){ showSettings(); });
  setValves(list);
}
function drawTitle(){
  drawTissue({time: attract.t, room:null, tide:null, c:0});
  drawAttract();
  var W = view.W;
  /* title, carved */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.96)';
  ctx.font = '500 54px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '14px'; }catch(e){}
  ctx.fillText('GULLET', W/2, view.H*0.22);
  try{ ctx.letterSpacing = '3px'; }catch(e){}
  ctx.fillStyle = 'rgba(190,160,140,0.65)';
  ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('the god sleeps — descend unnoticed', W/2, view.H*0.22+34);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  ctx.textAlign = 'left';
  for(var i=0;i<valves.length;i++) drawValve(valves[i]);
  /* P1-17: plain streak rules, always visible */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(170,140,125,0.55)';
  ctx.font = 'italic 12px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('return each day · +1 mote, cap +6 · miss a day and the god forgets your name',
    W/2, view.H - view.safeBottom - 18);
  ctx.textAlign = 'left';
  if(uiMsgT > 0){
    ctx.fillStyle = 'rgba(220,190,170,'+clamp(uiMsgT,0,1)*0.85+')';
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(uiMsg, W/2, view.H- view.safeBottom - 40);
    ctx.textAlign = 'left';
  }
}
function showChapterSelect(){
  /* first descent: no choice yet — the Throat is the only way in */
  if(save.furthest === 0){ startRun(0); return; }
  gameMode = 'select';
  var W = view.W, H = view.H;
  var list = [];
  var names = ['I · THE THROAT','II · THE HEART','III · THE STOMACH','IV · THE EYE','V · THE BRAIN','VI · THE WAKING'];
  for(var i=0;i<6;i++){
    (function(idx){
      var locked = idx > save.furthest || !ROOMS_BY_CHAPTER[idx];
      list.push({
        x: W/2, y: H*0.24 + idx*78, r: 40,
        label: names[idx], sub: locked ? 'still dreaming' : (save.records.chapters[idx] ? 'best '+save.records.chapters[idx] : 'undescended'),
        locked: locked,
        action: function(){
          if(locked){ uiMsg = 'This chamber is still dreaming.'; uiMsgT = 3; if(audio) audio.sfx('uiValve'); return; }
          startRun(idx);
        }
      });
    })(i);
  }
  list.push({ x: W/2, y: H*0.24 + 6*78 + 20, r: 40, label:'RETURN', sub:'', action: showTitle });
  setValves(list);
}
function drawSelect(){
  drawTissue({time: attract?attract.t:0, room:null, tide:null, c:0});
  var W = view.W;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.9)';
  ctx.font = '500 26px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '8px'; }catch(e){}
  ctx.fillText('CHOOSE YOUR DEPTH', W/2, view.H*0.13);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  ctx.textAlign = 'left';
  for(var i=0;i<valves.length;i++) drawValve(valves[i]);
  if(uiMsgT > 0){
    ctx.fillStyle = 'rgba(220,190,170,'+clamp(uiMsgT,0,1)*0.85+')';
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(uiMsg, W/2, view.H - view.safeBottom - 30);
    ctx.textAlign = 'left';
  }
}
function showRecords(){
  gameMode = 'records';
  recordsScroll = 0;
  var W = view.W, H = view.H;
  setValves([{ x: W/2, y: H-110-view.safeBottom, r: 44, label:'RETURN', sub:'', action: showTitle }]);
}
function drawCustom(){
  drawTissue({time: attract?attract.t:0, room:null, tide:null, c:0});
  var W = view.W;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.9)';
  ctx.font = '500 26px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '8px'; }catch(e){}
  ctx.fillText('MOTES & MASKS', W/2, view.safeTop+70);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  var col = appearanceColor(save.appearance);
  ctx.globalCompositeOperation = 'lighter';
  for(var i=0;i<24;i++){
    var a2 = i*2.39996, r2 = 30*Math.sqrt((i+0.5)/24);
    var sx = W/2 + Math.cos(a2)*r2, sy = view.safeTop+130 + Math.sin(a2)*r2*0.9;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.beginPath(); ctx.rect(0, view.safeTop+170, W, view.H-view.safeTop-170-view.safeBottom);
  ctx.clip();
  ctx.textAlign = 'left';
  for(var v=0;v<valves.length;v++){
    var vv = valves[v];
    if(vv.header){
      ctx.fillStyle = 'rgba(190,160,140,0.6)';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      try{ ctx.letterSpacing = '4px'; }catch(e){}
      ctx.fillText(vv.label, vv.x, vv.y - customScroll);
      try{ ctx.letterSpacing = '0px'; }catch(e){}
      ctx.textAlign = 'left';
      continue;
    }
    var cp = { x:vv.x, y:vv.y-customScroll, r:vv.r, label:vv.label, sub:vv.sub,
               locked:vv.locked, action:vv.action };
    drawValve(cp);
  }
  ctx.restore();
  if(uiMsgT > 0){
    ctx.fillStyle = 'rgba(220,190,170,'+clamp(uiMsgT,0,1)*0.85+')';
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(uiMsg, W/2, view.H - view.safeBottom - 30);
    ctx.textAlign = 'left';
  }
}
function appearanceColor(a){
  return { gold:'#ffd98a', crimson:'#ff7a6a', pearl:'#e8f0e0', watcher:'#cfd8ea',
           grey:'#a8a8b0', dawn:'#ffeec8', cantor:'#ffcf5a', warden:'#d6c08a',
           dreamer:'#b9a7e8', streak3:'#ff9040', streak7:'#e3d4ff' }[a] || '#ffd98a';
}
function showSettings(){
  gameMode = 'settings';
  setValves([]);
  settingsRows = buildSettingsRows();
}
var settingsRows = [];
function buildSettingsRows(){
  var W = view.W, H = view.H, rows = [], y = H*0.22;
  function row(label, value, minus, plus){
    rows.push({ label:label, value:value, y:y, minus:minus, plus:plus });
    y += 64;
  }
  var st = save.settings;
  row('MUSIC', Math.round(st.music*100)+'%', function(){ st.music=clamp(st.music-0.1,0,1); },
                                          function(){ st.music=clamp(st.music+0.1,0,1); });
  row('SOUNDS', Math.round(st.sfx*100)+'%', function(){ st.sfx=clamp(st.sfx-0.1,0,1); },
                                         function(){ st.sfx=clamp(st.sfx+0.1,0,1); });
  row('NUMERIC WAKE', st.numeric?'ON':'OFF', function(){ st.numeric=!st.numeric; }, function(){ st.numeric=!st.numeric; });
  row('REDUCED MOTION', st.reducedMotion?'ON':'OFF', function(){ st.reducedMotion=!st.reducedMotion; }, function(){ st.reducedMotion=!st.reducedMotion; });
  rows.back = { x: W/2, y: y+40, r: 44, label:'RETURN', sub:'', action: function(){ requestSave(save); showTitle(); } };
  return rows;
}
function drawSettings(){
  drawTissue({time: attract?attract.t:0, room:null, tide:null, c:0});
  var W = view.W;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.9)';
  ctx.font = '500 26px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '8px'; }catch(e){}
  ctx.fillText('SETTINGS', W/2, view.safeTop+70);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  ctx.textAlign = 'left';
  settingsRows = buildSettingsRows();   /* refresh values */
  for(var i=0;i<settingsRows.length;i++){
    var r = settingsRows[i];
    ctx.fillStyle = 'rgba(200,170,140,0.8)';
    ctx.font = '600 12px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(r.label, W/2-70, r.y+5);
    ctx.fillStyle = 'rgba(255,220,170,0.9)';
    ctx.textAlign = 'center';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(r.value, W/2+10, r.y+5);
    /* - / + zones, 44pt */
    ctx.strokeStyle = 'rgba(255,200,130,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2+90, r.y, 28, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2+150, r.y, 28, 0, 6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,170,0.9)';
    ctx.fillText('−', W/2+90, r.y+5);
    ctx.fillText('+', W/2+150, r.y+5);
  }
  ctx.textAlign = 'left';
  drawValve(settingsRows.back);
}
function settingsTouch(sx, sy){
  for(var i=0;i<settingsRows.length;i++){
    var r = settingsRows[i], W = view.W;
    var dx1 = sx-(W/2+90), dy1 = sy-r.y, dx2 = sx-(W/2+150), dy2 = sy-r.y;
    if(dx1*dx1+dy1*dy1 < 28*28){ r.minus(); if(audio)audio.sfx('uiValve'); requestSave(save); return true; }
    if(dx2*dx2+dy2*dy2 < 28*28){ r.plus(); if(audio)audio.sfx('uiValve'); requestSave(save); return true; }
  }
  var b = settingsRows.back;
  var dx = sx-b.x, dy = sy-b.y;
  if(dx*dx+dy*dy < b.r*b.r){ if(audio)audio.sfx('uiValve'); b.action(); return true; }
  return false;
}
/* ---- run control ---- */
/* P2-25: the M1 startRun is dead — the M2 definition below (with carry) wins by hoisting */
function continueRun(){
  sim = Sim(input, save, function(n,o){ if(audio) audio.sfx(n,o); });
  sim.startFromCheckpoint();
  gameMode = 'play';
  setValves([]);
  wakeLockAcquire();   /* mobile M6/M7: hold the screen for the descent */
  if(audio){ audio.unlock(); audio.setChapter(sim.s.ch); }
}
function dailySeedStr(){
  var d = new Date();
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
}
/* DAILY_NARROW is dead: the daily no longer punishes loyalty */
function startDaily(){
  if(gameMode === 'play' && sim && sim.s && sim.s.mode === 'play') return;
  var seed = dailySeed();
  var rng = mulberry32(seed);
  /* 3-of-6 chapters, seeded */
  var pool = [0,1,2,3,4,5], picks = [];
  for(var pk=0; pk<3; pk++){ picks.push(pool.splice(Math.floor(rng()*pool.length), 1)[0]); }
  picks.sort(function(a,b){ return a-b; });
  /* mutators, seeded: 1-2 per day */
  var mutPool = ['hunger','haste','heavy','bright'];
  var muts = [];
  var nm = 1 + Math.floor(rng()*2);
  for(var mk=0; mk<nm; mk++){ muts.push(mutPool.splice(Math.floor(rng()*mutPool.length), 1)[0]); }
  var real = [ROOMS_BY_CHAPTER[0], ROOMS_BY_CHAPTER[1], ROOMS_BY_CHAPTER[2],
              ROOMS_BY_CHAPTER[3], ROOMS_BY_CHAPTER[4], ROOMS_BY_CHAPTER[5]];
  for(var ch=0; ch<3; ch++){
    var defs = [];
    for(var i=0;i<7;i++) defs.push(genDailyRoom(picks[ch], i, rng, muts));
    ROOMS_BY_CHAPTER[ch] = defs;
  }
  sim = new Sim(input, save, function(n){ audio.sfx(n); });
  m2_resetChapterState(sim.s);
  sim.newRun(0);
  sim.s.daily = true;
  sim.s.dailySeed = seed;
  sim.s.dailyChapters = picks;
  sim.s.dailyMutators = muts;
  /* streak → +1 starting mote/day, cap +6 (loyalty rewarded, not punished) */
  var streak = (save.daily && save.daily.streak) || 0;
  var bonus = Math.min(6, streak);
  if(bonus > 0){
    for(var b=0;b<bonus && sim.s.alive<64;b++){ sim.s.motes[sim.s.alive].alive = true; sim.s.alive++; }
  }
  /* mutators apply */
  if(muts.indexOf('hunger') >= 0) sim.s.mutHunger = true;   /* spores heal half */
  if(muts.indexOf('haste') >= 0) sim.s.mutHaste = true;     /* everything 10% faster */
  if(muts.indexOf('heavy') >= 0) sim.s.mutHeavy = true;     /* wake decays 20% slower */
  if(muts.indexOf('bright') >= 0) sim.s.mutBright = true;   /* the dark is thinner */
  sim.s._dailyRestore = function(){
    for(var r=0;r<6;r++) ROOMS_BY_CHAPTER[r] = real[r];
  };
  var mutNames = { hunger:'HUNGER', haste:'HASTE', heavy:'HEAVY', bright:'BRIGHT' };
  sim.s.banner = 'THE DAILY DESCENT'; 
  sim.s.bannerSub = 'one dream, one day · ' + muts.map(function(m){ return mutNames[m]; }).join(' · ');
  /* P1-17: the missed-day line */
  if(save.daily.forgot){
    sim.s.bannerSub = 'the god forgot your name — begin again';
    save.daily.forgot = false; requestSave(save);
  }
  sim.s.bannerT = 4;
  gameMode = 'play';
  audio.unlock(); audio.setChapter(sim.s.ch);
}
/* ---------------- weekly deep dream ----------------
   P1-12: a REAL playable mode. Seven shards earn one descent into the week's
   shared dream — dreamSeed is deterministic per week, so every install dreams
   the same dream. One room per chapter (six rooms), the Waking's eyelid ends it.
   Completing it keeps the 'Oneiric' appearance and closes the dream for the week. */
function startDeepDream(){
  if(gameMode === 'play' && sim && sim.s && sim.s.mode === 'play') return;
  var wk = save.weekly;
  if(!wk || wk.shards < 7 || wk.dreamDone) return;
  var seed = wk.dreamSeed;
  var rng = mulberry32(seed);
  /* the week's shared mutators: 2, seeded */
  var mutPool = ['hunger','haste','heavy','bright'];
  var muts = [];
  for(var mk=0; mk<2; mk++){ muts.push(mutPool.splice(Math.floor(rng()*mutPool.length), 1)[0]); }
  var real = [ROOMS_BY_CHAPTER[0], ROOMS_BY_CHAPTER[1], ROOMS_BY_CHAPTER[2],
              ROOMS_BY_CHAPTER[3], ROOMS_BY_CHAPTER[4], ROOMS_BY_CHAPTER[5]];
  for(var ch=0; ch<6; ch++){
    var def = genDailyRoom(ch, 0, rng, muts);
    def.n = 0; def.banner = (ch === 0); def.dreamRoom = true;
    if(ch === 5){
      /* the finale: the Waking's eyelid, so the dream can end */
      def.events = [{type:'eyelid', y: Math.floor(def.len*0.8)}];
    }
    ROOMS_BY_CHAPTER[ch] = [def];
  }
  sim = new Sim(input, save, function(n){ audio.sfx(n); });
  m2_resetChapterState(sim.s);
  sim.newRun(0);
  sim.s.dream = true;
  sim.s.dreamSeedUsed = seed;
  sim.s.dreamMutators = muts;
  if(muts.indexOf('hunger') >= 0) sim.s.mutHunger = true;
  if(muts.indexOf('haste') >= 0) sim.s.mutHaste = true;
  if(muts.indexOf('heavy') >= 0) sim.s.mutHeavy = true;
  if(muts.indexOf('bright') >= 0) sim.s.mutBright = true;
  sim.s._dailyRestore = function(){
    for(var r=0;r<6;r++) ROOMS_BY_CHAPTER[r] = real[r];
  };
  var mutNames = { hunger:'HUNGER', haste:'HASTE', heavy:'HEAVY', bright:'BRIGHT' };
  sim.s.banner = 'THE DEEP DREAM';
  sim.s.bannerSub = 'seven shards · one shared dream · ' + muts.map(function(m){ return mutNames[m]; }).join(' · ');
  sim.s.bannerT = 4;
  gameMode = 'play';
  audio.unlock(); audio.setChapter(sim.s.ch);
}
function finishDaily(){
  var S = sim.s;
  save.daily = save.daily || {};
  var today = S.dailySeed;
  var d = new Date(); d.setDate(d.getDate()-1);
  var yseed = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  if(today && save.daily.lastSeed === today){
    /* BH-05: replaying an already-completed daily is loyalty, not a new day —
       the streak stands (it is neither incremented nor reset) */
  }
  else if(save.daily.lastSeed === yseed) save.daily.streak = (save.daily.streak||0)+1;
  else {
    /* P1-17: a missed day is named, plainly — the line surfaces at the next descent */
    if(save.daily.lastSeed && save.daily.streak > 1) save.daily.forgot = true;
    save.daily.streak = 1;
  }
  save.daily.lastSeed = today;
  /* daily best is score, not time */
  var sc = Math.floor(S.score);
  if(!save.daily.best || sc > save.daily.best) save.daily.best = sc;
  /* P1-16: time persists as the secondary stat */
  var rt = Math.floor(S.runTime || 0);
  if(rt > 0 && (!save.daily.timeBest || rt < save.daily.timeBest)) save.daily.timeBest = rt;
  /* P1-11: WHISPERS reads save.records — mirror the real values there */
  save.records.dailyBest = save.daily.best || 0;
  save.records.dailyStreak = save.daily.streak || 0;
  /* the deep dream: one week, seven shards — one shard per day, no farming replays */
  var wk = weekSeed();
  if(!save.weekly || save.weekly.seed !== wk)
    save.weekly = { seed: wk, dreamSeed: (wk*7919)%100000, shards: 0, done: false };
  if(save.weekly.shards < 7 && save.weekly.lastShardDay !== today){
    save.weekly.lastShardDay = today;
    save.weekly.shards++;
    if(save.weekly.shards >= 7 && !save.weekly.done){
      save.weekly.done = true;
      unlockAppearance('dreamer');
    }
  }
  /* streak cosmetics: the god rewards return */
  if(save.daily.streak >= 3) unlockAppearance('streak3');
  if(save.daily.streak >= 7){ unlockAppearance('streak7'); unlockTrail('daydream'); }
  /* P1-13: the long spine — Daydream (7), Vigil (30), Centurion (100) */
  if(save.daily.streak >= 30) unlockAppearance('vigil');
  if(save.daily.streak >= 100) unlockMask('centurion');
  checkSigils();
  writeSave(save);
  if(S._dailyRestore) S._dailyRestore();
}
function pauseGame(fromHidden){
  if(gameMode !== 'play' || !sim) return;
  sim.s.paused = true;
  gameMode = 'paused';
  wakeLockRelease();   /* let the screen sleep while paused */
  if(audio) audio.setBPM(30);
  var W = view.W, H = view.H, cy = H*0.42;
  setValves([
    { x:W/2, y:cy, r:46, label:'RESUME', sub:'inhale', action: resumeGame },
    { x:W/2, y:cy+92, r:46, label:'RESTART ROOM', sub:'from the last fold', action: function(){
        sim.loadCheckpoint();
        resumeGame();
      } },
    { x:W/2, y:cy+184, r:46, label:'ABANDON', sub:'back to the dark', action: function(){
        /* two-tap: the first tap arms, the second abandons */
        var v = this;
        if(!pauseGame._abandonArmed){
          pauseGame._abandonArmed = true;
          v.label = 'SURE?'; v.sub = 'tap again to abandon';
          setTimeout(function(){
            pauseGame._abandonArmed = false;
            v.label = 'ABANDON'; v.sub = 'back to the dark';
          }, 4000);
          return;
        }
        pauseGame._abandonArmed = false;
        save.checkpoint = null; requestSave(save);
        if(sim && sim.s && sim.s._dailyRestore) sim.s._dailyRestore();
        if(audio) audio.setBPM(52);
        showTitle();
      } }
  ]);
}
function resumeGame(){
  if(!sim) return;
  sim.s.paused = false;
  gameMode = 'play';
  wakeLockAcquire();
  if(audio) audio.setBPM(CHAPTERS[sim.s.ch].bpm || 52);   /* UX M4: resume at the chapter's BPM */
  setValves([]);
}
function drawPaused(){
  /* world holds its breath: dim + slow blink edges */
  ctx.fillStyle = 'rgba(8,4,3,0.55)';
  ctx.fillRect(0,0,view.W,view.H);
  var W = view.W;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.85)';
  ctx.font = 'italic 16px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('the world holds its breath', W/2, view.H*0.30);
  ctx.textAlign = 'left';
  for(var i=0;i<valves.length;i++) drawValve(valves[i]);
}
/* P2-25: the M1 showComplete is dead — the M2 definition below (daily-aware) wins by hoisting */
function drawPauseGlyph(){
  var px = view.W - 34, py = view.safeTop + 34;
  /* redrawn: faint ring for affordance + heavier bars */
  ctx.strokeStyle = 'rgba(255,210,160,0.28)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, 20, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,210,160,0.75)'; ctx.lineWidth = 4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(px-6, py-8); ctx.lineTo(px-6, py+8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px+6, py-8); ctx.lineTo(px+6, py+8); ctx.stroke();
}
/* mobile M8: rotate-to-portrait overlay */
function drawLandscapeOverlay(){
  var W = view.W, H = view.H;
  ctx.fillStyle = 'rgba(6,3,4,0.88)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.95)';
  ctx.font = '500 26px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('TURN YOUR PHONE', W/2, H/2 - 14);
  ctx.font = 'italic 15px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillStyle = 'rgba(190,160,140,0.8)';
  ctx.fillText('the god sleeps upright', W/2, H/2 + 18);
  ctx.textAlign = 'left';
}

/* ============================ MAIN ================================= */
var _lastFrame = 0, _acc = 0, _saveCount = 0;
var _ftEMA = 16, _slowT = 0;
function frame(t){
  requestAnimationFrame(frame);
  var now = t || 0;
  var fdt = Math.min(0.1, Math.max(0.0001, (_lastFrame ? (now-_lastFrame)/1000 : 0.016)));
  _lastFrame = now;
  /* thermal degrade: sustained p95-ish frame time > 20ms */
  _ftEMA = _ftEMA*0.95 + fdt*1000*0.05;
  if(_ftEMA > 20){ _slowT += fdt; } else { _slowT = 0; }
  if(_slowT > 5 && render.degraded === 0){
    render.degraded = 1;
    /* P0-16: lowering dpr MUST re-fit the backing store (shared choke point) */
    try{ view.dpr = Math.min(view.dpr, 1.5); resizeBacking(); }catch(e){}
  }
  /* UI timers */
  if(uiMsgT > 0) uiMsgT -= fdt;
  if(gameMode === 'title' || gameMode === 'select' || gameMode === 'records' ||
     gameMode === 'custom' || gameMode === 'settings' || gameMode === 'complete'){
    if(attract) updateAttract(fdt);
    /* menu lullaby: N = glands found (≥1), ducked −6dB, once per menu entry */
    if(audio && audio.unlocked && !audio._menuLullaby){
      audio._menuLullaby = true;
      audio.sfxLullaby(Math.max(1, save.secrets.lullaby||0), 0.5);
    }
    if(!IS_NODE) renderMenu();
    debounceSave(fdt);
    return;
  }
  if(gameMode === 'paused'){
    if(!IS_NODE){ drawPaused(); }
    debounceSave(fdt);
    return;
  }
  if(gameMode !== 'play' || !sim){ debounceSave(fdt); return; }
  if(sim.s.paused){ debounceSave(fdt); return; }
  /* mobile M8: landscape = full-screen overlay + soft-pause (iOS ignores manifest orientation) */
  if(landscapeHold){
    if(!IS_NODE){ renderGame(); drawLandscapeOverlay(); }
    debounceSave(fdt);
    return;
  }
  /* fixed-step accumulator: max 4 steps/frame, delta clamp 100ms */
  _acc += fdt;
  var steps = 0;
  while(_acc >= DT && steps < 4){ sim.update(); _acc -= DT; steps++; }
  if(steps === 4) _acc = 0;   /* spiral-of-death guard: slow slightly */
  /* audio state follows sim */
  if(audio && audio.unlocked){
    var bpm = 52;
    if(sim.s.ch === 5) bpm = 120;
    else if(sim.s.ch === 4) bpm = 46;
    else if(sim.s.ch === 1) bpm = 64;
    if(sim.s.tide) bpm = 96;
    else if(sim.s.wake >= 70) bpm = 72 + 16*(sim.s.wake-70)/30;   /* restless ramp 72->88 */
    /* UX D4: the Waking arrives over 3s — the pulse climbs with it, earned */
    if(sim.s.wakeRampT > 0) bpm = lerp(52, 120, clamp(1 - sim.s.wakeRampT/3, 0, 1));
    if(sim.s.alive < 12) { /* near-death: heartbeat doubles via echo */ }
    audio.setBPM(bpm);
    audio.setWake(sim.s.wake);
    audio.setImmuneProximity(Math.max(sim.s.cellNear||0, sim.s.tide ? 1 : 0));
    audio.setNearDeath(sim.s.alive < 12);
    audio.setStreak(sim.s.streak || 0);
    /* P2-6: personal-best daily shaker — on pace iff this daily's score beats the stored PB */
    audio.setPbPace(!!(sim.s.daily && save.daily && save.daily.best > 0 && sim.s.score > save.daily.best));
    /* duck slew lives in the audio layer; the hook only names the state */
    if(sim.s.skipT > 0) audio.setDuck(1);
    else if(sim.s.lidT > 0) audio.setDuck(0.97);
    else if(sim.s.duckDreamT > 0) audio.setDuck(0.9);
    else if(gameMode === 'play') audio.setDuck(0);
  }
  if(sim.s.mode === 'complete' && gameMode === 'play'){ showComplete(); }
  if(sim.s.mode === 'dawn' && gameMode === 'play'){ showDawn(); }
  if(sim.s.mode === 'dream' && gameMode === 'play'){ showDream(); }
  if(sim.s.mode === 'dawn') sim.s.dawnT = (sim.s.dawnT||0) + fdt;
  if(sim.s.mode === 'dream') sim.s.dreamT = (sim.s.dreamT||0) + fdt;
  /* P0-17: render gating — the sim is fixed-step, so on 120Hz displays every
     second rAF tick has no new sim state. Skip the render when <15ms since the
     last render or no sim step ran this frame (halves GPU/battery on ProMotion). */
  if(!IS_NODE){
    if(steps > 0 && now - _lastRender >= 15){ renderGame(); _lastRender = now; }
  }
  debounceSave(fdt);
}
function debounceSave(fdt){
  if(_saveTimer > 0){
    _saveCount += fdt;
    if(_saveCount > 0.25){ _saveCount = 0; _saveTimer = 0; writeSave(save); }
  }
}
function renderGame(){
  var S = sim.s;
  /* camera follows swarm, biased to see ahead (descending) */
  var targetY = S.cy - view.H*0.42;
  /* P0-15: finger-shadow offset, made real. The follow-point offset (S.fy) is
     write-only in this architecture (cy advances autonomously; only cx chases
     the finger), so the offset lives in the camera: while constricted and
     touching, the ribbon locks 70pt above the finger on screen. The 20pt
     ribbon is invisible under the finger inside 34pt gates; bloomed needs no
     offset (the disc stays visible around the finger). */
  if(input.hasTouch && S.c > 0.5 && input.sy > 0){
    targetY = S.cy - (input.sy - 70);
  }
  view.camY += (targetY - view.camY) * 0.12;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawTissue(S);
  drawWalls(S);
  drawEntities(S);
  drawHazards(S);
  if(S.flash){ drawFlash(S); }
  else { updateTrails(S, 1/60); drawSwarm(S); }
  drawLightMask(S);
  drawVeils(S);
  drawHUD(S);
  drawPauseGlyph();
}
function renderMenu(){
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  view.camY += (0 - view.camY) * 0.05;
  if(gameMode === 'title') drawTitle();
  else if(gameMode === 'select') drawSelect();
  else if(gameMode === 'records') drawRecords();
  else if(gameMode === 'custom') drawCustom();
  else if(gameMode === 'settings') drawSettings();
  else if(gameMode === 'complete') drawComplete();
  else if(gameMode === 'dawn') drawDawn();
  else if(gameMode === 'dream') drawDream();
  else if(gameMode === 'keyboard') drawKeyboard();
}
/* route touches: UI first, gameplay second */
function routeTouch(sx, sy){
  if(gameMode === 'settings') return settingsTouch(sx, sy);
  if(gameMode === 'keyboard') return keyboardTouch(sx, sy);
  return uiTouchStart(sx, sy);
}
/* ====================== GULLET test hooks ========================== */
var _headless = null;
if(typeof window === 'undefined' && typeof globalThis !== 'undefined'){
  globalThis.window = globalThis;
}
window.GULLET = {
  Sim: Sim,
  newRun: function(seed){
    var inp = { held:false, tx:0, ty:60, sx:0, sy:0, hasTouch:false, justTouched:false, flickT:-10 };
    var sv = loadSave();
    save = sv;   /* headless: mirror the browser, where global save === saveRef */
    var s = Sim(inp, sv, null);
    if(seed !== undefined) s.s.rngCos = mulberry32(seed);
    s.newRun(0);
    _headless = { sim: s, input: inp, save: sv };
    return s;
  },
  step: function(n){
    if(!_headless) throw new Error('GULLET.newRun() first');
    for(var i=0;i<n;i++) _headless.sim.update();
    return _headless.sim.state();
  },
  state: function(){
    if(!_headless) throw new Error('GULLET.newRun() first');
    return _headless.sim.state();
  },
  input: function(){ return _headless ? _headless.input : null; },
  validateRoom: validateRoom,
  buildRoom: buildRoom,
  genDailyRoom: genDailyRoom,
  ROOMS_T: ROOMS_T,
  ROOMS_BY_CHAPTER: ROOMS_BY_CHAPTER
};
/* mastery sigils: long-tail keeps, earned across many descents */
var SIGILS = [
  { id:'first_blood', ch:0, tier:'I', name:'First Blood', desc:'die once — the god noticed',
    test:function(sv){ return sv.stats.deaths >= 1; } },
  { id:'long_drop', ch:4, tier:'III', name:'The Long Drop', desc:'reach 1000m deep in one descent',
    test:function(sv){ return sv.stats.deepest >= 1000; } },
  { id:'drunkard', ch:0, tier:'II', name:'Drunkard', desc:'drink 100 spores, all told',
    test:function(sv){ return sv.stats.spores >= 100; } },
  { id:'tenfold', ch:0, tier:'III', name:'Tenfold', desc:'hold 10 rooms UNBROKEN, all told',
    test:function(sv){ return sv.stats.unbrokenRooms >= 10; } },
  { id:'long_vigil', ch:1, tier:'III', name:'The Long Vigil', desc:'hold UNBROKEN for 21 rooms in a row',
    test:function(sv){ return (sv.records.longestStreak||0) >= 21; } },
  { id:'half_remembered', ch:2, tier:'II', name:'Half-Remembered', desc:'find 3 memory glands',
    test:function(sv){ return sv.secrets.glands.filter(Boolean).length >= 3; } },
  { id:'six_mouths', ch:2, tier:'III', name:'Six Mouths', desc:'find all 6 memory glands',
    test:function(sv){ return sv.secrets.glands.filter(Boolean).length >= 6; } },
  { id:'hushed', ch:3, tier:'I', name:'Hushed', desc:'find 3 quiet rooms',
    test:function(sv){ return sv.secrets.quiet.filter(Boolean).length >= 3; } },
  { id:'third_morning', ch:5, tier:'I', name:'The Third Morning', desc:'a 3-day daily streak',
    test:function(sv){ return (sv.daily && sv.daily.streak >= 3); } },
  { id:'seventh_morning', ch:5, tier:'II', name:'The Seventh Morning', desc:'a 7-day daily streak',
    test:function(sv){ return (sv.daily && sv.daily.streak >= 7); } },
  { id:'light_sleeper', ch:1, tier:'II', name:'Light Sleeper', desc:'average wake under 20 in any chapter',
    test:function(sv){ for(var i=0;i<6;i++){ if(sv.stats.wakeN[i] > 0 && sv.stats.wakeSum[i]/sv.stats.wakeN[i] < 20) return true; } return false; } },
  { id:'still_point', ch:3, tier:'III', name:'The Still Point', desc:'reach the Gentle Dream — never wake the god',
    test:function(sv){ return !!sv.secrets.zeroWake; } },
  { id:'outrun', ch:2, tier:'I', name:'Outrun', desc:'outrun yourself once',
    test:function(sv){ return (sv.records.haunts||0) >= 1; } },
  { id:'seven_shards', ch:5, tier:'III', name:'Seven Shards', desc:'gather all seven shards of one week',
    test:function(sv){ return !!(sv.weekly && sv.weekly.done); } },
  { id:'long_night', ch:4, tier:'II', name:'The Long Night', desc:'descend for an hour, all told',
    test:function(sv){ return sv.stats.playtime >= 3600; } },
  { id:'well_kept', ch:4, tier:'I', name:'Well Kept', desc:'keep 7 challenges',
    test:function(sv){ return sv.stats.challenges.length >= 7; } },
  { id:'two_hearts', ch:1, tier:'I', name:'Two Hearts', desc:'answer the hidden heartbeat',
    test:function(sv){ return !!sv.secrets.secondPulse; } },
  { id:'perfectly_still', ch:3, tier:'II', name:'Perfectly Still', desc:'earn the still tag',
    test:function(sv){ return !!sv.secrets.stillTag; } }
];
function sigilEarned(id){
  return save.sigils && save.sigils.indexOf(id) >= 0;
}
function grantSigil(id){
  if(sigilEarned(id)) return;
  if(!save.sigils) save.sigils = [];
  save.sigils.push(id);
  writeSave(save);
  var nm = id;
  for(var i=0;i<SIGILS.length;i++) if(SIGILS[i].id === id) nm = SIGILS[i].name;
  var line = 'a sigil is kept — ' + nm.toLowerCase();
  if(sim && sim.s){ sim.s.whisper = line; sim.s.whisperT = 3; }
  uiMsg = line; uiMsgT = 4;
  if(typeof A !== 'undefined' && A) A.sfx('challenge');
}
function checkSigils(){
  if(!save.sigils) save.sigils = [];
  /* P1-14 backfill: challenges earned before the secret flags existed still count */
  if(save.secrets){
    if(!save.secrets.secondPulse && challengeDone('pulse2')) save.secrets.secondPulse = true;
    if(!save.secrets.stillTag && challengeDone('still')) save.secrets.stillTag = true;
  }
  for(var i=0;i<SIGILS.length;i++){
    var g = SIGILS[i];
    if(save.sigils.indexOf(g.id) < 0){
      try{ if(g.test(save)) grantSigil(g.id); }catch(e){}
    }
  }
}
function unlockTrail(id){
  if(save.unlocks.trails.indexOf(id) < 0){ save.unlocks.trails.push(id); writeSave(save); }
}
/* ============================ GO =================================== */
if(!IS_NODE){
  boot();
  renderInit();
  /* service worker: offline app shell */
  try{
    if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
      navigator.serviceWorker.register('./sw.js');
  }catch(e){}
  onHeldChange = function(h){
    if(gameMode !== 'play') return;
    if(audio){ audio.unlock(); audio.sfx(h ? 'constrict' : 'bloom'); }
  };
  /* wire UI-first touch routing into the input handlers */
  var _origBind = bindInput;
  showTitle();
  requestAnimationFrame(frame);
}
/* ==================== M2: FULL CAMPAIGN ============================ */
/* Chapters 1..5: room data via a compact corridor DSL, chapter systems,
   secrets, meta progression. Appended; M1 systems untouched. */

/* corridor walls with gate pinches; gates:[{y,w}] sorted internally */
var A = { sfx:function(n){ if(typeof audio !== 'undefined' && audio) audio.sfx(n); },
          setBPM:function(b){ if(typeof audio !== 'undefined' && audio) audio.setBPM(b); },
          setChapter:function(c){ if(typeof audio !== 'undefined' && audio) audio.setChapter(c); },
          setWake:function(w){ if(typeof audio !== 'undefined' && audio) audio.setWake(w); },
          setImmune:function(b){ if(typeof audio !== 'undefined' && audio) audio.setImmune(b); },
          setImmuneProximity:function(p){ if(typeof audio !== 'undefined' && audio && audio.setImmuneProximity) audio.setImmuneProximity(p); },
          setNearDeath:function(b){ if(typeof audio !== 'undefined' && audio) audio.setNearDeath(b); },
          setStreak:function(s){ if(typeof audio !== 'undefined' && audio) audio.setStreak(s); },
          setSecondBeat:function(b){ if(typeof audio !== 'undefined' && audio && audio.setSecondBeat) audio.setSecondBeat(b); },
          lateBeat:function(){ if(typeof audio !== 'undefined' && audio) audio.sfx('lateBeat'); },
          setEyeCalm:function(b){ if(typeof audio !== 'undefined' && audio) audio.setEyeCalm(b); } };
function corrWalls(len, half, gates, pad, wind){
  var pts = [[0,-half,half]];
  var gs = (gates||[]).slice().sort(function(a,b){ return a.y-b.y; });
  for(var i=0;i<gs.length;i++){
    var g = gs[i], hw = g.w/2;
    pts.push([g.y-140,-half,half]);
    pts.push([g.y-50,-hw*1.7,hw*1.7]);
    pts.push([g.y,-hw,hw]);
    pts.push([g.y+50,-hw*1.7,hw*1.7]);
    pts.push([g.y+140,-half,half]);
  }
  pts.push([len,-half,half]);
  /* wind: horizontal maze offsets [{y, dx}] interpolated along the corridor */
  if(wind && wind.length){
    var ws = wind.slice().sort(function(a,b){ return a.y-b.y; });
    for(var p=0;p<pts.length;p++){
      var py = pts[p][0];
      var pv = {y:-1e9, dx:0}, nx = {y:1e9, dx:0};
      for(var w2=0;w2<ws.length;w2++){
        if(ws[w2].y <= py && ws[w2].y >= pv.y) pv = ws[w2];
        if(ws[w2].y >= py && ws[w2].y <= nx.y) nx = ws[w2];
      }
      var span = nx.y - pv.y;
      var dx = span > 0 ? pv.dx + (nx.dx-pv.dx)*(py-pv.y)/span : pv.dx;
      pts[p][1] += dx; pts[p][2] += dx;
    }
  }
  return pts;
}
/* ---- Chapter 1: THE HEART (valves on 64 BPM) ---- */
var ROOMS_H = [
{ n:0, safe:true, len:1900, peristalsis:false, events:[], valves:[],
  walls: corrWalls(1900, 165, []),
  spores: cluster(0,500,6,44,101).concat(cluster(0,1100,6,44,102)).concat(cluster(0,1500,4,36,103)),
  nerves:[] },
{ n:1, safe:false, len:2000, peristalsis:false, events:[], valves:[{y:700,w:90,phase:0},{y:1400,w:90,phase:0}],
  walls: corrWalls(2000, 160, [{y:700,w:90},{y:1400,w:90}]),
  spores: cluster(0,350,5,40,111).concat(cluster(0,1050,5,40,112)),
  nerves:[{x:100,y:1700,msg:3}] },
{ n:2, safe:false, len:2100, peristalsis:false, events:[], valves:[{y:600,w:90,phase:0},{y:1250,w:90,phase:2}],
  walls: corrWalls(2100, 160, [{y:600,w:90},{y:1250,w:90}]),
  spores: stringSpores(0,400,0,550,3).concat(stringSpores(0,1050,0,1200,3)).concat(cluster(0,1700,5,40,121)),
  nerves:[] },
{ n:3, safe:false, len:2000, peristalsis:false, events:[{type:'skipbeat', y:900}], valves:[{y:1300,w:90,phase:0}],
  walls: corrWalls(2000, 160, [{y:1300,w:90}]),
  spores: cluster(0,500,5,40,131).concat(cluster(0,1650,5,40,132)),
  nerves:[], quiet:{x:-150,y:600,r:60} },
{ n:4, safe:false, len:2200, peristalsis:false, events:[], valves:[{y:550,w:90,phase:0},{y:1150,w:90,phase:2},{y:1750,w:90,phase:0}],
  walls: corrWalls(2200, 160, [{y:550,w:90},{y:1150,w:90},{y:1750,w:90}]),
  spores: cluster(0,850,4,36,141).concat(cluster(0,1450,4,36,142)),
  nerves:[{x:-100,y:2000,msg:4}] },
{ n:5, safe:false, len:2000, peristalsis:false, events:[], valves:[], secondBeat:true,
  walls: corrWalls(2000, 160, []),
  spores: cluster(0,600,5,40,151).concat(cluster(0,1400,5,40,152)),
  nerves:[], gland:{x:0,y:1000}, hidden:{x:190,y:1000,r:70,open:false} },
{ n:6, safe:false, len:1800, peristalsis:false, events:[], valves:[{y:1000,w:90,phase:0},{y:1400,w:90,phase:2}],
  /* P2-18: the last beat — twin valves on the 64 BPM heart push you through the gate */
  walls: corrWalls(1800, 165, [{y:1000,w:90},{y:1400,w:90}]),
  spores: cluster(0,400,5,40,161).concat(cluster(0,750,4,36,162)).concat(cluster(0,1650,4,36,163)),
  nerves:[], banner:true }
];
/* ---- Chapter 2: THE STOMACH (acid, churn, bladders, hunger bell) ---- */
var ROOMS_S = [
{ n:0, safe:true, len:1900, peristalsis:false, events:[],
  walls: corrWalls(1900, 165, []),
  spores: cluster(0,600,6,44,201).concat(cluster(0,1300,5,40,202)),
  nerves:[], acidShow:[{y0:1500,y1:1700,x0:-150,x1:150}] },
{ n:1, safe:false, len:2000, peristalsis:false, events:[],
  walls: corrWalls(2000, 150, [{y:900,w:70}]),
  spores: cluster(0,400,5,40,211).concat(stringSpores(0,700,0,850,3))
    .concat(cluster(0,750,8,22,213)),   /* pearl pocket: dense spores before the constriction */
  nerves:[], acids:[{y0:1000,y1:1250,x0:-140,x1:140}] },
{ n:2, safe:false, len:2100, peristalsis:false, events:[],
  walls: corrWalls(2100, 165, []),
  spores: cluster(0,500,5,40,221).concat(cluster(0,1500,6,44,222)),
  nerves:[{x:110,y:900,msg:5}], churns:[{x:0,y:800,r:120},{x:0,y:1300,r:120}] },
{ n:3, safe:false, len:2200, peristalsis:false, events:[{type:'bell', y:200}],
  walls: corrWalls(2200, 150, [{y:700,w:80},{y:1400,w:80}]),
  spores: stringSpores(0,500,0,650,3).concat(stringSpores(0,1200,0,1350,3))
    .concat(cluster(0,550,8,24,233)).concat(cluster(0,1550,8,24,234)),   /* pearl pockets before/after constrictions */
  nerves:[], acids:[{y0:1900,y1:2200,x0:-150,x1:150}], bellRise:150, quiet:{x:150,y:1000,r:60} },
{ n:4, safe:false, len:2000, peristalsis:false, events:[],
  walls: [[0,-170,170],[500,-170,170],[1000,-170,170],[1500,-170,170],[2000,-170,170]],
  spores: cluster(0,300,5,36,241).concat(cluster(0,1700,6,40,242)),
  nerves:[], bladders:[{x:-60,y:600},{x:60,y:1000},{x:-60,y:1400}] },
{ n:5, safe:false, len:2100, peristalsis:false, events:[], valves:[{y:1000,w:80,phase:0,slow:true}],
  walls: corrWalls(2100, 165, [{y:1000,w:80}]),
  spores: cluster(0,500,5,40,251).concat(cluster(0,1600,5,40,252)),
  nerves:[{x:-110,y:1300,msg:6}], acids:[{y0:1150,y1:1400,x0:-145,x1:145}], gland:{x:0,y:1800} },
{ n:6, safe:false, len:1900, peristalsis:false, events:[{type:'bell', y:200}],
  /* P2-18: the last churn — the hunger bell tolls, acid rises past the bladders */
  walls: corrWalls(1900, 165, []),
  spores: cluster(0,450,5,40,261).concat(cluster(0,900,5,40,262)).concat(cluster(0,1750,4,36,263)),
  nerves:[], acids:[{y0:1200,y1:1400,x0:-140,x1:140}],
  bladders:[{x:-60,y:600},{x:60,y:1000},{x:-60,y:1600}], bellRise:150, banner:true }
];
ROOMS_BY_CHAPTER.push(ROOMS_H, ROOMS_S);

/* ---- Chapter 3: THE EYE (watchers, lightless stretches, the Lid) ---- */
var ROOMS_E = [
{ n:0, safe:true, len:1900, peristalsis:false, events:[],
  walls: corrWalls(1900, 165, []),
  spores: cluster(0,600,6,44,301).concat(cluster(0,1300,5,40,302)),
  nerves:[], watchers:[{x:163,y:900,side:1,asleep:true}] },
{ n:1, safe:false, len:2000, peristalsis:false, events:[],
  walls: corrWalls(2000, 160, [{y:1000,w:80}]),
  spores: cluster(0,400,5,40,311).concat(cluster(0,1600,5,40,312)),
  nerves:[{x:-110,y:1300,msg:7}], watchers:[{x:-158,y:700,side:-1}] },
{ n:2, safe:false, len:2100, peristalsis:false, events:[], dark:true,
  walls: corrWalls(2100, 170, [{y:800,w:70},{y:1500,w:70}]),
  spores: cluster(0,500,6,44,321).concat(cluster(0,1200,6,44,322)).concat(cluster(0,1800,4,36,323)),
  nerves:[] },
{ n:3, safe:false, len:2000, peristalsis:false, events:[{type:'lid', y:300}],
  walls: corrWalls(2000, 160, []),
  spores: cluster(0,900,5,40,331).concat(cluster(0,1500,5,40,332)),
  nerves:[], gland:{x:0,y:1700,hidden:true}, watchers:[{x:158,y:1200,side:1}] },
{ n:4, safe:false, len:2300, peristalsis:false, events:[],
  walls: corrWalls(2300, 160, [{y:1100,w:80}]),
  spores: stringSpores(0,500,0,650,3).concat(stringSpores(0,1700,0,1850,3)),
  nerves:[{x:110,y:2000,msg:8}], watchers:[{x:-158,y:600,side:-1},{x:158,y:1200,side:1},{x:-158,y:1900,side:-1}] },
{ n:5, safe:false, len:2100, peristalsis:false, events:[], dark:true,
  /* maze rebuild: the corridor winds — dx offsets carve the maze */
  walls: corrWalls(2100, 150, [{y:700,w:70},{y:1400,w:70}], 0,
    [{y:0,dx:0},{y:350,dx:70},{y:700,dx:-40},{y:1050,dx:-80},{y:1400,dx:40},{y:1750,dx:80},{y:2100,dx:0}]),
  /* spores follow the wind: centered on the ACTUAL interpolated corridor (r=25 for 120pt clearance) */
  spores: cluster(3,400,5,25,351).concat(cluster(-38,1000,6,25,352)).concat(cluster(35,1750,5,25,353)),
  /* EYE n:5 watcher: sits ON the spore trail at the middle cluster, bisecting
     it — telegraphed lid-slit; the fair pass is constricted (bloom light never
     trips the gaze), consistent with watcher mechanics everywhere else */
  nerves:[], quiet:{x:-150,y:1100,r:60}, watchers:[{x:-38,y:1000,side:1}] },
{ n:6, safe:false, len:1700, peristalsis:false, events:[{type:'lid', y:300}],
  /* P2-18: the last look — a watcher guards the gate; the Lid lifts as you near it */
  walls: corrWalls(1700, 165, []),
  spores: cluster(0,450,5,40,361).concat(cluster(0,900,4,36,362)).concat(cluster(0,1400,4,36,363)),
  nerves:[], watchers:[{x:163,y:1150,side:1}], banner:true }
];
/* ---- Chapter 4: THE BRAIN (neural arcs, dream weather, static) ---- */
var ROOMS_B = [
{ n:0, safe:true, len:1900, peristalsis:false, events:[],
  walls: corrWalls(1900, 165, []),
  spores: cluster(0,600,6,44,401).concat(cluster(0,1300,5,40,402)),
  nerves:[], arcsShow:[{y:1000,gapX:0,gapW:80}],
  quiet:{x:155,y:500,r:60} },   /* P1-6: stillness alcove — off the main path, carved into the right wall */
{ n:1, safe:false, len:2000, peristalsis:false, events:[],
  walls: corrWalls(2000, 160, []),
  spores: cluster(0,500,5,40,411).concat(cluster(0,1500,5,40,412)),
  nerves:[{x:110,y:800,msg:9}], arcs:[{y:700,gapX:0,gapW:90,phase:0},{y:1300,gapX:0,gapW:90,phase:1}],
  quiet:{x:-150,y:1000,r:60} },   /* P1-6: stillness alcove — left wall, between the arcs */
{ n:2, safe:false, len:2100, peristalsis:false, events:[],
  walls: corrWalls(2100, 165, []),
  spores: cluster(0,600,5,40,431).concat(cluster(0,1500,5,40,432)),
  nerves:[], static:true, arcs:[{y:1000,gapX:0,gapW:100,phase:0}],
  quiet:{x:155,y:1600,r:60} },   /* P1-6: stillness alcove — right wall, past the arc */
{ n:3, safe:false, len:2200, peristalsis:false, events:[], dream:true,
  walls: [[0,-200,200],[600,-200,200],[1200,-200,200],[1800,-200,200],[2200,-200,200]],
  spores: cluster(0,700,6,44,421).concat(cluster(0,1400,6,44,422)),
  nerves:[], gland:{x:0,y:1800,dream:true},
  quiet:{x:-190,y:1000,r:60} },   /* P1-6: stillness alcove — left wall; clear of the dream gland (0,1800) */
{ n:4, safe:false, len:2000, peristalsis:false, events:[],
  walls: corrWalls(2000, 160, [{y:1000,w:80}]),
  spores: cluster(0,500,5,40,441).concat(cluster(0,1500,5,40,442)),
  nerves:[{x:-110,y:1700,msg:10}], gland:{x:0,y:800}, quiet:{x:150,y:1300,r:60} },
{ n:5, safe:false, len:2300, peristalsis:false, events:[], dream:true,
  walls: [[0,-190,190],[700,-190,190],[1400,-190,190],[2300,-190,190]],
  spores: cluster(0,600,6,44,451).concat(cluster(0,1200,6,44,452)).concat(cluster(0,1900,5,40,453)),
  nerves:[], arcs:[{y:900,gapX:0,gapW:90,phase:0},{y:1500,gapX:0,gapW:90,phase:1}],
  quiet:{x:-180,y:1150,r:60} },   /* P1-6: stillness alcove — left wall, between the arcs; 4:5+4:6 need the chain too (95.8 wake floor > 90 trigger) */
{ n:6, safe:false, len:1900, peristalsis:false, events:[{type:'finalvalve', y:1500}],
  walls: corrWalls(1900, 160, [{y:1500,w:60}]),
  spores: cluster(0,600,5,40,461).concat(cluster(0,1100,5,40,462)),
  nerves:[], quiet:{x:150,y:1000,r:60} },   /* P1-6: stillness alcove — right wall, before the final valve */
];
/* ---- Chapter 5: THE WAKING (remixes; wake locked high; the ascent) ---- */
var ROOMS_W = [
{ n:0, safe:true, len:1800, peristalsis:true, waveDir:-1, events:[],
  walls: corrWalls(1800, 165, []),
  spores: cluster(0,600,6,44,501).concat(cluster(0,1200,5,40,502)),
  nerves:[{x:100,y:1400,msg:12}] },
{ n:1, safe:false, len:2000, peristalsis:false, events:[], valves:[{y:600,w:40,phase:0,arrhythmic:true},{y:1300,w:40,phase:0,arrhythmic:true}],
  walls: corrWalls(2000, 160, [{y:600,w:40},{y:1300,w:40}]),
  spores: cluster(0,950,5,40,511).concat(cluster(0,1700,5,40,512)),
  nerves:[], gland:{x:0,y:300} },
{ n:2, safe:false, len:2100, peristalsis:false, events:[],
  walls: corrWalls(2100, 155, [{y:1000,w:75}]),
  spores: cluster(0,500,5,40,521).concat(cluster(0,1600,5,40,522)),
  nerves:[], geysers:[{x:-60,y:700,t:0},{x:60,y:1300,t:3}], quiet:{x:-150,y:1800,r:60} },
{ n:3, safe:false, len:2100, peristalsis:false, events:[],
  walls: corrWalls(2100, 160, []),
  spores: cluster(0,600,5,40,531).concat(cluster(0,1500,5,40,532)),
  nerves:[], watchers:[{x:-158,y:600,side:-1},{x:158,y:1100,side:1},{x:-158,y:1700,side:-1}], waking:true },
{ n:4, safe:false, len:2200, peristalsis:false, events:[], static3:true,
  walls: corrWalls(2200, 160, []),
  spores: cluster(0,600,5,40,541).concat(cluster(0,1600,5,40,542)),
  nerves:[{x:110,y:1100,msg:11}],
  arcs:[{y:500,gapX:0,gapW:90,phase:0},{y:900,gapX:0,gapW:90,phase:1},{y:1300,gapX:0,gapW:90,phase:0},{y:1700,gapX:0,gapW:90,phase:1}] },{ n:5, safe:false, len:2400, peristalsis:false, events:[],
  walls: [[0,-170,170],[600,-170,170],[1040,-170,170],[1100,-20,20],[1160,-170,170],[1200,-170,170],[1800,-170,170],[2400,-170,170]],
  spores: cluster(0,400,5,36,551).concat(cluster(0,2000,6,44,552)),
  nerves:[], bladders:[{x:-60,y:800},{x:60,y:1400},{x:-60,y:1900}], valves:[{y:1100,w:40,phase:0,arrhythmic:true}] },
{ n:6, safe:false, len:2000, peristalsis:false, events:[{type:'eyelid', y:1600}],
  walls: corrWalls(2000, 170, []),
  spores: cluster(0,500,6,44,561).concat(cluster(0,1100,6,44,562)),
  nerves:[] }
];
ROOMS_BY_CHAPTER.push(ROOMS_E, ROOMS_B, ROOMS_W);

var CHAPTERS = [
  { name:'I. THE THROAT',  sub:'the way in is the way down', bpm:52,
    pal:{ tissue:['#241009','#1a0d07','#140a08'], wall:'#2b1409', rib:'rgba(90,44,26,0.5)' } },
  { name:'II. THE HEART',  sub:'hold to the beat', bpm:64,
    pal:{ tissue:['#2a0d10','#1c0a0c','#150808'], wall:'#331016', rib:'rgba(140,40,50,0.5)', pulse:true } },
  { name:'III. THE STOMACH', sub:'what it wants, it dissolves', bpm:52,
    pal:{ tissue:['#1c1a0c','#15120a','#100e08'], wall:'#2a2410', rib:'rgba(110,100,40,0.5)', acid:true } },
  { name:'IV. THE EYE',    sub:'do not let it see you bloom', bpm:52,
    pal:{ tissue:['#101418','#0c0f12','#0a0c0e'], wall:'#161c22', rib:'rgba(70,90,110,0.45)', cold:true } },
  { name:'V. THE BRAIN',   sub:'think quietly', bpm:46,
    pal:{ tissue:['#150f22','#100b1a','#0c0814'], wall:'#1d1428', rib:'rgba(100,70,150,0.5)', violet:true } },
  { name:'VI. THE WAKING', sub:'the long light, at last', bpm:120,
    pal:{ tissue:['#2a1a10','#201410','#18100c'], wall:'#332014', rib:'rgba(160,100,60,0.5)', dawn:true } }
];
/* ==================== M2 SIM: chapter systems ===================== */
/* runtime room enrichment: carve quiet alcoves, copy hazard state */
globalThis.buildRoomPost = function(room, def){
  if(def.quiet){
    var q = def.quiet, side = q.x > 0 ? 1 : -1;
    for(var i=0;i<room.wallL.length;i++){
      var y = i*16, d = Math.abs(y - q.y);
      if(d < q.r*1.4){
        var push = q.r*1.5*Math.cos(d/(q.r*1.4)*Math.PI/2);
        if(side > 0) room.wallR[i] += push; else room.wallL[i] -= push;
      }
    }
    room.quiet = {x:q.x, y:q.y, r:q.r, done:false};
  }
  if(def.valves) room.valves = def.valves.map(function(v){
    return {y:v.y, w:v.w, phase:v.phase||0, slow:!!v.slow, arrhythmic:!!v.arrhythmic,
      open:true, prevOpen:true, slamT:0, nextT:2+Math.random(), inhale:false};
  });
  if(def.acids) room.acids = def.acids.map(function(a){ return {y0:a.y0, y1:a.y1, x0:a.x0, x1:a.x1, rise:0}; });
  if(def.acidShow) room.acidShow = def.acidShow;
  if(def.churns) room.churns = def.churns;
  if(def.bladders) room.bladders = def.bladders.map(function(b){ return {x:b.x, y:b.y, popped:false}; });
  if(def.watchers) room.watchers = def.watchers.map(function(w){
    return {x:w.x, y:w.y, side:w.side, asleep:!!w.asleep, gaze:0, open:!w.asleep, gazeCued:false};
  });
  if(def.arcs) room.arcs = def.arcs;
  if(def.arcsShow) room.arcsShow = def.arcsShow;
  if(def.geysers) room.geysers = def.geysers.map(function(g){ return {x:g.x, y:g.y, t:g.t, bulge:false}; });
  if(def.gland) room.gland = {x:def.gland.x, y:def.gland.y, hidden:!!def.gland.hidden, dream:!!def.gland.dream, found:false};
  if(def.hidden) room.hidden = {x:def.hidden.x, y:def.hidden.y, r:def.hidden.r, open:false};
  room.dream = !!def.dream; room.dark = !!def.dark;
  room.staticT = 0; room.secondBeat = !!def.secondBeat; room.waveDir = def.waveDir || 1;
  room.staticRule = !!def.static; room.static3 = !!def.static3; room.waking = !!def.waking;
  room.bellRise = def.bellRise || 0;
  /* DAILY_NARROW killed: the daily never narrows the walls */
};
/* per-run chapter state */
function m2_resetChapterState(S){
  S.beatT = 0; S.bpm = 64; S.skipT = 0;
  S.b2T = 0; S.b2Consec = 0;
  S.acidT = 0; S.bellT = 0; S.bellTolled = false;
  S.lidT = 0; S.stillT = 0; S.flash = null;
  S.scrambleT = 0; S.statT = 0; S.nerveDwell = 0; S.nerveIdx = -1;
  S.inDream = false; S.wakeTideT = 0; S.tideCount = 0;
  S.prevHeld = false; S.consec2 = 0; S.chConstr = 0; S.wakingTime = 0; S.tideCount = 0; S.doneCh = -1;
  S.stats = S.stats || { spores:0, deaths:0 };
  S.stats.constrictions = 0; S.stats.offbeat = 0; S.stats.threaded = 0;
  S.stats.sporesRun = 0; S.stats.watcherAlerts = 0;
  S.chapterMotesLost = 0;
};
/* direct kill bypassing iframes/caps (acid, arcs) */
function m2_killMote(sim, why){
  var S = sim.s;
  if(S.alive <= 0) return;
  if(S.grace > 0) return;   /* BH-07: respawn grace covers acid/arc kills */
  var best = null, bd = -1;
  for(var i=0;i<S.motes.length;i++){
    var m = S.motes[i]; if(!m.alive) continue;
    var d = Math.abs(m.x - S.cx) + Math.abs(m.y - S.cy);
    if(d > bd){ bd = d; best = m; }
  }
  if(!best) return;
  best.alive = false; best.deathT = 1.6; S.alive--;
  S.chapterMotesLost++;
  S.runMotesLost = (S.runMotesLost||0)+1;
  S.roomLost++;   /* BH-01 symmetry: acid/arc kills break room-UNBROKEN too */
  A.sfx('hiss');
  if(S.alive <= 0) sim.startDeath(why);
};
function m2_valveOpen(sim, v){
  var S = sim.s;
  if(v.arrhythmic) return v.slamT <= 0;
  if(S.skipT > 0) return true; /* half-open during skipped beat */
  var bl = 60 / S.bpm * (v.slow ? 1.333 : 1);
  return (Math.floor((S.beatT + v.phase*bl) / bl) % 4) < 2;
};
function m2_updateChapter(sim, dt){
  var S = sim.s, room = S.room, i, j;
  var R = S.rngCos || Math.random;
  S.sc = smoothstep(S.c);
  if(S.flash){ m2_updateFlash(S,dt); return; }
  var rising = sim.input.held && !S.prevHeld;
  S.prevHeld = sim.input.held;
  if(S.scrambleT > 0) S.scrambleT -= dt;
  /* ---- stillness: slow the world ----
     BH-03: stillT is decremented + scaled once in Sim.update(); dt arrives pre-scaled. */
  var wdt = dt;
  if(S.stillT > 0) sim.addWake(-20*dt);
  /* ---- HEART: beat clock, valves, second heartbeat ---- */
  if(S.ch === 1 || (room.valves && room.valves.length)){
    S.beatT += wdt;
    if(S.skipT > 0) S.skipT -= wdt;
    for(i=0;i<room.valves.length;i++){
      var v = room.valves[i];
      v.prevOpen = v.open;
      if(v.arrhythmic){
        v.nextT -= wdt;
        if(v.nextT <= 0){
          if(v.slamT <= 0){ v.inhale = true; v.inhaleT = 1.2; v.nextT = 1.2; }
          else { v.inhale = false; v.slamT = 0; v.nextT = 2 + Math.random()*1.5; }
        }
        if(v.inhale && v.nextT <= 0){ v.slamT = 1.5 + Math.random(); v.inhale = false; }
        if(v.inhale) v.inhaleT = Math.max(0, (v.inhaleT||1.2) - wdt);
        if(v.slamT > 0) v.slamT -= wdt;
        v.open = v.slamT <= 0;
      } else {
        v.open = m2_valveOpen(sim,v);
        var bl = 60/S.bpm*(v.slow?1.333:1);
        var cyc = (S.beatT + v.phase*bl) % (bl*4);
        v.inhale = v.open && cyc > bl*4 - 1.2;
        if(v.inhale) v.inhaleT = (bl*4 - cyc);   /* 1.2 -> 0 across the telegraph */
        if(v.inhale && !v.inhaled){ A.sfx('valveInhale'); v.inhaled = true; }
        if(!v.open) v.inhaled = false;
      }
      /* valve crush at slam moment */
      if(v.prevOpen && !v.open){
        var caught = false;
        for(j=0;j<S.motes.length;j++){
          var m = S.motes[j]; if(!m.alive) continue;
          if(Math.abs(m.y - v.y) < 26 && Math.abs(m.x) > 7){ caught = true; break; }
        }
        if(caught){ sim.loseMotes(4, 'valve'); A.sfx('valveSlam'); }
        else A.sfx('valveSlam');
      }
      /* on-beat pass: crossing open valve while constricted */
      if(S.prevCy < v.y && S.cy >= v.y && v.open && S.sc > 0.5){
        sim.addWake(-2); bumpStat('onbeat', 1);
      }
      /* dynamic valve collision */
      var allowed = v.open ? v.w/2 : 7;
      for(j=0;j<S.motes.length;j++){
        var mm = S.motes[j]; if(!mm.alive) continue;
        if(Math.abs(mm.y - v.y) < 26 && Math.abs(mm.x) > allowed){
          mm.x = allowed * (mm.x > 0 ? 1 : -1);
        }
      }
    }
    if(rising && S.ch === 1){
      S.stats.constrictions++;
      S.chConstr = (S.chConstr||0) + 1;
      var bl2 = 60/S.bpm;
      if(room.valves.length && (Math.floor(S.beatT/bl2) % 4) >= 2){
        S.stats.offbeat++;
        sim.addWake(6);
        S.whisper = 'the heart notices';
        A.sfx('offbeat');
      }
    }
    /* second heartbeat: 58 BPM, 8 consecutive onsets open the hidden room */
    if(room.secondBeat){
      S.b2T += wdt;
      if(rising){
        var p2 = 60/58, ph = S.b2T % p2;
        var err = Math.min(ph, p2 - ph);
        if(err <= 0.09){ S.b2Consec++; } else { S.b2Consec = 0; }
        if(S.b2Consec >= 8 && room.hidden && !room.hidden.open){
          room.hidden.open = true;
          S.whisper = 'the second pulse answers — something opens';
          A.sfx('hiddenOpen');
          unlockTrail('second');
          grantChallenge('pulse2');
        }
      }
    }
  } else if(rising){
    S.stats.constrictions++;
    S.chConstr = (S.chConstr||0) + 1;
  }
  if(S.tide && !S._wasTide){ if(!S.tide.forced){ S.tideCount++; S.chTides = (S.chTides||0)+1; } bumpStat('tides', 1); }
  S._wasTide = !!S.tide;
  if(S.ch === 5) S.wakingTime = (S.wakingTime||0) + dt;
  /* ---- STOMACH: acid, churns, bladders, hunger bell ---- */
  if(room.acids){
    for(i=0;i<room.acids.length;i++){
      var a = room.acids[i];
      var y0 = a.y0 - a.rise;
      var inAcid = false;
      for(j=0;j<S.motes.length;j++){
        var m2 = S.motes[j]; if(!m2.alive) continue;
        if(m2.x > a.x0 && m2.x < a.x1 && m2.y > y0 && m2.y < a.y1) inAcid = true;
      }
      if(inAcid){
        if(S.sc >= 0.5){ /* constricted: skim safe */ }
        else {
          S.acidT += wdt;
          sim.addWake(4*wdt);
          while(S.acidT >= 0.25){ S.acidT -= 0.25; m2_killMote(sim,'acid'); }
        }
      }
    }
  }
  if(room.churns){
    for(i=0;i<room.churns.length;i++){
      var c = room.churns[i];
      for(j=0;j<S.motes.length;j++){
        var m3 = S.motes[j]; if(!m3.alive) continue;
        var dx = m3.x - c.x, dy = m3.y - c.y, d = Math.sqrt(dx*dx+dy*dy);
        if(d < c.r && d > 1){
          var f = 60*(1 - d/c.r)*wdt;
          m3.x += dx/d*f; m3.y += dy/d*f*0.5;
        }
      }
    }
  }
  if(room.bladders){
    for(i=0;i<room.bladders.length;i++){
      var b = room.bladders[i];
      if(!b.popped && S.sc > 0.5){
        var bd = Math.sqrt((S.cx-b.x)*(S.cx-b.x) + (S.cy-b.y)*(S.cy-b.y));
        if(bd < 44){
          b.popped = true;
          S.cy -= 200;
          for(j=0;j<S.motes.length;j++){ var m4=S.motes[j]; if(m4.alive){ m4.y -= 200; m4.vy -= 300; } }
          sim.addWake(-3);
          A.sfx('bladderPop');
        }
      }
    }
  }
  if(S.bellT > 0){
    S.bellT -= wdt;
    if(room.acids){
      for(i=0;i<room.acids.length;i++) room.acids[i].rise = room.bellRise * (1 - S.bellT/20);
      if(S.bellT <= 0){ for(i=0;i<room.acids.length;i++) room.acids[i].rise = 0; }
    }
    if(!S.bellTolled && S.bellT < 10){ S.bellTolled = true; A.sfx('bell'); }
  }
  /* ---- EYE: watchers ---- */
  if(room.watchers){
    for(i=0;i<room.watchers.length;i++){
      var w = room.watchers[i];
      if(w.asleep) continue;
      var bloomR = 46*(1-S.sc) + 10*S.sc;
      var wd = Math.sqrt((S.cx-w.x)*(S.cx-w.x) + (S.cy-w.y)*(S.cy-w.y));
      var light = (bloomR/46) * Math.max(0, 1 - wd/400);
      if(light > 0.35 && !S.tide){
        /* P1-5: the Watcher telegraph earns its sound — the 'gaze' glass-harmonic
           (AUDIO_DIRECTION §4: "the 2 s warning") fires exactly once when the
           watcher opens/begins charging, then re-arms when it closes. */
        if(!w.gazeCued){ w.gazeCued = true; A.sfx('gaze'); }
        w.open = true;
        w.gaze += wdt/2;
        if(w.gaze >= 1){
          w.gaze = 0;
          S.stats.watcherAlerts++;
          sim.loseMotes(5, 'watcher');
          sim.addWake(10);
          A.sfx('snap');
          for(var k=0;k<room.watchers.length;k++) if(!room.watchers[k].asleep) room.watchers[k].gaze = 0.7;
          S.whisper = 'it saw you';
        }
      } else {
        w.gaze = Math.max(0, w.gaze - 0.5*wdt);
        if(w.gaze === 0){ w.open = false; w.gazeCued = false; }   /* re-arm the gaze cue */
      }
      /* waking remix: watchers snap at white cells too */
      if(room.waking && w.open){
        for(j=S._cells.length-1;j>=0;j--){
          var cl = S._cells[j]; if(!cl) continue;
          var cd = Math.sqrt((cl.x-w.x)*(cl.x-w.x) + (cl.y-w.y)*(cl.y-w.y));
          if(cd < 200){ S._cells.splice(j,1); S.score += 10; }
        }
      }
    }
    var calm = true;
    for(i=0;i<room.watchers.length;i++){ if(!room.watchers[i].asleep && room.watchers[i].gaze > 0.05){ calm = false; break; } }
    A.setEyeCalm(calm);
  }
  /* ---- EYE: the Lid ---- */
  if(S.lidT > 0){
    S.lidT -= wdt;
    if(S.lidT <= 0){
      S.lidT = 0;
      if(room.gland) room.gland.hidden = false;
      S.whisper = 'something glistens';
      A.sfx('hiddenOpen');
    }
  }
  /* ---- BRAIN: neural arcs, thought-static, dream weather ---- */
  if(room.arcs){
    for(i=0;i<room.arcs.length;i++){
      var ar = room.arcs[i];
      var bright = ((S.time + ar.phase) % 2) < 0.5;
      ar.bright = bright;
      for(j=0;j<S.motes.length;j++){
        var m5 = S.motes[j]; if(!m5.alive) continue;
        if(Math.abs(m5.y - ar.y) < 14 && Math.abs(m5.x - ar.gapX) > ar.gapW/2){
          if(bright || S.sc < 0.5){
            S.scrambleT = 0.5;
            sim.loseMotes(3, 'nerve');
            break;
          }
        }
      }
    }
  }
  if(room.staticRule || room.static3){
    var thresh = room.static3 ? 3 : 4;
    if(S.sc > 0.7){ room.staticT += wdt; }
    else room.staticT = 0;
    if(room.staticT > thresh){
      room.staticT = 0;
      S.scrambleT = 0.5;
      S.whisper = 'your thoughts come undone';
      A.sfx('static');
    }
  }
  S.inDream = !!room.dream;
  if(S.inDream){
    for(i=0;i<room.spores.length;i++){
      var spD = room.spores[i];
      if(!spD.taken) spD.y -= 20*wdt;
    }
  }
  /* ---- WAKING: wake locked high, tides on a timer, geysers ---- */
  if(S.ch === 5){
    if(S.wakeRampT > 0){
      /* UX D4: the Waking arrives as a 3s fiction, not a teleport.
         wake lerps from arrival value to 85; no hazard may strike during the ramp. */
      S.wakeRampT -= wdt;
      var rk = 1 - Math.max(0, S.wakeRampT)/3;
      S.wake = clamp((S.wakeRampFrom||0) + (85 - (S.wakeRampFrom||0))*rk, 0, 100);
      if(S.wakeRampT <= 0){
        S.wake = Math.max(S.wake, 85);
        if(S._sfx) S._sfx('dawnThump');   /* one heavy heartbeat thump on landing */
        S.edgeBlush = 1;
        S.whisper = 'it dreams of waking'; S.whisperT = 3;
      }
    } else {
      /* P0-4: floor 85, but NO forced rise — calm play can sit at 85-89 below
         the 90 trigger. Wake agency restored; the 45s timer is the pacing
         backstop (design: "tides every ~45s regardless"). */
      S.wake = Math.max(85, S.wake);
      if(!S.tide){
        S.wakeTideT += wdt;
        if(S.wakeTideT > 45){ S.wakeTideT = 0; sim.startTide(true); }
      }
    }
  }
  if(room.geysers){
    for(i=0;i<room.geysers.length;i++){
      var g = room.geysers[i];
      g.t -= wdt;
      if(g.eruptT > 0) g.eruptT -= wdt;
      if(g.t < 1.2 && !g.bulge){ g.bulge = true; A.sfx('geyserBulge'); }
      if(g.t <= 0){
        g.t = 6; g.bulge = false; g.eruptT = 0.4;
        A.sfx('geyser');
        var hit = false;
        for(j=0;j<S.motes.length;j++){
          var m6 = S.motes[j]; if(!m6.alive) continue;
          if(Math.abs(m6.x - g.x) < 40 && Math.abs(m6.y - g.y) < 200){ hit = true; break; }
        }
        if(hit) sim.loseMotes(4, 'acid');
      }
    }
  }
  /* ---- quiet rooms ---- */
  if(room.quiet && !room.quiet.done && S.stillT <= 0){
    var qd = Math.sqrt((S.cx-room.quiet.x)*(S.cx-room.quiet.x) + (S.cy-room.quiet.y)*(S.cy-room.quiet.y));
    if(qd < 150 && S.wake >= 20 && !room.quiet.warned){
      room.quiet.warned = true;
      S.whisper = 'too loud — return calm'; S.whisperT = 2.5;   /* level-design §4: the rule, whispered once */
    }
    if(qd < room.quiet.r && S.wake < 20 && S.mode === 'play'){
      room.quiet.done = true;
      /* BH-04: quiet-room completion is per-run; death cannot re-farm the burst */
      if(!S._visited) S._visited = {};
      var qvk = S.ch+':'+room.n;
      if(!S._visited[qvk]) S._visited[qvk] = {};
      S._visited[qvk].quiet = true;
      S.stillT = 8;
      save.secrets.quiet[S.ch] = true; writeSave(save);
      for(var sp=0;sp<30;sp++){
        room.spores.push({x:S.cx + (R()-0.5)*240, y:S.cy + (R()-0.5)*240, field:false, taken:false});
      }
      S.whisper = 'STILLNESS';
      A.sfx('stillness');
      checkChallenges('mid');   /* BH-02: only lifetime checks here; chapter-gated ones wait for clear */
      S.quietThisChapter = (S.quietThisChapter||0)+1;
      /* P1-15: Knot comes only from the Threadneedle challenge (see checkChallenges);
         quiet rooms no longer grant it directly. */
    }
  }
  /* ---- P1-6: standing stillness drain (Brain only) ----
     While the swarm rests bloomed and laterally near-still inside a quiet
     alcove, stillness itself drains wake — the legal wake reducer that makes
     the Gentle Dream reachable. Lateral speed is the measure (the swarm
     always descends >=90 pt/s; the finger owns the x axis, and a calm player
     holds it steady). Constricted or moving play never fires it, so normal
     play keeps its exact +3.5/+5/s Brain rates. Scoped to ch4 so ch0-3 and
     ch5 behavior is byte-identical.
     Rate: -60/s. A Brain room costs ~55-70 wake on the wake-optimal
     constricted sprint; the forced 90 pt/s descent gives ~1.33s inside an
     r=60 alcove, so -60/s nets ≈-80 per visit and the chain equilibrates
     near wake ~15, far from the 90 trigger. -20/s (the stillness-burst
     rate) was measured insufficient (trigger still fired in 4:2); -40/s
     equilibrated at ~75 and triggered in 4:5 on a full run. Alcoves in
     4:5/4:6 are required too: those two rooms cost 95.8 wake minimum with
     no reducer, above the 90 trigger. */
  if(S.ch === 4 && room.quiet && S.mode === 'play' && S.sc <= 0.5){
    var sdx = S.cx - room.quiet.x, sdy = S.cy - room.quiet.y;
    if(sdx*sdx + sdy*sdy < room.quiet.r*room.quiet.r && Math.abs(S.cvx) < 15){
      sim.addWake(-60*dt);
    }
  }
  /* ---- memory glands ---- */
  if(room.gland && !room.gland.found && !room.gland.hidden && S.mode === 'play'){
    var gd = Math.sqrt((S.cx-room.gland.x)*(S.cx-room.gland.x) + (S.cy-room.gland.y)*(S.cy-room.gland.y));
    if(gd < 44 && S.sc < 0.5) m2_startFlash(S,room.gland);
  }
  /* ---- hidden membrane collision ---- */
  if(room.hidden && !room.hidden.open){
    var h = room.hidden;
    for(j=0;j<S.motes.length;j++){
      var m7 = S.motes[j]; if(!m7.alive) continue;
      var hx = m7.x - h.x, hy = m7.y - h.y, hd = Math.sqrt(hx*hx+hy*hy);
      if(hd < h.r && hd > 1){ m7.x = h.x + hx/hd*h.r; m7.y = h.y + hy/hd*h.r; }
    }
  }
  /* nerve message leaving: dwell bloomed on a read knot for 2s */
  var scN = smoothstep(S.c), knotDwell = false;
  for(i=0;i<room.nerves.length;i++){
    var nvN = room.nerves[i];
    if(!nvN.read) continue;
    var ndx = nvN.x - S.cx, ndy = nvN.y - S.cy;
    if(ndx*ndx+ndy*ndy < 2500 && scN < 0.5){
      knotDwell = true;
      S.nerveDwell = (S.nerveDwell||0) + dt;
      S.nerveKnot = i;
    }
  }
  if(!knotDwell) S.nerveDwell = 0;
  if(S.nerveDwell > 2 && !IS_NODE && typeof gameMode !== 'undefined' && gameMode === 'play'){
    S.nerveDwell = 0;
    openKeyboard(S.nerveKnot);
  }
};

/* ==================== M2 SIM: flash, events, meta ================== */
/* memory-gland flash: become a single mote, gather echoes */
function m2_startFlash(S, gland){
  var echoes = [], n = gland.dream ? 5 : 3;
  var R = S.rngCos || Math.random;
  for(var i=0;i<n;i++){
    var a = R()*6.283, r = 60 + R()*90;
    echoes.push({ x:S.cx + Math.cos(a)*r, y:S.cy + Math.sin(a)*r - 40, taken:false, ph:R()*6.28 });
  }
  S.flash = { t: gland.dream ? 25 : 15, total: gland.dream ? 25 : 15,
              echoes: echoes, taken: 0, px: S.cx, py: S.cy, gland: gland, dream: gland.dream };
  S.whisper = gland.dream ? 'THE DREAM' : 'a memory surfaces';
  A.sfx('flash');
}
function m2_updateFlash(S, dt){
  var F = S.flash;
  F.t -= dt; S.time += 0; /* world holds its breath */
  /* finger steers the single mote directly */
  var inp = S._m2 ? S._m2.input : null;
  if(inp && inp.hasTouch){
    F.px += (inp.tx - F.px) * Math.min(1, dt/0.06);
    F.py += (S.cy + inp.ty - F.py) * Math.min(1, dt/0.06);
  }
  for(var i=0;i<F.echoes.length;i++){
    var e = F.echoes[i];
    if(e.taken) continue;
    e.ph += dt*2;
    e.x += Math.cos(e.ph)*8*dt; e.y += Math.sin(e.ph)*8*dt - 6*dt;
    var dx = e.x - F.px, dy = e.y - F.py;
    if(dx*dx + dy*dy < 576){
      e.taken = true; F.taken++;
      S.score += 30; S.roomBase += 30;
      A.sfx('echo');
    }
  }
  if(F.t <= 0 || F.taken >= F.echoes.length) m2_endFlash(S);
}
function m2_endFlash(S){
  var F = S.flash, gland = F.gland;
  S.flash = null;
  gland.found = true;
  /* P1-18: a daily gland credits the themed chapter, not the remapped index */
  var ch = (S.daily && S.dailyChapters) ? S.dailyChapters[S.ch] : S.ch;
  if(gland.dream){
    save.secrets.dreamSeen = true;
    save.secrets.lullaby++;
  } else if(!save.secrets.glands[ch]){
    save.secrets.glands[ch] = true;
    save.secrets.lullaby++;
  }
  writeSave(save);
  S.whisper = F.dream ? 'you remember dreaming this' : 'the god remembers you were here';
  A.sfx('lullaby' + Math.min(6, save.secrets.lullaby));
  S._unlocksDirty = true;
  checkChallenges('mid');
}
/* chapter event dispatch (non-swallow) */
function m2_handleEvent(S, e){
  if(e.type === 'skipbeat'){
    S.skipT = 2;
    S.whisper = 'the heart forgets — then remembers';
    A.sfx('skipbeat');
    var S2 = S;
    setTimeout(function(){ S2.bpm = 72; }, 2000);
  } else if(e.type === 'bell'){
    S.bellT = 20; S.bellTolled = false;
    S.whisper = 'the god is hungry';
    A.sfx('bell');

  } else if(e.type === 'lid'){
    S.lidT = 10;
    S.whisper = 'something closes its eye';
    A.sfx('lid');
  } else if(e.type === 'finalvalve'){
    /* P1-2 (design-owner ruling): the Gentle Dream now triggers when the run
       reaches the Brain's final valve with the god never fully woken — i.e.
       the immune-response threshold (90 in ch4/5, 100 elsewhere, tracked by
       S.immuneEverTriggered) was never reached in any room. The old
       wake ≤ 8 check was mathematically unreachable (min ~53.5 at the valve)
       and is retired; the ending stays advertised, with a reachable door. */
    if(!S.immuneEverTriggered && S.mode === 'play'){
      S.mode = 'dream'; S.dreamT = 0; S.doneCh = 4;
      save.secrets.zeroWake = true;
      if(save.unlocks.appearances.indexOf('grey') < 0) save.unlocks.appearances.push('grey');
      unlockTrail('still');
      writeSave(save);
      A.sfx('zerowake');
      checkChallenges('mid');
    }
  } else if(e.type === 'eyelid'){
    S.mode = 'dawn';
    S.dawnT = 0;
    A.sfx('dawn');
    onCampaignClear();
  }
}
/* ---------------- stats, challenges, unlocks ---------------- */
function bumpStat(k, n){
  if(!save.stats[k]) save.stats[k] = 0;
  save.stats[k] += (n||1);
}
var CHALLENGES = [
  /* Whispers — skill under pressure */
  { id:'unbroken', name:'Unbroken',       desc:'Clear a chapter with zero mote loss and no immune tide', tier:'Whispers' },
  { id:'dawn',     name:'Dawnrunner',     desc:'Clear the Waking in under 4:30', tier:'Whispers' },
  { id:'mini',     name:'Minimalist',     desc:'Clear the Brain with fewer than 10 constrictions', tier:'Whispers' },
  /* Trials — patience and appetite */
  { id:'steady',   name:'Steady Pulse',   desc:'Clear the Heart with no off-beat constriction and average wake under 40', tier:'Trials' },
  { id:'silent',   name:'Silent',         desc:'Clear the Brain with average wake under 25', tier:'Trials' },
  { id:'glutton',  name:'Glutton',        desc:'Drink 300 spores in one run', tier:'Trials' },
  /* Dreams — the god's own tests */
  { id:'tide',     name:'Tidecaller',     desc:'Survive 3 immune tides in one run', tier:'Dreams' },
  { id:'still',    name:'Stillness',      desc:'Find all 6 quiet rooms', tier:'Dreams' },
  { id:'somna',    name:'Somnambulist',   desc:'Reach the Gentle Dream — a full run with no immune response', tier:'Dreams' },
  { id:'pilgrim',  name:'Pilgrim',        desc:'Hold UNBROKEN for 21 rooms in one campaign', tier:'Dreams' },
  { id:'deepsleeper', name:'Deepsleeper',  desc:'Finish a campaign with zero wake-triggered immune tides (the Waking\u2019s forced tides don\u2019t count)', tier:'Dreams' },
  /* Records — curiosity */
  { id:'thread',   name:'Threadneedle',   desc:'Thread 10 narrow gates constricted, no scrape, one run', tier:'Records' },
  { id:'arch',     name:'Archivist',      desc:'Find all 6 memory glands', tier:'Records' },
  { id:'pulse2',   name:'Second Pulse',   desc:'Match the hidden heartbeat 8 times in a row', tier:'Records' }
];
function challengeDone(id){
  return save.stats.challenges.indexOf(id) >= 0;
}
function grantChallenge(id){
  if(challengeDone(id)) return;
  save.stats.challenges.push(id);
  /* P1-14: the two secret flags ride on their challenge grants */
  if(save.secrets){
    if(id === 'pulse2') save.secrets.secondPulse = true;
    if(id === 'still') save.secrets.stillTag = true;
  }
  writeSave(save);
  var nm = id;
  for(var ci=0;ci<CHALLENGES.length;ci++) if(CHALLENGES[ci].id === id) nm = CHALLENGES[ci].name;
  /* retention: lowercase, god-voice — 'a challenge is kept — steady pulse' */
  if(sim && sim.s){ sim.s.whisper = 'a challenge is kept — ' + nm.toLowerCase(); sim.s.whisperT = 3; }
  A.sfx('challenge');
}
function checkChallenges(ctx){
  /* BH-02: chapter-gated grants (unbroken/steady/mini/silent/pilgrim + mask reveals)
     only run at chapter-clear ('chapter'). Mid-chapter call sites pass 'mid'
     for lifetime/cumulative checks only. */
  if(!sim || !sim.s) return;
  var S = sim.s;
  var glands = save.secrets.glands.filter(Boolean).length;
  var quiet = save.secrets.quiet.filter(Boolean).length;
  if(glands >= 6) grantChallenge('arch');
  if(quiet >= 6){ grantChallenge('still'); unlockTrail('still'); }
  if(save.secrets.zeroWake) grantChallenge('somna');
  if(S.stats.sporesRun >= 300) grantChallenge('glutton');
  if(S.stats.threaded >= 10) grantChallenge('thread');
  if(S.tideCount >= 3) grantChallenge('tide');
  if(S.stats.sporesRun >= 200 && (S.ch === 2 || S.doneCh === 2)) unlockAppearance('pearl');
  if(glands >= 6) unlockAppearance('cantor');
  if(ctx !== 'chapter') return;
  var chAvg = S.chWakeSum/Math.max(1,S.chWakeN);
  /* retention re-tier: unbroken now demands zero mote loss AND no immune tide */
  if(S.doneCh === 1 && S.stats.offbeat === 0 && chAvg < 40) grantChallenge('steady');
  if(S.doneCh >= 0 && S.chapterMotesLost === 0 && (S.chTides||0) === 0) grantChallenge('unbroken');
  if(S.doneCh === 4 && (S.chConstr||0) < 10) grantChallenge('mini');
  if(S.doneCh === 4 && chAvg < 25) grantChallenge('silent');
  if(S.doneCh >= 0 && (S.streak||0) >= 21) grantChallenge('pilgrim');
  /* masks sit behind their challenges, not chapter participation */
  if(challengeDone('thread')) unlockMask('knot');
  if(challengeDone('unbroken')) unlockMask('halo');
  if(challengeDone('tide') || challengeDone('deepsleeper')) unlockMask('maw');
  if(S.doneCh === 3 && S.stats.watcherAlerts === 0) unlockAppearance('watcher');
}
var TRAILS = {
  ember:  { name:'Ember Drift',  cond:'the default — warm gold motes' },
  lullaby:{ name:'Lullaby Notes', cond:'find all 6 memory glands' },
  second:{ name:'Second Pulse', cond:'answer the hidden heartbeat' },
  still: { name:'Still Water',  cond:'find all 6 quiet rooms' },
  daydream:{ name:'Daydream',   cond:'a 7-day daily streak' }
};
var MASKS = {
  needle:{ name:'Needle', cond:'the default — a single bright thread' },
  knot:  { name:'Knot',   cond:'thread 10 narrow gates constricted, unscraped' },
  halo:  { name:'Halo',   cond:'hold a chapter UNBROKEN — no mote lost, no tide' },
  maw:   { name:'Maw',    cond:'survive the tides — tidecaller, or a tide-less campaign' },
  centurion:{ name:'Centurion', cond:'a 100-day daily streak' }
};
var APPEARANCES = {
  gold:   { name:'Gold',    cond:'the default' },
  crimson:{ name:'Crimson', cond:'complete the Steady Pulse challenge' },
  pearl:  { name:'Pearl',   cond:'drink 200 spores in the Stomach in one run' },
  watcher:{ name:'Watcher', cond:'clear the Eye without alerting a Watcher' },
  grey:   { name:'Quiet Grey', cond:'reach the Gentle Dream' },
  dawn:   { name:'Dawn',    cond:'finish the campaign' },
  cantor: { name:'Cantor',  cond:'find all 6 memory glands' },
  warden: { name:'Warden',  cond:'finish a campaign UNBROKEN — no mote lost' },
  dreamer:{ name:'Dreamer', cond:'seven shards of one week' },
  streak3:{ name:'Emberwake', cond:'a 3-day daily streak' },
  streak7:{ name:'Dawnkeeper', cond:'a 7-day daily streak' },
  oneiric:{ name:'Oneiric', cond:'surface from the deep dream' },
  vigil:  { name:'Vigil', cond:'a 30-day daily streak' }
};
function unlockAppearance(id){
  if(save.unlocks.appearances.indexOf(id) < 0){
    save.unlocks.appearances.push(id); writeSave(save);
    if(sim && sim.s){ sim.s.whisper = 'new appearance — ' + APPEARANCES[id].name; sim.s.whisperT = 3; }
  }
}
function unlockMask(id){
  if(save.unlocks.masks.indexOf(id) < 0){ save.unlocks.masks.push(id); writeSave(save); }
}
function onCampaignClear(){
  if(!sim || !sim.s) return;
  /* P1-12: surfacing from the deep dream keeps its own reward and closes the week */
  if(sim.s.dream){
    if(save.weekly){ save.weekly.dreamDone = true; }
    unlockAppearance('oneiric');
    if(sim.s){ sim.s.whisper = 'you surfaced — the dream keeps your shape'; sim.s.whisperT = 4; }
    if(sim.s._dailyRestore) sim.s._dailyRestore();
    writeSave(save);
    return;
  }
  unlockAppearance('dawn');   /* the memento: it never comes off */
  if((sim.s.wakingTime||9999) < 270) grantChallenge('dawn');   /* re-tier: <4:30 */
  if((sim.s.tideCount||0) === 0) grantChallenge('deepsleeper');
  if((sim.s.streak||0) >= 21) grantChallenge('pilgrim');
  if((sim.s.runMotesLost||0) === 0) unlockAppearance('warden');   /* full-campaign UNBROKEN */
  checkChallenges('chapter');   /* resolves challenge-gated masks: maw included */
  if(save && Math.floor(sim.s.score) > save.records.runBest){
    save.records.runBest = Math.floor(sim.s.score);
    /* the best run leaves a haunt — a past self to outrun */
    save.haunt = { depth: Math.floor(sim.s.depth), score: Math.floor(sim.s.score) };
  }
  writeSave(save);
}
/* ---------------- daily descent ---------------- */
function dailySeed(){
  var d = new Date();
  return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
}
function weekSeed(){
  /* Monday-based week key: the deep dream resets with the week's first dark */
  var d = new Date();
  var dow = (d.getDay()+6)%7;
  d.setDate(d.getDate()-dow);
  return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
}
/* ==================== M2 UI: campaign flow, endings, secrets ====== */
function startRun(ch, carry){
  sim = Sim(input, save, function(n,o){ if(audio) A.sfx(n,o); });
  sim.newRun(ch);
  if(carry){
    var S = sim.s;
    S.score = carry.score; S.depth = carry.depth;
    S.alive = Math.min(64, (carry.motes||48) + 8);
    for(var i=0;i<64;i++) S.motes[i].alive = i < S.alive;
    S.streak = carry.streak||0;
    S.stats.sporesRun = carry.sporesRun||0;
    S.stats.threaded = carry.threaded||0;
  }
  /* run-start inhale swell: the god draws breath as you descend */
  sim.s.inhaleSwellT = 2.5;
  gameMode = 'play';
  setValves([]);
  wakeLockAcquire();   /* mobile M6/M7: hold the screen for the descent */
  if(audio){ audio.unlock(); A.setChapter(ch); A.sfx('valveInhale'); }
}
function showComplete(){
  gameMode = 'complete';
  var W = view.W, H = view.H;
  save.checkpoint = null;
  requestSave(save);
  var S = sim.s;
  if(S.daily){
    setValves([ { x:W/2, y:H*0.60, r:46, label:'TITLE', sub:'', action: showTitle } ]);
    return;
  }
  var doneCh = S.doneCh, next = CHAPTERS[doneCh+1];
  setValves([
    { x:W/2, y:H*0.60, r:46, label:'DESCEND DEEPER', sub: next ? next.name : '', action: function(){
        startRun(doneCh+1, { score:S.score, depth:S.depth, motes:S.alive, streak:S.streak,
                             sporesRun:S.stats.sporesRun, threaded:S.stats.threaded });
      } },
    { x:W/2, y:H*0.60+92, r:46, label:'TITLE', sub:'', action: showTitle }
  ]);
}
function drawComplete(){
  drawTissue({time: attract?attract.t:0, room:null, tide:null, c:0});
  var W = view.W, H = view.H, S = sim.s;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.95)';
  ctx.font = '500 24px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '6px'; }catch(e){}
  if(S.daily){
    ctx.fillText('THE DESCENT ENDS', W/2, H*0.28);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,220,170,0.9)';
    var t = Math.floor(S.runTime);
    ctx.fillText('time ' + Math.floor(t/60) + ':' + ('0'+(t%60)).slice(-2), W/2, H*0.28+44);
    var d = save.daily || {};
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.fillStyle = 'rgba(190,160,140,0.7)';
    var best = d.best ? ('best score ' + d.best) : 'no best yet';
    ctx.fillText(best + ' · day streak ' + (d.streak||0), W/2, H*0.28+70);
  } else {
    ctx.fillText(CHAPTERS[S.doneCh].name + ' REMEMBERS YOU', W/2, H*0.28);
    try{ ctx.letterSpacing = '0px'; }catch(e){}
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,220,170,0.9)';
    ctx.fillText('SCORE ' + Math.floor(S.score), W/2, H*0.28+44);
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.fillStyle = 'rgba(190,160,140,0.7)';
    var sub = S.doneCh < 5 ? 'the next chamber stirs below' : 'there is nowhere deeper';
    ctx.fillText(sub, W/2, H*0.28+70);
  }
  ctx.textAlign = 'left';
  for(var i=0;i<valves.length;i++) drawValve(valves[i]);
}
/* ---- dawn ending ---- */
function showDawn(){
  gameMode = 'dawn';
  if(audio) audio.dawn();
  var W = view.W, H = view.H;
  setValves([
    { x:W/2, y:H*0.66, r:46, label:'SLEEP AGAIN', sub:'', action: function(){ startRun(0); } },
    { x:W/2, y:H*0.66+92, r:46, label:'TITLE', sub:'', action: showTitle }
  ]);
}
function drawDawn(){
  /* CHAMBERS §6: the palette inverts dark -> dawn over 10s, in parallel with the
     audio keystone (6s heartbeat slowdown -> 2s silence -> final thump -> chime) */
  var W = view.W, H = view.H, t = Math.min(1, (sim.s.dawnT||0)/10);
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,240,210,'+(0.25+0.75*t)+')');
  g.addColorStop(0.6, 'rgba(120,60,40,'+(0.5+0.3*t)+')');
  g.addColorStop(1, 'rgba(20,10,8,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(60,30,20,'+Math.min(1,t*1.2)+')';
  ctx.font = '500 30px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '8px'; }catch(e){}
  ctx.fillText('THE GOD WAKES', W/2, H*0.30);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  ctx.font = 'italic 15px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillStyle = 'rgba(80,45,35,'+Math.min(1,t)+')';
  ctx.fillText('you were the dream it needed', W/2, H*0.30+40);
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText('SCORE ' + Math.floor(sim.s.score), W/2, H*0.30+68);
  ctx.textAlign = 'left';
  for(var i=0;i<valves.length;i++) drawValve(valves[i]);
}
/* ---- Gentle Dream cinematic ---- */
var DREAM_LINES = [
  'the god never woke',
  'you thread the last valve without a whisper',
  'the god does not dream of waking',
  'it dreams of you, drifting, forever',
  'QUIET GREY waits in Motes & Masks'
];
/* the Gentle Dream ending is a true ending: no Waking, no segue — fade to title */
function showDream(){
  gameMode = 'dream';
  if(audio) audio.dream();
  var W = view.W, H = view.H;
  setValves([
    { x:W/2, y:H*0.72, r:46, label:'TITLE', sub:'', action: showTitle }
  ]);
}
function drawDream(){
  var W = view.W, H = view.H, t = sim.s.dreamT||0;
  ctx.fillStyle = '#0a0605'; ctx.fillRect(0, 0, W, H);
  /* starfield constellation (also appears on title once earned) */
  drawConstellation(W/2, H*0.30, Math.min(1, t/3));
  ctx.textAlign = 'center';
  for(var i=0;i<DREAM_LINES.length;i++){
    var lt = t - 2 - i*2.2;
    if(lt <= 0) continue;
    var a = Math.min(1, lt/1.5);
    ctx.fillStyle = i===0 ? 'rgba(200,220,255,'+(0.8*a)+')' : 'rgba(220,200,180,'+(0.75*a)+')';
    ctx.font = i===0 ? '600 15px ui-monospace, monospace' : 'italic 16px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.fillText(DREAM_LINES[i], W/2, H*0.44 + i*34);
  }
  ctx.textAlign = 'left';
  if(t > 12) for(var v=0;v<valves.length;v++) drawValve(valves[v]);
}
function drawConstellation(cx, cy, a){
  ctx.save();
  ctx.globalAlpha = 0.8*a;
  ctx.strokeStyle = '#9db8dd'; ctx.lineWidth = 1;
  var pts = [];
  for(var i=0;i<9;i++){
    var ang = i*2.4, r = 20 + (i%3)*22;
    pts.push([cx + Math.cos(ang)*r, cy + Math.sin(ang)*r*0.7]);
  }
  ctx.beginPath();
  for(var j=0;j<pts.length;j++){ if(j===0) ctx.moveTo(pts[j][0],pts[j][1]); else ctx.lineTo(pts[j][0],pts[j][1]); }
  ctx.stroke();
  ctx.fillStyle = '#dfe8ff';
  for(var k=0;k<pts.length;k++){ ctx.beginPath(); ctx.arc(pts[k][0],pts[k][1],2,0,6.283); ctx.fill(); }
  ctx.restore();
}
/* ---- nerve keyboard: leave a message ---- */
var kb = null;
var KB_ROWS = ['ABCDEFGHIJKLM','NOPQRSTUVWXYZ','← ✓'];
function openKeyboard(knot){
  kb = { text:'', knot: knot, ch: sim.s.ch };
  gameMode = 'keyboard';
  setValves([]);
  A.sfx('uiValve');
}
function drawKeyboard(){
  renderGame();
  var W = view.W, H = view.H;
  ctx.fillStyle = 'rgba(8,4,3,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.9)';
  ctx.font = 'italic 15px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('leave something for the next self', W/2, H*0.30);
  ctx.font = '600 17px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,230,190,0.95)';
  ctx.fillText(kb.text + '▍', W/2, H*0.30+40);
  ctx.font = '400 11px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(170,140,125,0.6)';
  ctx.fillText((24 - kb.text.length) + ' breaths left', W/2, H*0.30+62);
  var kw = W/13.5, kh = 44, y0 = H*0.44;
  kb.keys = [];
  for(var r=0;r<KB_ROWS.length;r++){
    var row = KB_ROWS[r], n = row.length;
    var x0 = W/2 - (n*kw)/2;
    for(var i=0;i<n;i++){
      var kx = x0 + i*kw + kw/2, ky = y0 + r*(kh+10);
      kb.keys.push({ ch: row[i], x:kx, y:ky, w:kw-6, h:kh });
      ctx.strokeStyle = 'rgba(255,200,130,0.4)'; ctx.lineWidth = 1.5;
      if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(kx-kw/2+3, ky-kh/2, kw-6, kh, 8); ctx.stroke(); }
      else ctx.strokeRect(kx-kw/2+3, ky-kh/2, kw-6, kh);
      ctx.fillStyle = 'rgba(255,220,170,0.85)';
      ctx.font = '600 16px -apple-system, sans-serif';
      ctx.fillText(row[i], kx, ky+6);
    }
  }
}
function keyboardTouch(sx, sy){
  for(var i=0;i<kb.keys.length;i++){
    var k = kb.keys[i];
    if(Math.abs(sx-k.x) < k.w/2+8 && Math.abs(sy-k.y) < k.h/2+8){
      A.sfx('key');
      if(k.ch === '←') kb.text = kb.text.slice(0, -1);
      else if(k.ch === '✓'){
        if(kb.text.length > 0){
          save.secrets.messages.push({ ch: kb.ch, knot: kb.knot, text: kb.text });
          writeSave(save);
        }
        kb = null; gameMode = 'play'; setValves([]);
      }
      else if(kb.text.length < 24) kb.text += k.ch;
      return true;
    }
  }
  return false;
}
/* ---- records: add challenges + daily ---- */
var CH_NAMES_SHORT = ['I · THE THROAT','II · THE HEART','III · THE STOMACH','IV · THE EYE','V · THE BRAIN','VI · THE WAKING'];
function drawRecords(){
  drawTissue({time: attract?attract.t:0, room:null, tide:null, c:0});
  var W = view.W, H = view.H, st = save.stats, rc = save.records, d = save.daily || {};
  var wk = save.weekly || {};
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,222,170,0.9)';
  ctx.font = '500 26px "Iowan Old Style", Palatino, Georgia, serif';
  try{ ctx.letterSpacing = '8px'; }catch(e){}
  ctx.fillText('WHISPERS', W/2, view.safeTop+70);
  try{ ctx.letterSpacing = '0px'; }catch(e){}
  /* scrollable body — the RETURN valve stays pinned below */
  ctx.save();
  ctx.beginPath(); ctx.rect(0, view.safeTop+100, W, H-view.safeTop-100-view.safeBottom-80); ctx.clip();
  ctx.translate(0, -recordsScroll);
  /* P1-16: daily best is a score — display it as a score; the run time
     persists separately as save.daily.timeBest */
  var best = d.best ? String(d.best) : '—';
  var dtime = d.timeBest ? (' · ' + Math.floor(d.timeBest/60)+':'+('0'+(d.timeBest%60)).slice(-2)) : '';
  var dream = wk.shards ? (wk.shards+'/7 shards'+(wk.done?' · complete':'')) : '—';
  var rows = [
    ['pilgrimages', st.runs], ['deaths', st.deaths], ['deepest', st.deepest+'m'],
    ['spores drunk', st.spores], ['unbroken rooms', st.unbrokenRooms],
    ['longest unbroken', rc.longestStreak||0], ['outran yourself', rc.haunts||0],
    ['daily best', best], ['day streak', d.streak||0],
    ['best descent time', dtime ? dtime.slice(3) : '—'],
    ['deep dream', dream]
  ];
  ctx.font = '400 12px -apple-system, sans-serif';
  for(var i=0;i<rows.length;i++){
    var y = view.safeTop+112 + i*26;
    ctx.fillStyle = 'rgba(180,150,130,0.7)'; ctx.textAlign = 'right';
    ctx.fillText(rows[i][0], W/2-16, y);
    ctx.fillStyle = 'rgba(255,220,170,0.9)'; ctx.textAlign = 'left';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText(String(rows[i][1]), W/2+16, y);
    ctx.font = '400 12px -apple-system, sans-serif';
  }
  var y2 = view.safeTop+112 + rows.length*26 + 12;
  /* average wake, per chapter slept through */
  ctx.fillStyle = 'rgba(180,150,130,0.7)'; ctx.textAlign = 'center';
  ctx.fillText('— average wake —', W/2, y2);
  ctx.font = '400 11px -apple-system, sans-serif';
  y2 += 22;
  var anyWake = false;
  for(var ci=0;ci<6;ci++){
    if(st.wakeN[ci] > 0){
      anyWake = true;
      ctx.fillStyle = 'rgba(200,175,150,0.75)';
      ctx.fillText(CH_NAMES_SHORT[ci] + ' — avg wake ' + Math.round(st.wakeSum[ci]/st.wakeN[ci]), W/2, y2);
      y2 += 18;
    }
  }
  if(!anyWake){
    ctx.fillStyle = 'rgba(150,125,115,0.45)';
    ctx.fillText('no chapter slept through yet', W/2, y2);
    y2 += 18;
  }
  y2 += 10;
  ctx.fillStyle = 'rgba(180,150,130,0.7)'; ctx.textAlign = 'center';
  ctx.fillText('— trials —', W/2, y2);
  ctx.font = '400 11px -apple-system, sans-serif';
  for(var j=0;j<CHALLENGES.length;j++){
    var c = CHALLENGES[j], done = challengeDone(c.id);
    ctx.fillStyle = done ? 'rgba(255,215,140,0.85)' : 'rgba(150,125,115,0.45)';
    ctx.fillText((done?'◆ ':'◇ ') + c.name + ' — ' + c.desc, W/2, y2+22 + j*20);
  }
  var contentEnd = y2+22 + CHALLENGES.length*20 + 20;
  recordsMax = Math.max(0, contentEnd + 12 - (H - view.safeBottom - 80));
  ctx.restore();
  ctx.textAlign = 'left';
  for(var v=0;v<valves.length;v++) drawValve(valves[v]);
}
/* ---- Motes & Masks: appearances, trails, masks ---- */
function showCustom(){
  gameMode = 'custom';
  var W = view.W, H = view.H;
  var list = [];
  function sec(title, y){ list.push({ x:W/2, y:y, r:0, label:title, sub:'', action:function(){}, header:true }); }
  var y = H*0.16;
  var apps = ['gold','crimson','pearl','watcher','grey','dawn','cantor','warden','dreamer','streak3','streak7','oneiric','vigil'];
  var keptA = 0;
  for(var ai=0;ai<apps.length;ai++) if(save.unlocks.appearances.indexOf(apps[ai]) >= 0) keptA++;
  sec('APPEARANCES — '+keptA+'/'+apps.length+' kept', y); y += 40;
  for(var i=0;i<apps.length;i++){
    (function(a){
      var owned = save.unlocks.appearances.indexOf(a) >= 0;
      list.push({ x:W/2, y:y, r:26, label:APPEARANCES[a].name,
        sub: owned ? (save.appearance===a?'worn':'touch to wear') : APPEARANCES[a].cond,
        locked:!owned, action:function(){
          if(!owned){ uiMsg='Not yet earned — the god remembers effort.'; uiMsgT=3; return; }
          save.appearance = a; requestSave(save); showCustom();
        } });
      y += 52;
    })(apps[i]);
  }
  y += 10;
  var trs = ['ember','lullaby','second','still','daydream'];
  var keptT = 0;
  for(var ti=0;ti<trs.length;ti++) if(save.unlocks.trails.indexOf(trs[ti]) >= 0) keptT++;
  sec('TRAILS — '+keptT+'/'+trs.length+' kept', y); y += 40;
  for(var j=0;j<trs.length;j++){
    (function(t){
      var owned = save.unlocks.trails.indexOf(t) >= 0;
      list.push({ x:W/2, y:y, r:26, label:TRAILS[t].name,
        sub: owned ? (save.trail===t?'worn':'touch to wear') : TRAILS[t].cond,
        locked:!owned, action:function(){
          if(!owned){ uiMsg='Not yet earned.'; uiMsgT=3; return; }
          save.trail = t; requestSave(save); showCustom();
        } });
      y += 52;
    })(trs[j]);
  }
  y += 10; sec('MASKS', y); y += 40;
  var mks = ['needle','knot','halo','maw','centurion'];
  for(var k=0;k<mks.length;k++){
    (function(m){
      var owned = save.unlocks.masks.indexOf(m) >= 0;
      list.push({ x:W/2, y:y, r:26, label:MASKS[m].name,
        sub: owned ? (save.mask===m?'worn':'touch to wear') : MASKS[m].cond,
        locked:!owned, action:function(){
          if(!owned){ uiMsg='Not yet earned.'; uiMsgT=3; return; }
          save.mask = m; requestSave(save); showCustom();
        } });
      y += 52;
    })(mks[k]);
  }
  y += 10;
  var keptS = (save.sigils||[]).length;
  sec('SIGILS — '+keptS+'/'+SIGILS.length+' kept', y); y += 40;
  /* P1-14: sigils ladder by chapter, tiers I/II/III with visible pips */
  var CHN = ['I · THE THROAT','II · THE HEART','III · THE STOMACH','IV · THE EYE','V · THE BRAIN','VI · THE WAKING'];
  for(var sc=0; sc<6; sc++){
    var grp = [];
    for(var g=0; g<SIGILS.length; g++) if(SIGILS[g].ch === sc) grp.push(SIGILS[g]);
    if(!grp.length) continue;
    grp.sort(function(a,b){ return a.tier < b.tier ? -1 : 1; });
    var pips = '';
    for(var pi=0; pi<grp.length; pi++) pips += sigilEarned(grp[pi].id) ? '●' : '○';
    sec(CHN[sc] + '  ' + pips, y); y += 40;
    for(var gi=0; gi<grp.length; gi++){
      (function(sg){
        var owned = sigilEarned(sg.id);
        list.push({ x:W/2, y:y, r:26, label: sg.tier + ' · ' + sg.name,
          sub: owned ? sg.desc : 'not yet kept — ' + sg.desc,
          locked:!owned, action:function(){
            if(!owned){ uiMsg='Not yet kept — the god remembers effort.'; uiMsgT=3; return; }
            uiMsg='kept — '+sg.desc+'.'; uiMsgT=3;
          } });
        y += 52;
      })(grp[gi]);
    }
    y += 6;
  }
  y += 16;
  list.push({ x:W/2, y:y, r:40, label:'RETURN', sub:'', action: showTitle });
  setValves(list);
  customScroll = 0;
  customMax = Math.max(0, y + 60 - (view.H - view.safeBottom - (view.safeTop+170)));
}

/* ==================== M2 RENDER: hazards & secrets ================ */
function glowFor(app){
  render.glowByApp = render.glowByApp || {};
  if(render.glowByApp[app]) return render.glowByApp[app];
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d');
  g.drawImage(render.glowGold, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = appearanceColor(app);
  g.globalAlpha = 0.85; g.fillRect(0, 0, 64, 64);
  render.glowByApp[app] = c;
  return c;
}
/* mote trails (render-owned particles) */
/* P1-23: pooled — no per-frame object allocation, swap-remove on death */
var _trailPool = [];
function updateTrails(S, dt){
  render.trail = render.trail || [];
  var tr = render.trail;
  if(S.mode === 'play' && !S.flash && tr.length < 90){
    var kind = save.trail || 'ember';
    var n = kind === 'second' ? 2 : 1;
    for(var i=0;i<n;i++){
      var p = _trailPool.pop() || {};
      p.x = S.cx + (Math.random()-0.5)*20; p.y = S.cy - 20 - Math.random()*30;
      p.vx = (Math.random()-0.5)*20; p.vy = -30-Math.random()*30;
      p.t = 0; p.life = kind==='still'?1.6:0.9; p.kind = kind; p.ph = Math.random()*6.28;
      tr.push(p);
    }
  }
  for(var j=tr.length-1;j>=0;j--){
    var q = tr[j];
    q.t += dt;
    if(q.t > q.life){ tr[j] = tr[tr.length-1]; tr.pop(); _trailPool.push(q); continue; }
    q.x += q.vx*dt; q.y += q.vy*dt;
  }
}
function drawTrailsInner(S){
  /* P1-23: switch-less trail renderer — called inside drawSwarm's 'lighter' block */
  var tr = render.trail || [];
  if(!tr.length) return;
  for(var i=0;i<tr.length;i++){
    var p = tr[i], sx = SX(p.x), sy = SY(p.y);
    if(sx<-20||sx>view.W+20||sy<-20||sy>view.H+20) continue;
    var a = 1 - p.t/p.life;
    if(p.kind === 'ember'){
      ctx.globalAlpha = 0.5*a;
      ctx.fillStyle = '#ffb35e';
      ctx.beginPath(); ctx.arc(sx, sy, 2.5*a+0.5, 0, 6.283); ctx.fill();
    } else if(p.kind === 'lullaby'){
      ctx.globalAlpha = 0.55*a;
      ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, 3+2*Math.sin(p.ph+p.t*6), 0, 6.283); ctx.stroke();
    } else if(p.kind === 'second'){
      ctx.globalAlpha = 0.6*a;
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.3*a;
      ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 6.283); ctx.fill();
    } else if(p.kind === 'daydream'){
      /* P1-13: violet-gold, slow and wide */
      ctx.globalAlpha = 0.5*a;
      ctx.fillStyle = '#c9a8ff';
      ctx.beginPath(); ctx.arc(sx, sy, 3.5*a+1, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.25*a;
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath(); ctx.arc(sx, sy, 6*a+1, 0, 6.283); ctx.fill();
    } else { /* still */
      ctx.globalAlpha = 0.35*a;
      ctx.strokeStyle = '#bcd8e8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 2+8*(p.t/p.life), 0, 6.283); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  /* P1-23: no composite switch — the caller (drawSwarm) owns the 'lighter' block */
}
function drawHazards(S){
  var room = S.room, W = view.W, H = view.H;
  if(!room) return;
  var i;
  var _rm = RM();   /* gates honor reduced motion */
  /* room-0 gate: a folded ring at the way down + a tether to the swarm */
  if(S.ch===0 && S.roomIdx===0 && S.firstRun && S.ob.stage < 3){
    var gy = SY(S.room.len - 60);
    if(gy > -40 && gy < H+40){
      var gp = _rm ? 0.6 : 0.6 + 0.4*Math.sin(S.time*3);
      ctx.strokeStyle = 'rgba(255,217,138,'+(0.5*gp)+')'; ctx.lineWidth = 2;
      for(var gr=0;gr<3;gr++){
        ctx.beginPath(); ctx.arc(W/2, gy, 24+gr*14, 0, 6.283); ctx.stroke();
      }
      /* the tether: a thin gold thread from the swarm to the folded way */
      var sx = SX(S.cx), sy = SY(S.cy);
      ctx.strokeStyle = 'rgba(255,217,138,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(W/2, (sy+gy)/2, W/2, gy); ctx.stroke();
    }
  }
  /* ---- valves: muscular lips that slam on the beat ---- */
  if(room.valves){
    for(i=0;i<room.valves.length;i++){
      var v = room.valves[i], vy = SY(v.y);
      if(vy < -60 || vy > H+60) continue;
      var open = v.open;
      var lipX = open ? v.w/2 : 7;
      var breathe = (open && !RM()) ? 1 + 0.08*Math.sin(S.time*6) : 1;
      ctx.save();
      ctx.translate(W/2, vy);
      if(v.inhale){
        /* 1.2s telegraph: concentric rings contracting into the valve — it is about to swallow */
        var ip = 1 - (v.inhaleT||0)/1.2;
        var RM2 = RM();
        for(var ir=0;ir<3;ir++){
          var irr = RM2 ? 60+ir*36 : (1-ip)*(lipX+120) + ir*36;
          ctx.globalAlpha = RM2 ? 0.4 : 0.45*(1-ip) + 0.1;
          ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, Math.max(irr, 4), 0, 6.283); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = open ? 'rgba(120,50,40,0.85)' : 'rgba(150,60,50,0.95)';
      ctx.strokeStyle = 'rgba(200,120,100,0.5)'; ctx.lineWidth = 2;
      /* four-petaled: muscular lips in a cross, never two ovals */
      for(var pt=0;pt<4;pt++){
        var pa = pt*Math.PI/2 + Math.PI/4 + ((open && !RM()) ? 0.05*Math.sin(S.time*6) : 0);
        var px = Math.cos(pa)*lipX*breathe, py = Math.sin(pa)*lipX*breathe*1.35;
        ctx.beginPath();
        ctx.ellipse(px, py, 22, 32, pa, 0, 6.283);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }
  /* ---- acid lakes ---- */
  function acidRect(a, harmless){
    var x0 = SX(a.x0), x1 = SX(a.x1), y0 = SY(a.y0 - (a.rise||0)), y1 = SY(a.y1);
    if(y1 < -40 || y0 > H+40) return;
    /* P2-13: the lake gradient's stops never vary with position — only the lake
       rect moves, and camY re-lerps every frame (the old screen-space key hit
       ~0.8%). Each harmless-variant is built ONCE in unit local space and the
       paint-time transform places it, so camera motion can no longer
       invalidate the cache. */
    var aKey = harmless ? 'h' : 'a';
    if(!render.acidCache) render.acidCache = {};
    var g = render.acidCache[aKey];
    if(!g){
      g = ctx.createLinearGradient(0, 0, 0, 1);
      g.addColorStop(0, harmless ? 'rgba(150,180,120,0.25)' : 'rgba(190,200,90,0.55)');
      g.addColorStop(1, harmless ? 'rgba(120,150,100,0.15)' : 'rgba(140,120,50,0.65)');
      render.acidCache[aKey] = g;
    }
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(Math.max(1, x1-x0), Math.max(1, y1-y0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
    if(!harmless){
      ctx.fillStyle = 'rgba(230,240,160,0.5)';
      for(var b=0;b<5;b++){
        var bx = x0 + ((b*97 + S.time*30) % (x1-x0));
        var by = y1 - ((b*61 + S.time*45) % (y1-y0));
        ctx.beginPath(); ctx.arc(bx, by, 2+ (b%3), 0, 6.283); ctx.fill();
      }
    }
  }
  if(room.acids) for(i=0;i<room.acids.length;i++) acidRect(room.acids[i], false);
  if(room.acidShow) for(i=0;i<room.acidShow.length;i++) acidRect(room.acidShow[i], true);
  /* ---- churns ---- */
  if(room.churns){
    ctx.strokeStyle = 'rgba(200,150,120,0.35)'; ctx.lineWidth = 2;
    for(i=0;i<room.churns.length;i++){
      var ch = room.churns[i], cx = SX(ch.x), cy = SY(ch.y);
      if(cx<-80||cx>W+80||cy<-80||cy>H+80) continue;
      for(var a2=0;a2<3;a2++){
        ctx.globalAlpha = 0.5 - a2*0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, 20+a2*26, S.time*2+a2*2, S.time*2+a2*2+4.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  /* ---- bladders ---- */
  if(room.bladders){
    for(i=0;i<room.bladders.length;i++){
      var bl = room.bladders[i];
      if(bl.popped) continue;
      var bx = SX(bl.x), by = SY(bl.y);
      if(bx<-40||bx>W+40||by<-40||by>H+40) continue;
      var pulse = 1 + 0.1*Math.sin(RT(S.time)*4 + i);
      ctx.strokeStyle = 'rgba(220,190,170,0.6)'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(200,170,160,0.18)';
      ctx.beginPath(); ctx.arc(bx, by, 30*pulse, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,190,0.35)';
      ctx.beginPath(); ctx.arc(bx-8*pulse, by-8*pulse, 6, 0, 6.283); ctx.fill();
    }
  }
  /* ---- watchers: lid-slits, never round eyes ---- */
  if(room.watchers){
    for(i=0;i<room.watchers.length;i++){
      var w = room.watchers[i], wx = SX(w.x), wy = SY(w.y);
      if(wx<-60||wx>view.W+60||wy<-60||wy>view.H+60) continue;
      /* slow-close when the player leaves: presence reaction */
      w.closeT = w.open ? 0 : Math.min(1, (w.closeT||0) + 0.02);
      var openA = w.asleep ? 0 : (w.open ? 0.4 + 0.6*Math.min(1, w.gaze*2) : 0.25*(1-(w.closeT||0)));
      ctx.save();
      ctx.translate(wx, wy);
      /* the slit: a dark lid-parting */
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#1a0e0a';
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 14*openA+1.5, 0, 0, 6.283); ctx.fill();
      if(openA > 0.25){
        /* the gaze: a cold pale ring, no pupil — and it tracks */
        ctx.globalAlpha = 0.55 + 0.4*Math.min(1, w.gaze);
        ctx.strokeStyle = '#cfe0f0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 8*openA+1, 0, 0, 6.283); ctx.stroke();
        var ang = Math.atan2(S.cy - w.y, S.cx - w.x);
        ctx.strokeStyle = 'rgba(207,224,240,0.35)';
        ctx.beginPath(); ctx.moveTo(Math.cos(ang)*18, Math.sin(ang)*10);
        ctx.lineTo(Math.cos(ang)*44, Math.sin(ang)*24); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  /* ---- neural arcs ---- */
  if(room.arcs){
    /* P2-13: 'lighter' hoisted out of the loop — one composite switch per batch
       instead of two per arc (save/restore no longer toggles it per arc) */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(i=0;i<room.arcs.length;i++){
      var ar = room.arcs[i], ay = SY(ar.y);
      if(ay < -40 || ay > H+40) continue;
      var bright = ar.bright;
      var gx0 = SX(ar.gapX - ar.gapW/2), gx1 = SX(ar.gapX + ar.gapW/2);
      /* P1-23: cache the arc gradient — keyed on rounded position + brightness */
      var agKey = Math.round(ay/4) + (bright?'b':'d');
      if(!render.arcGrad || render.arcKey !== agKey){
        var ag = ctx.createLinearGradient(0, Math.round(ay/4)*4-16, 0, Math.round(ay/4)*4+16);
      if(bright){
        ag.addColorStop(0, 'rgba(180,160,255,0)');
        ag.addColorStop(0.5, 'rgba(220,200,255,0.75)');
        ag.addColorStop(1, 'rgba(180,160,255,0)');
      } else {
        ag.addColorStop(0, 'rgba(140,120,200,0)');
        ag.addColorStop(0.5, 'rgba(140,120,200,0.22)');
        ag.addColorStop(1, 'rgba(140,120,200,0)');
      }
        render.arcGrad = ag; render.arcKey = agKey;
      }
      ctx.fillStyle = render.arcGrad;
      /* P1-23: the safe gap is left unpainted (two rects) — no source-over switch */
      ctx.fillRect(0, ay-16, gx0, 32);
      ctx.fillRect(gx1, ay-16, W-gx1, 32);
    }
    ctx.restore();
  }
  if(room.arcsShow){
    for(i=0;i<room.arcsShow.length;i++){
      var as2 = room.arcsShow[i], ay2 = SY(as2.y);
      if(ay2 < -40 || ay2 > H+40) continue;
      ctx.strokeStyle = 'rgba(140,120,200,0.3)';
      ctx.lineWidth = 2; ctx.setLineDash([6,8]);
      ctx.beginPath(); ctx.moveTo(0, ay2); ctx.lineTo(W, ay2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  /* ---- memory glands ---- */
  if(room.gland && !room.gland.hidden && !room.gland.found){
    var gl = room.gland, gx = SX(gl.x), gy = SY(gl.y);
    if(gx>-60&&gx<W+60&&gy>-60&&gy<H+60){
      var gp = 1 + 0.15*Math.sin(RT(S.time)*2.5);
      var gcol = gl.dream ? '150,130,220' : '220,160,190';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for(var l=3;l>0;l--){
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = 'rgba('+gcol+',0.5)';
        ctx.beginPath(); ctx.arc(gx, gy, l*11*gp, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba('+gcol+',0.9)';
      ctx.beginPath(); ctx.arc(gx, gy, 7*gp, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  /* ---- hidden iris membrane ---- */
  if(room.hidden && !room.hidden.open){
    var hd = room.hidden, hx = SX(hd.x), hy = SY(hd.y);
    ctx.strokeStyle = 'rgba(200,150,130,0.5)'; ctx.lineWidth = 2;
    for(var sp2=0;sp2<3;sp2++){
      ctx.globalAlpha = 0.6 - sp2*0.15;
      ctx.beginPath();
      ctx.arc(hx, hy, hd.r*(0.4+sp2*0.3), S.time*(0.5+sp2*0.2)+sp2, S.time*(0.5+sp2*0.2)+sp2+4.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* ---- quiet alcoves ---- */
  if(room.quiet && !room.quiet.done){
    var qx = SX(room.quiet.x), qy = SY(room.quiet.y);
    ctx.strokeStyle = 'rgba(180,200,220,0.35)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4,6]);
    ctx.beginPath(); ctx.arc(qx, qy, room.quiet.r, 0, 6.283); ctx.stroke();
    ctx.setLineDash([]);
  }
  /* ---- geysers ---- */
  if(room.geysers){
    for(i=0;i<room.geysers.length;i++){
      var gz = room.geysers[i], ex = SX(gz.x), ey = SY(gz.y);
      if(gz.bulge){
        var bs = 1 + (1.2 - gz.t)*1.2;
        ctx.fillStyle = 'rgba(190,200,90,0.3)';
        ctx.beginPath(); ctx.arc(ex, ey, 24*bs, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(230,240,160,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 24*bs, 0, 6.283); ctx.stroke();
      }
      if(gz.eruptT > 0){
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        /* P1-23: static gradient + animated alpha — no per-frame gradient build */
        var egKey = Math.round(ey/8);
        if(!render.geyserGrad || render.geyserKey !== egKey){
          var eg = ctx.createLinearGradient(0, egKey*8-200, 0, egKey*8+200);
          eg.addColorStop(0, 'rgba(220,230,140,0)');
          eg.addColorStop(0.5, 'rgba(220,230,140,0.6)');
          eg.addColorStop(1, 'rgba(220,230,140,0)');
          render.geyserGrad = eg; render.geyserKey = egKey;
        }
        ctx.globalAlpha = clamp(gz.eruptT, 0, 1);
        ctx.fillStyle = render.geyserGrad;
        ctx.fillRect(ex-40, ey-200, 80, 400);
        ctx.restore();
      }
    }
  }
  /* ---- dream weather: violet aurora ---- */
  if(room.dream){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(var d2=0;d2<3;d2++){
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = d2===1 ? '#b090ff' : '#8060d0';
      ctx.lineWidth = 26 - d2*6;
      ctx.beginPath();
      for(var px2=0;px2<=W;px2+=24){
        var py2 = H*0.3 + d2*H*0.18 + Math.sin(px2*0.02 + S.time*(0.6+d2*0.25) + d2*2)*40;
        if(px2===0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  /* ---- the eyelid: light ahead (Waking finale) ---- */
  for(i=0;i<room.events.length;i++){
    var ev = room.events[i];
    if(ev.type === 'eyelid' && !ev.done){
      var ly = SY(ev.y);
      if(ly > -100 && ly < H+100){
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        /* P1-23: cache the eyelid wash — keyed on rounded position */
        var lgKey = Math.round(ly/8);
        if(!render.lidGrad || render.lidKey !== lgKey){
          var lg = ctx.createLinearGradient(0, lgKey*8-60, 0, lgKey*8+60);
          lg.addColorStop(0, 'rgba(255,240,210,0)');
          lg.addColorStop(0.5, 'rgba(255,240,210,0.8)');
          lg.addColorStop(1, 'rgba(255,240,210,0)');
          render.lidGrad = lg; render.lidKey = lgKey;
        }
        ctx.fillStyle = render.lidGrad;
        ctx.fillRect(0, ly-60, W, 120);
        ctx.restore();
      }
    }
  }
}
/* flash scene: desaturated world, one mote, echoes */
function drawFlash(S){
  var F = S.flash, W = view.W, H = view.H;
  ctx.fillStyle = 'rgba(20,18,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(var i=0;i<F.echoes.length;i++){
    var e = F.echoes[i];
    if(e.taken) continue;
    var sx = SX(e.x), sy = SY(e.y);
    var pulse = 0.7 + 0.3*Math.sin(e.ph*2);
    ctx.globalAlpha = 0.8*pulse;
    ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 12, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 0.5*pulse;
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 6.283); ctx.fill();
  }
  var mx = SX(F.px), my = SY(F.py);
  ctx.globalAlpha = 1;
  ctx.drawImage(render.glowGold, mx-14, my-14, 28, 28);
  ctx.restore();
  ctx.globalAlpha = 1;
  /* timer: thinning thread */
  ctx.fillStyle = 'rgba(200,200,220,0.5)';
  ctx.fillRect(W/2-60, H-100, 120*(F.t/F.total), 2);
}
/* lid darkness + stillness vignette */
function drawVeils(S){
  var W = view.W, H = view.H;
  if(S.lidT > 0){
    /* the Lid: curved flesh edges closing from top and bottom, never a flat fade */
    var a = S.lidT > 9 ? (10-S.lidT) : (S.lidT < 1 ? S.lidT : 1);
    var close = clamp(a, 0, 1);
    var edge = H*0.55*close;
    ctx.fillStyle = '#0d0705';
    /* upper lid */
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, edge);
    ctx.quadraticCurveTo(W*0.5, edge + 60*close, 0, edge);
    ctx.closePath(); ctx.fill();
    /* lower lid */
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, H-edge);
    ctx.quadraticCurveTo(W*0.5, H-edge - 60*close, 0, H-edge);
    ctx.closePath(); ctx.fill();
    /* wet rim light on the closing edges */
    ctx.strokeStyle = 'rgba(160,70,60,'+(0.5*close)+')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, edge);
    ctx.quadraticCurveTo(W*0.5, edge + 60*close, W, edge); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H-edge);
    ctx.quadraticCurveTo(W*0.5, H-edge - 60*close, W, H-edge); ctx.stroke();
  }
  /* the Waking eyelid: during the 3s cliff-ramp, an eyelid fills from the edges */
  if(S.wakeRampT > 0){
    var rp = 1 - S.wakeRampT/3;
    var re = H*0.28*rp;
    ctx.fillStyle = 'rgba(13,7,5,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, re);
    ctx.quadraticCurveTo(W*0.5, re + 40*rp, 0, re);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, H-re);
    ctx.quadraticCurveTo(W*0.5, H-re - 40*rp, 0, H-re);
    ctx.closePath(); ctx.fill();
  }
  /* chapter-gate fold: a gold ring that folds shut behind the crossing */
  if(S.gateFoldT > 0){
    var gfp = 1 - S.gateFoldT/2;
    ctx.strokeStyle = 'rgba(255,217,138,'+(0.7*(1-gfp))+')'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(W/2, H/2, 120*(1-gfp)+12, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,'+(0.4*(1-gfp))+')';
    ctx.beginPath(); ctx.arc(W/2, H/2, 120*(1-gfp)+30, 0, 6.283); ctx.stroke();
  }
  /* run-start inhale swell: the screen breathes in as the descent begins */
  if(S.inhaleSwellT > 0){
    var isp = 1 - S.inhaleSwellT/2.5;
    var iv = Math.sin(isp*Math.PI);
    ctx.fillStyle = 'rgba(20,10,8,'+(0.35*iv)+')';
    ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(255,217,138,'+(0.5*iv)+')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, H/2, 60+isp*160, 0, 6.283); ctx.stroke();
  }
  /* attention cue: wake≥90 — the lid sags, a dark weight at the screen edges */
  if(S.wake >= 90 && S.lidT <= 0){
    /* P2-12: cache the lid-sag gradients — keyed on quantized sag + view height
       (was: 2 createLinearGradient calls per frame at wake>=90) */
    var sagQ = Math.round(clamp((S.wake-90)/10, 0, 1)*16), sagKey = sagQ+':'+H;
    if(!render.sagGrad || render.sagKey !== sagKey){
      var sq = sagQ/16;
      var sg = ctx.createLinearGradient(0,0,0,H*0.2);
      sg.addColorStop(0, 'rgba(5,3,2,'+(0.5*sq)+')'); sg.addColorStop(1, 'rgba(5,3,2,0)');
      var sg2 = ctx.createLinearGradient(0,H,0,H*0.8);
      sg2.addColorStop(0, 'rgba(5,3,2,'+(0.5*sq)+')'); sg2.addColorStop(1, 'rgba(5,3,2,0)');
      render.sagGrad = [sg, sg2]; render.sagKey = sagKey;
    }
    ctx.fillStyle = render.sagGrad[0]; ctx.fillRect(0,0,W,H*0.2);
    ctx.fillStyle = render.sagGrad[1]; ctx.fillRect(0,H*0.8,W,H*0.2);
  }
  /* dream-duck event: the world dims a breath — nothing hunts, only weather */
  if(S.duckDreamT > 0){
    ctx.fillStyle = 'rgba(10,8,12,'+(0.25*clamp(S.duckDreamT/2,0,1))+')';
    ctx.fillRect(0,0,W,H);
  }
  if(S.stillT > 0){
    ctx.strokeStyle = 'rgba(180,200,220,0.25)'; ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, W-24, H-24);
  }
}

