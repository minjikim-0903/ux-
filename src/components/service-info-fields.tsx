"use client";

import { DOMAINS, INFO_MAX } from "@/lib/service-info";

export type ServiceInfo = { domain: string; audience: string; goal: string };
export const EMPTY_INFO: ServiceInfo = { domain: "", audience: "", goal: "" };

/** 비어 있는 항목이 있으면 안내 문구를, 다 채웠으면 null을 돌려줘요. */
export function missingInfo(info: ServiceInfo): string | null {
  if (!info.domain) return "어떤 분야의 서비스인지 골라주세요.";
  if (!info.audience.trim()) return "누가 쓰는 서비스인지 적어주세요.";
  if (!info.goal.trim()) return "이 페이지의 목적을 적어주세요.";
  return null;
}

/** 진단 전에 받는 서비스 정보: 도메인(선택), 사용자, 목적. 모두 필수예요. */
export function ServiceInfoFields({ value, onChange }: { value: ServiceInfo; onChange: (v: ServiceInfo) => void }) {
  const set = (k: keyof ServiceInfo, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="info-fields">
      <p className="info-why">
        <strong>서비스의 방향을 체크하기 위해 미리 여쭤봐요.</strong>
        <br />
        누구를 위한, 어떤 목적의 페이지인지에 맞춰 진단해요.
      </p>
      <fieldset className="info-domain">
        <legend className="label">어떤 분야의 서비스인가요?</legend>
        <div className="seg" role="group">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.domain === d}
              className={value.domain === d ? "on" : ""}
              onClick={() => set("domain", value.domain === d ? "" : d)}
            >
              {d}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="info-field">
        <span className="label">누가 쓰나요?</span>
        <input
          required
          maxLength={INFO_MAX}
          placeholder="예: 운동을 처음 시작하는 20~30대 직장인"
          value={value.audience}
          onChange={(e) => set("audience", e.target.value)}
        />
      </label>
      <label className="info-field">
        <span className="label">이 페이지의 목적은 뭔가요?</span>
        <input
          required
          maxLength={INFO_MAX}
          placeholder="예: 첫 수업 무료 체험 신청 늘리기"
          value={value.goal}
          onChange={(e) => set("goal", e.target.value)}
        />
      </label>
    </div>
  );
}
