-- METRO TYCOON 世界ランキング用テーブル
-- Supabase の SQL Editor でこのファイルの内容をそのまま実行してください。
-- (プロジェクト: kifnzvktwbomxthzvvgy、既存の他ゲームと相乗りのため metro_ プレフィックスを使用)

create table if not exists public.metro_scores (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'なぞの社長',
  time_sec numeric not null,
  stations int not null default 0,
  delivered int not null default 0,
  earned bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint metro_scores_name_len check (char_length(name) between 1 and 20),
  constraint metro_scores_time_range check (time_sec > 0 and time_sec < 1000000),
  constraint metro_scores_stations_range check (stations >= 0 and stations < 1000),
  constraint metro_scores_delivered_range check (delivered >= 0),
  constraint metro_scores_earned_range check (earned >= 0)
);

alter table public.metro_scores enable row level security;

-- 他ゲーム(HOLD ON等)と同じ相乗りオリジンでの実績: ポリシーに "to anon" を付けず
-- 全ロールに開放しておく(共通originで他ゲームのSupabaseログインを拾った場合でも弾かれないため)。
drop policy if exists metro_scores_select on public.metro_scores;
create policy metro_scores_select on public.metro_scores
  for select using (true);

drop policy if exists metro_scores_insert on public.metro_scores;
create policy metro_scores_insert on public.metro_scores
  for insert with check (
    char_length(name) between 1 and 20
    and time_sec > 0 and time_sec < 1000000
    and stations >= 0 and stations < 1000
    and delivered >= 0
    and earned >= 0
  );
