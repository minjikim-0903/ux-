-- 로드맵 1단계: 진단 저장, 본인만 보기, 유해 사이트 차단 목록, 스크린샷 저장소
-- 원칙: 진단 기록과 스크린샷은 서버(service role)만 쓴다. 사용자가 직접 넣은 가짜 진단으로 데이터가 오염되지 않게.
--       사용자는 자기 기록만 보고 지울 수 있다.

-- 진단 기록
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  steps jsonb not null,                    -- [{ url, label }]
  context text,                            -- 사용자가 적은 서비스 설명
  ai_made boolean,                         -- AI로 만든 서비스인가? null = 답하지 않음
  ai_tool text,                            -- Lovable, Bolt, v0, Cursor, Claude Code, 기타
  report jsonb not null,                   -- AI 진단 결과 (schema.ts의 ReportSchema)
  captures jsonb not null default '[]',    -- 단계별 [{ path, width, height, elements }] 또는 null
  model text,
  usage jsonb                              -- AI 토큰 사용량 (비용 계산용)
);

create index diagnoses_user_created_idx on public.diagnoses (user_id, created_at desc);

alter table public.diagnoses enable row level security;

create policy "본인 진단만 조회" on public.diagnoses
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 진단만 삭제" on public.diagnoses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 차단 도메인 (불법·유해 사이트). 정책이 없어서 서버만 읽고 쓴다.
create table public.blocked_domains (
  domain text primary key,
  category text not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.blocked_domains enable row level security;

-- 스크린샷 저장소 (비공개). 경로: {user_id}/{diagnosis_id}/{단계}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 5242880, array['image/jpeg']);

create policy "본인 폴더 스크린샷만 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
