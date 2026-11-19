"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAccessToken } from "@/lib/supabase/browser";

const AI_TOOLS = ["Lovable", "Bolt", "v0", "Cursor", "Claude Code", "Replit", "기타"];
const KEY = (id: string) => `ai-made-answered:${id}`;

function answeredBefore(id: string): boolean {
  try { return localStorage.getItem(KEY(id)) === "1"; } catch { return false; }
}
function rememberAnswered(id: string) {
  try { localStorage.setItem(KEY(id), "1"); } catch { /* 저장 안 돼도 서버에는 저장됨 */ }
}

/**
 * 리포트를 맨 아래까지 보면 "AI로 만든 서비스인가요?"를 묻는 팝업.
 * 필수 질문이라 닫기 버튼이 없고, 답하면 닫혀요. 이 컴포넌트를 리포트 맨 끝에 두세요.
 */
export function AiMadePopup({ diagnosisId }: { diagnosisId: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [aiMade, setAiMade] = useState<boolean | null>(null);
  const [tool, setTool] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 맨 아래(이 컴포넌트 위치)가 화면에 들어오면 열어요.
  useEffect(() => {
    if (answeredBefore(diagnosisId) || !sentinel.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setOpen(true); io.disconnect(); }
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [diagnosisId]);

  // 열려 있는 동안 뒤 화면 스크롤을 막고, 첫 버튼에 포커스를 줘요.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstBtn.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  async function send(made: boolean, aiTool: string | null) {
    setSending(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const res = await fetch(`/api/diagnoses/${diagnosisId}/ai-made`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ai_made: made, ai_tool: aiTool }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "저장하지 못했어요.");
      rememberAnswered(diagnosisId);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="popup-sentinel" />
      {open && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-made-title">
            <p className="modal-cheer">뿌르르이야하!</p>
            <h2 id="ai-made-title">AI로 만든 서비스인가요?</h2>
            <p className="modal-sub">더 나은 서비스를 위해 피드백 푸릿!</p>

            <div className="seg modal-choice">
              <button
                ref={firstBtn}
                type="button"
                aria-pressed={aiMade === true}
                className={aiMade === true ? "on" : ""}
                onClick={() => setAiMade(true)}
                disabled={sending}
              >
                네
              </button>
              <button type="button" onClick={() => send(false, null)} disabled={sending}>
                아니요
              </button>
            </div>

            {aiMade && (
              <>
                <p className="label">어떤 도구로 만들었나요?</p>
                <div className="seg tools" role="group" aria-label="사용한 도구">
                  {AI_TOOLS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={tool === t}
                      className={tool === t ? "on" : ""}
                      onClick={() => setTool(tool === t ? "" : t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn primary modal-send" onClick={() => send(true, tool || null)} disabled={sending}>
                  {sending ? "보내는 중…" : "보내기"}
                </button>
              </>
            )}
            {error && <p className="modal-error" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
