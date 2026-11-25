"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialState, reduce } from "@/lib/parent/machine";
import type { ParentApi } from "@/lib/parent/types";
import { demoApi } from "@/lib/parent/demo";
import { realApi } from "@/lib/parent/api";
import { detectInApp, isIOS } from "@/lib/parent/browser";
import { ensureMic, startRecording, type Recording } from "@/lib/parent/recorder";
import { clear, loadPending } from "@/lib/parent/backup";
import { playQuestion, setSound, soundOn, stopSpeaking, unlockAudio } from "@/lib/parent/speak";

const COPY = {
  start: "시작하기",
  agree: "동의합니다",
  readAloud: "읽어 주세요",
  decline: "동의하지 않을래요",
  declined: "동의하지 않으셔도 됩니다. 그러면 녹음은 하지 않고, 전화로 여쭤보는 방법을 안내해 드려요.",
  micHelp: "다음 화면에서 '허용'을 눌러 주세요. 말씀을 녹음하려면 마이크가 필요해요.",
  micDenied: "마이크가 꺼져 있어요. 주소창 옆 자물쇠 모양을 누르고 마이크를 '허용'으로 바꾼 뒤 다시 눌러 주세요.",
  micOn: "마이크 켜기",
  inapp: "카카오톡 안에서는 녹음이 안 될 수 있어요. 오른쪽 위 ⋮ 를 누르고 '다른 브라우저로 열기'를 눌러 주세요.",
  inappOther: "이 앱 안에서는 녹음이 안 될 수 있어요. 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요.",
  inappContinue: "여기서 그냥 해 볼게요",
  speak: "● 말하기",
  done: "■ 다 했어요",
  forgot: "기억이 안 나요",
  skip: "넘어갈게요",
  replay: "질문 다시 듣기",
  end: "오늘은 여기까지",
  thinking: "잘 들었어요. 잠시만요…",
  error: "보내지 못했어요. 인터넷 연결을 확인하고 '다시 보내기'를 눌러 주세요. 말씀하신 내용은 휴대폰에 남아 있어요.",
  retry: "다시 보내기",
  invalid: "링크가 더 이상 쓸 수 없어요. 모아온에 연락 주시면 새 링크를 보내 드려요.",
  iosResume: "녹음이 잠시 멈췄어요. 이어서 말씀하시려면 '말하기'를 눌러 주세요.",
  demo: "체험 화면입니다. 아무것도 저장되지 않아요.",
  soundOff: "소리 끄기",
  soundOnLabel: "소리 켜기",
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${y}년 ${Number(m)}월 ${Number(d)}일` : iso;
};

function Clock({ startedAt }: { startedAt: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => { const t = setInterval(() => setSec(Math.floor((Date.now() - startedAt) / 1000)), 500); return () => clearInterval(t); }, [startedAt]);
  return <p className="clock" aria-label="녹음 시간">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</p>;
}

function Level({ rec }: { rec: Recording }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = 0;
    const loop = () => { if (bar.current) bar.current.style.width = `${Math.min(100, Math.round(rec.level() * 160))}%`; id = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(id);
  }, [rec]);
  return <div className="level" aria-hidden="true"><div ref={bar} /></div>;
}

type Boot = { demo: boolean; token: string; inApp: ReturnType<typeof detectInApp> };
function readBoot(): Boot {
  return {
    demo: new URLSearchParams(location.search).get("demo") === "1",
    token: new URLSearchParams(location.hash.slice(1)).get("k") ?? "",
    inApp: detectInApp(navigator.userAgent),
  };
}

/** Rendered only in the browser (see ClientOnly), so location and navigator are available at first render. */
export default function ParentApp() {
  const [boot] = useState(readBoot);
  const { demo } = boot;
  const [s, dispatch] = useReducer(reduce, initialState, (st) => (!boot.demo && !boot.token ? reduce(st, { type: "INFO_FAIL" }) : st));
  const [notice, setNotice] = useState<string | null>(null);
  const [sound, setSoundState] = useState(soundOn);
  const api = useRef<ParentApi | null>(null);
  const inApp = useRef(boot.inApp);
  const rec = useRef<Recording | null>(null);
  const [recState, setRecState] = useState<Recording | null>(null);
  const pending = useRef<{ turnId: number; blob: Blob | null; mime: string | null; command: string | null } | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!boot.demo && !boot.token) return;
    api.current = boot.demo ? demoApi() : realApi(boot.token);
    api.current.info().then((info) => dispatch({ type: "INFO_OK", info })).catch(() => dispatch({ type: "INFO_FAIL" }));
  }, [boot]);

  // Read each new question aloud.
  useEffect(() => {
    if ((s.screen === "question" || s.screen === "goodbye") && s.turn) void playQuestion(s.turn.audioUrl, s.turn.question);
  }, [s.screen, s.turn]);

  const send = useCallback(async () => {
    const p = pending.current;
    if (!p || !api.current) return;
    try {
      const path = p.blob && p.mime ? await api.current.upload(p.turnId, p.blob, p.mime) : null;
      const next = await api.current.complete(p.turnId, path, p.blob ? p.mime : null, p.command);
      await clear(p.turnId);
      pending.current = null;
      dispatch({ type: "TURN", turn: next });
    } catch {
      dispatch({ type: "UPLOAD_FAIL" });
    }
  }, []);

  const begin = useCallback(async () => {
    try {
      const left = (await loadPending())[0];
      const first = await api.current!.start();
      if (left && left.turnId === first.turnId) {
        dispatch({ type: "TURN", turn: first });
        pending.current = { turnId: left.turnId, blob: left.blob, mime: left.mime, command: null };
        dispatch({ type: "REC_STOP" });
        await send();
        return;
      }
      dispatch({ type: "TURN", turn: first });
    } catch {
      dispatch({ type: "FAIL" });
    }
  }, [send]);

  const micOn = useCallback(async (skipInApp = false) => {
    if (inApp.current && !skipInApp) { dispatch({ type: "INAPP_BLOCKED" }); return; }
    try {
      await ensureMic();
      dispatch({ type: "MIC_OK" });
      await begin();
    } catch {
      dispatch(inApp.current ? { type: "INAPP_BLOCKED" } : { type: "MIC_DENIED" });
    }
  }, [begin]);

  const finish = useCallback(async () => {
    const r = rec.current;
    if (!r || !s.turn) return;
    rec.current = null;
    setRecState(null);
    dispatch({ type: "REC_STOP" });
    const blob = await r.stop();
    pending.current = { turnId: s.turn.turnId, blob, mime: r.mime, command: null };
    await send();
  }, [s.turn, send]);

  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; }, [finish]);

  const speakNow = useCallback(async () => {
    if (!s.turn) return;
    stopSpeaking();
    setNotice(null);
    try {
      const r = await startRecording(s.turn.turnId, () => void finishRef.current());
      rec.current = r;
      setRecState(r);
      dispatch({ type: "REC_START" });
    } catch {
      dispatch(inApp.current ? { type: "INAPP_BLOCKED" } : { type: "MIC_DENIED" });
    }
  }, [s.turn]);
  const command = useCallback(async (c: string) => {
    if (!s.turn) return;
    stopSpeaking();
    pending.current = { turnId: s.turn.turnId, blob: null, mime: null, command: c };
    dispatch({ type: "COMMAND" });
    await send();
  }, [s.turn, send]);

  // iPhone stops the microphone when the screen turns off: send what we have.
  useEffect(() => {
    const onVis = () => {
      if (!isIOS(navigator.userAgent) || !rec.current) return;
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > 3000) {
        hiddenAt.current = null;
        setNotice(COPY.iosResume);
        void finishRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const info = s.info;
  const screens = info?.consentScreens ?? [];
  const consent = screens.find((c) => c.id === (s.screen === "consent-ai" ? "ai" : "record"));
  const consentLines = consent?.body.map((l) => l.replace("{보관기한}", fmtDate(info?.retainUntil ?? ""))) ?? [];

  return (
    <main className="parent">
      {demo && <p className="demo">{COPY.demo}</p>}
      <section className="screen" data-screen={s.screen}>
        {s.screen === "loading" && <p className="lead">불러오는 중이에요…</p>}

        {s.screen === "invalid" && <p className="lead">{COPY.invalid}</p>}

        {s.screen === "hello" && info && (
          <>
            <h1 className="title">{info.honorific}, 안녕하세요. 모아온입니다.</h1>
            <p className="lead">살아오신 이야기를 한 가지씩 여쭤볼게요. 편하게 말씀하시듯 답해 주시면 됩니다.</p>
            <button className="primary" onClick={() => { unlockAudio(); dispatch({ type: "START" }); }}>{COPY.start}</button>
          </>
        )}

        {(s.screen === "consent-record" || s.screen === "consent-ai") && consent && (
          <>
            <h1 className="title">{consent.title}</h1>
            <ul className="consent">{consentLines.map((l) => <li key={l}>{l}</li>)}</ul>
            <button className="primary" onClick={async () => {
              const id = consent.id;
              await api.current!.consent(id);
              dispatch({ type: "CONSENT_OK", screen: id });
            }}>{COPY.agree}</button>
            <div className="minor">
              <button className="link" onClick={() => void playQuestion(null, [consent.title, ...consentLines].join(" "))}>{COPY.readAloud}</button>
              <button className="link" onClick={() => dispatch({ type: "DECLINE" })}>{COPY.decline}</button>
            </div>
            <p className="fine"><a href="/privacy" target="_blank" rel="noopener">개인정보 안내 자세히 보기</a></p>
          </>
        )}

        {s.screen === "declined" && <p className="lead">{COPY.declined}</p>}

        {s.screen === "mic-help" && (
          <>
            <p className="lead">{s.micDenied ? COPY.micDenied : COPY.micHelp}</p>
            <button className="primary" onClick={() => void micOn(false)}>{COPY.micOn}</button>
          </>
        )}

        {s.screen === "inapp-help" && (
          <>
            <p className="lead">{boot.inApp === "kakao" ? COPY.inapp : COPY.inappOther}</p>
            <div className="minor"><button className="link" onClick={() => void micOn(true)}>{COPY.inappContinue}</button></div>
          </>
        )}

        {s.screen === "question" && s.turn && (
          <>
            {notice && <p className="notice">{notice}</p>}
            <h1 className="question">{s.turn.question}</h1>
            <button className="primary" onClick={() => void speakNow()}>{COPY.speak}</button>
            <div className="minor">
              <button className="link" onClick={() => void command("기억이 안 나요")}>{COPY.forgot}</button>
              <button className="link" onClick={() => void command("넘어갈게요")}>{COPY.skip}</button>
              <button className="link" onClick={() => void playQuestion(s.turn!.audioUrl, s.turn!.question)}>{COPY.replay}</button>
            </div>
            <div className="bottom">
              <button className="link" onClick={() => void command("오늘은 여기까지")}>{COPY.end}</button>
              <button className="link" onClick={() => { const on = !sound; setSound(on); setSoundState(on); if (!on) stopSpeaking(); }}>
                {sound ? COPY.soundOff : COPY.soundOnLabel}
              </button>
            </div>
          </>
        )}

        {s.screen === "recording" && recState && (
          <>
            <p className="recording-label">듣고 있어요. 편하게 말씀해 주세요.</p>
            <Clock startedAt={recState.startedAt} />
            <Level rec={recState} />
            <button className="primary stop" onClick={() => void finish()}>{COPY.done}</button>
          </>
        )}

        {s.screen === "thinking" && <p className="lead thinking">{COPY.thinking}</p>}

        {s.screen === "error" && (
          <>
            <p className="lead">{COPY.error}</p>
            <button className="primary" onClick={() => { dispatch({ type: "RETRY" }); void (pending.current ? send() : begin()); }}>{COPY.retry}</button>
          </>
        )}

        {s.screen === "goodbye" && s.turn && (
          <>
            <h1 className="question">{s.turn.question}</h1>
            <p className="lead">언제든 이 링크를 다시 누르시면 이어서 하실 수 있어요.</p>
          </>
        )}
      </section>
      {info?.operatorPhone && <footer className="help">도움이 필요하시면 전화 주세요: <span className="phone">{info.operatorPhone}</span></footer>}
    </main>
  );
}
