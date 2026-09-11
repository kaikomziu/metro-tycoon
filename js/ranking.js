// 世界ランキング (Supabase)。ストーリーモードのクリアタイムを競う。
// テーブルが未作成の間は fetchTop/submit が例外を投げるので呼び出し側でハンドリングすること。
window.MetroRanking = (function () {
  'use strict';
  const URL = 'https://kifnzvktwbomxthzvvgy.supabase.co';
  // 同一Supabaseプロジェクトで実際に書き込みに使われている従来形式(JWT)のanon key。
  // 新形式のpublishable keyはINSERTが403で弾かれるため使わない(他ゲームで既知の問題)。
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZm56dmt0d2JvbXh0aHp2dmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzgxMzgsImV4cCI6MjA5MzQxNDEzOH0.M7nXP-u--6J_6rRpgz1cJj21_7KX6MtfTmZy77Xf_IE';
  const TABLE = 'metro_scores';
  const DAILY_TABLE = 'metro_daily_scores';
  const NAME_KEY = 'metro_ranking_name';

  function headers(extra) {
    const h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    return extra ? Object.assign(h, extra) : h;
  }

  function getName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function setName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ }
  }

  async function fetchTop(limit) {
    const res = await fetch(
      URL + '/rest/v1/' + TABLE + '?select=name,time_sec,stations,delivered,earned&order=time_sec.asc&limit=' + (limit || 50),
      { headers: headers() }
    );
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  async function submit(row) {
    const res = await fetch(URL + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify([row]),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  async function dailyTop(day, limit) {
    const res = await fetch(
      URL + '/rest/v1/' + DAILY_TABLE + '?select=name,score&day=eq.' + encodeURIComponent(day) +
        '&order=score.desc&limit=' + (limit || 20),
      { headers: headers() }
    );
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  async function dailySubmit(row) {
    const res = await fetch(URL + '/rest/v1/' + DAILY_TABLE, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify([row]),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  return { fetchTop, submit, dailyTop, dailySubmit, getName, setName };
})();
