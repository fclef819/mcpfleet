import { describe, expect, it } from "vitest";
import TOML from "@iarna/toml";
import { reconcileCodexManagedServers, replaceManagedBlock } from "../src/codexConfig.js";
import type { ResolvedServer } from "../src/types.js";

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

  it("moves non-mcp settings out of the managed block before replacing it", () => {
    const existing = `trust_level = "trusted"

# BEGIN MCPFLEET
[tools]
web_search = true

[mcp_servers.old]
command = "old"
# END MCPFLEET
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.updatedText).toContain('[tools]\nweb_search = true\n\n# BEGIN MCPFLEET');
    expect(result.updatedText).toContain("[mcp_servers.demo]");
    expect(result.updatedText).not.toContain("[mcp_servers.old]");
  });

  it("moves root-level keys out of the managed block before the managed tables", () => {
    const existing = `# BEGIN MCPFLEET
approval_policy = "never"

[mcp_servers.old]
command = "old"
# END MCPFLEET
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.updatedText).toContain('approval_policy = "never"\n\n# BEGIN MCPFLEET');
    expect(result.updatedText).toContain("[mcp_servers.demo]");
    expect(result.updatedText).not.toContain("[mcp_servers.old]");
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
    expect(result.adoptedMcpServerBlocks).toEqual([]);
    expect(result.externalMcpServerBlocks).toEqual(["external"]);
  });

  it("ignores nested mcp server tables outside the marker block", () => {
    const existing = `[mcp_servers.drawio.tools.list-documents]
enabled = true

[mcp_servers.external]
command = "uvx"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.adoptedMcpServerBlocks).toEqual([]);
    expect(result.externalMcpServerBlocks).toEqual(["external"]);
  });

  it("adopts a matching unmanaged top-level block and preserves child tables", () => {
    const existing = `[mcp_servers.demo]
command = "npx"

[mcp_servers.demo.env]
FOO = "bar"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.adoptedMcpServerBlocks).toEqual(["demo"]);
    expect(result.updatedText).toContain("# BEGIN MCPFLEET");
    expect(result.updatedText).toContain("[mcp_servers.demo]");
    expect(result.updatedText).toContain("[mcp_servers.demo.env]");
    expect(result.updatedText.match(/\[mcp_servers\.demo\]/g)).toHaveLength(1);
    expect(result.externalMcpServerBlocks).toEqual([]);
  });

  it("keeps a differing unmanaged top-level block outside the managed block", () => {
    const existing = `[mcp_servers.demo]
command = "uvx"
`;

    const result = replaceManagedBlock(existing, block);
    expect(result.adoptedMcpServerBlocks).toEqual([]);
    expect(result.updatedText.match(/\[mcp_servers\.demo\]/g)).toHaveLength(2);
    expect(result.externalMcpServerBlocks).toEqual(["demo"]);
  });
});

describe("reconcileCodexManagedServers", () => {
  const server: ResolvedServer = {
    name: "demo",
    command: "uvx",
    args: ["demo-server"],
    env: {},
    sources: ["local/default"],
  };

  it("updates only mcpfleet-owned fields and preserves approvals", () => {
    const existing = `[mcp_servers.demo]
command = "npx"
default_tools_approval_mode = "prompt"

[mcp_servers.demo.tools.read]
approval_mode = "auto"
`;
    const result = reconcileCodexManagedServers(existing, [server], ["demo"]);

    expect(result.updatedText).toContain('command = "uvx"');
    expect(result.updatedText).toContain('default_tools_approval_mode = "prompt"');
    expect(result.updatedText).toContain('[mcp_servers.demo.tools.read]');
    expect(result.updatedText).toContain('approval_mode = "auto"');
    expect(TOML.parse(result.updatedText)).toMatchObject({
      mcp_servers: { demo: { command: "uvx", default_tools_approval_mode: "prompt" } },
    });
  });

  it("adopts an equivalent manual server without changing it", () => {
    const existing = `[mcp_servers.demo]
command = "uvx"
args = ["demo-server"]
default_tools_approval_mode = "prompt"
`;
    const result = reconcileCodexManagedServers(existing, [server]);

    expect(result.adoptedMcpServerBlocks).toEqual(["demo"]);
    expect(result.updatedText).toContain('default_tools_approval_mode = "prompt"');
  });

  it("removes legacy markers after migrating their managed servers", () => {
    const existing = `# BEGIN MCPFLEET
[mcp_servers.demo]
command = "uvx"
args = ["demo-server"]
# END MCPFLEET
`;
    const result = reconcileCodexManagedServers(existing, [server]);

    expect(result.updatedText).not.toContain("BEGIN MCPFLEET");
    expect(result.updatedText).not.toContain("END MCPFLEET");
    expect(result.updatedText).toContain("[mcp_servers.demo]");
  });
});
