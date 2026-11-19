import type { Report } from "./schema";

// API 키 없이 화면을 확인할 때 쓰는 예시 리포트예요. 가상 서비스(lumi-demo.kr)의 요금제 화면 기준이에요.
// rank 번호는 예시 화면(SampleScreen)의 핀 번호와 같아요.
export const SAMPLE_REPORT: Report = {
  site_category: "normal",
  verdict_headline: "유저는 요금제를 고르다가 가장 많이 망설일 가능성이 높아요.",
  verdict_highlight: "요금제를 고르다가",
  steps: [{ label: "요금제 선택", url: "https://lumi-demo.kr/pricing", risk: "high" }],
  reasons: [
    {
      rank: 1,
      step_index: 1,
      step_label: "요금제 선택",
      element_id: "e1",
      principles: ["선택 과부하"],
      confidence: "high",
      problem: "요금제 4개가 같은 크기로 나란히 있고, 추천 표시가 없어요.",
      hypothesis: "뭐가 나한테 맞는지 판단이 안 돼서 '나중에 고르자' 하고 떠날 가능성이 있어요.",
      suggestion: "Plus에 \"가장 많이 선택\" 표시를 붙이고, Lite는 숨겨서 3개로 줄여보세요.",
      effect: "고민하는 시간이 줄어서 다음 단계로 넘어가는 비율이 올라갈 수 있어요.",
    },
    {
      rank: 2,
      step_index: 1,
      step_label: "요금제 선택",
      element_id: "e2",
      principles: ["손실 회피"],
      confidence: "high",
      problem: "\"첫 달 무료\"는 크게 보이는데, 이후 월 12,900원 자동결제는 아주 작게 적혀 있어요.",
      hypothesis: "결제 직전에 자동결제를 알아채고 '속았다'는 느낌에 멈출 가능성이 있어요.",
      suggestion: "\"첫 달 무료 · 이후 월 12,900원 · 언제든 해지\"를 한 줄로 같이 보여주세요.",
      effect: "결제 화면에서 되돌아가는 유저가 줄고, 가입 뒤 해지율도 낮아질 수 있어요.",
    },
    {
      rank: 3,
      step_index: 1,
      step_label: "요금제 선택",
      element_id: "e3",
      principles: ["불확실성 회피"],
      confidence: "mid",
      problem: "버튼 문구가 \"다음\"이라 누르면 무슨 일이 생기는지 알 수 없어요.",
      hypothesis: "바로 결제될까 봐 버튼 누르기를 미룰 가능성이 있어요.",
      suggestion: "\"30일 무료로 시작하기\"처럼 누른 뒤의 결과를 버튼에 적어보세요.",
      effect: "버튼 클릭률이 올라갈 수 있어요.",
    },
  ],
  limitations: ["가상 서비스 화면으로 만든 예시예요."],
};
