import {
  boolean, date, integer, jsonb, numeric, pgTable, real, serial, text, timestamp, unique,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const parents = pgTable("parents", {
  id: serial("id").primaryKey(),
  honorific: text("honorific").notNull(),
  realName: text("real_name"),
  birthYear: integer("birth_year"),
  hometown: text("hometown"),
  job: text("job"),
  familyNote: text("family_note"),
  guardianContact: text("guardian_contact"),
  retainUntil: date("retain_until").notNull(),
  status: text("status").notNull().default("준비"),
  createdAt: createdAt(),
});

export const links = pgTable("links", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  lastUsedAt: ts("last_used_at"),
  createdAt: createdAt(),
});

export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  textVersion: text("text_version").notNull(),
  linkId: integer("link_id").references(() => links.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const questionSeeds = pgTable("question_seeds", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  text: text("text").notNull(),
  source: text("source").notNull().default("기본"),
  position: integer("position").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  usedAt: ts("used_at"),
  audioPath: text("audio_path"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  startedAt: ts("started_at").notNull().defaultNow(),
  endedAt: ts("ended_at"),
  endReason: text("end_reason"),
  summary: text("summary"),
  createdAt: createdAt(),
});

export const turns = pgTable("turns", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  question: text("question").notNull(),
  questionAudioPath: text("question_audio_path"),
  questionSource: text("question_source").notNull(),
  answerAudioPath: text("answer_audio_path"),
  answerMime: text("answer_mime"),
  answerSec: real("answer_sec"),
  transcript: text("transcript"),
  transcriptEdited: text("transcript_edited"),
  status: text("status").notNull().default("녹취 도착"),
  stt: text("stt").notNull().default("none"),
  command: text("command"),
  completedAt: ts("completed_at"),
  createdAt: createdAt(),
}, (t) => [unique("turns_session_seq").on(t.sessionId, t.seq)]);

export const memory = pgTable("memory", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().unique().references(() => parents.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  model: text("model").notNull(),
  keyName: text("key_name").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  audioSec: real("audio_sec").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
  credits: numeric("credits", { precision: 12, scale: 4, mode: "number" }),
  parentId: integer("parent_id").references(() => parents.id, { onDelete: "set null" }),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
