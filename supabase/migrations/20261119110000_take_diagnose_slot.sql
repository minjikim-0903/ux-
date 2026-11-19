-- 진단 횟수 확인과 기록을 한 번에 처리해요. 사용자별 잠금을 걸어서 동시에 여러 번 눌러도 정확히 세요.
-- 서버(service role)만 호출할 수 있어요.
create or replace function public.take_diagnose_slot(p_user uuid, p_limit int, p_window interval)
returns table (ok boolean, remaining int, retry_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
  oldest timestamptz;
begin
  -- 같은 사용자의 요청은 순서대로 처리돼요 (트랜잭션이 끝나면 잠금이 풀려요).
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select count(*) into used
  from diagnosis_attempts
  where user_id = p_user and created_at >= now() - p_window;

  if used >= p_limit then
    -- 한도를 넘었으면, 하나가 기간 밖으로 빠지는 시각을 알려줘요.
    select created_at into oldest
    from diagnosis_attempts
    where user_id = p_user and created_at >= now() - p_window
    order by created_at asc
    offset used - p_limit limit 1;
    return query select false, 0, oldest + p_window;
    return;
  end if;

  insert into diagnosis_attempts (user_id) values (p_user);
  return query select true, p_limit - used - 1, null::timestamptz;
end;
$$;

revoke all on function public.take_diagnose_slot(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.take_diagnose_slot(uuid, int, interval) to service_role;
