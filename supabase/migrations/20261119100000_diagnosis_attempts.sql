-- 진단 횟수 제한용 시도 기록. 진단을 시작할 때마다 한 줄씩 쌓여요 (AI 비용은 저장 여부와 관계없이 들어서).
-- 정책이 없어서 서버(service role)만 읽고 써요.
create table public.diagnosis_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index diagnosis_attempts_user_created_idx on public.diagnosis_attempts (user_id, created_at desc);

alter table public.diagnosis_attempts enable row level security;
