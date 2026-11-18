import { lookup } from "node:dns/promises";
import net from "node:net";
import type { Browser } from "playwright";
import { assertPublicUrl, FetchPageError, isPrivateIp } from "./extract";

// 실제 브라우저로 페이지를 열어 스크린샷과 화면 요소 위치를 가져와요.
// 자바스크립트로 그려지는 페이지(React 등)도 읽을 수 있어요.

const VIEWPORT = { width: 1280, height: 800 };
const MAX_SHOT_HEIGHT = 2400; // 이보다 긴 페이지는 위쪽만 찍어요 (AI 이미지 비용 제한)
const NAV_TIMEOUT_MS = 20_000;
const MAX_ELEMENTS = 80;

export type CapturedElement = {
  id: string; // e1, e2 … AI가 이 id로 문제 위치를 가리켜요
  kind: "heading" | "button" | "link" | "input" | "price" | "text";
  text: string;
  x: number; y: number; w: number; h: number; // 스크린샷 기준 px
};

export type Capture = {
  finalUrl: string;
  status: number;
  html: string; // 브라우저가 그린 뒤의 HTML
  image: string; // base64 JPEG
  width: number;
  height: number;
  elements: CapturedElement[];
};

/** 남이 넣은 링크를 서버 브라우저로 열기 때문에, 페이지가 내부망으로 보내는 요청은 전부 막아요. */
function makeHostGuard() {
  const cache = new Map<string, Promise<boolean>>();
  return (raw: string): Promise<boolean> => {
    if (process.env.ALLOW_PRIVATE_URLS === "true") return Promise.resolve(true);
    let u: URL;
    try { u = new URL(raw); } catch { return Promise.resolve(false); }
    if (u.protocol === "data:" || u.protocol === "blob:") return Promise.resolve(true);
    if (u.protocol !== "http:" && u.protocol !== "https:") return Promise.resolve(false);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (!cache.has(host)) {
      cache.set(
        host,
        net.isIP(host)
          ? Promise.resolve(!isPrivateIp(host))
          : lookup(host, { all: true })
              .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address)))
              .catch(() => false),
      );
    }
    return cache.get(host)!;
  };
}

// 브라우저 안에서 실행할 코드예요. 빌드 도구가 함수를 변환하면 브라우저에서 깨질 수 있어서 문자열로 둬요.
const COLLECT_ELEMENTS = `({ maxH, limit }) => {
  const PRICE = /(₩\\s?\\d[\\d,]*|\\d[\\d,]*\\s?원|\\$\\s?\\d[\\d,.]*)/;
  const clean = (s) => s.replace(/\\s+/g, " ").trim().slice(0, 60);
  const seen = new Set();
  const out = [];
  const add = (el, kind, text) => {
    if (seen.has(el) || out.length >= limit) return;
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY;
    const style = getComputedStyle(el);
    if (r.width < 4 || r.height < 4 || y > maxH || style.visibility === "hidden" || style.opacity === "0") return;
    seen.add(el);
    out.push({ kind, text: clean(text), x: Math.round(r.left + window.scrollX), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) });
  };
  const label = (el) => (el.textContent || "").trim() || el.value || el.placeholder || el.getAttribute("aria-label") || el.name || "";
  document.querySelectorAll("h1, h2, h3").forEach((el) => add(el, "heading", el.textContent || ""));
  document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach((el) => add(el, "button", label(el)));
  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach((el) => add(el, "input", label(el)));
  // 가격: 가격 글자를 직접 가진 가장 안쪽 요소
  document.querySelectorAll("body *").forEach((el) => {
    if (el.children.length > 2) return;
    const t = el.textContent || "";
    if (t.length < 40 && PRICE.test(t)) add(el, "price", t);
  });
  document.querySelectorAll("a[href]").forEach((el) => { const t = label(el); if (t) add(el, "link", t); });
  // 작은 글씨 안내문(약관, 자동결제 고지 등)
  document.querySelectorAll("p, small, span, li").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (el.children.length === 0 && t.length >= 10 && t.length <= 120 && parseFloat(getComputedStyle(el).fontSize) <= 12) add(el, "text", t);
  });
  return out;
}`;

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright")
      .then(({ chromium }) => chromium.launch())
      .catch((e) => { browserPromise = null; throw e; });
  }
  const b = await browserPromise;
  if (!b.isConnected()) { browserPromise = null; return getBrowser(); }
  return b;
}

export async function capturePage(url: string): Promise<Capture> {
  await assertPublicUrl(url);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "ko-KR",
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const isAllowed = makeHostGuard();
  await context.route("**/*", async (route) => {
    if (await isAllowed(route.request().url())) return route.continue();
    return route.abort("blockedbyclient");
  });

  try {
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch((e: Error) => {
      throw new FetchPageError(
        e.name === "TimeoutError" ? `페이지가 20초 안에 열리지 않았어요: ${url}` : `페이지를 열 수 없어요: ${url}`,
      );
    });
    if (!res) throw new FetchPageError(`페이지를 열 수 없어요: ${url}`);
    // 화면이 다 그려질 때까지 조금 기다려요. 요청이 끝나지 않는 페이지도 있어서 실패해도 넘어가요.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(500);

    const finalUrl = page.url();
    if (!(await isAllowed(finalUrl))) throw new FetchPageError("내부망 주소로 이동하는 페이지는 진단할 수 없어요.");

    const height = await page.evaluate(
      (max) => Math.min(Math.max(document.documentElement.scrollHeight, window.innerHeight), max),
      MAX_SHOT_HEIGHT,
    );

    const elements = (await page.evaluate(
      `(${COLLECT_ELEMENTS})(${JSON.stringify({ maxH: height, limit: MAX_ELEMENTS })})`,
    )) as Omit<CapturedElement, "id">[];

    const shot = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: true,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height },
    });

    return {
      finalUrl,
      status: res.status(),
      html: await page.content(),
      image: shot.toString("base64"),
      width: VIEWPORT.width,
      height,
      elements: elements.map((e, i) => ({ ...e, id: `e${i + 1}`, kind: e.kind as CapturedElement["kind"] })),
    };
  } finally {
    await context.close();
  }
}
