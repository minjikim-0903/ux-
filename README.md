# UX 검증 리포트 (MVP)

AI로 만든 화면의 링크를 넣으면, 유저가 어디서 왜 망설이는지 행동심리 기준으로 진단하고 개선안을 제안해요.
서비스 설명을 함께 적으면 그 목적에 맞춰 제안해요.

## 실행

```bash
cp .env.local.example .env.local   # ANTHROPIC_API_KEY 채우기
npm install
npm run dev                        # http://localhost:3000
```

API 키 없이 화면만 보려면 "예시 보기"를 누르세요.

## 구조

| 파일 | 역할 |
|---|---|
| `src/lib/extract.ts` | URL의 HTML을 가져와 버튼, 입력 필드, 가격, 키워드, 본문을 뽑아요 |
| `src/lib/rubric.ts` | 행동심리 패턴 10개와 판단 기준. 진단 품질은 이 파일이 결정해요 |
| `src/lib/schema.ts` | 리포트 형식 (AI가 이 형식대로 답해요) |
| `src/app/api/diagnose/route.ts` | 페이지 수집 → Claude 진단 → 리포트 반환 |
| `src/app/page.tsx` | 입력 화면과 리포트 화면 |

## 알려진 한계

- 자바스크립트로 그려지는 페이지(React SPA 등)는 내용을 거의 못 읽어요. 리포트의 "이번 진단의 한계"에 표시돼요. 다음 단계에서 헤드리스 브라우저(Playwright)로 바꿀 예정이에요.
- 로그인이 필요한 페이지는 읽을 수 없어요.
