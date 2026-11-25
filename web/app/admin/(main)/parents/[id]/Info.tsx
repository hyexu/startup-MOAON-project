"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin/client";

type P = { honorific: string; realName: string | null; birthYear: number | null; hometown: string | null; job: string | null; familyNote: string | null; guardianContact: string | null; retainUntil: string };

export default function Info({ id }: { id: number }) {
  const [p, setP] = useState<P | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { adminApi<P>("GET", `/parents/${id}`).then(setP).catch((e) => setMsg(e.message)); }, [id]);
  if (!p) return <p className="muted">{msg ?? "불러오는 중…"}</p>;
  const field = (k: keyof P, label: string) => <label>{label}<input id={k} name={k} defaultValue={p[k] ?? ""} /></label>;
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      try { await adminApi("PUT", `/parents/${id}`, { ...f, birthYear: f.birthYear || null }); setMsg("저장했습니다."); }
      catch (err) { setMsg((err as Error).message); }
    }}>
      <h1>{p.honorific}</h1>
      <div className="grid2">
        {field("honorific", "호칭 (AI가 부를 이름)")}
        {field("realName", "실명 (운영용)")}
        {field("birthYear", "출생 연도")}
        {field("hometown", "고향")}
        {field("job", "직업")}
        {field("guardianContact", "신청한 자녀 연락처")}
        <label>보관 기한<input id="retainUntil" name="retainUntil" type="date" defaultValue={p.retainUntil} required /></label>
      </div>
      <label>가족 메모<textarea id="familyNote" name="familyNote" rows={3} defaultValue={p.familyNote ?? ""} /></label>
      {msg && <p className="muted">{msg}</p>}
      <button className="go">저장</button>
    </form>
  );
}
