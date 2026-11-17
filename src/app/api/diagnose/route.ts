import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractPage, FetchPageError, type PageData } from "@/lib/extract";
import { SYSTEM_PROMPT } from "@/lib/rubric";
import { ReportSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  steps: z
    .array(z.object({ url: z.string().min(1), label: z.string().optional() }))
    .min(1)
    .max(4),
});

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

export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "URL을 1~4개 입력해주세요." }, { status: 400 });
  }
  const { steps } = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "API 키가 없어요. .env.local 파일에 ANTHROPIC_API_KEY를 넣고 서버를 다시 켜주세요." },
      { status: 500 },
    );
  }

  let pages: PageData[];
  try {
    pages = await Promise.all(steps.map((s) => extractPage(s.url.trim())));
  } catch (e) {
    if (e instanceof FetchPageError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  const userContent =
    `다음 ${pages.length}단계 플로우를 진단해주세요.\n\n` +
    pages.map((p, i) => describePage(i, steps[i].label, p)).join("\n\n---\n\n");

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "AI가 이 페이지 진단을 거절했어요. 다른 페이지로 시도해주세요." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json({ error: "리포트를 끝까지 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
    }

    return NextResponse.json({
      report: response.parsed_output,
      pages: pages.map((p) => ({ url: p.finalUrl, title: p.title, likelyClientRendered: p.likelyClientRendered })),
      usage: response.usage,
    });
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
}
