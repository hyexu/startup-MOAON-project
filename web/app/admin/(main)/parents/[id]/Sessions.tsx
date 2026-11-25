"use client";

import { useEffect, useState } from "react";
import { adminApi, fmt } from "@/lib/admin/client";

type T = { id: number; seq: number; question: string; source: string; command: string | null; stt: string; answerSec: number | null; transcript: string | null; answerUrl: string | null; completedAt: string | null };
type S = { id: number; startedAt: string; endedAt: string | null; summary: string | null; turns: T[] };

const STT_LABEL: Record<string, string> = { done: "글로 옮김", deferred: "미뤄 둠 (AI 멈춤)", empty: "소리 없음", failed: "실패", none: "" };
const SOURCE_LABEL: Record<string, string> = { ai: "AI 질문", seed: "미리 정한 질문", system: "안내" };

export default function Sessions({ id }: { id: number }) {
  const [list, setList] = useState<S[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => adminApi<S[]>("GET", `/parents/${id}/sessions`).then(setList).catch((e) => setMsg(e.message));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return <p className="muted">{msg ?? "불러오는 중…"}</p>;
  const deferred = list.flatMap((s) => s.turns).filter((t) => t.stt === "deferred").length;
  return (
    <div className="stack">
      {deferred > 0 && (
        <div className="panel">
          <span>글로 옮기지 못하고 미뤄 둔 녹음이 {deferred}개 있습니다.</span>
          <div><button className="go" onClick={async () => {
            try {
              const r = await adminApi<{ done: number; left: number; errors: { turnId: number; status: number; detail: string; storedBytes: number | null; sentBytes: number | null; mime: string | null }[] }>("POST", `/parents/${id}/transcribe-deferred`);
              const why = r.errors.length ? ` 실패 이유: ${r.errors.map((x) => `[${x.mime ?? "?"}, 저장 ${x.storedBytes ?? "?"}바이트 → 전송 ${x.sentBytes ?? "?"}바이트] ${x.detail || "알 수 없음"} (${x.status})`).join(" / ")}` : "";
              setMsg(`${r.done}개를 글로 옮겼습니다. 남은 것 ${r.left}개.${why}`); await load();
            }
            catch (e) { setMsg((e as Error).message === "ai_paused" ? "AI가 멈춰 있어 지금은 옮길 수 없습니다." : (e as Error).message); }
          }}>미뤄 둔 녹음 글로 옮기기</button></div>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
      {list.length === 0 && <p className="muted">아직 대화가 없습니다. 링크를 보내 드리면 여기에 쌓입니다.</p>}
      {list.map((s) => (
        <section key={s.id} className="stack">
          <h2>{fmt(s.startedAt)} 세션 {s.endedAt ? "(끝남)" : "(진행 중)"}</h2>
          {s.turns.map((t) => (
            <div key={t.id} className="turn">
              <div className="q">{t.seq}. {t.question} <span className="pill">{SOURCE_LABEL[t.source] ?? t.source}</span></div>
              {t.command && <div><span className="pill">버튼: {t.command}</span></div>}
              {t.answerUrl && <audio controls preload="none" src={t.answerUrl} style={{ width: "100%" }} />}
              {t.answerUrl && <div className="muted">{t.answerSec ? `${Math.round(t.answerSec)}초` : ""} {STT_LABEL[t.stt] && <span className={`pill${t.stt !== "done" ? " warn" : ""}`}>{STT_LABEL[t.stt]}</span>}</div>}
              {t.transcript && <div style={{ whiteSpace: "pre-wrap" }}>{t.transcript}</div>}
              {!t.completedAt && <div className="muted">아직 답하지 않은 질문</div>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
