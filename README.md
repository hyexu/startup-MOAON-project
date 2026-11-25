# MOAON — AI로 부모님 인생 책 만들기

AI가 부모님과 대화하며 유년·학창·청년 시절의 이야기를 자연스럽게 이끌어내고, 그 내용을 기록·윤문해 한 권의 회고록으로 엮어 주는 서비스입니다.

## 핵심 기능
1. **대화 리드** — AI가 답변의 구체적인 단어를 이어받아 다음 질문을 스스로 만들고, 장면 → 감각 → 인물 → 감정 → 의미 순으로 기억을 깊게 끌어냅니다.
2. **기록** — 이야기마다 에피소드 카드(시기·장소·인물·줄거리·원래 표현·확인 필요 사항)로 정리합니다.
3. **책으로 엮기** — 화자의 말투를 살린 1인칭 회고록 원고를 장 단위로 작성합니다. 없는 사실은 지어내지 않습니다.

## 현재 단계
- 시장조사 진행 중 (고려대 창업 수업)
- 인터뷰 AI 시범: Claude 스킬로 프로토타입 작성 → [`skills/life-story-interviewer/SKILL.md`](skills/life-story-interviewer/SKILL.md)
- 화면 시제품(spike): [`spike/memoir-interviewer.html`](spike/memoir-interviewer.html)
  - 탭 3개: 인터뷰(대화) · 기록 카드 · 책(원고, 직접 수정 가능)
  - 어르신용 큰 글씨, 음성 받아쓰기·읽어 주기, 원고 HTML/TXT 다운로드
  - Claude 기능(`claude.use`)을 쓰므로 **claude.ai에서 artifact로 열어야 동작**합니다. GitHub에서 파일을 바로 열면 대화가 되지 않습니다.

진행 상황은 [`PROGRESS.md`](PROGRESS.md)에 날짜별로 기록합니다.

## 저장소 구성
```
README.md                              서비스 소개, 현재 단계
PROGRESS.md                            날짜별 진행 일지
skills/life-story-interviewer/SKILL.md 인터뷰·기록·원고 작성 AI 지침
spike/memoir-interviewer.html          인터뷰 화면 시제품 (claude.ai artifact)
pilot/                                 시범 결과 요약 (가명 처리한 샘플만)
```

## 개인정보 원칙
이 저장소는 공개 저장소입니다. 실제 인터뷰 원문·원고·실명은 올리지 않고, 가명 처리한 샘플과 요약만 올립니다.
