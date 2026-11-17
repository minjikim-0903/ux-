import type { Report } from "./schema";

// API 키 없이 화면을 확인할 때 쓰는 예시 리포트예요. 가상 서비스 기준이에요.
export const SAMPLE_REPORT: Report = {
  verdict_headline: "유저는 요금제를 고르다가 가장 많이 망설일 가능성이 높아요.",
  verdict_highlight: "요금제를 고르다가",
  summary:
    "요금제가 4개이고 차이를 비교하려면 23줄짜리 표를 읽어야 해요. 여기에 자동결제 조건이 마지막 단계에서야 보여서, 결제 직전에 한 번 더 멈추게 만들어요.",
  steps: [
    { label: "랜딩", url: "https://lumi-demo.kr", risk: "low", reason_ranks: [] },
    { label: "요금제 선택", url: "https://lumi-demo.kr/pricing", risk: "high", reason_ranks: [1] },
    { label: "회원가입", url: "https://lumi-demo.kr/signup", risk: "mid", reason_ranks: [3] },
    { label: "결제 정보", url: "https://lumi-demo.kr/checkout", risk: "mid", reason_ranks: [2] },
  ],
  reasons: [
    {
      rank: 1,
      title: "고를 게 너무 많아서 결정을 미뤄요",
      principles: ["선택 과부하", "힉의 법칙"],
      confidence: "high",
      step_label: "요금제 선택",
      evidence: ["요금제 4개(Lite, Basic, Plus, Pro)가 같은 크기로 나란히 있어요", "추천 표시가 없어요", "비교표가 23개 항목이에요"],
      fixes: ["Plus 하나에 \"가장 많이 선택\" 표시를 붙여요", "Lite는 숨기고 3개로 줄여요", "비교표는 핵심 차이 3줄만 먼저 보여줘요"],
      signal: "요금제 카드 사이를 커서가 3번 이상 오가거나, 비교표를 펼친 뒤 10초 안에 페이지를 떠나는 행동",
    },
    {
      rank: 2,
      title: "마지막에 나온 자동결제 조건에 멈칫해요",
      principles: ["손실 회피", "뒤늦은 비용 공개"],
      confidence: "high",
      step_label: "결제 정보",
      evidence: ["\"첫 달 무료\"는 요금제 화면에서 크게 보여요", "\"이후 월 12,900원 자동결제\"는 결제 버튼 바로 위에서 처음 나와요", "해지 안내가 없어요"],
      fixes: ["요금제 화면에 자동결제 금액과 날짜를 같이 적어요", "\"언제든 해지, 결제 3일 전 알림\" 문구를 넣어요"],
      signal: "결제 버튼 근처에서 커서가 5초 이상 멈추거나, 결제 화면에서 요금제 화면으로 되돌아가는 행동",
    },
    {
      rank: 3,
      title: "써보기도 전에 개인정보를 너무 많이 물어요",
      principles: ["입력 부담", "신뢰 부족"],
      confidence: "mid",
      step_label: "회원가입",
      evidence: ["가입 필드가 7개예요", "전화번호와 생년월일이 필수예요", "왜 필요한지 설명이 없어요"],
      fixes: ["이메일과 비밀번호, 또는 소셜 로그인만 받아요", "나머지는 첫 사용 뒤에 받아요"],
      signal: "전화번호 필드에 들어갔다가 입력 없이 빠져나오는 행동",
    },
  ],
  limitations: ["예시 리포트예요. 실제 페이지를 읽은 결과가 아니에요."],
};
