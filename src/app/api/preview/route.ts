import { NextResponse } from "next/server";
import { z } from "zod";
import { capturePageCached } from "@/lib/capture";
import { FetchPageError } from "@/lib/extract";
import { urlProblem } from "@/lib/guard";

// 메인에서 "진단하기"를 누르면 입력한 링크의 화면을 미리 보여줘요.
// 찍은 화면은 잠깐 보관했다가 진단할 때 다시 써요 (capturePageCached).
export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({ url: z.string().trim().min(1).max(2000) });

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e.toLowerCase()] ?? m,
  );
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "링크를 입력해주세요." }, { status: 400 });
  const { url } = parsed.data;

  const problem = await urlProblem([url]);
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });

  try {
    const c = await capturePageCached(url);
    const title = decodeEntities(c.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    return NextResponse.json({
      image: `data:image/jpeg;base64,${c.image}`,
      width: c.width,
      height: c.height,
      finalUrl: c.finalUrl,
      title,
    });
  } catch (e) {
    if (e instanceof FetchPageError) return NextResponse.json({ error: e.message }, { status: 422 });
    // 브라우저를 띄울 수 없는 환경(지금의 Vercel 등)
    console.warn("[preview] 미리보기 실패:", (e as Error).message);
    return NextResponse.json({ error: "지금은 화면 미리보기를 불러올 수 없어요." }, { status: 503 });
  }
}
