import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/** 서버 전용 관리자 클라이언트. RLS를 건너뛰므로 사용자 ID를 직접 확인한 뒤에만 써요. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 없어요.");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/** 요청의 Authorization 헤더로 사용자를 확인해요. 토큰이 없거나 틀리면 null. */
export async function userFromRequest(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
