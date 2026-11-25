import { and, eq } from "drizzle-orm";
import { parents, sessions, turns } from "./db/schema";
import { resolveToken } from "./tokens";
import { CONSENT_SCREENS, hasAllConsents, recordConsent } from "./consent";
import { extFor } from "./audio";
import { completeTurn, NotFound, runRecorder, startSession, type TurnDeps } from "./turn";

export type ParentDeps = TurnDeps & { operatorPhone: string; after: (fn: () => Promise<void>) => void };
type Out = { status: number; json: object };
type Body = Record<string, unknown>;

const ok = (json: object): Out => ({ status: 200, json });
const err = (status: number, error: string): Out => ({ status, json: { error } });
const COMMANDS = new Set(["기억이 안 나요", "넘어갈게요", "오늘은 여기까지", "다시 왔어요"]);
const MIMES = /^audio\/(webm|mp4|x-m4a|aac|mpeg|ogg|wav)(;.*)?$/;

async function ownTurn(d: ParentDeps, parentId: number, turnId: unknown) {
  if (!Number.isSafeInteger(turnId)) return null;
  const [t] = await d.db.select().from(turns).where(and(eq(turns.id, turnId as number), eq(turns.parentId, parentId)));
  return t ?? null;
}

/** Every parent request carries the link token; nothing is returned for an invalid one. */
export async function handleParent(action: string, body: Body, d: ParentDeps): Promise<Out> {
  const link = await resolveToken(d.db, String(body.token ?? ""));
  if (!link) return err(401, "link_invalid");
  const { parentId, linkId } = link;

  switch (action) {
    case "info": {
      const [p] = await d.db.select().from(parents).where(eq(parents.id, parentId));
      return ok({
        honorific: p.honorific, operatorPhone: d.operatorPhone, consentsDone: await hasAllConsents(d.db, parentId),
        consentScreens: CONSENT_SCREENS, retainUntil: p.retainUntil,
      });
    }
    case "consent": {
      if (body.screen !== "record" && body.screen !== "ai") return err(400, "bad_screen");
      await recordConsent(d.db, parentId, linkId, body.screen);
      return ok({ ok: true, consentsDone: await hasAllConsents(d.db, parentId) });
    }
    case "start": {
      if (!(await hasAllConsents(d.db, parentId))) return err(403, "consent_required");
      const s = await startSession(d, parentId);
      return ok({ sessionId: s.sessionId, ...s.turn });
    }
    case "upload-url": {
      const t = await ownTurn(d, parentId, body.turnId);
      if (!t) return err(404, "not_found");
      const mime = String(body.mime ?? "");
      if (!MIMES.test(mime)) return err(400, "bad_mime");
      const path = `a/${parentId}/${t.id}.${extFor(mime)}`;
      const u = await d.storage.signedUploadUrl(path);
      return ok({ path, url: u.url, token: u.token });
    }
    case "complete": {
      const t = await ownTurn(d, parentId, body.turnId);
      if (!t) return err(404, "not_found");
      const path = body.path == null ? null : String(body.path);
      const mime = body.mime == null ? null : String(body.mime);
      const command = body.command == null ? null : String(body.command);
      if (path && (!path.startsWith(`a/${parentId}/${t.id}.`) || !mime || !MIMES.test(mime))) return err(400, "bad_path");
      if (command && !COMMANDS.has(command)) return err(400, "bad_command");
      if (!path && !command) return err(400, "empty");
      try {
        const out = await completeTurn(d, { parentId, turnId: t.id, audioPath: path, mime, command });
        if (path) d.after(() => runRecorder(d, parentId));
        return ok(out);
      } catch (e) {
        if (e instanceof NotFound) return err(404, "not_found");
        throw e;
      }
    }
    case "end": {
      if (!Number.isSafeInteger(body.sessionId)) return err(400, "bad_session");
      await d.db.update(sessions).set({ endedAt: new Date(), endReason: "user" })
        .where(and(eq(sessions.id, body.sessionId as number), eq(sessions.parentId, parentId)));
      return ok({ ok: true });
    }
    default:
      return err(404, "unknown_action");
  }
}
