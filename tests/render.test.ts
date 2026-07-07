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
        startup_timeout_sec: 30,
        sources: ["r/default"],
      },
    ]);

    expect(rendered).toContain("# BEGIN MCPFLEET");
    expect(rendered).toContain("[mcp_servers.demo]");
    expect(rendered).toContain('command = "npx"');
    expect(rendered).toContain('args = ["-y", "@demo/server"]');
    expect(rendered).toContain("startup_timeout_sec = 30");
    expect(rendered).not.toContain("[mcp_servers.demo.env]");
    expect(rendered).not.toContain('FOO = "bar"');
    expect(rendered).toContain("# END MCPFLEET");
  });

  it("renders TOML for URL-based mcp servers", () => {
    const rendered = renderManagedBlock([
      {
        name: "remote",
        url: "https://example.com/mcp",
        args: [],
        env: {},
        startup_timeout_sec: 10,
        sources: ["r/default"],
      },
    ]);

    expect(rendered).toContain("[mcp_servers.remote]");
    expect(rendered).toContain('url = "https://example.com/mcp"');
    expect(rendered).toContain("startup_timeout_sec = 10");
    expect(rendered).not.toContain("command =");
  });
});
