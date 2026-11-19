"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** 브라우저용 Supabase 클라이언트. 세션은 이 브라우저(localStorage)에 저장돼요. */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return client;
}

/** 지금 세션의 access token. 없으면 익명 계정을 만들어요 (진단 버튼을 누를 때만 호출). */
export async function ensureAccessToken(): Promise<string> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: created, error } = await sb.auth.signInAnonymously();
  if (error || !created.session) {
    throw new Error(
      error?.message.includes("disabled")
        ? "익명 로그인이 꺼져 있어요. Supabase에서 Allow anonymous sign-ins를 켜주세요."
        : "임시 계정을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }
  return created.session.access_token;
}

/** 세션이 이미 있을 때만 돌려줘요. 기록 보기처럼 새 계정을 만들면 안 되는 곳에서 써요. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.user.id ?? null;
}
