import { z } from "zod";

export const RiskLevel = z.enum(["low", "mid", "high"]);
export const Confidence = z.enum(["high", "mid", "low"]);

export const ReportSchema = z.object({
  verdict_headline: z
    .string()
    .describe("한 문장 결론. 예: '유저는 요금제를 고르다가 가장 많이 망설일 가능성이 높아요.'"),
  verdict_highlight: z
    .string()
    .describe("verdict_headline 안에 그대로 들어있는 핵심 구절. 예: '요금제를 고르다가'"),
  summary: z.string().describe("결론의 이유를 2~3문장으로 설명"),
  steps: z
    .array(
      z.object({
        label: z.string().describe("단계 이름. 예: 랜딩, 요금제 선택, 회원가입, 결제 정보"),
        url: z.string(),
        risk: RiskLevel,
        reason_ranks: z.array(z.number().int()).describe("이 단계와 연결된 reasons의 rank 목록"),
      }),
    )
    .describe("입력된 URL 순서대로, URL마다 하나씩"),
  reasons: z
    .array(
      z.object({
        rank: z.number().int(),
        title: z.string().describe("유저 입장에서 쓴 이탈 이유. 예: '고를 게 너무 많아서 결정을 미뤄요'"),
        principles: z.array(z.string()).describe("행동심리 원리 1~2개. 예: 선택 과부하, 힉의 법칙"),
        confidence: Confidence,
        step_label: z.string(),
        evidence: z.array(z.string()).describe("페이지 데이터에서 실제로 확인한 근거 2~4개"),
        fixes: z.array(z.string()).describe("바로 적용할 수 있는 개선안 2~3개"),
        signal: z.string().describe("스니펫으로 실제 측정할 수 있는 행동 신호 1문장"),
      }),
    )
    .describe("가장 가능성 높은 이탈 이유 3개, rank 1부터"),
  limitations: z
    .array(z.string())
    .describe("이번 진단의 한계. 예: 자바스크립트로 그려지는 화면이라 내용 일부를 못 읽음"),
});

export type Report = z.infer<typeof ReportSchema>;
