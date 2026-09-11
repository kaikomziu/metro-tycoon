// 実績一覧。実績はモード・スロットを問わずアカウント共通(localStorage 'metro_ach_v1')。
// check(ctx) は true を返すと解除。ctx = { state, curMode, activeLines, edges, trains, cap }
window.METRO_ACHIEVEMENTS = [
  // 駅・路線
  { id: 'st3',    cat: '駅・路線', name: '開業準備完了',   desc: '駅を3つ保有する',            check: c => c.state.stations.length >= 3 },
  { id: 'st5',    cat: '駅・路線', name: '路線網の芽生え', desc: '駅を5つ保有する',            check: c => c.state.stations.length >= 5 },
  { id: 'st10',   cat: '駅・路線', name: '中堅鉄道会社',   desc: '駅を10保有する',             check: c => c.state.stations.length >= 10 },
  { id: 'st20',   cat: '駅・路線', name: '大手私鉄',       desc: '駅を20保有する',             check: c => c.state.stations.length >= 20 },
  { id: 'ln2',    cat: '駅・路線', name: '複線化',         desc: '2路線を同時運用する',        check: c => c.activeLines >= 2 },
  { id: 'ln3',    cat: '駅・路線', name: '三路線体制',     desc: '3路線を同時運用する',        check: c => c.activeLines >= 3 },
  { id: 'ln5',    cat: '駅・路線', name: '路線網完成',     desc: '5路線すべてを運用する',      check: c => c.activeLines >= 5 },
  { id: 'edge10', cat: '駅・路線', name: '線路職人',       desc: '線路を合計10本敷設する',      check: c => c.edges >= 10 },
  { id: 'edge25', cat: '駅・路線', name: '大工事',         desc: '線路を合計25本敷設する',      check: c => c.edges >= 25 },

  // 輸送・経営
  { id: 'd10',    cat: '輸送・経営', name: '初出発',         desc: '乗客を10人輸送する',        check: c => c.state.stats.delivered >= 10 },
  { id: 'd100',   cat: '輸送・経営', name: '通勤の足',       desc: '乗客を100人輸送する',       check: c => c.state.stats.delivered >= 100 },
  { id: 'd500',   cat: '輸送・経営', name: '都市の大動脈',   desc: '乗客を500人輸送する',       check: c => c.state.stats.delivered >= 500 },
  { id: 'd2000',  cat: '輸送・経営', name: '輸送王',         desc: '乗客を2000人輸送する',      check: c => c.state.stats.delivered >= 2000 },
  { id: 'e1000',  cat: '輸送・経営', name: '黒字化',         desc: '累計売上¥1,000を達成',      check: c => c.state.stats.earned >= 1000 },
  { id: 'e10000', cat: '輸送・経営', name: '安定経営',       desc: '累計売上¥10,000を達成',     check: c => c.state.stats.earned >= 10000 },
  { id: 'e100000', cat: '輸送・経営', name: '優良企業',      desc: '累計売上¥100,000を達成',    check: c => c.state.stats.earned >= 100000 },
  { id: 'e1000000', cat: '輸送・経営', name: '鉄道財閥',     desc: '累計売上¥1,000,000を達成',  check: c => c.state.stats.earned >= 1000000 },
  { id: 'm50000', cat: '輸送・経営', name: '資金にゆとり',   desc: '資金¥50,000を保有する',     check: c => c.state.money >= 50000 },
  { id: 'm500000', cat: '輸送・経営', name: '大富豪社長',    desc: '資金¥500,000を保有する',    check: c => c.state.money >= 500000 },

  // アップグレード
  { id: 'up1',   cat: 'アップグレード', name: '最初の投資',   desc: 'アップグレードを初めて購入する', check: c => Object.keys(c.state.upg).some(k => c.state.upg[k] > 0) },
  { id: 'upAll', cat: 'アップグレード', name: '全方位投資',   desc: '12種すべてのアップグレードを1回以上購入する', check: c => Object.keys(c.state.upg).length >= 12 && Object.values(c.state.upg).every(v => v > 0) },
  { id: 'upMax1', cat: 'アップグレード', name: '極めし技術',  desc: 'いずれかのアップグレードをMAXにする', check: c => Object.keys(c.state.upg).some(k => c.state.upg[k] >= 10 || c.state.upg[k] >= 8) },
  { id: 'cap20', cat: 'アップグレード', name: '満員電車対策', desc: '列車の定員が20人を超える', check: c => c.cap >= 20 },
  { id: 'trains10', cat: 'アップグレード', name: '大車両基地', desc: '運行中の列車が合計10両になる', check: c => c.trains >= 10 },
  { id: 'interest5', cat: 'アップグレード', name: '資産運用家', desc: '「資産運用」をLv5にする', check: c => (c.state.upg.interest || 0) >= 5 },

  // ストーリーモード
  { id: 'ch1',   cat: 'ストーリー', name: '一番列車',       desc: 'ストーリーモード第1章をクリアする', check: c => c.curMode === 'story' && (c.state.chapter || 0) >= 1 },
  { id: 'ch3',   cat: 'ストーリー', name: '路線拡大計画',   desc: 'ストーリーモード第3章をクリアする', check: c => c.curMode === 'story' && (c.state.chapter || 0) >= 3 },
  { id: 'cleared', cat: 'ストーリー', name: '大都市、完成', desc: 'ストーリーモードのエンディングを達成する', check: c => c.curMode === 'story' && !!c.state.cleared },
  { id: 'gameover', cat: 'ストーリー', name: 'ダイヤ崩壊',  desc: 'ゲームオーバーを経験する', check: c => !!c.state.over },
  { id: 'nearmiss', cat: 'ストーリー', name: '間一髪',       desc: '駅が崩壊寸前まで混雑してから持ち直す', check: c => !!c.state._nearMiss },

  // エターナルモード・その他
  { id: 'et30',   cat: 'エターナル', name: '終わらない旅',   desc: 'エターナルモードで30分プレイする', check: c => c.curMode === 'eternal' && c.state.time >= 1800 },
  { id: 'etMoney', cat: 'エターナル', name: '永遠の資産',    desc: 'エターナルモードで資金¥1,000,000を保有する', check: c => c.curMode === 'eternal' && c.state.money >= 1000000 },
  { id: 'etStations', cat: 'エターナル', name: '無限都市',   desc: 'エターナルモードで駅を15保有する', check: c => c.curMode === 'eternal' && c.state.stations.length >= 15 },
  { id: 'time60', cat: 'その他', name: '一時間耐久',        desc: '1時間プレイする（累計ではなく1回のプレイで）', check: c => c.state.time >= 3600 },
];
