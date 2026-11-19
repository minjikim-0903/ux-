-- 진단 전에 받는 서비스 정보: 도메인(업종), 누가 쓰는지(사용자), 이 페이지의 목적
alter table public.diagnoses
  add column domain text,
  add column audience text,
  add column goal text;
