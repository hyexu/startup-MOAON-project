import { describe, expect, it } from "vitest";
import { CONFIG, envList } from "@/lib/config";

describe("CONFIG", () => {
  it("pins the spec defaults", () => {
    expect(CONFIG.maxAnswerSec).toBe(300);
    expect(CONFIG.pauseBelowCredits).toBe(300);
    expect(CONFIG.dailyTurnCap).toBe(80);
    expect(CONFIG.recentTurns).toBe(30);
    expect(CONFIG.models.interviewer).toBe("claude-sonnet-5-5");
    expect(CONFIG.models.recorder).toBe("claude-haiku-5-5");
  });
});

describe("envList", () => {
  it("splits, trims and drops empty values", () => {
    process.env.TEST_LIST = " a, b ,,c ";
    expect(envList("TEST_LIST")).toEqual(["a", "b", "c"]);
  });
  it("returns [] when unset", () => {
    delete process.env.TEST_UNSET;
    expect(envList("TEST_UNSET")).toEqual([]);
  });
});
