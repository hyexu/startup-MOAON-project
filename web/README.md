# 모아온 음성 인터뷰 서비스 (web)

부모님이 휴대폰 링크로 말로 답하면 녹음이 저장되고, AI가 다음 질문을 이어 가는 서비스입니다.

- 부모님 화면: `/r#k=링크키` · 체험: `/r?demo=1` (아무것도 저장하지 않음)
- 운영자 화면: `/admin`
- 개인정보 안내: `/privacy`

설계: `../docs/superpowers/specs/2026-11-25-voice-interview-service-design.md` · 계획: `../docs/superpowers/plans/2026-11-25-voice-interview-phase1.md`

## 처음 설정하기 (한 번만)

키와 비밀번호는 **채팅이나 저장소에 붙여 넣지 말고**, 아래에 적힌 곳(Supabase·Vercel 화면)에만 넣어 주세요.

### 1. Supabase (무료 플랜)

1. supabase.com에서 새 프로젝트를 만듭니다. 지역은 `Northeast Asia (Seoul)`.
2. **SQL Editor**에서 `drizzle/0000_init.sql`, 이어서 `drizzle/0001_turn_claim.sql`의 내용을 차례로 붙여 넣고 실행합니다.
3. **Storage**에서 `audio`라는 이름의 버킷을 만들고 **Public은 끈 채로** 둡니다. (또는 `npx tsx scripts/setup-storage.ts`)
4. **Authentication → Users**에서 운영자 계정(이메일·비밀번호)을 만듭니다. 회원가입은 **Authentication → Sign In / Providers**에서 꺼 두세요.
5. 필요한 값 (Vercel에 넣을 것):
   - `DATABASE_URL`: **Connect → Transaction pooler** 주소 (포트 6543, 비밀번호 포함)
   - `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`: 프로젝트 URL (`https://xxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Publishable(anon) 키
   - `SUPABASE_SERVICE_ROLE_KEY`: Secret(service role) 키 — 서버 전용

### 2. Vercel (Hobby 플랜)

1. vercel.com → **Add New → Project** → GitHub 저장소 `startup-MOAON-project` 가져오기.
2. **Root Directory**를 `web`으로 지정합니다.
3. **Environment Variables**에 아래 8개를 넣습니다.

| 이름 | 값 |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler 주소 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Secret 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Publishable 키 |
| `BAZE_API_KEYS` | 고려대 BAZE 키들, 쉼표로 구분 (앞의 키부터 씀) |
| `ADMIN_EMAILS` | 운영자 이메일, 쉼표로 구분 |
| `OPERATOR_PHONE` | 부모님 화면에 보일 운영자 연락처 |

4. **Deploy**. 이후 main에 올리면 자동으로 다시 배포됩니다.

## 배포 후 확인 순서

1. `/admin/login`으로 로그인 → 맨 위에 AI 크레딧 띠가 보이는지.
2. 가명으로 부모님 등록 → **질문** 탭에 18개 → 잠시 뒤 "음성 준비" 표시.
3. **링크** 탭에서 링크 만들기 → 휴대폰(안드로이드 크롬, 아이폰 사파리, 카카오톡)으로 열기.
4. 동의 두 번 → 마이크 허용 → 답 2개 → **대화 기록** 탭에서 녹음 재생과 글 확인 → **이야기 카드** 탭에 카드가 생기는지.
5. 링크 **중지** 후 다시 열면 "링크가 더 이상 쓸 수 없어요" 화면.
6. **AI 멈추기**를 누르고 답해 보면, 미리 정한 질문으로 이어지고 녹음은 "미뤄 둠"으로 남는지. 다시 켠 뒤 **미뤄 둔 녹음 글로 옮기기**.

## 개발

```bash
npm install
npm test                    # 단위 테스트 (PGlite 메모리 DB)
npx playwright test --trace off   # 부모님 화면 체험 모드 e2e
BAZE_API_KEYS=키 npx tsx scripts/baze-smoke.ts   # BAZE 실제 연결 확인 (크레딧 약 20 사용)
```

스키마를 바꾸면 `npm run db:generate`로 `drizzle/`에 새 SQL을 만들고, Supabase SQL Editor에서 실행합니다.
