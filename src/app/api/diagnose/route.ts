import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { capturePageCached, type Capture } from "@/lib/capture";
import { extractPage, FetchPageError, parseHtml, type PageData } from "@/lib/extract";
import { blockDomain, CATEGORY_TEXT, urlProblem } from "@/lib/guard";
import { DIAGNOSE_LIMIT, formatRetry, takeDiagnoseSlot } from "@/lib/limits";
import { SYSTEM_PROMPT } from "@/lib/rubric";
import { DOMAINS, INFO_MAX } from "@/lib/service-info";
import { type Report, ReportSchema } from "@/lib/schema";
import { supabaseAdmin, userFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  steps: z
    .array(z.object({ url: z.string().min(1), label: z.string().optional() }))
    .min(1)
    .max(4),
  // 진단 전에 받는 서비스 정보 (메인에서 필수로 받아요)
  domain: z.enum(DOMAINS),
  audience: z.string().trim().min(1).max(INFO_MAX),
  goal: z.string().trim().min(1).max(INFO_MAX),
});

const MODEL = "claude-opus-5-5";
// API 크레딧 없이 저장·화면 흐름을 테스트할 때만 써요. 배포 환경에서는 절대 켜지지 않아요.
const MOCK = process.env.DIAGNOSE_MOCK === "true" && process.env.NODE_ENV !== "production";

type StepResult = { page: PageData; capture: Capture | null };

/** 테스트용 가짜 리포트. 캡처한 요소 중 앞쪽 몇 개를 골라 핀이 찍히게 만들어요. */
function mockReport(results: StepResult[], steps: { url: string; label?: string }[]): Report {
  const picks = results.flatMap(({ capture }, i) =>
    (capture?.elements ?? [])
      .filter((e) => ["button", "price", "heading"].includes(e.kind))
      .slice(0, 2)
      .map((e) => ({ step: i + 1, e })),
  ).slice(0, 3);
  return {
    site_category: "normal",
    verdict_headline: "[테스트] 가짜 리포트예요. 실제 AI 진단이 아니에요.",
    verdict_highlight: "가짜 리포트",
    steps: steps.map((s, i) => ({ label: s.label || `${i + 1}단계`, url: s.url, risk: "mid" as const })),
    reasons: picks.map(({ step, e }, i) => ({
      rank: i + 1,
      step_index: step,
      step_label: steps[step - 1].label || `${step}단계`,
      element_id: e.id,
      principles: ["테스트"],
      confidence: "low" as const,
      problem: `[테스트] "${e.text}" 요소를 가리키는 가짜 문제예요.`,
      hypothesis: "[테스트] 가짜 가설이에요.",
      suggestion: "[테스트] 가짜 제안이에요.",
      effect: "[테스트] 가짜 기대 효과예요.",
    })),
    limitations: ["DIAGNOSE_MOCK=true로 만든 테스트용 리포트예요."],
  };
}

/** 스크린샷을 비공개 저장소에 올리고, 진단 기록을 저장해요. 실패해도 리포트는 보여줘요. */
async function saveDiagnosis(args: {
  userId: string;
  steps: { url: string; label?: string }[];
  domain: string;
  audience: string;
  goal: string;
  report: Report;
  results: StepResult[];
  usage: unknown;
  model: string;
}): Promise<string | null> {
  const sb = supabaseAdmin();
  const id = crypto.randomUUID();
  try {
    const captures = await Promise.all(
      args.results.map(async ({ capture }, i) => {
        if (!capture) return null;
        const path = `${args.userId}/${id}/${i + 1}.jpg`;
        const { error } = await sb.storage
          .from("screenshots")
          .upload(path, Buffer.from(capture.image, "base64"), { contentType: "image/jpeg" });
        if (error) throw error;
        return { path, width: capture.width, height: capture.height, final_url: capture.finalUrl, elements: capture.elements };
      }),
    );
    const { error } = await sb.from("diagnoses").insert({
      id,
      user_id: args.userId,
      steps: args.steps,
      domain: args.domain,
      audience: args.audience,
      goal: args.goal,
      report: args.report,
      captures,
      model: args.model,
      usage: args.usage,
    });
    if (error) throw error;
    return id;
  } catch (e) {
    console.error("[save] 진단 저장 실패:", (e as Error).message);
    return null;
  }
}

const client = new Anthropic();

function describePage(i: number, label: string | undefined, p: PageData): string {
  return [
    `## ${i + 1}단계${label ? ` (사용자 라벨: ${label})` : ""}`,
    `URL: ${p.finalUrl} (HTTP ${p.status})`,
    `제목: ${p.title || "(없음)"}`,
    `설명: ${p.description || "(없음)"}`,
    `헤딩:\n${p.headings.join("\n") || "(없음)"}`,
    `버튼·CTA 문구 (${p.ctas.length}개): ${p.ctas.join(" | ") || "(없음)"}`,
    `폼: ${
      p.forms.length
        ? p.forms
            .map(
              (f, j) =>
                `폼${j + 1} 필드 ${f.fieldCount}개(필수 ${f.requiredCount}개): ` +
                f.fields.map((x) => `${x.label || "(라벨 없음)"}[${x.type}${x.required ? ",필수" : ""}]`).join(", "),
            )
            .join(" / ")
        : "(폼 없음)"
    }`,
    `가격 표기: ${p.prices.join(", ") || "(없음)"}`,
    `키워드 등장 횟수: ${
      Object.entries(p.keywordHits)
        .map(([k, n]) => `${k} ${n}`)
        .join(", ") || "(해당 없음)"
    }`,
    p.likelyClientRendered ? "주의: 본문 텍스트가 매우 짧아요. 자바스크립트로 그려지는 페이지일 수 있어요." : "",
    `본문 텍스트${p.textTruncated ? " (앞부분만, 12,000자에서 잘림)" : ""}:\n${p.text}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function readStep(url: string): Promise<StepResult> {
  try {
    const capture = await capturePageCached(url);
    const page = parseHtml(capture.html, url, capture.finalUrl, capture.status);
    return { page: { ...page, likelyClientRendered: false }, capture };
  } catch (e) {
    // 주소 자체가 막힌 경우는 그대로 알려주고, 브라우저 문제면 HTML만 읽는 방식으로 넘어가요.
    if (e instanceof FetchPageError && /내부망|주소 형식|http 또는 https|도메인/.test(e.message)) throw e;
    console.warn("[capture] 브라우저 캡처 실패, HTML만 읽어요:", (e as Error).message);
    return { page: await extractPage(url), capture: null };
  }
}

export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const error = field === "steps" || field === undefined
      ? "URL을 1~4개 입력해주세요."
      : "서비스 분야, 사용자, 목적을 모두 입력해주세요.";
    return NextResponse.json({ error }, { status: 400 });
  }
  const { steps, domain, audience, goal } = parsed.data;
  const urls = steps.map((s) => s.url.trim());

  const user = await userFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "임시 계정을 확인하지 못했어요. 새로고침한 뒤 다시 시도해주세요." }, { status: 401 });
  }

  if (!MOCK && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "API 키가 없어요. .env.local 파일에 ANTHROPIC_API_KEY를 넣고 서버를 다시 켜주세요." },
      { status: 500 },
    );
  }

  // 앱 링크·차단 목록·Safe Browsing 검사 (AI 판별은 진단 뒤에)
  const problem = await urlProblem(urls);
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });

  // 횟수 제한: 링크 검사를 통과한 진단만 1회로 세요 (계정당 24시간 5회).
  const slot = await takeDiagnoseSlot(user.id);
  if (!slot.ok) {
    return NextResponse.json(
      { error: `24시간 동안 ${DIAGNOSE_LIMIT}회까지 진단할 수 있어요. ${formatRetry(slot.retryAt)}부터 다시 할 수 있어요.`, remaining: 0 },
      { status: 429 },
    );
  }

  // 1순위: 실제 브라우저로 열어 스크린샷까지. 브라우저를 못 띄우는 환경이면 HTML만 읽어요.
  let results: StepResult[];
  try {
    results = await Promise.all(urls.map(readStep));
  } catch (e) {
    if (e instanceof FetchPageError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    {
      type: "text",
      text:
        `다음 ${results.length}단계 플로우를 진단해주세요.` +
        `\n\n# 사용자가 적은 서비스 정보\n- 도메인: ${domain}\n- 주요 사용자: ${audience}\n- 이 페이지의 목적: ${goal}`,
    },
  ];
  results.forEach(({ page, capture }, i) => {
    content.push({ type: "text", text: describePage(i, steps[i].label, page) });
    if (capture) {
      content.push({
        type: "text",
        text:
          `${i + 1}단계 화면 요소 목록 (id 종류 "글자" @x,y 크기, 스크린샷 ${capture.width}x${capture.height}px 기준):\n` +
          capture.elements.map((e) => `${e.id} ${e.kind} "${e.text}" @${e.x},${e.y} ${e.w}x${e.h}`).join("\n"),
      });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: capture.image } });
    }
  });

  let report: Report;
  let usage: unknown = null;
  try {
    if (MOCK) {
      report = mockReport(results, steps);
    } else {
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        return NextResponse.json({ error: "AI가 이 페이지 진단을 거절했어요. 다른 페이지로 시도해주세요." }, { status: 422 });
      }
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        return NextResponse.json({ error: "리포트를 끝까지 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
      }
      report = response.parsed_output;
      usage = response.usage;
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "API 키가 올바르지 않아요. .env.local의 ANTHROPIC_API_KEY를 확인해주세요." }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "요청이 많아요. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI 호출에 실패했어요 (${e.status}): ${e.message}` }, { status: 502 });
    }
    console.error(e);
    return NextResponse.json({ error: "진단 중 알 수 없는 오류가 났어요. 서버 로그를 확인해주세요." }, { status: 500 });
  }

  // AI 판별: 불법·유해 사이트면 저장하지 않고 차단 목록에 올려요.
  if (report.site_category !== "normal") {
    await Promise.all(urls.map((u) => blockDomain(u, report.site_category, "AI 판별")));
    return NextResponse.json(
      { error: `${CATEGORY_TEXT[report.site_category] ?? "유해"} 사이트로 판단돼서 진단하지 않았어요.` },
      { status: 403 },
    );
  }

  const id = await saveDiagnosis({
    userId: user.id, steps, domain, audience, goal, report, results, usage, model: MOCK ? "mock" : MODEL,
  });

  return NextResponse.json({
    id, // 저장에 실패하면 null. 리포트는 그래도 보여줘요.
    report,
    // 화면에 핀을 찍을 때 쓰는 스크린샷과 요소 위치예요. 캡처하지 못한 단계는 null이에요.
    captures: results.map(({ capture }) =>
      capture
        ? {
            image: `data:image/jpeg;base64,${capture.image}`,
            width: capture.width,
            height: capture.height,
            elements: capture.elements.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
          }
        : null,
    ),
    usage,
    remaining: slot.remaining, // 24시간 안에 남은 진단 횟수
  });
}
