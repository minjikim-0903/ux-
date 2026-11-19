"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AiMadePopup } from "@/components/ai-made-popup";
import { ReportView, type Shot } from "@/components/report";
import type { Report } from "@/lib/schema";
import { currentUserId, supabaseBrowser } from "@/lib/supabase/browser";

type StoredCapture = {
  path: string;
  width: number;
  height: number;
  elements: { id: string; x: number; y: number; w: number; h: number }[];
} | null;

type State =
  | { kind: "loading" }
  | { kind: "missing"; message: string }
  | { kind: "ready"; report: Report; shots: (Shot | null)[]; createdAt: string; urls: string[]; askAiMade: boolean };

export default function SavedReport() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 새 익명 계정을 만들지 않아요. 진단한 브라우저의 계정이 있을 때만 볼 수 있어요.
      if (!(await currentUserId())) {
        return setState({ kind: "missing", message: "이 진단은 진단한 브라우저에서만 볼 수 있어요." });
      }
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("diagnoses")
        .select("report, captures, created_at, steps, ai_made")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        return setState({ kind: "missing", message: "진단을 찾을 수 없거나, 볼 수 있는 권한이 없어요." });
      }

      const captures = (data.captures ?? []) as StoredCapture[];
      const paths = captures.filter((c): c is NonNullable<StoredCapture> => Boolean(c)).map((c) => c.path);
      const signed = paths.length
        ? (await sb.storage.from("screenshots").createSignedUrls(paths, 60 * 60)).data ?? []
        : [];
      const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]));
      const shots = captures.map((c) =>
        c && urlOf.get(c.path)
          ? {
              image: urlOf.get(c.path)!,
              width: c.width,
              height: c.height,
              elements: c.elements.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
            }
          : null,
      );
      if (cancelled) return;
      setState({
        kind: "ready",
        report: data.report as Report,
        shots,
        createdAt: data.created_at as string,
        urls: (data.steps as { url: string }[]).map((s) => s.url),
        askAiMade: data.ai_made === null,
      });
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <main className="wrap">
      <Link href="/" className="link-btn back">← 새로 진단하기</Link>

      {state.kind === "loading" && <div className="loading"><span className="pulse" />진단 기록을 불러오고 있어요.</div>}

      {state.kind === "missing" && (
        <div className="r-empty">
          <p>{state.message}</p>
          <Link href="/" className="btn primary">새로 진단하기</Link>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <p className="hint">
            {new Date(state.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })} 진단 ·{" "}
            {state.urls.join(" → ")}
          </p>
          <ReportView report={state.report} isSample={false} shots={state.shots} />
          {state.askAiMade && <AiMadePopup diagnosisId={id} />}
        </>
      )}
    </main>
  );
}
