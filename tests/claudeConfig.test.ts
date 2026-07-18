import { describe, expect, it } from "vitest";
import { replaceClaudeManagedServers } from "../src/claudeConfig.js";
import type { ResolvedServer } from "../src/types.js";

const servers: ResolvedServer[] = [{
  name: "demo",
  command: "npx",
  args: ["-y", "@demo/server"],
  env: { TOKEN: "secret" },
  sources: ["local/default"],
}];

describe("replaceClaudeManagedServers", () => {
  it("preserves unmanaged settings without adding mcpfleet metadata", () => {
    const result = replaceClaudeManagedServers('{"theme":"dark","mcpServers":{"external":{"command":"uvx"}}}', servers);
    const config = JSON.parse(result.updatedText);

    expect(config.theme).toBe("dark");
    expect(config.mcpServers.external.command).toBe("uvx");
    expect(config.mcpServers.demo).toEqual({ type: "stdio", command: "npx", args: ["-y", "@demo/server"], env: { TOKEN: "secret" } });
    expect(config.mcpfleet).toBeUndefined();
  });

  it("removes server names managed by an earlier apply", () => {
    const existing = JSON.stringify({
      mcpServers: { old: { command: "old" }, external: { command: "uvx" } },
      mcpfleet: { managedMcpServers: ["old"] },
    });
    const result = replaceClaudeManagedServers(existing, servers, ["old"]);
    const config = JSON.parse(result.updatedText);

    expect(config.mcpServers.old).toBeUndefined();
    expect(config.mcpServers.external).toEqual({ command: "uvx" });
  });

  it("does not overwrite a conflicting unmanaged server", () => {
    expect(() => replaceClaudeManagedServers('{"mcpServers":{"demo":{"command":"uvx"}}}', servers))
      .toThrow("unmanaged Claude mcpServers would be overwritten: demo");
  });

  it("migrates legacy in-config management metadata", () => {
    const existing = JSON.stringify({
      mcpServers: { old: { command: "old" } },
      mcpfleet: { managedMcpServers: ["old"] },
    });
    const result = replaceClaudeManagedServers(existing, servers);
    const config = JSON.parse(result.updatedText);

    expect(config.mcpServers.old).toBeUndefined();
    expect(config.mcpfleet).toBeUndefined();
  });
});
