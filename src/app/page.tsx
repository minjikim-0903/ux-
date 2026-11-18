"use client";

import { useRef, useState } from "react";
import type { Report } from "@/lib/schema";
import { SAMPLE_REPORT } from "@/lib/sample";

type StepInput = { label: string; url: string };

const RISK_TEXT = { low: "낮음", mid: "중간", high: "높음" } as const;
const CONF_TEXT = { high: "확신 높음", mid: "확신 중간", low: "확신 낮음" } as const;
const EMPTY: StepInput = { label: "", url: "" };
const MAX_STEPS = 4;

const CHAIN = [
  { key: "problem", label: "문제 진단" },
  { key: "hypothesis", label: "이럴 가능성이 있어요" },
  { key: "suggestion", label: "이렇게 해보세요" },
  { key: "effect", label: "기대 효과" },
] as const;

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

/** 예시 리포트용 가상 요금제 화면. 핀 번호는 SAMPLE_REPORT의 rank와 같아요. */
function SampleScreen() {
  const plans = [
    { name: "Lite", price: "5,900" },
    { name: "Basic", price: "9,900" },
    { name: "Plus", price: "12,900" },
    { name: "Pro", price: "19,900" },
  ];
  return (
    <figure className="screen" aria-label="예시 화면: 가상 서비스의 요금제 페이지">
      <div className="screen-bar">
        <span /><span /><span />
        <span className="screen-url">lumi-demo.kr/pricing</span>
      </div>
      <div className="screen-body">
        <div className="mock-banner"><strong>첫 달 무료</strong></div>
        <div className="mock-plans">
          <span className="pin" aria-label="문제 1">1</span>
          {plans.map((p) => (
            <div key={p.name} className="mock-plan">
              <b>{p.name}</b>
              <span>월 {p.price}원</span>
            </div>
          ))}
        </div>
        <p className="mock-fine">
          * 무료 체험 종료 후 월 12,900원이 자동결제됩니다.
          <span className="pin" aria-label="문제 2">2</span>
        </p>
        <div className="mock-cta">
          <span className="mock-btn">다음</span>
          <span className="pin" aria-label="문제 3">3</span>
        </div>
      </div>
    </figure>
  );
}

/** API가 돌려주는 단계별 스크린샷과 요소 위치 (px, 스크린샷 기준) */
type Shot = {
  image: string;
  width: number;
  height: number;
  elements: { id: string; x: number; y: number; w: number; h: number }[];
};

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** 실제 스크린샷 위에 문제 위치(박스 + 번호 핀)를 그려요. */
function ShotView({
  shot, reasons, active, scrollRef,
}: {
  shot: Shot;
  reasons: Report["reasons"];
  active: number | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <figure className="screen">
      <div className="shot-scroll" ref={scrollRef}>
        <div className="shot" style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 서버가 만든 data URL 스크린샷이라 next/image 최적화 대상이 아니에요 */}
          <img src={shot.image} alt="진단한 페이지 스크린샷" />
          {reasons.map((r) => {
            const el = shot.elements.find((e) => e.id === r.element_id);
            if (!el) return null;
            return (
              <div key={r.rank} className={`mark${active === r.rank ? " on" : ""}`}>
                <div
                  className="mark-box"
                  style={{ left: pct(el.x, shot.width), top: pct(el.y, shot.height), width: pct(el.w, shot.width), height: pct(el.h, shot.height) }}
                />
                <span className="pin" style={{ left: pct(el.x, shot.width), top: pct(el.y, shot.height) }}>{r.rank}</span>
              </div>
            );
          })}
        </div>
      </div>
    </figure>
  );
}

function ReasonCard({
  r, active, onLocate,
}: {
  r: Report["reasons"][number];
  active?: boolean;
  onLocate?: () => void;
}) {
  return (
    <article className={`reason${active ? " on" : ""}`}>
      <header className="r-head">
        <span className="rank">{r.rank}</span>
        <div className="tags">
          <span className="tag">{r.step_label}</span>
          {r.principles.map((p) => <span key={p} className="tag">{p}</span>)}
          <span className={`tag c-${r.confidence}`}>{CONF_TEXT[r.confidence]}</span>
        </div>
        {onLocate && <button type="button" className="locate" onClick={onLocate}>화면에서 보기</button>}
      </header>
      <ol className="chain">
        {CHAIN.map((c) => (
          <li key={c.key} className={`chain-${c.key}`}>
            <span className="label">{c.label}</span>
            <p>{r[c.key]}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}

function ReportView({ report, isSample, shots = [] }: { report: Report; isSample: boolean; shots?: (Shot | null)[] }) {
  const firstStep = report.reasons.find((r) => shots[r.step_index - 1])?.step_index ?? shots.findIndex(Boolean) + 1;
  const [step, setStep] = useState(Math.max(firstStep, 1));
  const [active, setActive] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shot = shots[step - 1] ?? null;
  const hasShots = shots.some(Boolean);

  function locate(r: Report["reasons"][number]) {
    setStep(r.step_index);
    setActive(r.rank);
    const target = shots[r.step_index - 1];
    const el = target?.elements.find((e) => e.id === r.element_id);
    const box = scrollRef.current;
    if (!el || !target) return;
    // 데스크톱: 스크린샷 칸 안에서 해당 요소로 스크롤. 모바일: 스크린샷이 보이게 페이지 스크롤.
    requestAnimationFrame(() => {
      if (!box) return;
      if (box.scrollHeight > box.clientHeight + 1) {
        box.scrollTo({ top: (el.y / target.height) * box.scrollHeight - box.clientHeight / 3, behavior: "smooth" });
      } else {
        box.querySelector(".mark.on .pin")?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  const pinned = (r: Report["reasons"][number]) => Boolean(shots[r.step_index - 1]?.elements.some((e) => e.id === r.element_id));

  return (
    <section className="report" aria-label={isSample ? "예시 리포트" : "진단 리포트"}>
      <div className="verdict">
        <span className="est">{isSample ? "예시 리포트" : "AI 추정 · 실제 유저 데이터 아님"}</span>
        <Headline text={report.verdict_headline} highlight={report.verdict_highlight} />
      </div>

      {report.steps.length > 1 && (
        <div className="flow">
          {report.steps.map((s, i) => (
            <div key={i} className={`step lv-${s.risk}`}>
              <span className="name">{i + 1}. {s.label}</span>
              <div className="meter"><i /><i /><i /><i /><i /></div>
              <span className="lvl">망설임 {RISK_TEXT[s.risk]}</span>
            </div>
          ))}
        </div>
      )}

      <div className={isSample || hasShots ? "report-grid" : "report-list"}>
        {isSample && <div className="screen-col"><SampleScreen /></div>}
        {!isSample && hasShots && (
          <div className="screen-col">
            {shots.filter(Boolean).length > 1 && (
              <div className="shot-tabs" role="tablist">
                {shots.map((s, i) => s && (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={step === i + 1}
                    className={step === i + 1 ? "on" : ""}
                    onClick={() => { setStep(i + 1); setActive(null); }}
                  >
                    {i + 1}. {report.steps[i]?.label ?? `${i + 1}단계`}
                  </button>
                ))}
              </div>
            )}
            {shot && (
              <ShotView
                shot={shot}
                reasons={report.reasons.filter((r) => r.step_index === step)}
                active={active}
                scrollRef={scrollRef}
              />
            )}
          </div>
        )}
        <div className="reasons">
          {report.reasons.map((r) => (
            <ReasonCard
              key={r.rank}
              r={r}
              active={active === r.rank}
              onLocate={!isSample && pinned(r) ? () => locate(r) : undefined}
            />
          ))}
        </div>
      </div>

      {report.limitations.length > 0 && (
        <p className="limits">{report.limitations.join(" · ")}</p>
      )}
    </section>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [heroUrl, setHeroUrl] = useState("");
  const [steps, setSteps] = useState<StepInput[]>([{ ...EMPTY }]);
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [shots, setShots] = useState<(Shot | null)[]>([]);
  const [runId, setRunId] = useState(0);

  const update = (i: number, key: keyof StepInput, value: string) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  async function runDiagnosis(input: StepInput[]) {
    const filled = input.filter((s) => s.url.trim());
    if (!filled.length) return setError("진단할 링크를 하나 이상 입력해주세요.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          steps: filled.map((s) => ({ url: s.url.trim(), label: s.label.trim() || undefined })),
          context: context.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({ error: "서버 응답을 읽을 수 없어요." }));
      if (!res.ok) throw new Error(data.error ?? "진단에 실패했어요.");
      setShots(data.captures ?? []);
      setReport(data.report);
      setRunId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "진단에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  function startFromHero(e: React.FormEvent) {
    e.preventDefault();
    const first = [{ label: "", url: heroUrl.trim() }];
    setSteps(first);
    setStarted(true);
    runDiagnosis(first);
  }

  if (!started) {
    return (
      <main className="hero">
        <h1>내 AI가 만들어준 UX,<br />괜찮을까?</h1>
        <p className="hero-sub">링크를 넣고 검증 리포트를 받아보세요.</p>
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
        <button type="button" className="link-btn" onClick={() => setStarted(true)}>
          예시 리포트 먼저 보기
        </button>
      </main>
    );
  }

  return (
    <main className="wrap">
      <button type="button" className="link-btn back" onClick={() => setStarted(false)}>← 처음으로</button>

      <form className="form" onSubmit={(e) => { e.preventDefault(); runDiagnosis(steps); }}>
        <div className="form-head">
          <h2>진단할 페이지 링크</h2>
          <p className="hint">한 페이지만 넣어도 돼요. 랜딩 → 요금제 → 가입 → 결제처럼 순서대로 넣으면 단계별로 비교해요.</p>
        </div>
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
        <label className="ctx">
          <span className="label">어떤 서비스인가요? (선택)</span>
          <textarea
            rows={2}
            maxLength={1000}
            placeholder="예: 20대 대상 필라테스 예약 앱이에요. 첫 수업 무료 체험 신청을 늘리고 싶어요."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={steps.length >= MAX_STEPS}
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY }])}
          >
            + 단계 추가 ({steps.length}/{MAX_STEPS})
          </button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "진단 중…" : "진단하기"}
          </button>
        </div>
      </form>

      {loading && (
        <div className="loading"><span className="pulse" />페이지를 읽고 분석하고 있어요. 30초~1분 정도 걸려요.</div>
      )}
      {error && <div className="error" role="alert">{error}</div>}

      {report ? (
        <>
          <ReportView key={runId} report={report} isSample={false} shots={shots} />
          <button type="button" className="btn ghost" onClick={() => setReport(null)}>예시 리포트 다시 보기</button>
        </>
      ) : (
        <ReportView report={SAMPLE_REPORT} isSample />
      )}
    </main>
  );
}
