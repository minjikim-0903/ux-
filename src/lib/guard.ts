import "server-only";
import { supabaseAdmin } from "./supabase/server";

// 불법·유해 사이트 차단. 여러 방법을 겹쳐 써요 (docs/PLAN.md 8번).
// 1) 차단 목록(blocked_domains) → 2) Google Safe Browsing(키가 있을 때) → 3) AI 판별(route.ts에서 site_category)

export const CATEGORY_TEXT: Record<string, string> = {
  gambling: "도박",
  adult: "성인",
  phishing: "피싱·사기",
  illegal_goods: "불법 상품",
  other_harmful: "불법·유해",
  malware: "악성코드·피싱",
};

export function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/** sub.example.com이면 sub.example.com, example.com 둘 다 확인해요. */
function hostCandidates(host: string): string[] {
  const parts = host.split(".");
  return parts.slice(0, -1).map((_, i) => parts.slice(i).join("."));
}

export async function findBlocked(urls: string[]): Promise<{ domain: string; category: string } | null> {
  const hosts = Array.from(new Set(urls.flatMap((u) => hostCandidates(hostOf(u)))));
  const { data, error } = await supabaseAdmin().from("blocked_domains").select("domain, category").in("domain", hosts).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function blockDomain(url: string, category: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("blocked_domains")
    .upsert({ domain: hostOf(url), category, reason }, { onConflict: "domain", ignoreDuplicates: true });
  if (error) console.error("[guard] 차단 목록 저장 실패:", error.message);
}

const APP_STORE = /^(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)$/;

/**
 * 진단·미리보기 전에 링크를 검사해요. 문제가 없으면 null.
 * 주소 형식 → 앱스토어 링크 → 차단 목록 → Safe Browsing 순서예요.
 */
export async function urlProblem(urls: string[]): Promise<{ status: number; error: string } | null> {
  try {
    urls.forEach(hostOf);
  } catch {
    return { status: 400, error: "주소 형식이 올바르지 않아요. https://로 시작하는 주소를 넣어주세요." };
  }
  if (urls.some((u) => APP_STORE.test(new URL(u).hostname))) {
    return { status: 400, error: "앱은 진단할 수 없어요. 웹페이지 링크를 넣어주세요. (앱스토어·플레이스토어 페이지도 안 돼요)" };
  }
  const blocked = await findBlocked(urls);
  if (blocked) {
    return { status: 403, error: `${CATEGORY_TEXT[blocked.category] ?? "유해"} 사이트로 분류된 주소라 진단할 수 없어요.` };
  }
  const unsafe = await safeBrowsingHit(urls);
  if (unsafe) {
    await blockDomain(unsafe, "malware", "Google Safe Browsing");
    return { status: 403, error: "악성코드나 피싱으로 알려진 사이트라 진단할 수 없어요." };
  }
  return null;
}

/** GOOGLE_SAFE_BROWSING_KEY가 있을 때만 검사해요. 검사 실패는 진단을 막지 않아요. */
export async function safeBrowsingHit(urls: string[]): Promise<string | null> {
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        client: { clientId: "ux-check", clientVersion: "0.1" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: { threat: { url: string } }[] };
    return data.matches?.[0]?.threat.url ?? null;
  } catch {
    return null;
  }
}
