import { z } from "zod";

export const RiskLevel = z.enum(["low", "mid", "high"]);
export const Confidence = z.enum(["high", "mid", "low"]);

export const SiteCategory = z.enum(["normal", "gambling", "adult", "phishing", "illegal_goods", "other_harmful"]);

export const ReportSchema = z.object({
  site_category: SiteCategory.describe(
    "사이트 종류. 불법 도박, 성인, 피싱·사기, 불법 상품(마약·무기·위조품 등), 기타 불법·유해면 해당 값. 일반 서비스는 normal",
  ),
  verdict_headline: z
    .string()
    .describe("한 문장 결론. 예: '유저는 요금제를 고르다가 가장 많이 망설일 가능성이 높아요.'"),
  verdict_highlight: z
    .string()
    .describe("verdict_headline 안에 그대로 들어있는 핵심 구절. 예: '요금제를 고르다가'"),
  steps: z
    .array(
      z.object({
        label: z.string().describe("단계 이름. 예: 랜딩, 요금제 선택, 회원가입, 결제 정보"),
        url: z.string(),
        risk: RiskLevel,
      }),
    )
    .describe("입력된 URL 순서대로, URL마다 하나씩"),
  reasons: z
    .array(
      z.object({
        rank: z.number().int(),
        step_index: z.number().int().describe("이 문제가 있는 단계 번호. 1부터 시작"),
        step_label: z.string(),
        element_id: z
          .string()
          .describe("문제가 있는 화면 요소의 id(예: e12). 요소 목록에서 가장 알맞은 것 하나. 화면 전체 문제이거나 알맞은 요소가 없으면 빈 문자열"),
        principles: z.array(z.string()).describe("행동심리 원리 1개. 예: 선택 과부하"),
        confidence: Confidence,
        problem: z
          .string()
          .describe("문제 진단. 화면에서 실제로 확인한 사실 한 문장. 버튼 문구나 가격은 그대로 인용. 예: '요금제 4개가 같은 크기로 나란히 있고, 추천 표시가 없어요.'"),
        hypothesis: z
          .string()
          .describe("가설. 그래서 유저가 어떻게 망설일 수 있는지 한 문장. '~할 가능성이 있어요'로 끝내기."),
        suggestion: z
          .string()
          .describe("제안. 바로 적용할 수 있는 가장 효과 큰 개선안 한 문장. 예: 'Plus에 \"가장 많이 선택\" 표시를 붙여보세요.'"),
        effect: z
          .string()
          .describe("기대 효과. 제안을 적용하면 어떤 행동 지표가 좋아질 수 있는지 한 문장. '~할 수 있어요'로 끝내기."),
      }),
    )
    .describe("가장 가능성 높은 이탈 이유 3개, rank 1부터"),
  limitations: z
    .array(z.string())
    .describe("이번 진단의 한계. 짧게 0~2개. 예: 자바스크립트로 그려지는 화면이라 내용 일부를 못 읽음"),
});

export type Report = z.infer<typeof ReportSchema>;
