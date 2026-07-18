import type { ResolvedServer } from "./types.js";

export interface ClaudeConfigAnalysis {
  updatedText: string;
  adoptedMcpServers: string[];
  externalMcpServers: string[];
}

type ClaudeMcpServer = Record<string, unknown>;
type ClaudeConfig = Record<string, unknown> & {
  mcpServers?: Record<string, ClaudeMcpServer>;
  mcpfleet?: { managedMcpServers?: unknown } & Record<string, unknown>;
};

export function replaceClaudeManagedServers(existingText: string, servers: ResolvedServer[]): ClaudeConfigAnalysis {
  const config = parseConfig(existingText);
  const mcpServers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
  const metadata = isRecord(config.mcpfleet) ? { ...config.mcpfleet } : {};
  const previouslyManaged = readManagedNames(metadata.managedMcpServers);
  const desired = new Map(servers.map((server) => [server.name, renderClaudeServer(server)]));
  const adoptedMcpServers: string[] = [];
  const externalMcpServers: string[] = [];

  for (const name of previouslyManaged) {
    delete mcpServers[name];
  }

  for (const [name, server] of desired) {
    const existing = mcpServers[name];
    if (existing !== undefined && !previouslyManaged.includes(name)) {
      if (JSON.stringify(existing) === JSON.stringify(server)) {
        adoptedMcpServers.push(name);
      } else {
        externalMcpServers.push(name);
        continue;
      }
    }
    mcpServers[name] = server;
  }

  if (externalMcpServers.length > 0) {
    throw new Error(`unmanaged Claude mcpServers would be overwritten: ${externalMcpServers.sort().join(", ")}`);
  }

  config.mcpServers = sortRecord(mcpServers);
  config.mcpfleet = {
    ...metadata,
    managedMcpServers: Array.from(desired.keys()).sort(),
  };
  return {
    updatedText: `${JSON.stringify(config, null, 2)}\n`,
    adoptedMcpServers: adoptedMcpServers.sort(),
    externalMcpServers: [],
  };
}

export function renderClaudeManagedServers(servers: ResolvedServer[]): string {
  const mcpServers = Object.fromEntries(servers.map((server) => [server.name, renderClaudeServer(server)]));
  return `${JSON.stringify({ mcpServers: sortRecord(mcpServers) }, null, 2)}\n`;
}

function renderClaudeServer(server: ResolvedServer): ClaudeMcpServer {
  if (server.url) {
    return {
      type: "http",
      url: server.url,
    };
  }
  return {
    command: server.command,
    ...(server.args.length > 0 ? { args: server.args } : {}),
    ...(Object.keys(server.env).length > 0 ? { env: sortRecord(server.env) } : {}),
  };
}

function parseConfig(text: string): ClaudeConfig {
  if (text.trim().length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      throw new Error("must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Claude config JSON: ${detail}`);
  }
}

function readManagedNames(value: unknown): string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string") ? value : [];
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
