"use client";

import dynamic from "next/dynamic";

const ParentApp = dynamic(() => import("./ParentApp"), { ssr: false, loading: () => <main className="parent"><p className="lead">불러오는 중이에요…</p></main> });

export default function ClientOnly() {
  return <ParentApp />;
}
