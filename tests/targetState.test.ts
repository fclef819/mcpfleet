import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadTargetState, saveTargetState } from "../src/targetState.js";

describe("target state", () => {
  it("stores managed server names outside target configuration", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mcpfleet-state-"));
    const statePath = path.join(directory, "codex.json");
    try {
      await saveTargetState(statePath, ["demo", "demo", "filesystem"]);
      expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({
        version: 1,
        managedMcpServers: ["demo", "filesystem"],
      });
      expect(await loadTargetState(statePath)).toEqual({ version: 1, managedMcpServers: ["demo", "filesystem"] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
