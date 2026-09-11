(function () {
  'use strict';

  // ---- constants ----
  const W = 960, H = 620;
  const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'pentagon'];
  const COLORS = ['#ff5d75', '#5b8cff', '#3ddc97', '#ffc94d', '#b98bff'];
  const NAMES  = ['1号線', '2号線', '3号線', '4号線', '5号線'];
  const MODES = ['story', 'eternal'];
  const SLOTS = [1, 2, 3];
  const RESET_PHRASE = 'metro tycoon reset';
  const saveKey = (m, slot) => 'metro_tycoon_' + m + '_' + slot;

  const BASE = {
    speed: 66,        // px/sec
    capacity: 4,
    fare: 9,
    spawn: 2.7,       // sec between passengers (before scaling)
    crowd: 10,        // waiting passengers before a station is "overcrowded"
    giveUp: 150,      // sec until a waiting passenger leaves
    overLimit: 22,    // sec of overcrowding => game over
  };

  const UP_CATS = { ops: '🚆 運行', biz: '💰 経営', city: '🏙️ 都市開発' };
  const UP = [
    // 🚆 運行
    { key: 'capacity', cat: 'ops', name: '車両大型化',   desc: '列車の定員 +3',            max: 8,  cost: l => Math.round(70  * Math.pow(1.80, l)) },
    { key: 'speed',    cat: 'ops', name: '加速性能',     desc: '列車速度 +22%',            max: 8,  cost: l => Math.round(80  * Math.pow(1.80, l)) },
    { key: 'trains',   cat: 'ops', name: '増発',         desc: '全路線の列車 +1',          max: 4,  cost: l => Math.round(140 * Math.pow(2.50, l)) },
    // 💰 経営
    { key: 'fare',     cat: 'biz', name: '運賃改定',     desc: '運賃 +50%',                max: 10, cost: l => Math.round(90  * Math.pow(1.85, l)) },
    { key: 'opFee',    cat: 'biz', name: '基本収益改善', desc: '列車の運行収益 +1',        max: 6,  cost: l => Math.round(160 * Math.pow(2.10, l)) },
    { key: 'interest', cat: 'biz', name: '資産運用',     desc: '資金が毎秒 +0.015%ずつ増え続ける', max: 10, cost: l => Math.round(220 * Math.pow(2.30, l)) },
    // 🏙️ 都市開発
    { key: 'spawn',    cat: 'city', name: '沿線開発',      desc: '乗客の発生 +35%',          max: 10, cost: l => Math.round(100 * Math.pow(1.80, l)) },
    { key: 'lines',    cat: 'city', name: '新規開業',      desc: '路線スロット +1',          max: 4,  cost: l => Math.round(200 * Math.pow(2.60, l)) },
    { key: 'crowd',    cat: 'city', name: '駅ホーム拡張',  desc: '混雑の許容人数 +3',        max: 8,  cost: l => Math.round(85  * Math.pow(1.80, l)) },
    { key: 'patience', cat: 'city', name: '乗客サービス向上', desc: '乗客が待てる時間 +40秒', max: 8,  cost: l => Math.round(75  * Math.pow(1.75, l)) },
    { key: 'grace',    cat: 'city', name: '緊急対応マニュアル', desc: '混雑放置の猶予 +6秒', max: 6,  cost: l => Math.round(130 * Math.pow(2.00, l)) },
    { key: 'discount', cat: 'city', name: '都市開発補助金', desc: '新駅の価格 -6%',          max: 6,  cost: l => Math.round(140 * Math.pow(2.00, l)) },
  ];

  const PALETTE = ['#ff5d75', '#5b8cff', '#3ddc97', '#ffc94d', '#b98bff', '#ff8c42', '#39c2d7', '#e85cc4', '#8bd450', '#7a7ff5'];

  const SKINS = [
    { key: 'default', name: 'ノーマル',  need: 0 },
    { key: 'neon',    name: 'ネオン',    need: 6 },
    { key: 'retro',   name: 'レトロ',    need: 14 },
    { key: 'aurora',  name: 'オーロラ',  need: 24 },
  ];

  const EVENT_INFO = {
    rush:    { icon: '🌆', label: 'ラッシュアワー発生！ 乗客がどっと増加中', freq: 720 },
    vip:     { icon: '🎩', label: 'VIP乗客が乗車中！ 運賃が跳ね上がる',     freq: 880 },
    trouble: { icon: '🔧', label: '車両トラブル発生…… 速度が低下中',        freq: 300 },
  };

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

  const CHAPTERS = [
    { name: '開業', desc: '路線を1本、線路でつなごう', check: () => totalEdges() >= 1 },
    { name: 'はじめての乗客', desc: '乗客を10人、目的地まで送り届けよう', check: () => state.stats.delivered >= 10 },
    { name: '路線拡大', desc: '駅を5つ保有しよう', check: () => state.stations.length >= 5 },
    { name: '複数路線体制', desc: '2つの路線を同時に走らせよう', check: () => activeLineCount() >= 2 },
    { name: '黒字経営', desc: '累計売上¥3000を達成しよう', check: () => state.stats.earned >= 3000 },
    { name: '大都市計画', desc: '駅10・輸送200人・路線3本の巨大ネットワークを完成させよう', check: () => state.stations.length >= 10 && state.stats.delivered >= 200 && activeLineCount() >= 3 },
  ];

  const MODE_INFO = {
    story: { icon: '📖', label: 'ストーリーモード', desc: '小さな2駅の路線から大都市鉄道網へ。6つの目標を達成してエンディングを目指す。乗客が溢れた駅を放置すると経営破綻（ゲームオーバー）。' },
    eternal: { icon: '♾️', label: 'エターナルモード', desc: '目標もエンディングもなし。混雑してもゲームオーバーにならない、終わりのない経営を気ままに楽しむモード。' },
  };

  // ---- state ----
  let state, cv, ctx, side, linectrl;
  let curMode = 'story', curSlot = 1;
  let slotsTabMode = 'story';
  let tut = { active: false, step: 0 };
  let tutEl, tutText, tutStepEl, tutNextBtn;
  let editing = -1;      // index of line being edited, or -1
  let editFrom = null;   // currently selected station id while editing
  let mouse = null;
  let spawnAcc = 0, saveAcc = 0;
  let coins = [];
  let toastMsg = '', toastT = 0;
  let dispMoney = null;
  let muted = false, actx = null;
  let simSpeed = 1;               // 1x / 2x / 3x fast-forward, not saved with the slot
  let skin = 'default';           // cosmetic theme, account-wide (localStorage)
  let achUnlocked = {};           // achievement id -> unlocked timestamp, account-wide
  let eventAcc = 0;

  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const dist  = (a, b) => Math.sqrt(dist2(a, b));
  const stationById = id => state.stations.find(s => s.id === id);
  function eventActive(type) { return state.event && state.event.type === type && state.time < state.event.until; }
  const trainSpeed = () => BASE.speed * (1 + state.upg.speed * 0.22) * (eventActive('trouble') ? 0.55 : 1);
  const capacity   = () => BASE.capacity + state.upg.capacity * 3;
  const trainsPerLine = () => 1 + state.upg.trains;
  const maxLines   = () => 1 + state.upg.lines;
  const crowdLimit = () => BASE.crowd + (state.upg.crowd || 0) * 3;
  const giveUpTime = () => BASE.giveUp + (state.upg.patience || 0) * 40;
  const overGrace  = () => BASE.overLimit + (state.upg.grace || 0) * 6;

  function newLine(i) {
    return { idx: i, color: COLORS[i], name: NAMES[i], edges: [], trains: [], _adj: {} };
  }
  function addStation(x, y, shape) {
    const st = { id: state.nextId++, x, y, shape, passengers: [], crowdT: 0 };
    state.stations.push(st);
    return st;
  }
  function spotCost() {
    const base = Math.round(55 * Math.pow(1.34, Math.max(0, state.stations.length - 2)));
    const discount = Math.pow(0.94, (state.upg && state.upg.discount) || 0);
    return Math.max(10, Math.round(base * discount));
  }

  function defaultState() {
    state = {
      money: 100, time: 0, over: false,
      chapter: 0, cleared: false, event: null, _nearMiss: false,
      stations: [], spots: [], lines: [],
      upg: {
        fare: 0, capacity: 0, speed: 0, trains: 0, spawn: 0, lines: 0,
        crowd: 0, patience: 0, grace: 0, interest: 0, opFee: 0, discount: 0,
      },
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
  function activeLineCount() {
    let n = 0;
    for (let i = 0; i < state.lines.length && i < maxLines(); i++) if (state.lines[i].edges.length) n++;
    return n;
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
    const vip = eventActive('vip') ? 1.8 : 1;
    return Math.round(BASE.fare * (1 + state.upg.fare * 0.5) * hops * (1 + 0.18 * (hops - 1)) * vip);
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
    const opRev = 1 + (state.upg.opFee || 0);   // operating revenue for running
    state.money += opRev;
    state.stats.earned += opRev;

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
    if (curMode === 'story') checkChapter();

    if (state.upg.interest) {
      const gain = state.money * state.upg.interest * 0.00015 * dt;
      state.money += gain;
      state.stats.earned += gain;
    }

    if (state.event && state.time >= state.event.until) state.event = null;
    maybeSpawnEvent(dt);

    spawnAcc += dt;
    let iv = BASE.spawn / (1 + state.upg.spawn * 0.35 + 0.10 * Math.max(0, state.stations.length - 2));
    if (eventActive('rush')) iv /= 2.2;
    let guard = 0;
    while (spawnAcc >= iv && guard++ < 20) { spawnAcc -= iv; trySpawn(); }

    for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
      const l = state.lines[i];
      if (l.edges.length) l.trains.forEach(t => stepTrain(l, t, dt));
    }

    const cLimit = crowdLimit(), gTime = giveUpTime(), oGrace = overGrace();
    let over = false, nearMiss = false;
    state.stations.forEach(s => {
      for (let i = s.passengers.length - 1; i >= 0; i--) {
        if (state.time - s.passengers[i].born > gTime) s.passengers.splice(i, 1);
      }
      if (s.passengers.length > cLimit) s.crowdT += dt;
      else s.crowdT = Math.max(0, s.crowdT - dt * 1.5);
      if (s.crowdT > oGrace * 0.8) nearMiss = true;
      if (s.crowdT > oGrace) over = true;
    });
    if (nearMiss && !over) state._nearMiss = true;
    if (over && curMode !== 'eternal') gameOver();

    checkAchievements();

    coins.forEach(c => { c.t += dt; c.y -= 20 * dt; });
    coins = coins.filter(c => c.t < 1.1);
    if (toastT > 0) toastT -= dt;

    saveAcc += dt;
    if (saveAcc > 3) { saveAcc = 0; save(); }
  }

  // ---- random events ----
  function maybeSpawnEvent(dt) {
    if (state.event) return;
    eventAcc += dt;
    if (eventAcc < 75) return;
    eventAcc = 0;
    if (Math.random() < 0.55) return;            // not every check triggers one
    const types = Object.keys(EVENT_INFO);
    const type = types[(Math.random() * types.length) | 0];
    const dur = 18 + Math.random() * 12;
    state.event = { type, until: state.time + dur };
    showToast(EVENT_INFO[type].icon + ' ' + EVENT_INFO[type].label);
    beep(EVENT_INFO[type].freq, 0.16, 0.05);
  }

  // ---- achievements ----
  function loadAch() {
    try { achUnlocked = JSON.parse(localStorage.getItem('metro_ach_v1') || '{}'); } catch (e) { achUnlocked = {}; }
  }
  function saveAch() {
    try { localStorage.setItem('metro_ach_v1', JSON.stringify(achUnlocked)); } catch (e) { /* ignore */ }
  }
  function achCount() { return Object.keys(achUnlocked).length; }
  function checkAchievements() {
    if (!window.METRO_ACHIEVEMENTS) return;
    const ctx = { state, curMode, activeLines: activeLineCount(), edges: totalEdges(), trains: totalTrains(), cap: capacity() };
    let newly = null;
    for (const a of window.METRO_ACHIEVEMENTS) {
      if (achUnlocked[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(ctx); } catch (e) { ok = false; }
      if (ok) { achUnlocked[a.id] = Date.now(); newly = a; }
    }
    if (newly) {
      saveAch();
      showToast('🏅 実績解除：' + newly.name);
      beep(1046, 0.14, 0.05);
      renderAch();
    }
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

  // ---- story mode chapters ----
  function checkChapter() {
    if (curMode !== 'story' || state.cleared) return;
    let guard = 0;
    while ((state.chapter || 0) < CHAPTERS.length && guard++ < CHAPTERS.length) {
      const idx = state.chapter || 0;
      if (!CHAPTERS[idx].check()) break;
      state.chapter = idx + 1;
      if (state.chapter >= CHAPTERS.length) { state.cleared = true; showClear(); }
      else { showToast('第' + (idx + 1) + '章クリア：' + CHAPTERS[idx].name); beep(880, 0.12, 0.05); }
      save();
    }
    renderChapterUI();
  }
  function showClear() {
    beep(660, 0.15, 0.05);
    const stats = document.getElementById('clearstats');
    if (stats) {
      stats.innerHTML =
        '運行時間：' + fmtTime(state.time) + '<br>' +
        '輸送人数：' + state.stats.delivered + ' 人<br>' +
        '累計売上：¥' + Math.round(state.stats.earned) + '<br>' +
        '駅の数：' + state.stations.length;
    }
    const nameInput = document.getElementById('clearName');
    const msg = document.getElementById('clearSubmitMsg');
    const btn = document.getElementById('bClearSubmit');
    if (nameInput && window.MetroRanking) nameInput.value = window.MetroRanking.getName();
    if (msg) msg.textContent = '';
    if (btn) btn.disabled = false;
    const el = document.getElementById('clear');
    if (el) el.classList.remove('hidden');
  }
  function renderChapterUI() {
    const box = document.getElementById('chapterBar');
    if (!box) return;
    if (curMode !== 'story' || state.cleared) { box.hidden = true; return; }
    const idx = state.chapter || 0;
    if (idx >= CHAPTERS.length) { box.hidden = true; return; }
    const ch = CHAPTERS[idx];
    box.hidden = false;
    box.innerHTML = '<b>第' + (idx + 1) + '章：' + ch.name + '</b><span>' + ch.desc + '</span>';
  }
  function renderEventBar() {
    const box = document.getElementById('eventBar');
    if (!box) return;
    if (!state.event || state.time >= state.event.until) { box.hidden = true; return; }
    const info = EVENT_INFO[state.event.type];
    if (!info) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<b>' + info.icon + ' ' + info.label + '</b><span>残り' + Math.ceil(state.event.until - state.time) + '秒</span>';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function renderAch() {
    const skinRow = document.getElementById('skinRow');
    const progress = document.getElementById('achProgress');
    const grid = document.getElementById('achGrid');
    if (!skinRow || !grid) return;
    const n = achCount();
    skinRow.innerHTML = SKINS.map(s => {
      const unlocked = n >= s.need;
      const active = skin === s.key;
      return '<button class="skin-sw' + (active ? ' on' : '') + (unlocked ? '' : ' locked') + '" data-k="' + s.key + '"' + (unlocked ? '' : ' disabled') + '>' +
        s.name + (unlocked ? '' : '（実績' + s.need + '）') + '</button>';
    }).join('');
    skinRow.querySelectorAll('.skin-sw:not(.locked)').forEach(b => b.addEventListener('click', () => {
      skin = b.dataset.k;
      try { localStorage.setItem('metro_skin', skin); } catch (e) {}
      _bgGrad = null;
      renderAch();
    }));
    const total = window.METRO_ACHIEVEMENTS ? window.METRO_ACHIEVEMENTS.length : 0;
    if (progress) progress.textContent = '解除済み: ' + n + ' / ' + total;
    if (!window.METRO_ACHIEVEMENTS) { grid.innerHTML = ''; return; }
    let html = '', lastCat = null;
    window.METRO_ACHIEVEMENTS.forEach(a => {
      if (a.cat !== lastCat) { html += '<div class="upcat ach-cat">' + a.cat + '</div>'; lastCat = a.cat; }
      const done = !!achUnlocked[a.id];
      html += '<div class="ach-card' + (done ? ' done' : '') + '">' +
        '<b>' + (done ? '🏅 ' : '🔒 ') + a.name + '</b>' +
        '<p>' + a.desc + '</p></div>';
    });
    grid.innerHTML = html;
  }
  async function renderRank() {
    const list = document.getElementById('rankList');
    if (!list || !window.MetroRanking) return;
    list.innerHTML = '<p class="mode-desc">読み込み中…</p>';
    try {
      const rows = await window.MetroRanking.fetchTop(50);
      if (!rows.length) {
        list.innerHTML = '<p class="mode-desc">まだ記録がありません。ストーリーモードをクリアして一番乗りを目指そう！</p>';
        return;
      }
      let html = '<div class="rank-row rank-head"><span>#</span><span>社長</span><span>タイム</span><span>駅</span><span>輸送</span></div>';
      rows.forEach((r, i) => {
        html += '<div class="rank-row"><span>' + (i + 1) + '</span><span>' + escapeHtml(r.name) + '</span><span>' +
          fmtTime(r.time_sec) + '</span><span>' + r.stations + '</span><span>' + r.delivered + '</span></div>';
      });
      list.innerHTML = html;
    } catch (e) {
      list.innerHTML = '<p class="mode-desc">まだランキング機能の準備ができていません。しばらくしてからもう一度お試しください。</p>';
    }
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
  // lighten (pct>0) or darken (pct<0) a #rrggbb colour
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  const SKIN_BG = {
    default: ['#161c30', '#0e1220', '#080a12'],
    neon:    ['#1b1030', '#0f0a20', '#060410'],
    retro:   ['#2a2016', '#1a1410', '#0e0b08'],
    aurora:  ['#0f2a26', '#0d1a2a', '#080c14'],
  };
  let _bgGrad = null, _bgGradSkin = null;
  function bgGradient() {
    if (_bgGrad && _bgGradSkin === skin) return _bgGrad;
    const stops = SKIN_BG[skin] || SKIN_BG.default;
    const g = ctx.createRadialGradient(W * 0.5, H * 0.32, 30, W * 0.5, H * 0.6, Math.max(W, H) * 0.8);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);
    _bgGrad = g;
    _bgGradSkin = skin;
    return g;
  }

  function draw() {
    ctx.fillStyle = bgGradient();
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 36; x < W; x += 36) for (let y = 36; y < H; y += 36) ctx.fillRect(x, y, 1.4, 1.4);

    // tracks — dark casing, then colour; parallel offset where lines share a corridor
    rebuildShare();
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass === 0 ? 9 : 5.5;
      if (pass === 1 && skin === 'neon') { ctx.shadowBlur = 12; }
      for (let i = 0; i < state.lines.length && i < maxLines(); i++) {
        const l = state.lines[i];
        ctx.strokeStyle = pass === 0 ? '#0d1017' : l.color;
        if (pass === 1 && skin === 'neon') ctx.shadowColor = l.color;
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
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
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
        const frac = Math.min(1, s.crowdT / overGrace());
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
      // body: dark disc (soft drop shadow) + light rim so it reads over any track colour
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#0d1017';
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 7); ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 7); ctx.stroke();
      ctx.fillStyle = '#eef2f8';
      drawShape(s.x, s.y, 8, s.shape);

      const pc = s.passengers.length;
      const shown = Math.min(pc, 7);
      ctx.fillStyle = pc > crowdLimit() ? '#ff9a5b' : '#ffd85e';
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
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        roundRect(-12, -6, 24, 12, 3);
        const grad = ctx.createLinearGradient(0, -6, 0, 6);
        grad.addColorStop(0, shade(l.color, 22));
        grad.addColorStop(1, shade(l.color, -20));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        roundRect(-8, -3.6, 15, 2, 1);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.97)';
        for (let k = 0; k < tr.load.length && k < 6; k++) ctx.fillRect(-9 + k * 3.4, 1.2, 2, 3);
        ctx.restore();
      });
    }

    // coins
    coins.forEach(c => {
      ctx.globalAlpha = Math.max(0, 1 - c.t / 1.1);
      ctx.shadowColor = 'rgba(255,201,77,0.55)';
      ctx.shadowBlur = 8;
      label('+¥' + c.val, c.x, c.y, '#ffdb85', 13);
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
    });

    if (toastT > 0) {
      ctx.globalAlpha = toastT > 0.4 ? 1 : toastT / 0.4;
      ctx.font = "600 13.5px 'Space Grotesk',system-ui";
      ctx.textAlign = 'center';
      const w = ctx.measureText(toastMsg).width + 30;
      ctx.fillStyle = 'rgba(14,17,27,0.86)';
      roundRect(W / 2 - w / 2, H - 44, w, 29, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#eef1fb';
      ctx.fillText(toastMsg, W / 2, H - 24.5);
      ctx.globalAlpha = 1;
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
    if (dispMoney === null || Math.abs(dispMoney - state.money) > state.money * 0.6 + 500) dispMoney = state.money;
    dispMoney += (state.money - dispMoney) * 0.2;
    if (Math.abs(dispMoney - state.money) < 0.5) dispMoney = state.money;
    setTxt('hMoney', '¥' + Math.floor(dispMoney));
    setTxt('hTime', fmtTime(state.time));
    setTxt('hSta', state.stations.length);
    setTxt('hTrain', totalTrains());
    setTxt('hWait', totalWaiting());
    setTxt('hDeliv', state.stats.delivered);
    renderChapterUI();
    renderEventBar();
  }
  function setTxt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  function buildSide() {
    let html = '<h3>アップグレード</h3>';
    let lastCat = null;
    UP.forEach(u => {
      if (u.cat !== lastCat) {
        html += '<div class="upcat">' + UP_CATS[u.cat] + '</div>';
        lastCat = u.cat;
      }
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
        '<span class="ehint">駅をタップで選択 → 別の駅をタップでつなぐ（枝分かれOK）。線路をタップすると撤去</span>' +
        '<div class="palette">' + PALETTE.map(c => '<button class="swatch" data-c="' + c + '" style="--c:' + c + '"></button>').join('') + '</div>';
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
      linectrl.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => {
        l.color = b.dataset.c;
        renderLineCtrl();
        save();
      }));
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
  function maybeStartTut() {
    let tutSeen = false;
    try { tutSeen = !!localStorage.getItem('metro_tut_done'); } catch (e) {}
    if (!tutSeen && totalEdges() === 0 && state.stats.delivered === 0) startTut();
    else renderTut();
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

  // ---- save / load (3 slots per mode) ----
  function save() {
    if (!curMode || !curSlot) return;
    try {
      const cp = {
        mode: curMode, money: state.money, time: state.time, over: state.over,
        chapter: state.chapter || 0, cleared: !!state.cleared,
        event: state.event, _nearMiss: !!state._nearMiss,
        stations: state.stations, spots: state.spots,
        lines: state.lines.map(l => ({
          idx: l.idx, edges: l.edges, color: l.color,
          trains: l.trains.map(t => ({ a: t.a, b: t.b, p: t.p, load: t.load })),
        })),
        upg: state.upg, stats: state.stats, nextId: state.nextId,
      };
      localStorage.setItem(saveKey(curMode, curSlot), JSON.stringify(cp));
    } catch (e) { /* ignore */ }
  }
  function readSlot(m, slot) {
    try {
      const raw = localStorage.getItem(saveKey(m, slot));
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.stations) || s.stations.length === 0) return null;
      return s;
    } catch (e) { return null; }
  }
  function bootActive() {
    const s = readSlot(curMode, curSlot);
    if (!s) { defaultState(); return; }

    state = s;
    state.upg = state.upg || {};
    UP.forEach(u => {
      if (typeof state.upg[u.key] !== 'number') state.upg[u.key] = 0;
    });
    state.stats = state.stats || { delivered: 0, earned: 0, spent: 0 };
    state.chapter = typeof state.chapter === 'number' ? state.chapter : 0;
    state.cleared = !!state.cleared;
    state._nearMiss = !!state._nearMiss;
    state.event = (state.event && state.event.until > state.time) ? state.event : null;
    state.spots = state.spots || [];
    if (!Array.isArray(state.lines)) state.lines = [];
    while (state.lines.length < 5) state.lines.push(newLine(state.lines.length));
    state.lines.forEach((l, i) => {
      l.idx = i; l.color = l.color || COLORS[i]; l.name = NAMES[i];
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
  function loadSlot(m, slot) {
    curMode = m; curSlot = slot;
    try { localStorage.setItem('metro_mode', m); localStorage.setItem('metro_slot', String(slot)); } catch (e) {}
    bootActive();
    editing = -1; editFrom = null; coins = []; spawnAcc = 0; toastT = 0;
    const slotsEl = document.getElementById('slots');
    if (slotsEl) slotsEl.classList.add('hidden');
    const overEl = document.getElementById('over');
    if (overEl) overEl.classList.add('hidden');
    const clearEl = document.getElementById('clear');
    if (clearEl) clearEl.classList.add('hidden');
    buildSide();
    updateSide();
    renderLineCtrl();
    renderChapterUI();
    updateModeBadge();
    maybeStartTut();
    save();
  }
  function updateModeBadge() {
    const b = document.getElementById('bSlots');
    if (!b) return;
    b.textContent = MODE_INFO[curMode].icon + ' スロット' + curSlot;
  }

  // ---- save slot manager ----
  function renderSlots() {
    const grid = document.getElementById('slotGrid');
    const desc = document.getElementById('modeDesc');
    if (!grid) return;
    document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('on', b.dataset.m === slotsTabMode));
    if (desc) desc.textContent = MODE_INFO[slotsTabMode].desc;

    let html = '';
    SLOTS.forEach(slot => {
      const s = readSlot(slotsTabMode, slot);
      const active = slotsTabMode === curMode && slot === curSlot;
      html += '<div class="slot-card' + (active ? ' active' : '') + '" data-slot="' + slot + '">';
      html += '<b>スロット ' + slot + (active ? '（プレイ中）' : '') + '</b>';
      if (!s) {
        html += '<p class="slot-empty">空き — まだデータがありません</p>';
        html += '<div class="slot-btns"><button class="slotPlay" data-slot="' + slot + '">新規に始める</button></div>';
      } else {
        const chap = slotsTabMode === 'story'
          ? (s.cleared ? '・エンディング達成' : '・第' + Math.min((s.chapter || 0) + 1, CHAPTERS.length) + '章')
          : '';
        html += '<p>¥' + Math.floor(s.money) + '　駅' + s.stations.length + '　' + fmtTime(s.time || 0) + chap + '</p>';
        html += '<div class="slot-btns">' +
          '<button class="slotPlay" data-slot="' + slot + '">このセーブで遊ぶ</button>' +
          '<button class="slotReset" data-slot="' + slot + '">削除</button></div>';
        html += '<div class="slot-confirm" hidden data-slot="' + slot + '">' +
          '<p>削除すると元に戻せません。「<code>' + RESET_PHRASE + '</code>」と入力すると削除できます。</p>' +
          '<input type="text" class="slot-confirm-input" autocomplete="off" placeholder="' + RESET_PHRASE + '">' +
          '<div class="slot-btns"><button class="slotDelete" disabled>完全に削除する</button>' +
          '<button class="slotCancel">やめる</button></div></div>';
      }
      html += '</div>';
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.slotPlay').forEach(b => b.addEventListener('click', () => loadSlot(slotsTabMode, +b.dataset.slot)));
    grid.querySelectorAll('.slotReset').forEach(b => b.addEventListener('click', () => {
      grid.querySelectorAll('.slot-confirm').forEach(c => { c.hidden = true; });
      const card = b.closest('.slot-card');
      const confirmBox = card.querySelector('.slot-confirm');
      confirmBox.hidden = false;
      confirmBox.querySelector('.slot-confirm-input').value = '';
      confirmBox.querySelector('.slotDelete').disabled = true;
    }));
    grid.querySelectorAll('.slot-confirm-input').forEach(inp => inp.addEventListener('input', () => {
      const box = inp.closest('.slot-confirm');
      box.querySelector('.slotDelete').disabled = inp.value !== RESET_PHRASE;
    }));
    grid.querySelectorAll('.slotCancel').forEach(b => b.addEventListener('click', () => { b.closest('.slot-confirm').hidden = true; }));
    grid.querySelectorAll('.slotDelete').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      const slot = +b.closest('.slot-card').dataset.slot;
      try { localStorage.removeItem(saveKey(slotsTabMode, slot)); } catch (e) {}
      if (slotsTabMode === curMode && slot === curSlot) {
        defaultState();
        editing = -1; editFrom = null; coins = []; spawnAcc = 0; toastT = 0;
        document.getElementById('over').classList.add('hidden');
        document.getElementById('clear').classList.add('hidden');
        buildSide(); updateSide(); renderLineCtrl(); renderChapterUI();
        save();
      }
      showToast('削除しました');
      renderSlots();
    }));
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

    // account-wide meta: achievements, unlocked skin, fast-forward speed
    loadAch();
    try {
      const sv = localStorage.getItem('metro_skin');
      if (sv && SKINS.some(s => s.key === sv && achCount() >= s.need)) skin = sv;
    } catch (e) {}
    try {
      const sp = parseInt(localStorage.getItem('metro_speed'), 10);
      if ([1, 2, 3].indexOf(sp) !== -1) simSpeed = sp;
    } catch (e) {}

    // resolve which mode/slot to play, migrating a legacy single-save file if present
    let firstVisit = false;
    try {
      const savedMode = localStorage.getItem('metro_mode');
      const savedSlot = parseInt(localStorage.getItem('metro_slot'), 10);
      if (MODES.indexOf(savedMode) !== -1 && SLOTS.indexOf(savedSlot) !== -1) {
        curMode = savedMode; curSlot = savedSlot;
      } else {
        firstVisit = true;
        const legacy = localStorage.getItem('metro_tycoon_v1');
        if (legacy && !localStorage.getItem(saveKey('story', 1))) {
          localStorage.setItem(saveKey('story', 1), legacy);
        }
        curMode = 'story'; curSlot = 1;
        localStorage.setItem('metro_mode', curMode);
        localStorage.setItem('metro_slot', String(curSlot));
      }
    } catch (e) {}

    bootActive();
    buildSide();
    updateSide();
    renderLineCtrl();
    renderChapterUI();
    updateModeBadge();

    tutNextBtn.addEventListener('click', tutNext);
    document.getElementById('tutSkip').addEventListener('click', finishTut);

    // save slot / mode manager
    const slotsEl = document.getElementById('slots');
    document.getElementById('bSlots').addEventListener('click', () => { slotsTabMode = curMode; renderSlots(); slotsEl.classList.remove('hidden'); });
    document.getElementById('bCloseSlots').addEventListener('click', () => { slotsEl.classList.add('hidden'); maybeStartTut(); });
    document.querySelectorAll('.mtab').forEach(b => b.addEventListener('click', () => { slotsTabMode = b.dataset.m; renderSlots(); }));
    if (firstVisit) { slotsTabMode = curMode; renderSlots(); slotsEl.classList.remove('hidden'); }
    else maybeStartTut();

    document.getElementById('bClearContinue').addEventListener('click', () => document.getElementById('clear').classList.add('hidden'));
    document.getElementById('bClearSubmit').addEventListener('click', async () => {
      const btn = document.getElementById('bClearSubmit');
      const msg = document.getElementById('clearSubmitMsg');
      const nameInput = document.getElementById('clearName');
      const name = (nameInput.value || '').trim().slice(0, 20) || 'なぞの社長';
      if (window.MetroRanking) window.MetroRanking.setName(name);
      btn.disabled = true;
      msg.textContent = '送信中…';
      try {
        await window.MetroRanking.submit({
          name,
          time_sec: Math.max(1, Math.round(state.time)),
          stations: state.stations.length,
          delivered: state.stats.delivered,
          earned: Math.round(state.stats.earned),
        });
        msg.textContent = '登録しました！🏆 世界ランキングで確認できます。';
        beep(1200, 0.12, 0.05);
      } catch (e) {
        msg.textContent = 'ランキング機能は準備中です。しばらくしてから遊びに来てね。';
        btn.disabled = false;
      }
    });

    // speed / achievements / ranking
    document.querySelectorAll('.spd').forEach(b => b.classList.toggle('on', +b.dataset.s === simSpeed));
    document.querySelectorAll('.spd').forEach(b => b.addEventListener('click', () => {
      simSpeed = +b.dataset.s;
      try { localStorage.setItem('metro_speed', String(simSpeed)); } catch (e) {}
      document.querySelectorAll('.spd').forEach(x => x.classList.toggle('on', +x.dataset.s === simSpeed));
    }));

    const achEl = document.getElementById('ach');
    document.getElementById('bAch').addEventListener('click', () => { renderAch(); achEl.classList.remove('hidden'); });
    document.getElementById('bCloseAch').addEventListener('click', () => achEl.classList.add('hidden'));

    const rankEl = document.getElementById('rank');
    document.getElementById('bRank').addEventListener('click', () => { rankEl.classList.remove('hidden'); renderRank(); });
    document.getElementById('bCloseRank').addEventListener('click', () => rankEl.classList.add('hidden'));

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
      updateSide(); renderLineCtrl(); renderChapterUI(); save();
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
      update(dt * simSpeed);
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
