import "server-only";
import { supabaseAdmin } from "./supabase/server";

// 사용 횟수 제한. 봇이 진단을 반복해 AI 비용이 나가는 걸 막아요. (CAPTCHA는 정식 공개 전에 추가 예정)

export const DIAGNOSE_LIMIT = 5;
const DIAGNOSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Slot = { ok: true; remaining: number } | { ok: false; retryAt: Date };

/**
 * 진단 1회를 기록하고, 24시간 안에 DIAGNOSE_LIMIT회를 넘으면 거절해요.
 * 세기와 기록을 DB 함수(take_diagnose_slot) 안에서 사용자별 잠금을 걸고 한 번에 해서,
 * 동시에 여러 번 눌러도 정확히 DIAGNOSE_LIMIT회까지만 통과해요.
 */
export async function takeDiagnoseSlot(userId: string): Promise<Slot> {
  const { data, error } = await supabaseAdmin().rpc("take_diagnose_slot", {
    p_user: userId,
    p_limit: DIAGNOSE_LIMIT,
    p_window: `${DIAGNOSE_WINDOW_MS / 1000} seconds`,
  });
  if (error) throw error;
  const row = (data as { ok: boolean; remaining: number; retry_at: string | null }[])[0];
  return row.ok ? { ok: true, remaining: row.remaining } : { ok: false, retryAt: new Date(row.retry_at!) };
}

/** 남은 진단 횟수 (기록하지 않고 세기만 해요). */
export async function remainingDiagnoses(userId: string): Promise<number> {
  const since = new Date(Date.now() - DIAGNOSE_WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin()
    .from("diagnosis_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return Math.max(0, DIAGNOSE_LIMIT - (count ?? 0));
}

// 미리보기: 로그인 전이라 IP 기준으로 짧게 막아요. 서버 메모리에 두는 간단한 방식이에요.
const PREVIEW_LIMIT = 20;
const PREVIEW_WINDOW_MS = 10 * 60 * 1000;
const g = globalThis as typeof globalThis & { __previewHits?: Map<string, number[]> };
const previewHits = (g.__previewHits ??= new Map());

export function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** 이 IP가 10분 안에 미리보기를 PREVIEW_LIMIT회 넘게 불렀으면 true. */
export function previewLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (previewHits.get(ip) ?? []).filter((t: number) => now - t < PREVIEW_WINDOW_MS);
  if (hits.length >= PREVIEW_LIMIT) {
    previewHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  previewHits.set(ip, hits);
  if (previewHits.size > 5000) previewHits.delete(previewHits.keys().next().value!);
  return false;
}

/** "오후 3:20"처럼 다시 할 수 있는 시각을 한국 시간으로 보여줘요. 날짜가 다르면 날짜도 붙여요. */
export function formatRetry(at: Date): string {
  const sameDay = at.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) === new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return at.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(sameDay ? {} : { month: "long", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}
