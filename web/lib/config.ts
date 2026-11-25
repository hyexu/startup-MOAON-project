export const CONFIG = {
  maxAnswerSec: 300,
  linkDays: 90,
  retentionDays: 365,
  dailyTurnCap: 80,
  pauseBelowCredits: 300,
  recentTurns: 30,
  creditSnapshotMaxAgeMs: 5 * 60 * 1000,
  models: { interviewer: "claude-sonnet-5-5", recorder: "claude-haiku-5-5" },
  effort: { interviewer: "low", recorder: "low" },
  bazeBase: "https://api.baze.co/v1/gateway",
  bazeClaudeBase: "https://api.baze.co/v1/gateway/claude",
  tts: {
    model: "gemini-3.8-flash-tts",
    voice: "Kore",
    instructions: "어르신께 여쭙듯 천천히, 따뜻하고 또렷하게 읽어 주세요.",
  },
  stt: { model: "stt-async-v5" },
} as const;

/** Comma-separated environment variable as a trimmed list without empty values. */
export function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
