import { describe, expect, it } from "vitest";
import { renderManagedBlock } from "../src/render.js";

describe("renderManagedBlock", () => {
  it("renders TOML for mcp servers", () => {
    const rendered = renderManagedBlock([
      {
        name: "demo",
        command: "npx",
        args: ["-y", "@demo/server"],
        env: { FOO: "bar" },
        sources: ["r/default"],
      },
    ]);

    expect(rendered).toContain("# BEGIN MCPFLEET");
    expect(rendered).toContain("[mcp_servers.demo]");
    expect(rendered).toContain('command = "npx"');
    expect(rendered).toContain('args = ["-y", "@demo/server"]');
    expect(rendered).toContain("[mcp_servers.demo.env]");
    expect(rendered).toContain('FOO = "bar"');
    expect(rendered).toContain("# END MCPFLEET");
  });
});
