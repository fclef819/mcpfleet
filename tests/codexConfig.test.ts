import { describe, expect, it } from "vitest";
import { replaceManagedBlock } from "../src/codexConfig.js";

const block = `# BEGIN MCPFLEET
[mcp_servers.demo]
command = "npx"
# END MCPFLEET
`;

describe("replaceManagedBlock", () => {
  it("replaces only the marker block", () => {
    const existing = `trust_level = "trusted"

# BEGIN MCPFLEET
[mcp_servers.old]
command = "old"
# END MCPFLEET

[projects."/tmp/demo"]
trust_level = "trusted"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.updatedText).toContain('trust_level = "trusted"');
    expect(result.updatedText).toContain('[projects."/tmp/demo"]');
    expect(result.updatedText).not.toContain("[mcp_servers.old]");
    expect(result.updatedText).toContain("[mcp_servers.demo]");
  });

  it("appends a marker block when one does not exist", () => {
    const existing = `[projects."/tmp/demo"]
trust_level = "trusted"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.updatedText).toContain('[projects."/tmp/demo"]');
    expect(result.updatedText.endsWith("# END MCPFLEET\n")).toBe(true);
  });

  it("reports unmanaged mcp servers outside the marker block", () => {
    const existing = `[mcp_servers.external]
command = "uvx"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.externalMcpServerBlocks).toEqual(["external"]);
  });

  it("ignores nested mcp server tables outside the marker block", () => {
    const existing = `[mcp_servers.drawio.tools.list-documents]
enabled = true

[mcp_servers.external]
command = "uvx"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.externalMcpServerBlocks).toEqual(["external"]);
  });
});
