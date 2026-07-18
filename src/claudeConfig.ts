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

export function replaceClaudeManagedServers(existingText: string, servers: ResolvedServer[], previouslyManaged: string[] = []): ClaudeConfigAnalysis {
  const config = parseConfig(existingText);
  const mcpServers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
  const legacyManaged = readLegacyManagedNames(config.mcpfleet);
  const managedNames = Array.from(new Set([...previouslyManaged, ...legacyManaged]));
  if (legacyManaged.length > 0 && isOnlyLegacyMetadata(config.mcpfleet)) {
    delete config.mcpfleet;
  }
  const desired = new Map(servers.map((server) => [server.name, renderClaudeServer(server)]));
  const adoptedMcpServers: string[] = [];
  const externalMcpServers: string[] = [];

  for (const name of managedNames) {
    delete mcpServers[name];
  }

  for (const [name, server] of desired) {
    const existing = mcpServers[name];
    if (existing !== undefined && !managedNames.includes(name)) {
      if (sameManagedServer(existing, server)) {
        adoptedMcpServers.push(name);
      } else {
        externalMcpServers.push(name);
        continue;
      }
    }
    mcpServers[name] = managedNames.includes(name) ? mergeManagedServer(existing, server) : server;
  }

  if (externalMcpServers.length > 0) {
    throw new Error(`unmanaged Claude mcpServers would be overwritten: ${externalMcpServers.sort().join(", ")}`);
  }

  config.mcpServers = sortRecord(mcpServers);
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
    type: "stdio",
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

function sameManagedServer(existing: ClaudeMcpServer, desired: ClaudeMcpServer): boolean {
  return JSON.stringify(managedFields(existing)) === JSON.stringify(managedFields(desired));
}

function mergeManagedServer(existing: ClaudeMcpServer | undefined, desired: ClaudeMcpServer): ClaudeMcpServer {
  const merged = { ...(existing ?? {}) };
  for (const key of ["type", "command", "url", "args", "env"]) {
    delete merged[key];
  }
  return { ...merged, ...desired };
}

function managedFields(server: ClaudeMcpServer): ClaudeMcpServer {
  const type = server.type ?? (server.url ? "http" : "stdio");
  return {
    ...(type ? { type } : {}),
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
  };
}

function readLegacyManagedNames(value: unknown): string[] {
  return isRecord(value) && Array.isArray(value.managedMcpServers)
    && value.managedMcpServers.every((name) => typeof name === "string")
    ? value.managedMcpServers
    : [];
}

function isOnlyLegacyMetadata(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 1 && Array.isArray(value.managedMcpServers);
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
