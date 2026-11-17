"use client";

import { useState } from "react";
import type { Report } from "@/lib/schema";
import { SAMPLE_REPORT } from "@/lib/sample";

type StepInput = { label: string; url: string };

const RISK_TEXT = { low: "낮음", mid: "중간", high: "높음" } as const;
const CONF_TEXT = { high: "확신 높음", mid: "확신 중간", low: "확신 낮음" } as const;
const EMPTY: StepInput = { label: "", url: "" };

function Headline({ text, highlight }: { text: string; highlight: string }) {
  const i = highlight ? text.indexOf(highlight) : -1;
  if (i < 0) return <h1>{text}</h1>;
  return (
    <h1>
      {text.slice(0, i)}
      <em>{highlight}</em>
      {text.slice(i + highlight.length)}
    </h1>
  );
}

function ReportView({ report, isSample }: { report: Report; isSample: boolean }) {
  return (
    <>
      <section className="verdict">
        <span className="est">● {isSample ? "예시 리포트" : "AI 추정 · 실제 유저 데이터 아님"}</span>
        <Headline text={report.verdict_headline} highlight={report.verdict_highlight} />
        <p>{report.summary}</p>
      </section>

      <section className="sec">
        <div className="label">단계별 예상 망설임 강도</div>
        <div className="flow">
          {report.steps.map((s, i) => (
            <div key={i} className={`step lv-${s.risk}${s.risk === "high" ? " focus" : ""}`}>
              <span className="n">{i + 1}단계</span>
              <span className="name">{s.label}</span>
              <span className="u" title={s.url}>{s.url}</span>
              <div className="meter"><i /><i /><i /><i /><i /></div>
              <span className="lvl">
                {RISK_TEXT[s.risk]}
                {s.reason_ranks.length > 0 && ` · 원인 ${s.reason_ranks.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="sec">
        <h2>이탈 이유 Top {report.reasons.length}</h2>
        {report.reasons.map((r) => (
          <article key={r.rank} className="reason">
            <div className="r-head">
              <span className="rank">{r.rank}</span>
              <div className="r-title">
                <h3>{r.title}</h3>
                <div className="tags">
                  {r.principles.map((p) => <span key={p} className="tag">{p}</span>)}
                  <span className="tag">{r.step_label}</span>
                  <span className={`tag c-${r.confidence}`}>{CONF_TEXT[r.confidence]}</span>
                </div>
              </div>
            </div>
            <div className="r-body">
              <div>
                <span className="label">근거</span>
                <ul>{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
              <div>
                <span className="label">고칠 것</span>
                <ul>{r.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
              <div className="signal">
                <span className="label">실제 데이터로 확인할 신호</span>
                <p>{r.signal}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {report.limitations.length > 0 && (
        <section className="sec">
          <div className="label">이번 진단의 한계</div>
          <ul className="limits">{report.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}
    </>
  );
}

export default function Home() {
  const [steps, setSteps] = useState<StepInput[]>([{ label: "", url: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const update = (i: number, key: keyof StepInput, value: string) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  async function diagnose(e: React.FormEvent) {
    e.preventDefault();
    const filled = steps.filter((s) => s.url.trim());
    if (!filled.length) return setError("진단할 URL을 하나 이상 입력해주세요.");
    setLoading(true);
    setError(null);
    setReport(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          steps: filled.map((s) => ({ url: s.url.trim(), label: s.label.trim() || undefined })),
        }),
      });
      const data = await res.json().catch(() => ({ error: "서버 응답을 읽을 수 없어요." }));
      if (!res.ok) throw new Error(data.error ?? "진단에 실패했어요.");
      setReport(data.report);
      setIsSample(false);
      setElapsed(Math.round((Date.now() - started) / 1000));
    } catch (err) {
      setError(err instanceof Error ? err.message : "진단에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="sec">
        <div className="brand"><span className="dot" />머뭇</div>
        <p className="lede">가입·결제 플로우의 URL을 순서대로 넣으면, 유저가 어디서 왜 망설이는지 행동심리 기준으로 진단해요.</p>
      </div>

      <form className="form" onSubmit={diagnose}>
        {steps.map((s, i) => (
          <div className="row" key={i}>
            <span className="n">{i + 1}</span>
            <input
              id={`label-${i}`}
              className="lbl"
              placeholder="단계 이름 (선택)"
              aria-label={`${i + 1}단계 이름`}
              value={s.label}
              onChange={(e) => update(i, "label", e.target.value)}
            />
            <input
              id={`url-${i}`}
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
            disabled={steps.length >= 4}
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY }])}
          >
            + 단계 추가 ({steps.length}/4)
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => { setReport(SAMPLE_REPORT); setIsSample(true); setError(null); setElapsed(null); }}
            >
              예시 보기
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "진단 중…" : "진단하기"}
            </button>
          </div>
        </div>
        <p className="hint">한 페이지만 넣어도 돼요. 랜딩 → 요금제 → 가입 → 결제처럼 순서대로 넣으면 단계별로 비교해요.</p>
      </form>

      {loading && (
        <div className="loading"><span className="pulse" />페이지를 읽고 행동심리 기준으로 분석하고 있어요. 30초~1분 정도 걸려요.</div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {report && <ReportView report={report} isSample={isSample} />}
      {report && elapsed !== null && <p className="meta">진단 시간 {elapsed}초 · 화면 구조 기반 추정</p>}
    </main>
  );
}
