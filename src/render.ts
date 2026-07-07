import TOML from "@iarna/toml";
import type { ResolvedServer } from "./types.js";

export const BEGIN_MARKER = "# BEGIN MCPFLEET";
export const END_MARKER = "# END MCPFLEET";

export function renderManagedBlock(servers: ResolvedServer[]): string {
  const lines: string[] = [BEGIN_MARKER];

  if (servers.length === 0) {
    lines.push("# Managed by mcpfleet. No subscribed MCP servers.");
    lines.push(END_MARKER);
    return `${lines.join("\n")}\n`;
  }

  for (const server of servers) {
    lines.push(`[mcp_servers.${server.name}]`);
    if (server.command) {
      lines.push(`command = ${formatTomlValue(server.command)}`);
    }
    if (server.url) {
      lines.push(`url = ${formatTomlValue(server.url)}`);
    }
    if (server.args.length > 0) {
      lines.push(`args = ${formatTomlValue(server.args)}`);
    }
    if (server.startup_timeout_sec !== undefined) {
      lines.push(`startup_timeout_sec = ${server.startup_timeout_sec}`);
    }
    lines.push("");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  lines.push(END_MARKER);
  return `${lines.join("\n")}\n`;
}

function formatTomlValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatTomlValue(item)).join(", ")}]`;
  }
  return TOML.stringify.value(value).trim();
}
