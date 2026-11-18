import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 12_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const KEYWORDS = [
  "자동결제", "자동 결제", "자동갱신", "자동 갱신", "정기결제", "무료", "체험",
  "해지", "취소", "환불", "배송비", "추가 요금", "부가세", "약정",
  "약관", "동의", "개인정보", "필수", "선택",
  "리뷰", "후기", "평점", "보안", "안전", "인증", "사업자",
  "추천", "인기", "베스트", "할인", "쿠폰", "한정", "마감",
];

export type PageData = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  description: string;
  headings: string[];
  ctas: string[];
  forms: {
    fieldCount: number;
    requiredCount: number;
    fields: { type: string; label: string; required: boolean }[];
  }[];
  prices: string[];
  keywordHits: Record<string, number>;
  text: string;
  textTruncated: boolean;
  likelyClientRendered: boolean;
};

export class FetchPageError extends Error {}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchPageError(`주소 형식이 올바르지 않아요: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new FetchPageError("http 또는 https 주소만 진단할 수 있어요.");
  }
  if (process.env.ALLOW_PRIVATE_URLS === "true") return u;
  const { address } = await lookup(u.hostname).catch(() => {
    throw new FetchPageError(`도메인을 찾을 수 없어요: ${u.hostname}`);
  });
  if (isPrivateIp(address)) {
    throw new FetchPageError(
      "내부망이나 localhost 주소는 막혀 있어요. 로컬에서 테스트하려면 .env.local에 ALLOW_PRIVATE_URLS=true를 넣어주세요.",
    );
  }
  return u;
}

async function fetchHtml(raw: string): Promise<{ html: string; finalUrl: string; status: number }> {
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; UXCheckBot/0.1)",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
    }).catch((e: Error) => {
      throw new FetchPageError(
        e.name === "TimeoutError" ? `페이지 응답이 10초 안에 오지 않았어요: ${current}` : `페이지를 열 수 없어요: ${current}`,
      );
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new FetchPageError(`HTML 페이지가 아니에요 (${type || "형식 없음"}): ${current}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new FetchPageError(`페이지가 너무 커요 (2MB 초과): ${current}`);
    return { html: new TextDecoder("utf-8").decode(buf), finalUrl: u.toString(), status: res.status };
  }
  throw new FetchPageError(`리다이렉트가 너무 많아요: ${raw}`);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function extractPage(url: string): Promise<PageData> {
  const { html, finalUrl, status } = await fetchHtml(url);
  return parseHtml(html, url, finalUrl, status);
}

/** HTML 문자열에서 진단용 데이터를 뽑아요. 브라우저로 그린 HTML(capture.ts)에도 써요. */
export function parseHtml(html: string, url: string, finalUrl: string, status: number): PageData {
  // 태그 앞에 공백을 넣어 요소 사이 글자가 붙지 않게 해요 ("기록모든" → "기록 모든")
  const $ = cheerio.load(html.replace(/</g, " <"));
  $("script, style, noscript, svg, template, iframe").remove();

  const headings = $("h1, h2, h3")
    .map((_, el) => `${el.tagName.toUpperCase()}: ${clean($(el).text())}`)
    .get()
    .filter((h) => h.length > 4)
    .slice(0, 40);

  const ctas = Array.from(
    new Set(
      $('button, [role="button"], input[type="submit"], a[class*="btn"], a[class*="button"]')
        .map((_, el) => clean($(el).text() || $(el).attr("value") || $(el).attr("aria-label") || ""))
        .get()
        .filter((t) => t && t.length <= 40),
    ),
  ).slice(0, 60);

  const forms = $("form")
    .map((_, form) => {
      const fields = $(form)
        .find("input, select, textarea")
        .filter((_, el) => !["hidden", "submit", "button"].includes(($(el).attr("type") ?? "").toLowerCase()))
        .map((_, el) => {
          const $el = $(el);
          const id = $el.attr("id");
          const label =
            (id && clean($(`label[for="${id}"]`).text())) ||
            clean($el.closest("label").text()) ||
            $el.attr("placeholder") ||
            $el.attr("aria-label") ||
            $el.attr("name") ||
            "";
          return {
            type: el.tagName === "input" ? ($el.attr("type") ?? "text") : el.tagName,
            label: label.slice(0, 60),
            required: $el.attr("required") !== undefined || $el.attr("aria-required") === "true",
          };
        })
        .get();
      return { fieldCount: fields.length, requiredCount: fields.filter((f) => f.required).length, fields };
    })
    .get()
    .filter((f) => f.fieldCount > 0)
    .slice(0, 5);

  const fullText = clean($("body").text());
  const prices = Array.from(
    new Set(fullText.match(/(?:₩\s?\d[\d,]*|\d[\d,]*\s?원|\$\s?\d[\d,.]*|월\s?\d[\d,]*)/g) ?? []),
  ).slice(0, 30);

  const keywordHits: Record<string, number> = {};
  for (const k of KEYWORDS) {
    const n = fullText.split(k).length - 1;
    if (n > 0) keywordHits[k] = n;
  }

  return {
    url,
    finalUrl,
    status,
    title: clean($("title").first().text()),
    description: $('meta[name="description"]').attr("content") ?? "",
    headings,
    ctas,
    forms,
    prices,
    keywordHits,
    text: fullText.slice(0, MAX_TEXT),
    textTruncated: fullText.length > MAX_TEXT,
    likelyClientRendered: fullText.length < 300,
  };
}
