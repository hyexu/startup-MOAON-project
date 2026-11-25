"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin/client";
import { PERIODS } from "@/lib/seeds";

type Seed = { id?: number; period: string; text: string; source: "기본" | "가족"; position: number; enabled: boolean; usedAt?: string | null; audioPath?: string | null };

export default function Seeds({ id }: { id: number }) {
  const [seeds, setSeeds] = useState<Seed[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { adminApi<Seed[]>("GET", `/parents/${id}/seeds`).then(setSeeds).catch((e) => setMsg(e.message)); }, [id]);
  if (!seeds) return <p className="muted">{msg ?? "불러오는 중…"}</p>;
  const set = (i: number, patch: Partial<Seed>) => setSeeds(seeds.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= seeds.length) return;
    const next = [...seeds];
    [next[i], next[j]] = [next[j], next[i]];
    setSeeds(next);
  };
  return (
    <div className="stack">
      <p className="muted">AI가 대화에 맞게 바꿔 쓰는 질문 씨앗입니다. AI가 멈춘 동안에는 위에서부터 그대로 여쭙니다. 이미 여쭌 질문은 글을 바꿀 수 없습니다.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>순서</th><th>시기</th><th>질문</th><th>출처</th><th>사용</th><th>상태</th></tr></thead>
          <tbody>
            {seeds.map((s, i) => (
              <tr key={s.id ?? `new-${i}`}>
                <td><button type="button" onClick={() => move(i, -1)} aria-label="위로">↑</button> <button type="button" onClick={() => move(i, 1)} aria-label="아래로">↓</button></td>
                <td><select value={s.period} onChange={(e) => set(i, { period: e.target.value })}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select></td>
                <td style={{ minWidth: 280 }}><input style={{ width: "100%" }} value={s.text} disabled={!!s.usedAt} onChange={(e) => set(i, { text: e.target.value })} /></td>
                <td>{s.source}</td>
                <td><input type="checkbox" checked={s.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} /></td>
                <td>{s.usedAt ? <span className="pill">여쭘</span> : s.audioPath ? <span className="pill">음성 준비</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" onClick={() => setSeeds([...seeds, { period: "유년", text: "", source: "가족", position: seeds.length, enabled: true }])}>가족 질문 추가</button>{" "}
        <button className="go" onClick={async () => {
          try {
            await adminApi("PUT", `/parents/${id}/seeds`, seeds.filter((s) => s.text.trim()).map((s, i) => ({ ...s, position: i })));
            setSeeds(await adminApi<Seed[]>("GET", `/parents/${id}/seeds`));
            setMsg("저장했습니다. 질문 음성은 잠시 뒤 준비됩니다.");
          } catch (e) { setMsg((e as Error).message); }
        }}>저장</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
