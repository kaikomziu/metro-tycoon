(function () {
  'use strict';

  // ---- constants ----
  const W = 960, H = 620;
  const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'pentagon'];
  const COLORS = ['#ff5a4e', '#3d8bff', '#2fc06b', '#ffb02e', '#c76bff'];
  const NAMES  = ['1号線', '2号線', '3号線', '4号線', '5号線'];
  const SAVE_KEY = 'metro_tycoon_v1';

  const BASE = {
    speed: 66,        // px/sec
    capacity: 4,
    fare: 9,
    spawn: 2.7,       // sec between passengers (before scaling)
    crowd: 10,        // waiting passengers before a station is "overcrowded"
    giveUp: 150,      // sec until a waiting passenger leaves
    overLimit: 22,    // sec of overcrowding => game over
  };

  const UP = [
    { key: 'fare',     name: '運賃改定',   desc: '運賃 +50%',        max: 10, cost: l => Math.round(90  * Math.pow(1.85, l)) },
    { key: 'capacity', name: '車両大型化', desc: '列車の定員 +3',    max: 8,  cost: l => Math.round(70  * Math.pow(1.80, l)) },
    { key: 'speed',    name: '加速性能',   desc: '列車速度 +22%',    max: 8,  cost: l => Math.round(80  * Math.pow(1.80, l)) },
    { key: 'trains',   name: '増発',       desc: '全路線の列車 +1',  max: 4,  cost: l => Math.round(140 * Math.pow(2.50, l)) },
    { key: 'spawn',    name: '沿線開発',   desc: '乗客の発生 +35%',  max: 10, cost: l => Math.round(100 * Math.pow(1.80, l)) },
    { key: 'lines',    name: '新規開業',   desc: '路線スロット +1',  max: 4,  cost: l => Math.round(200 * Math.pow(2.60, l)) },
  ];

  // ---- state ----
  let state, cv, ctx, side, linectrl;
  let editing = -1;
  let mouse = null;
  let spawnAcc = 0, saveAcc = 0;
  let coins = [];
  let toastMsg = '', toastT = 0;
  let muted = false, actx = null;

  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const dist  = (a, b) => Math.sqrt(dist2(a, b));
  const stationById = id => state.stations.find(s => s.id === id);
  const trainSpeed = () => BASE.speed * (1 + state.upg.speed * 0.22);
  const capacity   = () => BASE.capacity + state.upg.capacity * 3;
  const trainsPerLine = () => 1 + state.upg.trains;
  const maxLines   = () => 1 + state.upg.lines;

  function newLine(i) {
    return { idx: i, color: COLORS[i], name: NAMES[i], stationIds: [], trains: [], _cum: [0], _total: 0 };
  }
  function addStation(x, y, shape) {
    const st = { id: state.nextId++, x, y, shape, passengers: [], crowdT: 0 };
    state.stations.push(st);
    return st;
  }
  function spotCost() {
    return Math.round(55 * Math.pow(1.34, Math.max(0, state.stations.length - 2)));
  }

  function defaultState() {
    state = {
      money: 100, time: 0, over: false,
      stations: [], spots: [], lines: [],
      upg: { fare: 0, capacity: 0, speed: 0, trains: 0, spawn: 0, lines: 0 },
      stats: { delivered: 0, earned: 0, spent: 0 },
      nextId: 1,
    };
    for (let i = 0; i < 5; i++) state.lines.push(newLine(i));
    addStation(W / 2 - 120, H / 2 - 30, 'circle');
    addStation(W / 2 + 130, H / 2 + 40, 'triangle');
    const defs = [
      [W / 2 + 20, H / 2 - 150, 'square'],
      [W / 2 - 240, H / 2 + 90, 'diamond'],
      [W / 2 + 250, H / 2 - 60, 'pentagon'],
      [W / 2 - 30, H / 2 + 175, 'circle'],
      [W / 2 + 180, H / 2 + 165, 'triangle'],
      [W / 2 - 285, H / 2 - 120, 'square'],
    ];
    defs.forEach((d, i) => state.spots.push({
      id: state.nextId++, x: d[0], y: d[1], shape: d[2], cost: Math.round(55 * Math.pow(1.34, i)),
    }));
    return state;
  }

  // ---- lines / trains ----
  function rebuildLine(line) {
    const ids = line.stationIds;
    line._cum = [0];
    for (let i = 1; i < ids.length; i++) {
      const a = stationById(ids[i - 1]), b = stationById(ids[i]);
      line._cum[i] = line._cum[i - 1] + ((a && b) ? dist(a, b) : 0);
    }
    line._total = ids.length >= 2 ? line._cum[ids.length - 1] : 0;

    const want = ids.length >= 2 ? trainsPerLine() : 0;
    while (line.trains.length > want) line.trains.pop();
    while (line.trains.length < want) {
      const i = line.trains.length;
      line.trains.push({ p: line._total * ((i + 0.5) / want), dir: i % 2 ? -1 : 1, load: [], _lastK: -1 });
    }
    line.trains.forEach(t => {
      if (t.p > line._total) t.p = line._total;
      if (t.p < 0) t.p = 0;
      if (!Array.isArray(t.load)) t.load = [];
      if (typeof t._lastK !== 'number') t._lastK = -1;
    });
  }

  function trainXY(line, tr) {
    const c = line._cum;
    let k = 0;
    while (k < c.length - 2 && c[k + 1] < tr.p) k++;
    const a = stationById(line.stationIds[k]);
    const b = stationById(line.stationIds[k + 1]);
    if (!a || !b) return { x: a ? a.x : 0, y: a ? a.y : 0, a: a || { x: 0, y: 0 }, b: b || { x: 0, y: 0 } };
    const segLen = (c[k + 1] - c[k]) || 1;
    const f = (tr.p - c[k]) / segLen;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a, b };
  }

  function fareFor(hops) {
    hops = Math.max(1, hops);
    return Math.round(BASE.fare * (1 + state.upg.fare * 0.5) * hops * (1 + 0.18 * (hops - 1)));
  }

  function stepTrain(line, tr, dt) {
    if (line.stationIds.length < 2) return;
    const old = tr.p;
    tr.p += tr.dir * trainSpeed() * dt;
    if (tr.p <= 0) { tr.p = 0; tr.dir = 1; }
    else if (tr.p >= line._total) { tr.p = line._total; tr.dir = -1; }
    const lo = Math.min(old, tr.p) - 0.01, hi = Math.max(old, tr.p) + 0.01;
    const c = line._cum;
    for (let k = 0; k < c.length; k++) {
      if (c[k] >= lo && c[k] <= hi && tr._lastK !== k) {
        tr._lastK = k;
        arrive(line, tr, k);
      }
    }
  }

  function arrive(line, tr, k) {
    const st = stationById(line.stationIds[k]);
    if (!st) return;
    // unload
    for (let i = tr.load.length - 1; i >= 0; i--) {
      const p = tr.load[i];
      if (p.dest === st.id) {
        tr.load.splice(i, 1);
        const gain = fareFor(Math.abs(k - p.fromK));
        state.money += gain;
        state.stats.delivered++;
        state.stats.earned += gain;
        coins.push({ x: st.x, y: st.y - 16, t: 0, val: gain });
        beep(720, 0.09, 0.035);
      }
    }
    // operating revenue just for running
    state.money += 1;
    state.stats.earned += 1;
    // board
    const cap = capacity();
    for (let i = 0; i < st.passengers.length && tr.load.length < cap; i++) {
      const pg = st.passengers[i];
      if (line.stationIds.indexOf(pg.dest) !== -1) {
        pg.fromK = k;
        tr.load.push(pg);
        st.passengers.splice(i, 1);
        i--;
      }
    }
  }

  // ---- passengers ----
  function trySpawn() {
    const active = state.stations.filter(s =>
      state.lines.some((l, i) => i < maxLines() && l.stationIds.length >= 2 && l.stationIds.indexOf(s.id) !== -1));
    if (active.length < 2) return;
    const from = active[(Math.random() * active.length) | 0];
    const dests = new Set();
    state.lines.forEach((l, i) => {
      if (i < maxLines() && l.stationIds.length >= 2 && l.stationIds.indexOf(from.id) !== -1) {
        l.stationIds.forEach(id => { if (id !== from.id) dests.add(id); });
      }
    });
    if (!dests.size) return;
    const arr = [...dests];
    from.passengers.push({ dest: arr[(Math.random() * arr.length) | 0], born: state.time, fromK: -1 });
  }

  // ---- buying ----
  function randomPos() {
    for (let i = 0; i < 300; i++) {
      const x = 48 + Math.random() * (W - 96), y = 48 + Math.random() * (H - 96);
      let ok = true;
      for (const s of state.stations) if (dist2(s, { x, y }) < 82 * 82) { ok = false; break; }
      if (ok) for (const s of state.spots) if (dist2(s, { x, y }) < 72 * 72) { ok = false; break; }
      if (ok) return { x, y };
    }
    return null;
  }
  function replenishSpots() {
    let guard = 0;
    while (state.spots.length < 5 && guard++ < 12) {
      const p = randomPos();
      if (!p) break;
      state.spots.push({
        id: state.nextId++, x: p.x, y: p.y,
        shape: SHAPES[(Math.random() * SHAPES.length) | 0],
        cost: Math.round(spotCost() * (1 + 0.12 * state.spots.length)),
      });
    }
  }
  function buySpot(sp) {
    if (state.money < sp.cost) { showToast('資金が足りません（¥' + sp.cost + '）'); beep(200, 0.12, 0.03); return null; }
    state.money -= sp.cost;
    state.stats.spent += sp.cost;
    state.spots = state.spots.filter(x => x !== sp);
    const st = addStation(sp.x, sp.y, sp.shape);
    replenishSpots();
    updateSide();
    beep(480, 0.08, 0.04);
    save();
    return st;
  }
  function buyUpgrade(key) {
    const u = UP.find(x => x.key === key);
    const lv = state.upg[key];
    if (lv >= u.max) return;
    const c = u.cost(lv);
    if (state.money < c) { showToast('資金が足りません（¥' + c + '）'); beep(200, 0.12, 0.03); return; }
    state.money -= c;
    state.stats.spent += c;
    state.upg[key] = lv + 1;
    state.lines.forEach(rebuildLine);
    beep(560, 0.1, 0.045);
    updateSide();
    renderLineCtrl();
    save();
  }

  // ---- line editing ----
  function appendToLine(line, id) {
    if (line.stationIds.indexOf(id) !== -1) return;
    line.stationIds.push(id);
    rebuildLine(line);
    renderLineCtrl();
    save();
  }
  function handleTap(x, y) {
    if (state.over) return;
    const st = state.stations.find(s => dist2(s, { x, y }) < 20 * 20);
    const sp = state.spots.find(s => dist2(s, { x, y }) < 18 * 18);

    if (editing >= 0) {
      const line = state.lines[editing];
      if (sp) { const ns = buySpot(sp); if (ns) appendToLine(line, ns.id); return; }
      if (st) {
        const ids = line.stationIds;
        if (ids.length && ids[ids.length - 1] === st.id) { editing = -1; renderLineCtrl(); return; }
        appendToLine(line, st.id);
        return;
      }
      return;
    }

    if (sp) { buySpot(sp); return; }
    if (st) {
      let li = state.lines.findIndex((l, i) => i < maxLines() && l.stationIds.indexOf(st.id) !== -1);
      if (li < 0) li = state.lines.findIndex((l, i) => i < maxLines() && l.stationIds.length === 0);
      if (li < 0) li = 0;
      editing = li;
      const l = state.lines[li];
      if (l.stationIds.indexOf(st.id) === -1) appendToLine(l, st.id);
      renderLineCtrl();
    }
  }

  // ---- simulation ----
  function update(dt) {
    if (state.over) return;
    state.time += dt;

    spawnAcc += dt;
    const iv = BASE.spawn / (1 + state.upg.spawn * 0.35 + 0.10 * Math.max(0, state.stations.length - 2));
    let guard = 0;
    while (spawnAcc >= iv && guard++ < 20) { spawnAcc -= iv; trySpawn(); }

    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (l.stationIds.length >= 2) l.trains.forEach(t => stepTrain(l, t, dt));
    }

    let over = false;
    state.stations.forEach(s => {
      for (let i = s.passengers.length - 1; i >= 0; i--) {
        if (state.time - s.passengers[i].born > BASE.giveUp) s.passengers.splice(i, 1);
      }
      if (s.passengers.length > BASE.crowd) s.crowdT += dt;
      else s.crowdT = Math.max(0, s.crowdT - dt * 1.5);
      if (s.crowdT > BASE.overLimit) over = true;
    });
    if (over) gameOver();

    coins.forEach(c => { c.t += dt; c.y -= 20 * dt; });
    coins = coins.filter(c => c.t < 1.1);
    if (toastT > 0) toastT -= dt;

    saveAcc += dt;
    if (saveAcc > 3) { saveAcc = 0; save(); }
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    editing = -1;
    renderLineCtrl();
    beep(160, 0.5, 0.06);
    document.getElementById('overstats').innerHTML =
      '運行時間：' + fmtTime(state.time) + '<br>' +
      '輸送人数：' + state.stats.delivered + ' 人<br>' +
      '累計売上：¥' + Math.round(state.stats.earned) + '<br>' +
      '駅の数：' + state.stations.length;
    document.getElementById('over').classList.remove('hidden');
    save();
  }

  // ---- rendering ----
  function drawShape(x, y, r, shape) {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, 7);
    else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (shape === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.72); ctx.lineTo(x - r * 0.92, y + r * 0.72); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
    ctx.fill();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.fillStyle = '#121826';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) ctx.fillRect(x, y, 1, 1);

    // lines
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (l.stationIds.length < 1) continue;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      l.stationIds.forEach(id => {
        const s = stationById(id); if (!s) return;
        started ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
        started = true;
      });
      ctx.stroke();
      if (editing === i && mouse && l.stationIds.length) {
        const last = stationById(l.stationIds[l.stationIds.length - 1]);
        if (last) {
          ctx.setLineDash([6, 6]); ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }
    }

    // spots
    state.spots.forEach(sp => {
      const aff = state.money >= sp.cost;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = aff ? '#3ad07a' : '#4a5468';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 13, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = aff ? '#8affc0' : '#7f8aa0';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('¥' + sp.cost, sp.x, sp.y + 27);
    });

    // stations
    state.stations.forEach(s => {
      if (s.crowdT > 0) {
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.crowdT / BASE.overLimit));
        ctx.stroke();
      }
      ctx.fillStyle = '#0d1017';
      ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, 7); ctx.fill();
      ctx.fillStyle = '#eef2f8';
      drawShape(s.x, s.y, 8, s.shape);
      for (let k = 0; k < s.passengers.length && k < 6; k++) {
        const ang = -Math.PI / 2 + (k - 2.5) * 0.34;
        const d = stationById(s.passengers[k].dest);
        ctx.fillStyle = '#ffd85e';
        drawShape(s.x + Math.cos(ang) * 24, s.y + Math.sin(ang) * 24, 4, d ? d.shape : 'circle');
      }
      if (s.passengers.length > 6) {
        ctx.fillStyle = '#ffd85e';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('+' + (s.passengers.length - 6), s.x, s.y - 24);
      }
    });

    // trains
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (l.stationIds.length < 2) continue;
      l.trains.forEach(tr => {
        const pos = trainXY(l, tr);
        const ang = Math.atan2(pos.b.y - pos.a.y, pos.b.x - pos.a.x);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(ang);
        ctx.fillStyle = l.color;
        roundRect(-12, -6, 24, 12, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        for (let k = 0; k < tr.load.length && k < 6; k++) ctx.fillRect(-9 + k * 3.4, -1.5, 2, 3);
        ctx.restore();
      });
    }

    // coins
    coins.forEach(c => {
      ctx.globalAlpha = Math.max(0, 1 - c.t / 1.1);
      ctx.fillStyle = '#ffd85e';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('+¥' + c.val, c.x, c.y);
      ctx.globalAlpha = 1;
    });

    if (toastT > 0) {
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      const w = ctx.measureText(toastMsg).width + 26;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(W / 2 - w / 2, H - 42, w, 27, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toastMsg, W / 2, H - 23);
    }
  }

  // ---- HUD / side / line control ----
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }
  function totalTrains() {
    let n = 0;
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) n += state.lines[i].trains.length;
    return n;
  }
  function totalWaiting() {
    return state.stations.reduce((a, s) => a + s.passengers.length, 0);
  }
  function updateHud() {
    setTxt('hMoney', '¥' + Math.floor(state.money));
    setTxt('hTime', fmtTime(state.time));
    setTxt('hSta', state.stations.length);
    setTxt('hTrain', totalTrains());
    setTxt('hWait', totalWaiting());
    setTxt('hDeliv', state.stats.delivered);
  }
  function setTxt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  function buildSide() {
    let html = '<h3>アップグレード</h3>';
    UP.forEach(u => {
      html += '<div class="uprow" data-k="' + u.key + '">' +
        '<div class="uptop"><b>' + u.name + '</b><span class="uplv"></span></div>' +
        '<div class="updesc">' + u.desc + '</div>' +
        '<button class="upbtn"></button></div>';
    });
    html += '<div class="help">駅をタップ→別の駅をタップで路線敷設。終点をもう一度タップで完了。点線の丸は購入できる駅。混雑を放置するとゲームオーバー。</div>';
    side.innerHTML = html;
    side.querySelectorAll('.uprow').forEach(row => {
      row.querySelector('.upbtn').addEventListener('click', () => buyUpgrade(row.dataset.k));
    });
  }
  function updateSide() {
    side.querySelectorAll('.uprow').forEach(row => {
      const u = UP.find(x => x.key === row.dataset.k);
      const lv = state.upg[u.key];
      row.querySelector('.uplv').textContent = 'Lv ' + lv + '/' + u.max;
      const btn = row.querySelector('.upbtn');
      if (lv >= u.max) { btn.textContent = 'MAX'; btn.disabled = true; }
      else { const c = u.cost(lv); btn.textContent = '¥' + c; btn.disabled = state.money < c; }
    });
  }

  function renderLineCtrl() {
    let html = '';
    for (let i = 0; i < maxLines(); i++) {
      const l = state.lines[i];
      html += '<button class="lslot' + (editing === i ? ' on' : '') + '" data-i="' + i + '" style="--c:' + l.color + '">' +
        '<span class="dot"></span>' + l.name + '<small>' + l.stationIds.length + '駅</small></button>';
    }
    if (editing >= 0) {
      html += '<button id="eUndo">1つ戻す</button><button id="eReset">全消し</button><button id="eDone">完了</button>' +
        '<span class="ehint">駅をタップして延伸／終点をもう一度タップ、または「完了」で確定</span>';
    }
    linectrl.innerHTML = html;
    linectrl.querySelectorAll('.lslot').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      editing = editing === i ? -1 : i;
      renderLineCtrl();
    }));
    if (editing >= 0) {
      const l = state.lines[editing];
      const u = document.getElementById('eUndo');
      const r = document.getElementById('eReset');
      const d = document.getElementById('eDone');
      u.addEventListener('click', () => { l.stationIds.pop(); rebuildLine(l); renderLineCtrl(); save(); });
      r.addEventListener('click', () => { l.stationIds = []; l.trains = []; rebuildLine(l); renderLineCtrl(); save(); });
      d.addEventListener('click', () => { editing = -1; renderLineCtrl(); });
    }
  }

  // ---- audio ----
  function beep(freq, dur, vol) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = vol || 0.04;
      o.connect(g); g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.12));
      o.stop(actx.currentTime + (dur || 0.12));
    } catch (e) { /* ignore */ }
  }
  function resumeAudio() { try { if (actx && actx.state === 'suspended') actx.resume(); } catch (e) {} }

  function showToast(m) { toastMsg = m; toastT = 2.4; }

  // ---- save / load ----
  function save() {
    try {
      const cp = {
        money: state.money, time: state.time, over: state.over,
        stations: state.stations, spots: state.spots,
        lines: state.lines.map(l => ({ idx: l.idx, stationIds: l.stationIds, trains: l.trains.map(t => ({ p: t.p, dir: t.dir, load: t.load, _lastK: t._lastK })) })),
        upg: state.upg, stats: state.stats, nextId: state.nextId,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(cp));
    } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.stations) || s.stations.length === 0) return null;
      return s;
    } catch (e) { return null; }
  }
  function boot() {
    if (/[?&]reset\b/.test(location.search)) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      defaultState();
      return;
    }
    const s = load();
    if (s) {
      state = s;
      state.upg = state.upg || {};
      ['fare', 'capacity', 'speed', 'trains', 'spawn', 'lines'].forEach(k => {
        if (typeof state.upg[k] !== 'number') state.upg[k] = 0;
      });
      state.stats = state.stats || { delivered: 0, earned: 0, spent: 0 };
      state.spots = state.spots || [];
      if (!Array.isArray(state.lines)) state.lines = [];
      while (state.lines.length < 5) state.lines.push(newLine(state.lines.length));
      state.lines.forEach((l, i) => {
        l.idx = i; l.color = COLORS[i]; l.name = NAMES[i];
        l.stationIds = l.stationIds || [];
        l.trains = l.trains || [];
        rebuildLine(l);
      });
      state.stations.forEach(st => { st.passengers = st.passengers || []; if (typeof st.crowdT !== 'number') st.crowdT = 0; });
      if (typeof state.nextId !== 'number') {
        state.nextId = 1 + Math.max(0, ...state.stations.map(x => x.id), ...state.spots.map(x => x.id));
      }
      replenishSpots();
    } else {
      defaultState();
    }
  }

  // ---- input ----
  function toLocal(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  function init() {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    side = document.getElementById('side');
    linectrl = document.getElementById('linectrl');

    boot();
    buildSide();
    updateSide();
    renderLineCtrl();

    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      resumeAudio();
      const p = toLocal(e);
      mouse = p;
      handleTap(p.x, p.y);
    });
    cv.addEventListener('pointermove', e => { mouse = toLocal(e); });
    cv.addEventListener('pointerleave', () => { mouse = null; });

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing >= 0) { editing = -1; renderLineCtrl(); } });

    document.getElementById('bMute').addEventListener('click', e => {
      muted = !muted;
      e.target.textContent = muted ? '🔇' : '🔊';
    });
    const help = document.getElementById('help');
    document.getElementById('bHelp').addEventListener('click', () => { renderChangelog(); help.classList.remove('hidden'); });
    document.getElementById('bCloseHelp').addEventListener('click', () => help.classList.add('hidden'));
    document.getElementById('bRestart').addEventListener('click', () => {
      defaultState();
      spawnAcc = 0; coins = []; editing = -1;
      document.getElementById('over').classList.add('hidden');
      updateSide(); renderLineCtrl(); save();
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('beforeunload', save);

    // Simulation is driven by setInterval so it keeps running even when the
    // tab is backgrounded (requestAnimationFrame is paused there). rAF, when
    // available, is used only to keep rendering smooth while visible.
    let last = now();
    let rafOn = false;
    function tick() {
      const t = now();
      let dt = (t - last) / 1000;
      last = t;
      if (!(dt > 0)) dt = 0.033;
      if (dt > 0.25) dt = 0.25;
      update(dt);
      updateHud();
      updateSide();
      if (!rafOn) draw();
    }
    setInterval(tick, 33);

    if (window.requestAnimationFrame) {
      const rframe = () => { rafOn = true; draw(); requestAnimationFrame(rframe); };
      requestAnimationFrame(rframe);
    }
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function renderChangelog() {
    const el = document.getElementById('changelog');
    if (!el || !window.METRO_CHANGELOG) return;
    el.innerHTML = window.METRO_CHANGELOG.map(v =>
      '<h4>' + v[0] + ' <span style="color:#6b7688">' + v[1] + '</span></h4>' +
      v[2].map(x => '・' + x).join('<br>')
    ).join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
