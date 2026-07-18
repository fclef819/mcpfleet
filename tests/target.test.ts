import { describe, expect, it } from "vitest";
import { parseTarget } from "../src/target.js";

describe("parseTarget", () => {
  it("uses the command-line target before MCPFLEET_TARGET", () => {
    expect(parseTarget(["-t", "claude"], { MCPFLEET_TARGET: "codex" }).target).toBe("claude");
  });

  it("uses MCPFLEET_TARGET when no target option is supplied", () => {
    expect(parseTarget([], { MCPFLEET_TARGET: "codex" }).target).toBe("codex");
  });

  it("rejects a missing target", () => {
    expect(() => parseTarget([], {})).toThrow("A target is required");
  });

  it("rejects an unsupported target", () => {
    expect(() => parseTarget(["--target", "other"], {})).toThrow('Invalid target "other"');
  });
});
