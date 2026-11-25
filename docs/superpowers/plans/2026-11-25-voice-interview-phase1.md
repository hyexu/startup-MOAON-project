# 모아온 음성 인터뷰 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부모님이 휴대폰 링크로 말로 답하면 녹음이 저장되고, BAZE 게이트웨이의 Claude가 다음 질문을 이어 가며, 운영자가 대화 기록과 크레딧을 확인할 수 있는 웹 서비스(발표 2026-12-14).

**Architecture:** `web/` 아래 Next.js App Router 앱 하나에 부모님 화면(`/r`), 운영자 화면(`/admin`), API 라우트가 함께 있다. DB는 Supabase Postgres를 Drizzle ORM으로 직접 연결(서버 전용, 테스트는 PGlite), 파일은 Supabase Storage 비공개 버킷, 운영자 로그인은 Supabase Auth. AI는 모두 BAZE 게이트웨이를 거치며, 한 턴은 `runTurn()` 하나가 순서대로 처리하고 이야기 카드 정리는 응답 뒤 `after()`로 실행한다.

**Tech Stack:** Next.js 16.4, React, TypeScript, `@anthropic-ai/sdk` 1.14 (baseURL만 BAZE로), Drizzle ORM 0.45 + `postgres` 4 (운영) / `@electric-sql/pglite` 0.6 (테스트), `@supabase/supabase-js` 2 (Storage·Auth만), `zod` 4, `ffmpeg-static` 5, Vitest 5, `@playwright/test` 1.63.0.

**Spec:** `docs/superpowers/specs/2026-11-25-voice-interview-service-design.md` (1단계 = 7절). 인터뷰 원칙 원본: `skills/life-story-interviewer/SKILL.md`. 기록자 형식 원본: `spike/memoir-interviewer.html`의 `RECORDER_RULES`.

## Global Constraints

- 앱 위치 `web/`. Node 22 이상 (`"engines": {"node": ">=22"}`). Vercel 프로젝트 Root Directory = `web`.
- 서버 환경 변수 (이름 고정): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BAZE_API_KEYS`(쉼표 구분, 순서대로 사용), `ADMIN_EMAILS`(쉼표 구분), `OPERATOR_PHONE`(부모님 화면에 표시). 키 값은 저장소·로그·DB에 절대 남기지 않는다. 키는 `key1`, `key2`처럼 순번 이름으로만 기록.
- BAZE: 기본 주소 `https://api.baze.co/v1/gateway`. Claude는 Anthropic SDK `new Anthropic({ baseURL: "https://api.baze.co/v1/gateway/claude", apiKey })`. STT `POST /audio/transcriptions/`(multipart, `model=stt-async-v5`, `language_hints=ko`, `enable_speaker_diarization=false`) → `GET /audio/transcriptions/{operation_id}/` 폴링. TTS `POST /audio/speech/` JSON `{model:"gemini-3.8-flash-tts", input, voice:"Kore", instructions:"어르신께 여쭙듯 천천히, 따뜻하고 또렷하게 읽어 주세요."}` → 24kHz 모노 16bit PCM. 잔액 `GET /credits/` → `total.remaining`.
- 모델(설정값, `web/lib/config.ts`): 질문 `claude-sonnet-5-5` effort `low`, 기록 `claude-haiku-5-5` effort `low`. 원고(Opus)는 2단계.
- 기본값: 한 답변 최대 300초, 링크 90일, 보관 기한 1년, 부모님별 하루 최대 80턴, AI 멈춤 기준 남은 크레딧 합 300 미만, 최근 대화 30턴만 질문 생성에 사용.
- AI로 보내는 글에는 부모님 실명·연락처·자녀 연락처를 넣지 않는다. 화자는 `parents.honorific`(호칭)으로만.
- 상태 이름(팀원 시스템과 동일): 전사 `녹취 도착 / 정리 중 / 정리 완료 / 고객 확인 / 확정`. 동의 항목 `개인정보 수집·이용`, `음성 녹음과 보관`, `AI 처리 위탁(국외 이전 포함)`.
- 디자인 토큰(팀원 사이트): 배경 `#F5F5F7`, 카드 `#FFFFFF`, 글자 `#1D1D1F`, 보조 `#6E6E73`, 선 `#D2D2D7`, 행동 `#2E5A4C`(hover `#24483C`), 세이지 `#9FB283`, 세이지 연한 `#EEF2E8`, 글꼴 `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif`. 부모님 화면: 본문 20px 이상, 질문 28px 이상, 버튼 높이 64px 이상, 한 화면에 주 버튼 하나.
- 공개 저장소: 실제 인터뷰 데이터·키를 커밋하지 않는다. 테스트 데이터는 가명.

## Review Focus

1. **카카오톡 안 브라우저에서 마이크가 막힘** → "다른 브라우저로 열기" 안내 화면이 나오고 막다른 화면이 없어야 한다. (Task 9 테스트)
2. **[다 했어요]를 두 번 누르거나 네트워크 재시도로 완료 요청이 두 번 옴** → 같은 턴이 두 번 처리되거나 질문이 두 개 생기면 안 된다 (같은 결과 반환). (Task 7 테스트)
3. **녹음 중 화면이 꺼지거나 업로드가 끊긴 뒤 다시 열기** → IndexedDB에 남은 녹음을 이어서 보내고, 같은 질문에서 이어 간다. (Task 9 테스트)
4. **중지되거나 만료된 링크, 다른 부모님의 턴 ID로 요청** → 401/404이고 어떤 데이터도 노출하지 않는다. (Task 5 테스트)
5. **크레딧이 대화 도중 바닥남 (BAZE 402)** → 그 턴은 녹음 저장 + 씨앗 질문으로 계속되고, 전사는 `deferred`로 남아 나중에 처리할 수 있다. (Task 7 테스트)

---

## File Structure

```
web/
  package.json, next.config.ts, tsconfig.json, vitest.config.ts, playwright.config.ts, drizzle.config.ts
  app/
    layout.tsx, globals.css                       디자인 토큰
    privacy/page.tsx                              쉬운 말 개인정보 안내
    r/page.tsx, r/ParentApp.tsx                   부모님 화면 (클라이언트)
    admin/login/page.tsx, admin/(main)/layout.tsx, admin/(main)/page.tsx,
    admin/(main)/parents/[id]/page.tsx            운영자 화면
    api/r/[action]/route.ts                       부모님 API (토큰 확인)
    api/admin/[...path]/route.ts                  운영자 API (세션 확인)
  lib/
    config.ts                                     기본값·모델 이름
    db/schema.ts, db/client.ts, db/test-db.ts     Drizzle 스키마와 연결
    seeds.ts                                      시기별 기본 질문 씨앗
    tokens.ts                                     링크 토큰 생성·해시
    consent.ts                                    동의 문구와 버전
    prompts/interviewer.ts, prompts/recorder.ts   지시문과 요청 조립
    memory.ts                                     기록 상태 스키마·병합
    baze/keys.ts, baze/client.ts                  키 순환, Claude·STT·TTS·잔액
    audio.ts                                      webm→ogg, PCM→mp3
    usage.ts                                      ai_usage 기록, 비용 계산
    ai-mode.ts                                    AI 멈춤 판단
    storage.ts                                    Supabase Storage 래퍼
    turn.ts                                       runTurn 파이프라인
    parent-api.ts                                 부모님 API 처리 함수
    admin-api.ts                                  운영자 API 처리 함수
    parent/machine.ts, parent/recorder.ts, parent/backup.ts, parent/speak.ts, parent/demo.ts, parent/browser.ts
  drizzle/0000_init.sql
  tests/unit/*.test.ts, tests/e2e/parent.spec.ts
  README.md                                       설정·배포 안내 (Supabase, Vercel, 환경 변수)
```

---

### Task 1: 앱 뼈대, 설정, 디자인 토큰

**Files:**
- Create: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/app/layout.tsx`, `web/app/globals.css`, `web/app/page.tsx`, `web/lib/config.ts`, `web/.gitignore`, `web/.env.example`
- Test: `web/tests/unit/config.test.ts`

**Interfaces:**
- Produces: `CONFIG` 객체 `{ maxAnswerSec: 300, linkDays: 90, retentionDays: 365, dailyTurnCap: 80, pauseBelowCredits: 300, recentTurns: 30, models: { interviewer: "claude-sonnet-5-5", recorder: "claude-haiku-5-5" }, effort: { interviewer: "low", recorder: "low" }, bazeBase: "https://api.baze.co/v1/gateway", tts: { model: "gemini-3.8-flash-tts", voice: "Kore", instructions: string }, stt: { model: "stt-async-v5" } }`. `envList(name: string): string[]` (쉼표 분리, 공백 제거, 빈 값 제외).

- [ ] **Step 1:** `npx create-next-app@16.4.6 web --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes`. 의존성 추가: `@anthropic-ai/sdk@1.14.0 zod@4 drizzle-orm@0.45 postgres@4 @supabase/supabase-js@2 @supabase/ssr ffmpeg-static@5`, dev: `vitest@5 @electric-sql/pglite@0.6 drizzle-kit@0.31 @playwright/test@1.63.0`. scripts: `"test": "vitest run"`, `"e2e": "playwright test"`, `"db:generate": "drizzle-kit generate"`. `.env.example`에 Global Constraints의 변수 이름만 (값 없음).
- [ ] **Step 2: 실패하는 테스트** — `config.test.ts`: `CONFIG.maxAnswerSec === 300`, `CONFIG.pauseBelowCredits === 300`, `envList` 가 `" a, b ,,c "` → `["a","b","c"]`, 미설정 변수 → `[]`.
- [ ] **Step 3:** `npm test` → FAIL (모듈 없음).
- [ ] **Step 4:** `lib/config.ts` 구현. `globals.css`에 Global Constraints의 토큰을 `:root` 변수로, `body` 배경·글꼴 지정. `app/page.tsx`는 "모아온 인터뷰 서비스" 한 줄과 `/admin` 링크.
- [ ] **Step 5:** `npm test` PASS, `npm run build` 성공.
- [ ] **Step 6:** Commit `feat(web): Next.js 앱 뼈대와 설정`.

### Task 2: DB 스키마와 테스트 DB

**Files:**
- Create: `web/lib/db/schema.ts`, `web/lib/db/client.ts`, `web/lib/db/test-db.ts`, `web/drizzle.config.ts`, `web/drizzle/0000_init.sql`(생성물), `web/lib/seeds.ts`
- Test: `web/tests/unit/schema.test.ts`

**Interfaces:**
- Produces (Drizzle 테이블, 모두 `id` serial PK, `created_at` timestamptz default now()):
  - `parents`: `honorific` text not null, `real_name` text, `birth_year` int, `hometown` text, `job` text, `family_note` text, `guardian_contact` text, `retain_until` date not null, `status` text default `'준비'`
  - `links`: `parent_id` fk, `token_hash` text unique not null, `expires_at`, `revoked_at` null, `last_used_at` null
  - `consents`: `parent_id`, `item` text, `text_version` text, `link_id`
  - `question_seeds`: `parent_id`, `period` text (`유년|학창|청년|가정·중년|지금`), `text`, `source` (`기본|가족`), `position` int, `enabled` bool default true, `used_at` null, `audio_path` text null
  - `sessions`: `parent_id`, `started_at`, `ended_at` null, `end_reason` text null, `summary` text null
  - `turns`: `session_id`, `parent_id`, `seq` int, `question` text not null, `question_audio_path` null, `question_source` (`ai|seed|system`), `answer_audio_path` null, `answer_mime` null, `answer_sec` real null, `transcript` text null, `transcript_edited` text null, `status` text default `'녹취 도착'`, `stt` text (`none|done|failed|deferred|empty`) default `'none'`, `command` text null, `completed_at` null; unique(`session_id`,`seq`)
  - `memory`: `parent_id` unique, `state` jsonb not null, `version` int not null default 1, `updated_at`
  - `ai_usage`: `kind` (`interviewer|recorder|stt|tts`), `model`, `key_name`, `input_tokens` int, `output_tokens` int, `cache_read_tokens` int, `audio_sec` real, `cost_usd` numeric(12,6), `credits` numeric(12,4) null, `parent_id` null, `session_id` null
  - `settings`: `key` text PK, `value` jsonb (키: `ai_paused_manual` bool, `credit_snapshot` `{at, keys:[{name, remaining}]}`)
  - 모든 테이블 RLS enable, 정책 없음 (앱은 서버에서만 접근).
- `getDb(): DrizzleDb` (postgres-js, `DATABASE_URL`, `prepare:false`). `makeTestDb(): Promise<DrizzleDb>` (PGlite 메모리 DB에 `drizzle/` SQL 적용).
- `DEFAULT_SEEDS: {period, text}[]` — SKILL.md 2-6의 씨앗을 시기별 3~4개 질문 문장으로 (예: 유년 "어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?"). 총 18개.
- `copyDefaultSeeds(db, parentId): Promise<void>`.

- [ ] **Step 1: 실패하는 테스트** — `schema.test.ts`: `makeTestDb()` 후 parent 하나 insert, `copyDefaultSeeds` → seeds 18개, position 0..17 순서, 시기 5종 모두 포함; 같은 (session_id, seq) 턴 두 번 insert → 에러.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 스키마 작성 → `npm run db:generate`로 `drizzle/0000_init.sql` 생성, 파일 끝에 각 테이블 `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` 추가. `client.ts`, `test-db.ts`, `seeds.ts` 구현.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5:** Commit `feat(web): DB 스키마와 기본 질문 씨앗`.

### Task 3: 기록 상태 스키마와 병합

**Files:**
- Create: `web/lib/memory.ts`
- Test: `web/tests/unit/memory.test.ts`

**Interfaces:**
- Produces:
  - `MemoryState` (zod `memorySchema`): 체험판 기록자 JSON과 같음 — `profile{respondent, honorific, birthYear, birthplace, purpose, lifeMap}`, `currentPeriod`, `currentEpisodeId`, `periods{유년,학창,청년,가정·중년,지금: 0..3}`, `episodes[{id, title, period, age, place, people, story, senses, quotes[], emotion, meaning, uncertain, visibility("공개"|"비공개"|"확인 필요"), funnel[]}]`.
  - `blankMemory(honorific: string): MemoryState`
  - `memoryJsonSchema` (`z.toJSONSchema(memorySchema)`, structured output용)
  - `mergeMemory(prev: MemoryState, next: unknown): MemoryState` — `next`가 스키마에 안 맞으면 `prev` 그대로. 맞으면 `next`를 쓰되: periods 값은 0..3으로 자름, 기존 에피소드가 `next`에 없으면 유지(기록자가 빠뜨려도 잃지 않음), `visibility`가 기존에 "비공개"였으면 유지(공개로 되돌리지 않음), funnel은 FUNNEL 6단계 외 값 제거.
  - `loadMemory(db, parentId)`, `saveMemory(db, parentId, state)` (version +1).

- [ ] **Step 1: 실패하는 테스트** — 스키마 불일치 입력 → prev 반환; 에피소드 누락 → 유지; 비공개 → 공개 시도 → 비공개 유지; periods 7 → 3; funnel `["열기","아무거나"]` → `["열기"]`; save 두 번 → version 3.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** Commit `feat(web): 기록 상태 병합`.

### Task 4: 지시문과 요청 조립

**Files:**
- Create: `web/lib/prompts/interviewer.ts`, `web/lib/prompts/recorder.ts`
- Test: `web/tests/unit/prompts.test.ts`

**Interfaces:**
- Consumes: `CONFIG`, `MemoryState` (Task 3)
- Produces:
  - `INTERVIEWER_VERSION = "interviewer-2026-11-25"`, `RECORDER_VERSION = "recorder-2026-11-25"`
  - `INTERVIEWER_SYSTEM: string` — 체험판 `INTERVIEWER_RULES`를 바탕으로, 음성으로 읽힌다는 전제를 추가: "2~3문장, 마크다운·괄호·이모지 금지, 숫자는 읽기 쉽게". 버튼 명령 목록: `기억이 안 나요`, `넘어갈게요`, `오늘은 여기까지`, `다시 왔어요`.
  - `buildInterviewerRequest(input: { honorific: string; state: MemoryState; seeds: {period: string; text: string}[]; lastSessionSummary: string | null; isNewSession: boolean; turns: {question: string; answer: string | null; command: string | null}[] }): { system: TextBlockParam[]; messages: MessageParam[] }`
    - system 블록 2개: [고정 지시문 (`cache_control: {type:"ephemeral"}`)] + [현재 상태 요약: 호칭, 시기별 채움, 에피소드 목록(id·시기·제목·깔때기 단계), 남은 씨앗 최대 8개, 지난 세션 요약, 새 세션 여부].
    - messages: 최근 `CONFIG.recentTurns`개 턴을 `assistant(question)` / `user(answer 또는 "[버튼] 명령")`로 펼침. 첫 메시지는 항상 user(`"(인터뷰 시작)"` 또는 `"(이전 대화 이어짐)"`), 마지막은 user. 답이 빈 턴은 `"(답 없음)"`.
  - `RECORDER_SYSTEM: string` — 체험판 `RECORDER_RULES` 그대로(+ quotes는 화자 답 원문에서만).
  - `buildRecorderRequest(input: { state: MemoryState; turns: same as above (최근 12개) }): { system: string; messages: MessageParam[] }` — 응답 형식은 Task 3의 `memoryJsonSchema`를 `output_config.format`으로 (Task 6이 붙임).

- [ ] **Step 1: 실패하는 테스트** — (a) 결과 system·messages 어디에도 `real_name` 값("김가명")이 없다 (입력에 아예 안 받지만, 상태 JSON에 실수로 들어간 경우도 막기 위해 `state.profile`에서 `realName` 키 제거 확인); (b) 턴 45개 입력 → messages에 질문 30개; (c) messages[0].role === "user", 마지막 role === "user"; (d) command `"오늘은 여기까지"` → user content `"[버튼] 오늘은 여기까지"`; (e) system[0]에 cache_control 존재; (f) `isNewSession: true`면 상태 요약에 "새 세션" 문구.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): 인터뷰어·기록자 지시문과 요청 조립`.

### Task 5: 링크 토큰과 동의

**Files:**
- Create: `web/lib/tokens.ts`, `web/lib/consent.ts`
- Test: `web/tests/unit/tokens.test.ts`

**Interfaces:**
- Produces:
  - `newToken(): { token: string; hash: string }` (32바이트 base64url, sha256 hex)
  - `hashToken(token: string): string`
  - `createLink(db, parentId, days = CONFIG.linkDays): Promise<{ linkId: number; url: string }>` — url은 `${origin}/r#k=${token}`, origin은 인자로 받음: 시그니처 `createLink(db, parentId, origin: string, days?)`.
  - `resolveToken(db, token: string): Promise<{ linkId: number; parentId: number } | null>` — 만료·중지·부모님 `retain_until` 지남이면 null. 성공 시 `last_used_at` 갱신.
  - `revokeLink(db, linkId)`.
  - `CONSENT_VERSION = "2026-11-25"`, `CONSENT_SCREENS: { id: "record" | "ai"; title: string; body: string[]; items: string[] }[]` — 문구는 spec 6-1 화면 ①·②를 쉬운 말 문장으로 (보관 기한 자리는 `{보관기한}` 치환).
  - `recordConsent(db, parentId, linkId, screen: "record"|"ai")`, `hasAllConsents(db, parentId): Promise<boolean>` (세 항목 모두).

- [ ] **Step 1: 실패하는 테스트** — 정상 토큰 → parentId; 틀린 토큰 → null; `revokeLink` 후 → null; 만료 시각 지난 링크 → null; DB에 원문 토큰이 저장되지 않음(links 행에 token 문자열 없음); `record`만 동의 → `hasAllConsents` false, `ai`까지 → true.
- [ ] **Step 2–4:** FAIL → 구현 → PASS. **Step 5:** Commit `feat(web): 링크 토큰과 동의 기록`.

### Task 6: BAZE 클라이언트, 키 순환, 사용량 기록, 오디오 변환

**Files:**
- Create: `web/lib/baze/keys.ts`, `web/lib/baze/client.ts`, `web/lib/usage.ts`, `web/lib/audio.ts`
- Test: `web/tests/unit/baze.test.ts`, `web/tests/unit/audio.test.ts`

**Interfaces:**
- Produces:
  - `class KeyPool { constructor(keys: {name: string; key: string}[]); current(): {name, key} | null; markExhausted(name: string): void; }` — `fromEnv()`는 `BAZE_API_KEYS`를 `key1..N`으로.
  - `class BazeError extends Error { status: number; code: "no_credit" | "rate_limited" | "bad_request" | "server" | "no_keys" }`
  - `createBaze(opts: { pool: KeyPool; fetch?: typeof fetch; anthropicFactory?: (key: string) => Anthropic })` 반환 객체:
    - `message(args: { model; system; messages; maxTokens; effort; jsonSchema?: object }): Promise<{ text: string; json?: unknown; usage: UsageRow; stopReason: string }>` — `jsonSchema`가 있으면 `output_config: { effort, format: { type: "json_schema", schema } }`. 402 → `markExhausted` 후 다음 키로 한 번 더, 키가 없으면 `BazeError("no_credit")`. `stop_reason === "refusal"`이면 `text: ""`.
    - `transcribe(file: Buffer, filename: string): Promise<{ text: string; usage: UsageRow }>` — 시작 후 1.5초 간격 폴링, 최대 120초, `failed` → `BazeError("server")`.
    - `speak(text: string): Promise<{ pcm: Buffer; usage: UsageRow }>`
    - `balances(): Promise<{name: string; remaining: number}[]>` (`/credits/`의 `total.remaining`)
  - `UsageRow = { kind; model; keyName; inputTokens; outputTokens; cacheReadTokens; audioSec; costUsd; credits: number | null }`. `costUsd`는 `PRICES` 표(Sonnet 5.5 입력 2.0/출력 10.0/캐시읽기 0.1, Haiku 5.5 0.1/0.5/0.01 USD per 1M)로 계산, STT는 응답 `credits_charged`를 `credits`에.
  - `recordUsage(db, row: UsageRow, ctx: { parentId?: number; sessionId?: number })`
  - `toSttFormat(buf: Buffer, mime: string): Promise<{ buf: Buffer; filename: string; mime: string }>` — `audio/webm*` → ffmpeg `-c:a copy -f ogg` (`answer.ogg`, `audio/ogg`), `audio/mp4`·`audio/aac`·`audio/mpeg`·`audio/ogg`·`audio/wav` → 그대로.
  - `pcmToMp3(pcm: Buffer): Promise<Buffer>` — ffmpeg `-f s16le -ar 24000 -ac 1 -i - -b:a 48k -f mp3 -`.
  - `audioSeconds(buf, mime): Promise<number>` (ffmpeg로 길이 측정).

- [ ] **Step 1: 실패하는 테스트 (`baze.test.ts`, fetch·Anthropic 가짜 주입)** — (a) key1이 402 → key2로 재시도 성공, `usage.keyName === "key2"`; (b) 두 키 모두 402 → `BazeError` code `no_credit`; (c) STT: 시작 응답 `{operation_id:"op1", credits_charged: 1.5}`, 폴링 `processing` → `completed {text:"감나무가 있었어요"}` → text 반환, credits 1.5; (d) multipart 본문에 `language_hints`=`ko`, `model`=`stt-async-v5`; (e) Sonnet usage `{input 1000, output 100, cache_read 500}` → costUsd `0.00305`; (f) 오류 메시지·로그 어디에도 키 문자열이 없다(가짜 키 `sk-test-SECRET` 검사).
- [ ] **Step 2: 실패하는 테스트 (`audio.test.ts`)** — 테스트 안에서 ffmpeg-static으로 1초 사인파 webm/opus를 만들고 `toSttFormat` → mime `audio/ogg`, ffprobe 대신 `audioSeconds` ≈ 1 (±0.2); 1초 PCM 0바이트열 48000바이트 → `pcmToMp3` 결과 앞 3바이트가 `ID3` 또는 프레임 동기 `0xFF 0xFB/0xF3`.
- [ ] **Step 3:** FAIL. **Step 4:** 구현. **Step 5:** PASS.
- [ ] **Step 6: 실제 연결 확인 (한 번, 수동)** — `BAZE_API_KEYS=proxy-injected npx tsx scripts/baze-smoke.ts` (Create `web/scripts/baze-smoke.ts`: `message`로 질문 1개, `speak`로 "안녕하세요" 합성 후 mp3 변환, 1초 녹음 파일 `transcribe`, `balances`). 기대: 질문 한 문장 출력, mp3 바이트 > 0, STT 결과(빈 문자열 가능), 잔액 숫자. structured output이 400이면 `jsonSchema` 대신 프롬프트 JSON + `JSON.parse`로 바꾸고 그 사실을 커밋 메시지에 적는다.
- [ ] **Step 7:** Commit `feat(web): BAZE 클라이언트, 키 순환, 오디오 변환`.

### Task 7: AI 멈춤 판단과 한 턴 파이프라인

**Files:**
- Create: `web/lib/ai-mode.ts`, `web/lib/storage.ts`, `web/lib/turn.ts`
- Test: `web/tests/unit/turn.test.ts`

**Interfaces:**
- Consumes: Task 2 스키마, Task 4 `buildInterviewerRequest`/`buildRecorderRequest`, Task 3 `mergeMemory`/`loadMemory`/`saveMemory`, Task 6 `createBaze`, `toSttFormat`, `pcmToMp3`, `recordUsage`.
- Produces:
  - `Storage = { put(path: string, buf: Buffer, mime: string): Promise<void>; get(path: string): Promise<Buffer>; signedUploadUrl(path: string): Promise<{ url: string; token: string }>; signedReadUrl(path: string, sec?: number): Promise<string>; remove(paths: string[]): Promise<void> }` — `supabaseStorage()`(버킷 `audio`)와 테스트용 `memoryStorage()`.
  - `aiMode(db, baze): Promise<{ paused: boolean; reason: "manual" | "credits" | null }>` — `settings.ai_paused_manual`이 true면 manual. `credit_snapshot`이 5분보다 오래됐으면 `baze.balances()`로 갱신해 저장. 합이 `CONFIG.pauseBelowCredits` 미만이면 credits.
  - `startSession(deps, parentId): Promise<{ sessionId: number; turn: TurnOut }>` — 열린 세션(마지막 턴 24시간 이내, ended 아님)이 있으면 그걸 이어 쓰고 마지막 미완료 턴을 반환, 없으면 새 세션 + 첫 질문(AI면 인터뷰어, 멈춤이면 첫 미사용 씨앗).
  - `TurnOut = { turnId: number; seq: number; question: string; audioUrl: string | null; source: "ai" | "seed" | "system"; done: boolean }` (`done`은 "오늘은 여기까지" 마무리 멘트일 때 true)
  - `completeTurn(deps, args: { parentId: number; turnId: number; audioPath: string | null; mime: string | null; command: string | null }): Promise<TurnOut>` — 순서: (1) 턴이 이 부모님 것인지 확인, 아니면 `NotFound`; (2) 이미 `completed_at`이 있으면 다음 턴(seq+1)을 그대로 반환 (중복 요청); (3) 녹음 있으면 `toSttFormat` → AI 모드면 `transcribe`, 멈춤이면 `stt='deferred'`; 결과가 공백뿐이면 `stt='empty'`이고 다음 질문은 고정 문구 `"소리가 잘 안 들렸어요. 한 번만 더 말씀해 주시겠어요?"` + 같은 질문 이어 붙임 (`source: "system"`); (4) 다음 질문: AI 모드·하루 80턴 미만이면 인터뷰어, `BazeError` 또는 빈 응답이면 씨앗으로; 멈춤이면 씨앗 (씨앗 `used_at` 표시). 씨앗이 다 떨어지면 `"오늘 들려주신 이야기 정말 고맙습니다. 다음에 또 여쭤볼게요."` + `done: true`. (5) 질문 음성: AI 모드면 `speak` → mp3 → Storage `q/{parentId}/{turnId}.mp3`, 씨앗에 `audio_path`가 있으면 그것, 아니면 null(브라우저 음성). (6) 새 턴 insert, 이전 턴 `completed_at` 기록. 전체를 DB 트랜잭션 + 이전 턴 행 잠금(`FOR UPDATE`)으로.
  - `runRecorder(deps, parentId): Promise<void>` — 최근 12턴으로 기록자 호출 → `mergeMemory` → 저장. 실패해도 throw하지 않고 로그만.
  - `deps = { db; baze; storage; now?: () => Date }`

- [ ] **Step 1: 실패하는 테스트 (PGlite + 가짜 baze + memoryStorage)** —
  - 정상: 녹음 + STT "감나무가 있었어요" → 인터뷰어 응답 "감나무 아래서 주로 뭘 하셨어요?" → 새 턴 question 일치, `source:"ai"`, ai_usage 행 3개(stt, interviewer, tts).
  - **중복 완료(Review Focus 2):** 같은 `completeTurn` 두 번(동시에 `Promise.all`) → 턴 수 1개 증가, 두 결과의 turnId 같음, STT 호출 1번.
  - **크레딧 바닥(Review Focus 5):** 가짜 baze가 transcribe·message 모두 `BazeError no_credit` → 녹음 경로 저장, `stt='deferred'`, 다음 질문 = 첫 미사용 씨앗, `source:"seed"`.
  - 멈춤(manual) → baze 호출 0회, 씨앗 질문.
  - 빈 전사 → 고정 문구로 시작하는 질문, `source:"system"`.
  - 다른 부모님의 turnId → `NotFound`.
  - 하루 80턴 넘으면 인터뷰어 호출 없이 씨앗.
  - 인터뷰어가 refusal(빈 text) → 씨앗.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** Commit `feat(web): 한 턴 처리 파이프라인과 AI 멈춤`.

### Task 8: 부모님 API

**Files:**
- Create: `web/lib/parent-api.ts`, `web/app/api/r/[action]/route.ts`
- Test: `web/tests/unit/parent-api.test.ts`

**Interfaces:**
- Consumes: Task 5 `resolveToken`, `recordConsent`, `hasAllConsents`, `CONSENT_SCREENS`; Task 7 `startSession`, `completeTurn`, `runRecorder`, `Storage`.
- Produces: 모든 요청은 `POST /api/r/{action}`, 본문 JSON에 `token`. 토큰이 무효면 401 `{error:"link_invalid"}`. `handleParent(action, body, deps): Promise<{status: number; json: object}>`:
  - `info` → `{ honorific, operatorPhone, consentsDone: boolean, consentScreens, retainUntil }`
  - `consent` `{screen}` → `{ ok: true, consentsDone }`
  - `start` → 동의 미완료면 403 `{error:"consent_required"}`; 아니면 `TurnOut` + `sessionId`
  - `upload-url` `{turnId, mime}` → `{ path: "a/{parentId}/{turnId}.{ext}", url, token }` (ext: webm|m4a|mp4|ogg|wav), 턴이 이 부모님 것이 아니면 404
  - `complete` `{turnId, path|null, mime|null, command|null}` → `TurnOut`; 응답 뒤 `after(() => runRecorder(...))` (녹음이 있었을 때만)
  - `end` `{sessionId}` → `{ ok: true }` (`ended_at`, `end_reason:"user"`)
- route.ts는 `handleParent`를 부르고 JSON 반환만. `runtime` 지정 안 함(Node 기본), `maxDuration = 120`.

- [ ] **Step 1: 실패하는 테스트** — (Review Focus 4) 중지된 링크 → 401, 응답에 honorific 없음; 다른 부모님 turnId로 `upload-url`·`complete` → 404; 동의 전 `start` → 403; `consent record` → `ai` → `start` → 200 + question; `upload-url` path가 `a/{parentId}/`로 시작.
- [ ] **Step 2–4:** FAIL → 구현 → PASS. **Step 5:** Commit `feat(web): 부모님 API`.

### Task 9: 부모님 화면 (녹음·재생·시연 모드)

**Files:**
- Create: `web/app/r/page.tsx`, `web/app/r/ParentApp.tsx`, `web/app/r/parent.css`, `web/lib/parent/machine.ts`, `web/lib/parent/recorder.ts`, `web/lib/parent/backup.ts`, `web/lib/parent/speak.ts`, `web/lib/parent/browser.ts`, `web/lib/parent/demo.ts`, `web/playwright.config.ts`
- Test: `web/tests/unit/machine.test.ts`, `web/tests/e2e/parent.spec.ts`

**Interfaces:**
- Consumes: Task 8 API 계약 (클라이언트 `api(action, body)` 함수, 시연 모드에서는 `demo.ts`의 같은 모양 가짜).
- Produces:
  - `type Screen = "loading" | "invalid" | "hello" | "consent-record" | "consent-ai" | "declined" | "mic-help" | "inapp-help" | "question" | "recording" | "thinking" | "goodbye" | "error"`
  - `reduce(state: ParentState, event: ParentEvent): ParentState` — 순수 함수. 이벤트: `INFO_OK{consentsDone}`, `INFO_FAIL`, `START`, `CONSENT_OK{screen}`, `DECLINE`, `MIC_DENIED`, `INAPP_BLOCKED`, `TURN{TurnOut}`, `REC_START`, `REC_STOP`, `REC_LIMIT`, `UPLOAD_FAIL`, `END`.
  - `detectInApp(ua: string): "kakao" | "other" | null` (카카오톡 `KAKAOTALK`, 네이버 `NAVER(inapp`, 인스타 `Instagram`, 페북 `FBAN|FBAV`, 안드로이드 웹뷰 `; wv)`)
  - `startRecording(): Promise<Recording>` — `MediaRecorder`, mime 우선순위 `audio/mp4` → `audio/webm;codecs=opus` → `audio/webm`, 64kbps, 5초마다 조각을 `backup.ts`로 IndexedDB(`moaon-rec`, 키 `turnId`)에 저장. `Recording.stop(): Promise<Blob>`. `CONFIG.maxAnswerSec`에서 자동 정지. 녹음 중 Wake Lock 요청(실패 무시). 아이폰에서 녹음 중 화면이 3초 넘게 숨겨지면(`visibilitychange`) 그때까지 녹음을 정지·백업하고, 돌아오면 `"녹음이 잠시 멈췄어요. 이어서 말씀하시려면 '말하기'를 눌러 주세요."`와 함께 지금까지 녹음을 먼저 보낸다.
  - `backup.ts`: `saveChunk(turnId, blob)`, `loadPending(): Promise<{turnId, blob, mime}[]>`, `clear(turnId)`.
  - `speak.ts`: `playQuestion(audioUrl: string | null, text: string): Promise<void>` — url 있으면 `<audio>`, 없거나 실패하면 `speechSynthesis` (`lang: "ko-KR"`, rate 0.9). 소리 끄기 토글은 localStorage `moaon-sound`.
- 화면 문구(정확히): 인사 `"{호칭}, 안녕하세요. 모아온입니다."` / 버튼 `"시작하기"`; 동의 버튼 `"동의합니다"`, 보조 `"읽어 주세요"`, 거절 안내 `"동의하지 않으셔도 됩니다. 그러면 녹음은 하지 않고, 전화로 여쭤보는 방법을 안내해 드려요."`; 질문 화면 버튼 `"● 말하기"`, 작은 버튼 `"기억이 안 나요"`, `"넘어갈게요"`, `"질문 다시 듣기"`, 아래 `"오늘은 여기까지"`; 녹음 중 `"■ 다 했어요"`; 처리 중 `"잘 들었어요. 잠시만요…"`; 카카오 안내 `"카카오톡 안에서는 녹음이 안 될 수 있어요. 오른쪽 위 ⋮ 를 누르고 '다른 브라우저로 열기'를 눌러 주세요."`. 모든 화면 하단에 `"도움이 필요하시면 전화 주세요: {operatorPhone}"`.
  - 버튼 명령 문자열: `기억이 안 나요` → command `"기억이 안 나요"`, `넘어갈게요` → `"넘어갈게요"`, `오늘은 여기까지` → `"오늘은 여기까지"` (녹음 없이 `complete`).
  - 시작 시 `loadPending()`에 남은 녹음이 있으면 먼저 업로드·`complete` 후 이어서 진행 (Review Focus 3).
  - `?demo=1`: 서버 호출 없이 `demo.ts`의 가짜 API(가명 "어머님", 질문 4개 순환, 1.5초 지연) 사용, 녹음은 로컬 재생만, 화면 상단 `"체험 화면입니다. 아무것도 저장되지 않아요."`.

- [ ] **Step 1: 실패하는 테스트 (`machine.test.ts`)** — `INFO_OK{consentsDone:false}` → hello → START → consent-record → CONSENT_OK{record} → consent-ai → CONSENT_OK{ai} → mic-help; `INAPP_BLOCKED` → inapp-help (Review Focus 1); recording + `REC_LIMIT` → thinking; thinking + `UPLOAD_FAIL` → error(재시도 버튼 상태 보존, 같은 turnId); `TURN{done:true}` → goodbye; `detectInApp` 카카오 UA → "kakao", 아이폰 사파리 UA → null.
- [ ] **Step 2:** FAIL. **Step 3:** 구현 (화면은 `reduce` 상태로만 그림, 주 버튼 하나).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: e2e (`parent.spec.ts`, `--trace off`, Chromium `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`)** — `/r?demo=1`: 시작하기 → 동의합니다 ×2 → 말하기 → 다 했어요 → "잘 들었어요" 보임 → 다음 질문 글자가 바뀜 → 오늘은 여기까지 → 마무리 화면. 카카오 UA로 `/r?demo=1` 열고 녹음 시도 → 카카오 안내 문구 보임. 390×844 화면에서 가로 스크롤 없음, 주 버튼 높이 ≥ 64px.
- [ ] **Step 6:** `npm run e2e -- --trace off` PASS. **Step 7:** Commit `feat(web): 부모님 화면과 시연 모드`.

### Task 10: 운영자 로그인, 부모님·질문·링크 관리

**Files:**
- Create: `web/lib/admin-api.ts`, `web/app/api/admin/[...path]/route.ts`, `web/app/admin/login/page.tsx`, `web/app/admin/(main)/layout.tsx`, `web/app/admin/(main)/page.tsx`, `web/app/admin/(main)/parents/[id]/page.tsx`, `web/lib/supabase-auth.ts`
- Test: `web/tests/unit/admin-api.test.ts`

**Interfaces:**
- Consumes: Task 2 `copyDefaultSeeds`, Task 5 `createLink`/`revokeLink`.
- Produces:
  - `requireAdmin(req): Promise<{ email: string }>` — Supabase Auth 세션(쿠키, `@supabase/ssr`)의 이메일이 `ADMIN_EMAILS`에 있어야 함, 아니면 401.
  - `handleAdmin(method, path, body, deps)` 경로:
    - `GET /parents` → 목록 `{id, honorific, status, lastAnswerAt, periods, monthCredits}`
    - `POST /parents` `{honorific, realName?, birthYear?, hometown?, job?, familyNote?, guardianContact?}` → 생성 + 기본 씨앗 복사 + `blankMemory`, `retain_until = 오늘+365일`
    - `PUT /parents/:id` (같은 필드 + `retainUntil`)
    - `GET /parents/:id/seeds`, `PUT /parents/:id/seeds` `[{id?, period, text, source, position, enabled}]` (전체 교체, 사용된 씨앗은 text 변경 불가)
    - `POST /parents/:id/links` → `{ url, expiresAt, message }` (`message`: `"{호칭}, 안녕하세요. 모아온입니다.\n살아오신 이야기를 여쭙고 싶어요.\n\n{url}\n\n링크를 누르고 말씀하시듯 답해 주시면 됩니다."`), `GET /parents/:id/links`, `POST /links/:id/revoke`
  - 씨앗 음성 미리 만들기 (spec 6-6): `PUT seeds` 응답 뒤 `after()`로, AI 멈춤이 아니면 `audio_path`가 없는 활성 씨앗마다 `speak` → mp3 → Storage `s/{parentId}/{seedId}.mp3` 저장. 실패는 건너뜀.
  - 화면: 로그인(이메일·비밀번호), 목록(카드 아닌 표), 부모님 상세 탭 `정보 / 질문 / 링크 / 대화 기록 / 이야기 카드` (뒤 둘은 Task 11). 링크는 만든 직후 한 번만 보이고 [복사] 버튼, 문안 [복사].

- [ ] **Step 1: 실패하는 테스트** — `PUT seeds` 후 씨앗 음성 생성 함수(직접 호출)가 활성·음성 없는 씨앗에만 `speak` 호출, 멈춤이면 0회; 로그인 안 함 → 401; `ADMIN_EMAILS` 밖 이메일 → 401 (requireAdmin을 가짜 세션으로 주입); `POST /parents` → seeds 18개, memory 행 존재; `PUT seeds`로 사용된 씨앗 text 변경 시도 → 400; 링크 목록 응답에 token·token_hash 없음.
- [ ] **Step 2–4:** FAIL → 구현 → PASS. **Step 5:** Commit `feat(web): 운영자 로그인과 부모님·질문·링크 관리`.

### Task 11: 운영자 대화 기록, 이야기 카드, 크레딧과 AI 멈춤

**Files:**
- Modify: `web/lib/admin-api.ts`, `web/app/admin/(main)/layout.tsx`, `web/app/admin/(main)/parents/[id]/page.tsx`
- Test: `web/tests/unit/admin-api.test.ts` (추가)

**Interfaces:**
- Consumes: Task 7 `aiMode`, `Storage.signedReadUrl`, Task 6 `createBaze().transcribe`, `recordUsage`.
- Produces (`handleAdmin` 경로 추가):
  - `GET /parents/:id/sessions` → `[{id, startedAt, endedAt, turns:[{seq, question, source, answerUrl (서명 10분), answerSec, transcript, stt, command}]}]`
  - `GET /parents/:id/memory` → `MemoryState`
  - `GET /credits` → `{ keys:[{name, remaining}], paused, reason, monthUsage:{credits, costUsd, turns}, avgCreditsPerTurn }`
  - `PUT /ai-pause` `{paused: boolean}`
  - `POST /parents/:id/transcribe-deferred` → `stt='deferred'` 턴을 차례로 전사(멈춤이면 409), `{done: n, left: m}`
- 화면: 모든 운영자 페이지 맨 위 띠 `"AI 크레딧: key1 4,820 · key2 5,000 · 이번 달 1턴 평균 72크레딧"`, 멈춤이면 띠 색 바꾸고 `"AI 멈춤 (크레딧 부족) — 부모님은 미리 정한 질문으로 계속 녹음할 수 있어요"` + [AI 다시 켜기]/[AI 멈추기]. 대화 기록 탭: 세션별 질문 → `<audio controls>` → 전사 원문, 미뤄 둔 녹음 수와 [미뤄 둔 녹음 글로 옮기기]. 이야기 카드 탭: 체험판 카드 모양(제목, 시기, 줄거리, 원래 표현, 깔때기 단계, 비공개/확인 필요 표시) 읽기 전용.

- [ ] **Step 1: 실패하는 테스트** — credits 합계·평균 계산(ai_usage 가짜 행: 턴 2개, credits 합 150 → 평균 75); `PUT /ai-pause true` 후 `aiMode` paused manual; 멈춤 상태에서 `transcribe-deferred` → 409; 멈춤 해제 후 deferred 2개 → transcribe 2번, `stt='done'`; sessions 응답의 answerUrl이 서명 주소이고 공개 경로가 아님.
- [ ] **Step 2–4:** FAIL → 구현 → PASS. **Step 5:** Commit `feat(web): 대화 기록·이야기 카드·크레딧 화면과 AI 멈춤`.

### Task 12: 개인정보 안내, 설정 안내서, 배포 확인

**Files:**
- Create: `web/app/privacy/page.tsx`, `web/README.md`, `web/scripts/setup-storage.ts`
- Modify: `README.md` (저장소 구성에 `web/`, `docs/` 추가), `PROGRESS.md` (오늘 한 일)
- Test: `web/tests/e2e/privacy.spec.ts`

**Interfaces:**
- Consumes: Task 5 `CONSENT_SCREENS`, `CONSENT_VERSION`.
- Produces:
  - `/privacy`: 동의 화면과 같은 문구를 바탕으로 무엇을 모으는지, 누가 보는지, AI 처리 경로(마인드로직 BAZE(국내) → Soniox·Google·Anthropic(미국), 학습 미사용), 보관 기한, 내려받기·삭제 요청 방법(운영자 전화·이메일), 문구 버전. 20px 본문.
  - `setup-storage.ts`: Supabase에 비공개 버킷 `audio` 생성(있으면 건너뜀).
  - `web/README.md`: ① Supabase 무료 프로젝트 만들기 → `DATABASE_URL`(Transaction pooler), URL, anon·service role 키 ② `drizzle/0000_init.sql` 실행(SQL Editor) ③ `npx tsx scripts/setup-storage.ts` ④ Auth에서 운영자 계정 만들기 ⑤ Vercel Hobby 프로젝트(Root Directory `web`) + 환경 변수 8개 ⑥ 배포 후 확인 순서(아래 Step 3). 키는 채팅·저장소에 넣지 말 것.
- [ ] **Step 1: e2e** — `/privacy`에 "AI 학습에 쓰지 않습니다", "Anthropic", "Soniox", "Google", "마인드로직" 문구가 있고 390px에서 가로 스크롤 없음. FAIL 확인 → 구현 → PASS.
- [ ] **Step 2:** `npm test && npm run build && npm run e2e -- --trace off` 모두 통과.
- [ ] **Step 3: 실제 환경 확인 (사용자가 Supabase·Vercel 준비 후)** — 운영자 로그인 → 가명 부모님 등록 → 링크 발급 → 휴대폰(안드로이드 크롬, 아이폰 사파리, 카카오톡)으로 열기 → 동의 → 답 2개 → 운영자 화면에서 녹음 재생·전사·이야기 카드·크레딧 차감 확인 → 링크 중지 후 다시 열면 "링크가 더 이상 쓸 수 없어요" 화면. 결과를 `PROGRESS.md`에 기록 (실제 내용 없이 통과/실패만).
- [ ] **Step 4:** Commit `docs(web): 개인정보 안내와 설정·배포 안내서`.
