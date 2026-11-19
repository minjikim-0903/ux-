"use client";

import { useRef, useState } from "react";
import type { Report } from "@/lib/schema";

const RISK_TEXT = { low: "낮음", mid: "중간", high: "높음" } as const;
const CONF_TEXT = { high: "확신 높음", mid: "확신 중간", low: "확신 낮음" } as const;

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
export type Shot = {
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

export function ReportView({ report, isSample, shots = [] }: { report: Report; isSample: boolean; shots?: (Shot | null)[] }) {
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
