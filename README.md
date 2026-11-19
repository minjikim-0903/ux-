# UX 검증 리포트 (MVP)

**"내 AI가 만들어준 UX, 괜찮을까?"**
AI로 만든 화면의 링크를 넣으면, 유저가 어디서 왜 망설이는지 진단하고 개선안을 제안해요.

진단에서 끝나지 않고, **제안을 실제로 실행해 본 결과까지 모아서** 이론이 아닌 실제 행동에서 나온 UX 근거 데이터를 쌓는 것이 목표예요.
목적과 로드맵은 [기획안](docs/PLAN.md)에 정리돼 있어요.

## 무엇을 하나요

1. 링크를 넣고, 서비스 정보(분야·사용자·목적)를 적어요.
2. 실제 브라우저로 화면을 열어 스크린샷과 화면 요소를 수집해요.
3. AI가 문제마다 **문제 진단 → 가설 → 제안 → 기대 효과**를 써요.
4. 스크린샷 위에 문제 위치를 ①②③ 핀으로 보여줘요.

## 실행

```bash
cp .env.local.example .env.local   # ANTHROPIC_API_KEY 채우기
npm install
npx playwright install chromium    # 스크린샷용 브라우저 (처음 한 번)
supabase db push                   # DB 테이블·저장소 만들기 (supabase/migrations)
npm run dev                        # http://localhost:3000
```

Supabase 대시보드에서 **Authentication → Sign In / Providers → Allow anonymous sign-ins**를 켜야 진단할 수 있어요. 진단 버튼을 누를 때 익명 계정이 만들어지고, 결과는 그 브라우저에서만 볼 수 있어요.

API 키 없이 화면만 보려면 메인에서 "예시 리포트 먼저 보기"를 누르세요.

### 환경 변수

| 이름 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 (진단에 필요, 크레딧 충전 필요) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 관리자 키. 서버에서만 쓰세요 |
| `GOOGLE_SAFE_BROWSING_KEY` | (선택) 있으면 악성·피싱 사이트를 진단 전에 걸러요 |
| `DIAGNOSE_MOCK` | `true`면 AI 대신 테스트용 가짜 리포트를 만들어요. 크레딧 없이 저장·화면을 테스트할 때 써요. 배포 환경에서는 무시돼요 |
| `ALLOW_PRIVATE_URLS` | `true`면 localhost 같은 내부 주소도 진단해요. 로컬 테스트용, 배포에서는 쓰지 마세요 |

## 구조

| 파일 | 역할 |
|---|---|
| `src/app/page.tsx` | 메인(링크 입력), 진단 폼 |
| `src/app/r/[id]/page.tsx` | 저장된 진단 다시 보기 (진단한 브라우저에서만) |
| `src/components/report.tsx` | 리포트 화면 (스크린샷 핀, 문제 카드) |
| `src/app/api/diagnose/route.ts` | 화면 수집 → Claude 진단 → 리포트와 스크린샷 반환 |
| `src/lib/capture.ts` | 실제 브라우저(Playwright)로 스크린샷과 화면 요소 위치를 가져와요. 페이지가 내부망으로 보내는 요청은 모두 막아요 |
| `src/lib/extract.ts` | HTML에서 버튼, 입력 필드, 가격, 키워드, 본문을 뽑아요. 브라우저를 못 쓰면 이것만으로 진단해요 |
| `src/lib/limits.ts` | 사용 횟수 제한: 익명 계정당 24시간 진단 5회(DB 함수 `take_diagnose_slot`), IP당 10분 미리보기 20회 |
| `src/lib/guard.ts` | 불법·유해 사이트 차단 (차단 목록, Safe Browsing). AI 판별은 리포트의 `site_category` |
| `src/lib/supabase/` | 브라우저용(익명 로그인)·서버용(관리자) Supabase 클라이언트 |
| `supabase/migrations/` | DB 테이블(`diagnoses`, `blocked_domains`), 스크린샷 저장소, 본인만 보기 규칙(RLS) |
| `src/lib/rubric.ts` | 행동심리 패턴과 진단 규칙. 진단 품질은 이 파일이 결정해요 |
| `src/lib/schema.ts` | 리포트 형식 (AI가 이 형식대로 답해요) |
| `src/lib/sample.ts` | API 키 없이 보는 예시 리포트 |
| `docs/PLAN.md` | 기획안: 목적, 수집할 데이터, 로드맵 |

## 알려진 한계

- 리포트는 **AI 추정**이에요. 실제 유저 행동 데이터가 아니에요. 실행 결과를 연결하는 기능은 로드맵에 있어요.
- 브라우저를 띄울 수 없는 환경(지금의 Vercel)에서는 스크린샷 없이 HTML만 읽어요. 이때는 자바스크립트로 그려지는 페이지를 거의 못 읽고, 화면 핀도 안 나와요. Vercel에서 쓰려면 `@sparticuz/chromium`이나 외부 브라우저 서비스가 필요해요.
- 로그인이 필요한 페이지나 봇을 막는 사이트는 읽을 수 없어요.
- 스크린샷은 데스크톱(가로 1280px) 기준, 위에서 2400px까지만 찍어요.
