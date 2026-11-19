// 진단 전에 받는 서비스 정보. 화면(선택 버튼)과 서버(검증)가 같이 써요.
// 도메인은 나중에 "교육 서비스에서는…"처럼 묶어 보려고 정해진 목록에서 고르게 해요.
export const DOMAINS = [
  "커머스·쇼핑",
  "교육",
  "헬스케어·운동",
  "금융·핀테크",
  "SaaS·업무툴",
  "콘텐츠·미디어",
  "커뮤니티·소셜",
  "여행·예약",
  "기타",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const INFO_MAX = 200;
