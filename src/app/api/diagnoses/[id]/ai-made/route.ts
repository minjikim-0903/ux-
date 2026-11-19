import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, userFromRequest } from "@/lib/supabase/server";

// 리포트 아래 팝업의 "AI로 만든 서비스인가요?" 답을 저장해요. 자기 진단에만 쓸 수 있어요.
const BodySchema = z.object({
  ai_made: z.boolean(),
  ai_tool: z.string().max(40).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "임시 계정을 확인하지 못했어요." }, { status: 401 });

  const { ai_made, ai_tool } = parsed.data;
  const { data, error } = await supabaseAdmin()
    .from("diagnoses")
    .update({ ai_made, ai_tool: ai_made ? ai_tool || null : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "진단을 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
