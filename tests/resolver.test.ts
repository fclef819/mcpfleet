import { describe, expect, it } from "vitest";
import { resolveSubscriptions } from "../src/resolver.js";
import type { RegistryIndex, RegistryRef } from "../src/types.js";

function makeRegistry(name: string, index: RegistryIndex): { ref: RegistryRef; index: RegistryIndex } {
  return {
    ref: { name, url: `https://example.com/${name}.yaml` },
    index,
  };
}

describe("resolveSubscriptions", () => {
  it("deduplicates identical server definitions", () => {
    const sharedPackage = {
      kind: "MCPPackage" as const,
      schemaVersion: 1 as const,
      name: "pkg-a",
      server: {
        name: "shared",
        command: "npx",
        args: ["-y", "a"],
        startup_timeout_sec: 30,
      },
    };

    const resolved = resolveSubscriptions(
      [
        makeRegistry("main", {
          kind: "MCPRegistry",
          schemaVersion: 1,
          packages: [
            sharedPackage,
            {
              ...sharedPackage,
              name: "pkg-b",
            },
          ],
          profiles: [
            {
              kind: "MCPProfile",
              schemaVersion: 1,
              name: "default",
              packages: ["pkg-a", "pkg-b"],
            },
          ],
        }),
      ],
      ["main/default"],
    );

    expect(resolved.servers).toHaveLength(1);
    expect(resolved.servers[0]?.name).toBe("shared");
  });

  it("throws on conflicting duplicate server definitions", () => {
    expect(() =>
      resolveSubscriptions(
        [
          makeRegistry("main", {
            kind: "MCPRegistry",
            schemaVersion: 1,
            packages: [
              {
                kind: "MCPPackage",
                schemaVersion: 1,
                name: "pkg-a",
                server: { name: "dup", command: "npx", args: ["-y", "a"] },
              },
              {
                kind: "MCPPackage",
                schemaVersion: 1,
                name: "pkg-b",
                server: { name: "dup", command: "uvx", args: ["b"] },
              },
            ],
            profiles: [
              {
                kind: "MCPProfile",
                schemaVersion: 1,
                name: "default",
                packages: ["pkg-a", "pkg-b"],
              },
            ],
          }),
        ],
        ["main/default"],
      ),
    ).toThrow(/Conflicting MCP server definition/);
  });

  it("supports URL-based server definitions", () => {
    const resolved = resolveSubscriptions(
      [
        makeRegistry("main", {
          kind: "MCPRegistry",
          schemaVersion: 1,
          packages: [
            {
              kind: "MCPPackage",
              schemaVersion: 1,
              name: "remote-api",
              server: {
                name: "remote-api",
                url: "https://example.com/mcp",
                startup_timeout_sec: 10,
              },
            },
          ],
          profiles: [
            {
              kind: "MCPProfile",
              schemaVersion: 1,
              name: "default",
              packages: ["remote-api"],
            },
          ],
        }),
      ],
      ["main/default"],
    );

    expect(resolved.servers).toEqual([
      {
        name: "remote-api",
        command: undefined,
        url: "https://example.com/mcp",
        args: [],
        env: {},
        startup_timeout_sec: 10,
        sources: ["main/default"],
      },
    ]);
  });
});
