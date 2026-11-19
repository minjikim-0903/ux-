"use client";

import { useState } from "react";
import { AiMadePopup } from "@/components/ai-made-popup";
import { LinkPreview } from "@/components/link-preview";
import { ReportView, type Shot } from "@/components/report";
import { EMPTY_INFO, missingInfo, type ServiceInfo, ServiceInfoFields } from "@/components/service-info-fields";
import { ensureAccessToken } from "@/lib/supabase/browser";
import type { Report } from "@/lib/schema";
import { SAMPLE_REPORT } from "@/lib/sample";

type StepInput = { label: string; url: string };

const EMPTY: StepInput = { label: "", url: "" };
const FIRST_LABEL = "홈";
const MAX_STEPS = 4;

export default function Home() {
  const [started, setStarted] = useState(false);
  const [heroUrl, setHeroUrl] = useState("");
  // 메인: 링크 입력 → (진단하기) → 서비스 정보 입력 → (진단 시작)
  const [heroStage, setHeroStage] = useState<"link" | "info">("link");
  const [heroError, setHeroError] = useState<string | null>(null);
  const [info, setInfo] = useState<ServiceInfo>(EMPTY_INFO);
  const [steps, setSteps] = useState<StepInput[]>([{ label: FIRST_LABEL, url: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [shots, setShots] = useState<(Shot | null)[]>([]);
  const [runId, setRunId] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null); // 24시간 안에 남은 진단 횟수

  const update = (i: number, key: keyof StepInput, value: string) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  async function runDiagnosis(input: StepInput[]) {
    const filled = input.filter((s) => s.url.trim());
    if (!filled.length) return setError("진단할 링크를 하나 이상 입력해주세요.");
    const missing = missingInfo(info);
    if (missing) return setError(missing);
    setLoading(true);
    setError(null);
    try {
      // 진단할 때만 익명 계정을 만들어요. 결과는 이 계정(이 브라우저)에서만 볼 수 있어요.
      const token = await ensureAccessToken();
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          steps: filled.map((s) => ({ url: s.url.trim(), label: s.label.trim() || undefined })),
          domain: info.domain,
          audience: info.audience.trim(),
          goal: info.goal.trim(),
        }),
      });
      const data = await res.json().catch(() => ({ error: "서버 응답을 읽을 수 없어요." }));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (!res.ok) throw new Error(data.error ?? "진단에 실패했어요.");
      setShots(data.captures ?? []);
      setReport(data.report);
      setRunId((n) => n + 1);
      setSavedId(data.id ?? null);
      // 저장됐으면 주소를 /r/{id}로 바꿔서 새로고침해도 다시 볼 수 있게 해요.
      if (data.id) window.history.replaceState(null, "", `/r/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "진단에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  function startFromHero(e: React.FormEvent) {
    e.preventDefault();
    // 1) 링크를 넣고 진단하기 → 서비스 정보 입력으로
    if (heroStage === "link") {
      setHeroError(null);
      return setHeroStage("info");
    }
    // 2) 서비스 정보까지 채우면 진단 시작
    const missing = missingInfo(info);
    if (missing) return setHeroError(missing);
    // 메인에서 넣은 링크는 1단계 "홈"으로 그대로 들어가요.
    const first = [{ label: FIRST_LABEL, url: heroUrl.trim() }];
    setSteps(first);
    setStarted(true);
    runDiagnosis(first);
  }

  if (!started) {
    return (
      <main className="hero">
        <h1>내 AI가 만들어준 UX,<br />괜찮을까?</h1>
        {heroStage === "link" ? (
          <>
            <form className="hero-form" onSubmit={startFromHero}>
              <input
                type="url"
                required
                placeholder="https://my-service.com"
                aria-label="진단할 페이지 링크"
                value={heroUrl}
                onChange={(e) => setHeroUrl(e.target.value)}
              />
              <button type="submit" className="btn primary">진단하기</button>
            </form>
            <p className="hero-note">웹페이지 링크만 진단할 수 있어요. 앱은 안 돼요.</p>
            <button type="button" className="link-btn" onClick={() => setStarted(true)}>
              예시 리포트 먼저 보기
            </button>
          </>
        ) : (
          <form className="hero-info" onSubmit={startFromHero}>
            <LinkPreview url={heroUrl.trim()} />
            <div className="hero-info-url">
              <span>{heroUrl}</span>
              <button type="button" className="link-btn" onClick={() => setHeroStage("link")}>링크 바꾸기</button>
            </div>
            <ServiceInfoFields value={info} onChange={(v) => { setInfo(v); setHeroError(null); }} />
            {heroError && <p className="error" role="alert">{heroError}</p>}
            <button type="submit" className="btn primary lg">진단 시작</button>
          </form>
        )}
      </main>
    );
  }

  return (
    <main className="wrap">
      <button
        type="button"
        className="link-btn back"
        onClick={() => { setStarted(false); window.history.replaceState(null, "", "/"); }}
      >
        ← 처음으로
      </button>

      <form className="form" onSubmit={(e) => { e.preventDefault(); runDiagnosis(steps); }}>
        <div className="form-head">
          <h2>진단할 페이지 링크</h2>
          <p className="hint">한 페이지만 넣어도 돼요. 랜딩 → 요금제 → 가입 → 결제처럼 순서대로 넣으면 단계별로 비교해요.</p>
        </div>
        <ServiceInfoFields value={info} onChange={setInfo} />
        {steps.map((s, i) => (
          <div className="row" key={i}>
            <span className="n">{i + 1}</span>
            <input
              className="lbl"
              placeholder="단계 이름 (선택)"
              aria-label={`${i + 1}단계 이름`}
              value={s.label}
              onChange={(e) => update(i, "label", e.target.value)}
            />
            <input
              className="url"
              type="url"
              placeholder="https://example.com/pricing"
              aria-label={`${i + 1}단계 URL`}
              value={s.url}
              onChange={(e) => update(i, "url", e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`${i + 1}단계 삭제`}
              disabled={steps.length === 1}
              onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={steps.length >= MAX_STEPS}
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY }])}
          >
            + 단계 추가 ({steps.length}/{MAX_STEPS})
          </button>
          <div className="submit-wrap">
            {remaining !== null && <span className="remaining">남은 진단 {remaining}회 · 24시간 기준</span>}
            <button type="submit" className="btn primary" disabled={loading || remaining === 0}>
              {loading ? "진단 중…" : "진단하기"}
            </button>
          </div>
        </div>
      </form>

      {loading && (
        <div className="loading"><span className="pulse" />페이지를 읽고 분석하고 있어요. 30초~1분 정도 걸려요.</div>
      )}
      {error && <div className="error" role="alert">{error}</div>}

      {report ? (
        <>
          {savedId ? (
            <p className="saved">✓ 저장했어요. 이 브라우저에서 주소를 다시 열면 언제든 볼 수 있어요.</p>
          ) : (
            <p className="saved warn">저장하지 못했어요. 이 화면을 닫으면 결과가 사라져요.</p>
          )}
          <ReportView key={runId} report={report} isSample={false} shots={shots} />
          <button type="button" className="btn ghost" onClick={() => setReport(null)}>예시 리포트 다시 보기</button>
          {savedId && <AiMadePopup key={savedId} diagnosisId={savedId} />}
        </>
      ) : (
        <ReportView report={SAMPLE_REPORT} isSample />
      )}
    </main>
  );
}
