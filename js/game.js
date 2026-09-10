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

  const TUT = [
    { text: 'ようこそ、社長。まずは駅をひとつタップして選んでみよう（白い輪がつくよ）。',
      auto: () => editFrom != null },
    { text: 'つぎに別の駅をタップ。2つの駅が線路でつながって、電車が走り出す！',
      auto: () => totalEdges() >= 1 },
    { text: '電車は自動で走り、駅のまわりの小さな印（＝乗客）を目的地まで運ぶと運賃が入る。運行するだけでも少し稼げるよ。しばらく眺めてみよう。',
      auto: () => state.stats.delivered >= 2, manual: true },
    { text: '点線の丸は「購入できる駅」。タップで買って線路をのばそう。ひとつの駅から何本でも枝分かれOK。資金が足りなければ少し待ってから。',
      auto: () => state.stations.length >= 3, manual: true },
    { text: '右の「アップグレード」で運賃・スピード・列車の数などを強化できる。資金に余裕が出たら押してみよう。',
      auto: () => Object.keys(state.upg).some(k => state.upg[k] > 0), manual: true },
    { text: '注意！ 乗客が溢れた駅は赤いリングが一周するとダイヤ崩壊＝ゲームオーバー。混みだしたら「増発」や「新規開業」で捌こう。開業おめでとう！',
      manual: true, last: true },
  ];

  // ---- state ----
  let state, cv, ctx, side, linectrl;
  let tut = { active: false, step: 0 };
  let tutEl, tutText, tutStepEl, tutNextBtn;
  let editing = -1;      // index of line being edited, or -1
  let editFrom = null;   // currently selected station id while editing
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
    return { idx: i, color: COLORS[i], name: NAMES[i], edges: [], trains: [], _adj: {} };
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

  // ---- line graph ----
  function lineStationIds(line) {
    const set = new Set();
    line.edges.forEach(e => { set.add(e[0]); set.add(e[1]); });
    return [...set];
  }
  function edgeExists(line, a, b) {
    return line.edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  }
  function totalEdges() {
    return state.lines.reduce((a, l) => a + l.edges.length, 0);
  }
  function edgeCount(id) {
    return state.lines.reduce((a, l) => a + l.edges.filter(e => e[0] === id || e[1] === id).length, 0);
  }
  function addEdge(line, a, b) {
    if (a === b) return;
    if (!edgeExists(line, a, b)) { line.edges.push([a, b]); beep(430, 0.06, 0.035); }
    rebuildLine(line);
    save();
  }
  function removeEdge(line, a, b) {
    line.edges = line.edges.filter(e => !((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)));
    beep(300, 0.06, 0.03);
    rebuildLine(line);
    save();
  }

  function rebuildLine(line) {
    line._adj = {};
    const link = (a, b) => {
      (line._adj[a] = line._adj[a] || []);
      if (line._adj[a].indexOf(b) < 0) line._adj[a].push(b);
    };
    line.edges.forEach(e => { link(e[0], e[1]); link(e[1], e[0]); });

    const want = line.edges.length
      ? trainsPerLine() + Math.floor(Math.max(0, line.edges.length - 1) / 2)
      : 0;
    while (line.trains.length > want) line.trains.pop();
    while (line.trains.length < want) {
      const e = line.edges[line.trains.length % line.edges.length];
      line.trains.push({ a: e[0], b: e[1], p: Math.random(), load: [] });
    }
    line.trains.forEach(t => {
      t.load = Array.isArray(t.load) ? t.load : [];
      if (line.edges.length && !edgeExists(line, t.a, t.b)) {
        const e = line.edges[0]; t.a = e[0]; t.b = e[1]; t.p = 0;
      }
      if (typeof t.p !== 'number' || t.p < 0 || t.p > 1) t.p = 0;
    });
  }

  // breadth-first hop distances from `from` within this line's graph
  function bfs(line, from) {
    const d = {}; d[from] = 0;
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const nb = line._adj[cur] || [];
      for (let j = 0; j < nb.length; j++) {
        if (d[nb[j]] === undefined) { d[nb[j]] = d[cur] + 1; q.push(nb[j]); }
      }
    }
    return d;
  }

  function chooseNext(line, atId, cameFrom, tr) {
    const nb = line._adj[atId] || [];
    if (!nb.length) return cameFrom;
    let cands = nb.filter(n => n !== cameFrom);
    if (!cands.length) cands = nb.slice();          // dead end -> turn around
    if (cands.length === 1) return cands[0];
    if (Math.random() < 0.15) return cands[(Math.random() * cands.length) | 0];

    let best = cands[0], bestScore = Infinity;
    for (const c of cands) {
      const d = bfs(line, c);
      let score;
      if (tr.load.length) {
        score = 0;
        for (const p of tr.load) score += (d[p.dest] === undefined ? 40 : d[p.dest]);
      } else {
        let m = Infinity;
        for (const sid in d) {
          const st = stationById(+sid);
          if (!st || !st.passengers.length) continue;
          for (const p of st.passengers) {
            if (d[p.dest] !== undefined) { if (d[sid] < m) m = d[sid]; break; }
          }
        }
        score = (m === Infinity) ? 30 + Math.random() * 6 : m;
      }
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function fareFor(hops) {
    hops = Math.max(1, hops);
    return Math.round(BASE.fare * (1 + state.upg.fare * 0.5) * hops * (1 + 0.18 * (hops - 1)));
  }

  function trainXY(line, tr) {
    const a = stationById(tr.a), b = stationById(tr.b);
    if (!a || !b) return { x: 0, y: 0, a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
    return { x: a.x + (b.x - a.x) * tr.p, y: a.y + (b.y - a.y) * tr.p, a, b };
  }

  function stepTrain(line, tr, dt) {
    let a = stationById(tr.a), b = stationById(tr.b);
    if (!a || !b || !edgeExists(line, tr.a, tr.b)) {
      if (!line.edges.length) return;
      const e = line.edges[(Math.random() * line.edges.length) | 0];
      tr.a = e[0]; tr.b = e[1]; tr.p = 0;
      a = stationById(tr.a); b = stationById(tr.b);
      if (!a || !b) return;
    }
    let len = dist(a, b) || 1;
    tr.p += trainSpeed() * dt / len;
    let guard = 0;
    while (tr.p >= 1 && guard++ < 8) {
      tr.p -= 1;
      arrive(line, tr, tr.b);
      const next = chooseNext(line, tr.b, tr.a, tr);
      tr.a = tr.b; tr.b = next;
      a = stationById(tr.a); b = stationById(tr.b);
      if (!a || !b) { tr.p = 0; break; }
      const nlen = dist(a, b) || 1;
      tr.p = tr.p * len / nlen;
      len = nlen;
    }
  }

  function arrive(line, tr, stId) {
    const st = stationById(stId);
    if (!st) return;
    for (let i = tr.load.length - 1; i >= 0; i--) {
      if (tr.load[i].dest === stId) {
        const p = tr.load.splice(i, 1)[0];
        const gain = fareFor(p.hops || 1);
        state.money += gain;
        state.stats.delivered++;
        state.stats.earned += gain;
        coins.push({ x: st.x, y: st.y - 16, t: 0, val: gain });
        beep(720, 0.09, 0.035);
      }
    }
    state.money += 1;               // operating revenue for running
    state.stats.earned += 1;

    const cap = capacity();
    const d = bfs(line, stId);
    for (let i = 0; i < st.passengers.length && tr.load.length < cap; i++) {
      const pg = st.passengers[i];
      if (d[pg.dest] !== undefined) {
        pg.hops = d[pg.dest];
        tr.load.push(pg);
        st.passengers.splice(i, 1);
        i--;
      }
    }
  }

  // ---- passengers ----
  function trySpawn() {
    const lineSets = [];
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      if (state.lines[i].edges.length) lineSets.push(state.lines[i]);
    }
    if (!lineSets.length) return;
    const activeIds = new Set();
    lineSets.forEach(l => lineStationIds(l).forEach(id => activeIds.add(id)));
    if (activeIds.size < 2) return;
    const arr = [...activeIds];
    const fromId = arr[(Math.random() * arr.length) | 0];
    const dests = new Set();
    lineSets.forEach(l => {
      const d = bfs(l, fromId);
      for (const k in d) { if (+k !== fromId) dests.add(+k); }
    });
    if (!dests.size) return;
    const dd = [...dests];
    const st = stationById(fromId);
    if (st) st.passengers.push({ dest: dd[(Math.random() * dd.length) | 0], born: state.time, hops: 1 });
  }

  // ---- buying ----
  function randomPos() {
    for (let i = 0; i < 300; i++) {
      const x = 48 + Math.random() * (W - 96), y = 48 + Math.random() * (H - 96);
      let ok = true;
      for (const s of state.stations) if (dist2(s, { x, y }) < 94 * 94) { ok = false; break; }
      if (ok) for (const s of state.spots) if (dist2(s, { x, y }) < 86 * 86) { ok = false; break; }
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

  // ---- editing ----
  function firstLineWith(id) {
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      if (lineStationIds(state.lines[i]).indexOf(id) !== -1) return i;
    }
    return -1;
  }
  function firstEmptyLine() {
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      if (!state.lines[i].edges.length) return i;
    }
    return -1;
  }
  function stopEdit() { editing = -1; editFrom = null; renderLineCtrl(); }

  function segDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function handleTap(x, y) {
    if (state.over) return;
    const st = state.stations.find(s => dist2(s, { x, y }) < 20 * 20);
    const sp = state.spots.find(s => dist2(s, { x, y }) < 18 * 18);

    if (editing >= 0) {
      const line = state.lines[editing];
      if (sp) {
        const ns = buySpot(sp);
        if (!ns) return;
        if (editFrom != null) addEdge(line, editFrom, ns.id);
        editFrom = ns.id;
        renderLineCtrl();
        return;
      }
      if (st) {
        // tapping a station only ever selects / connects — never removes
        if (editFrom != null && editFrom !== st.id && !edgeExists(line, editFrom, st.id)) {
          addEdge(line, editFrom, st.id);
        }
        editFrom = st.id;
        renderLineCtrl();
        return;
      }
      // tapping an existing track of this line (away from stations) removes it
      for (const e of line.edges) {
        const a = stationById(e[0]), b = stationById(e[1]);
        if (a && b && segDist(x, y, a, b) < 9) {
          removeEdge(line, e[0], e[1]);
          editFrom = null;
          renderLineCtrl();
          return;
        }
      }
      editFrom = null;
      renderLineCtrl();
      return;
    }

    if (sp) { buySpot(sp); return; }
    if (st) {
      let li = firstLineWith(st.id);
      if (li < 0) li = firstEmptyLine();
      if (li < 0) li = 0;
      editing = li;
      editFrom = st.id;
      renderLineCtrl();
    }
  }

  // ---- simulation ----
  function update(dt) {
    if (state.over) return;
    state.time += dt;
    tutUpdate();

    spawnAcc += dt;
    const iv = BASE.spawn / (1 + state.upg.spawn * 0.35 + 0.10 * Math.max(0, state.stations.length - 2));
    let guard = 0;
    while (spawnAcc >= iv && guard++ < 20) { spawnAcc -= iv; trySpawn(); }

    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (l.edges.length) l.trains.forEach(t => stepTrain(l, t, dt));
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
    stopEdit();
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
  let _share = {};
  function rebuildShare() {
    _share = {};
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      state.lines[i].edges.forEach(e => {
        const k = e[0] < e[1] ? e[0] + '_' + e[1] : e[1] + '_' + e[0];
        (_share[k] = _share[k] || []).push(i);
      });
    }
  }
  // perpendicular shift so lines that share the same pair of stations run parallel
  function edgeOffset(lineIdx, id0, id1) {
    const k = id0 < id1 ? id0 + '_' + id1 : id1 + '_' + id0;
    const arr = _share[k];
    if (!arr || arr.length < 2) return 0;
    return (arr.indexOf(lineIdx) - (arr.length - 1) / 2) * 6;
  }
  function perp(a, b, off) {
    if (!off) return { x: 0, y: 0 };
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len * off, y: dx / len * off };
  }
  function label(txt, x, y, fill, size) {
    ctx.font = 'bold ' + size + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(10,13,20,0.92)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  function drawShape(x, y, r, shape, outline) {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, 7);
    else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (shape === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.72); ctx.lineTo(x - r * 0.92, y + r * 0.72); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
    if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(10,13,20,0.9)'; ctx.stroke(); }
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

    // tracks — dark casing, then colour; parallel offset where lines share a corridor
    rebuildShare();
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass === 0 ? 9 : 5.5;
      for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
        const l = state.lines[i];
        ctx.strokeStyle = pass === 0 ? '#0d1017' : l.color;
        l.edges.forEach(e => {
          const a = stationById(e[0]), b = stationById(e[1]);
          if (!a || !b) return;
          const o = perp(a, b, edgeOffset(i, e[0], e[1]));
          ctx.beginPath();
          ctx.moveTo(a.x + o.x, a.y + o.y);
          ctx.lineTo(b.x + o.x, b.y + o.y);
          ctx.stroke();
        });
      }
    }
    // rubber band while editing
    if (editing >= 0 && editFrom != null && mouse) {
      const s = stationById(editFrom);
      if (s) {
        ctx.strokeStyle = state.lines[editing].color;
        ctx.lineWidth = 4;
        ctx.setLineDash([7, 7]); ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }

    // buyable spots
    state.spots.forEach(sp => {
      const aff = state.money >= sp.cost;
      ctx.fillStyle = 'rgba(13,16,23,0.62)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 15, 0, 7); ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = aff ? '#3ad07a' : '#5b667c';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 13, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      label('¥' + sp.cost, sp.x, sp.y + 28, aff ? '#8affc0' : '#9aa6ba', 11);
    });

    const editSet = editing >= 0 ? new Set(lineStationIds(state.lines[editing])) : null;

    // stations
    state.stations.forEach(s => {
      if (s.crowdT > 0) {
        const frac = Math.min(1, s.crowdT / BASE.overLimit);
        ctx.strokeStyle = 'rgba(10,13,20,0.85)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(s.x, s.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      }
      if (editSet && editSet.has(s.id)) {
        ctx.strokeStyle = state.lines[editing].color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, 7); ctx.stroke();
      }
      // body: dark disc + light rim so it reads over any track colour
      ctx.fillStyle = '#0d1017';
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 7); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 7); ctx.stroke();
      ctx.fillStyle = '#eef2f8';
      drawShape(s.x, s.y, 8, s.shape);

      const pc = s.passengers.length;
      const shown = Math.min(pc, 7);
      ctx.fillStyle = pc > BASE.crowd ? '#ff9a5b' : '#ffd85e';
      for (let k = 0; k < shown; k++) {
        const ang = -Math.PI / 2 + (k - (shown - 1) / 2) * 0.3;
        const d = stationById(s.passengers[k].dest);
        drawShape(s.x + Math.cos(ang) * 26, s.y + Math.sin(ang) * 26, 4.3, d ? d.shape : 'circle', 1.6);
      }
      if (pc > 7) label('+' + (pc - 7), s.x, s.y - 26, '#ffd85e', 10);
    });

    // selected station marker
    if (editing >= 0 && editFrom != null) {
      const s = stationById(editFrom);
      if (s) {
        ctx.strokeStyle = 'rgba(10,13,20,0.8)';
        ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 23, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 23, 0, 7); ctx.stroke();
      }
    }

    // tutorial highlight (under trains so a passing train never fully hides it)
    const hl = tutHighlight();
    if (hl) {
      const r = 26 + Math.sin(state.time * 5) * 4;
      ctx.strokeStyle = 'rgba(10,13,20,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(hl.x, hl.y, r, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ffd85e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hl.x, hl.y, r, 0, 7); ctx.stroke();
    }

    // trains
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (!l.edges.length) continue;
      l.trains.forEach(tr => {
        const pos = trainXY(l, tr);
        const o = perp(pos.a, pos.b, edgeOffset(i, tr.a, tr.b));
        const ang = Math.atan2(pos.b.y - pos.a.y, pos.b.x - pos.a.x);
        ctx.save();
        ctx.translate(pos.x + o.x, pos.y + o.y);
        ctx.rotate(ang);
        roundRect(-12, -6, 24, 12, 3);
        ctx.fillStyle = l.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        for (let k = 0; k < tr.load.length && k < 6; k++) ctx.fillRect(-9 + k * 3.4, -1.5, 2, 3);
        ctx.restore();
      });
    }

    // coins
    coins.forEach(c => {
      ctx.globalAlpha = Math.max(0, 1 - c.t / 1.1);
      label('+¥' + c.val, c.x, c.y, '#ffe17a', 13);
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
    html += '<div class="help">駅をタップして選択 → もう一つの駅をタップでつなぐ。同じ駅からさらに別の駅へつなげば枝分かれOK。線路をタップすると撤去。点線の丸は購入できる駅。列車は待っている客のいる方へ自動で進みます。混雑を放置するとゲームオーバー。</div>';
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
        '<span class="dot"></span>' + l.name + '<small>' + lineStationIds(l).length + '駅</small></button>';
    }
    if (editing >= 0) {
      html += '<button id="eUndo">1つ戻す</button><button id="eReset">全消し</button><button id="eDone">完了</button>' +
        '<span class="ehint">駅をタップで選択 → 別の駅をタップでつなぐ（枝分かれOK）。線路をタップすると撤去</span>';
    }
    linectrl.innerHTML = html;
    linectrl.querySelectorAll('.lslot').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (editing === i) { stopEdit(); }
      else { editing = i; editFrom = null; renderLineCtrl(); }
    }));
    if (editing >= 0) {
      const l = state.lines[editing];
      document.getElementById('eUndo').addEventListener('click', () => {
        l.edges.pop(); editFrom = null; rebuildLine(l); renderLineCtrl(); save();
      });
      document.getElementById('eReset').addEventListener('click', () => {
        l.edges = []; l.trains = []; editFrom = null; rebuildLine(l); renderLineCtrl(); save();
      });
      document.getElementById('eDone').addEventListener('click', stopEdit);
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

  // ---- tutorial ----
  function startTut() { tut.active = true; tut.step = 0; renderTut(); }
  function finishTut() {
    tut.active = false;
    try { localStorage.setItem('metro_tut_done', '1'); } catch (e) {}
    renderTut();
  }
  function tutNext() {
    tut.step++;
    if (tut.step >= TUT.length) finishTut();
    else renderTut();
  }
  function renderTut() {
    if (!tutEl) return;
    const glow = tut.active && tut.step === 4;
    if (side) side.classList.toggle('tut-glow', glow);
    if (!tut.active) { tutEl.hidden = true; return; }
    const s = TUT[tut.step];
    tutEl.hidden = false;
    tutText.textContent = s.text;
    tutStepEl.textContent = (tut.step + 1) + ' / ' + TUT.length;
    tutNextBtn.hidden = !(s.manual || s.last);
    tutNextBtn.textContent = s.last ? 'はじめる' : '次へ';
  }
  function tutUpdate() {
    if (!tut.active) return;
    const s = TUT[tut.step];
    if (s.auto && s.auto()) tutNext();
  }
  function tutHighlight() {
    if (!tut.active) return null;
    if (tut.step <= 1) {
      const cands = state.stations.filter(st => st.id !== editFrom);
      if (!cands.length) return state.stations[0] || null;
      return cands.slice().sort((a, b) => edgeCount(a.id) - edgeCount(b.id))[0];
    }
    if (tut.step === 3) {
      return state.spots.slice().sort((a, b) => a.cost - b.cost)[0] || null;
    }
    return null;
  }

  // ---- save / load ----
  function save() {
    try {
      const cp = {
        money: state.money, time: state.time, over: state.over,
        stations: state.stations, spots: state.spots,
        lines: state.lines.map(l => ({
          idx: l.idx, edges: l.edges,
          trains: l.trains.map(t => ({ a: t.a, b: t.b, p: t.p, load: t.load })),
        })),
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
      try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('metro_tut_done'); } catch (e) {}
      defaultState();
      return;
    }
    const s = load();
    if (!s) { defaultState(); return; }

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
      if (!Array.isArray(l.edges)) {
        l.edges = [];
        if (Array.isArray(l.stationIds)) {          // migrate old linear lines
          for (let k = 1; k < l.stationIds.length; k++) l.edges.push([l.stationIds[k - 1], l.stationIds[k]]);
        }
      }
      delete l.stationIds;
      l.trains = Array.isArray(l.trains) ? l.trains : [];
      rebuildLine(l);
    });
    state.stations.forEach(st => { st.passengers = st.passengers || []; if (typeof st.crowdT !== 'number') st.crowdT = 0; });
    if (typeof state.nextId !== 'number') {
      state.nextId = 1 + Math.max(0, ...state.stations.map(x => x.id), ...state.spots.map(x => x.id));
    }
    replenishSpots();
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

    tutEl = document.getElementById('tut');
    tutText = document.getElementById('tutText');
    tutStepEl = document.getElementById('tutStep');
    tutNextBtn = document.getElementById('tutNext');

    boot();
    buildSide();
    updateSide();
    renderLineCtrl();

    tutNextBtn.addEventListener('click', tutNext);
    document.getElementById('tutSkip').addEventListener('click', finishTut);
    let tutSeen = false;
    try { tutSeen = !!localStorage.getItem('metro_tut_done'); } catch (e) {}
    if (!tutSeen && totalEdges() === 0 && state.stats.delivered === 0) startTut();
    else renderTut();

    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      resumeAudio();
      const p = toLocal(e);
      mouse = p;
      handleTap(p.x, p.y);
    });
    cv.addEventListener('pointermove', e => { mouse = toLocal(e); });
    cv.addEventListener('pointerleave', () => { mouse = null; });

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing >= 0) stopEdit(); });

    document.getElementById('bMute').addEventListener('click', e => {
      muted = !muted;
      e.target.textContent = muted ? '🔇' : '🔊';
    });
    const help = document.getElementById('help');
    document.getElementById('bHelp').addEventListener('click', () => { renderChangelog(); help.classList.remove('hidden'); });
    document.getElementById('bCloseHelp').addEventListener('click', () => help.classList.add('hidden'));
    document.getElementById('bTut').addEventListener('click', () => { help.classList.add('hidden'); startTut(); });
    document.getElementById('bRestart').addEventListener('click', () => {
      defaultState();
      spawnAcc = 0; coins = []; editing = -1; editFrom = null;
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
