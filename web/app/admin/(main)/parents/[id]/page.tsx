"use client";

import { use, useState } from "react";
import Info from "./Info";
import Seeds from "./Seeds";
import Links from "./Links";
import Sessions from "./Sessions";
import Cards from "./Cards";

const TABS = [["info", "정보"], ["seeds", "질문"], ["links", "링크"], ["sessions", "대화 기록"], ["cards", "이야기 카드"]] as const;

export default function ParentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("info");
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "info" && <Info id={id} />}
      {tab === "seeds" && <Seeds id={id} />}
      {tab === "links" && <Links id={id} />}
      {tab === "sessions" && <Sessions id={id} />}
      {tab === "cards" && <Cards id={id} />}
    </>
  );
}
