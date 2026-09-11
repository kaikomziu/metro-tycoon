-- METRO TYCOON デイリーチャレンジ用テーブル
-- Supabase の SQL Editor でこのファイルの内容をそのまま実行してください。
-- (プロジェクト: kifnzvktwbomxthzvvgy、既存の他ゲームと相乗りのため metro_ プレフィックスを使用)

create table if not exists public.metro_daily_scores (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  name text not null default 'なぞの社長',
  score bigint not null,
  created_at timestamptz not null default now(),
  constraint metro_daily_name_len check (char_length(name) between 1 and 20),
  constraint metro_daily_score_range check (score >= 0)
);

create index if not exists metro_daily_scores_day_idx on public.metro_daily_scores(day, score desc);

alter table public.metro_daily_scores enable row level security;

drop policy if exists metro_daily_select on public.metro_daily_scores;
create policy metro_daily_select on public.metro_daily_scores
  for select using (true);

drop policy if exists metro_daily_insert on public.metro_daily_scores;
create policy metro_daily_insert on public.metro_daily_scores
  for insert with check (
    char_length(name) between 1 and 20
    and score >= 0
  );
