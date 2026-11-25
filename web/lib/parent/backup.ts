/** Keep recording chunks in IndexedDB so a closed tab or failed upload loses nothing. */
const DB = "moaon-rec", STORE = "pending";
type Pending = { turnId: number; mime: string; chunks: Blob[] };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "turnId" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveChunk(turnId: number, chunk: Blob, mime: string): Promise<void> {
  try {
    const prev = (await tx<Pending | undefined>("readonly", (s) => s.get(turnId))) ?? { turnId, mime, chunks: [] };
    prev.chunks.push(chunk);
    await tx("readwrite", (s) => s.put(prev));
  } catch { /* private mode etc.: recording still works without backup */ }
}

export async function loadPending(): Promise<{ turnId: number; blob: Blob; mime: string }[]> {
  try {
    const all = await tx<Pending[]>("readonly", (s) => s.getAll());
    return all.filter((p) => p.chunks.length).map((p) => ({ turnId: p.turnId, mime: p.mime, blob: new Blob(p.chunks, { type: p.mime }) }));
  } catch { return []; }
}

export async function clear(turnId: number): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(turnId)); } catch { /* ignore */ }
}
