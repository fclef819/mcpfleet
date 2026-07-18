import TOML from "@iarna/toml";
import { BEGIN_MARKER, END_MARKER } from "./render.js";
import type { ResolvedServer } from "./types.js";

export interface ConfigAnalysis {
  updatedText: string;
  adoptedMcpServerBlocks: string[];
  externalMcpServerBlocks: string[];
}

const MCP_SERVER_HEADER = /^\s*\[mcp_servers\.([^. \t\r\n\]]+)\]\s*$/;
const TABLE_HEADER = /^\s*\[([^\]]+)\]\s*$/;
const MANAGED_KEYS = ["args", "command", "startup_timeout_sec", "url"] as const;

export function reconcileCodexManagedServers(existingText: string, servers: ResolvedServer[], previouslyManaged: string[] = []): ConfigAnalysis {
  const legacyManaged = findLegacyManagedServerNames(existingText);
  let text = removeLegacyMarkers(existingText);
  const desired = new Map(servers.map((server) => [server.name, codexServerFields(server)]));
  const managedNames = new Set([...previouslyManaged, ...legacyManaged]);
  const adoptedMcpServerBlocks: string[] = [];

  for (const name of managedNames) {
    if (!desired.has(name)) {
      const section = findCodexServerSections(text).find((item) => item.name === name);
      if (section) {
        text = removeRanges(text, [{ start: section.start, end: section.end }]);
      }
    }
  }

  for (const [name, fields] of desired) {
    const section = findCodexServerSections(text).find((item) => item.name === name);
    if (!section) {
      text = appendBlock(text, renderCodexServer(name, fields));
      continue;
    }

    const current = parseCodexServerFields(section.rootText);
    if (!managedNames.has(name)) {
      if (!sameManagedServer(current, fields)) {
        throw new Error(`unmanaged Codex mcp_servers would be overwritten: ${name}`);
      }
      adoptedMcpServerBlocks.push(name);
      continue;
    }

    if (sameManagedServer(current, fields)) {
      continue;
    }
    const merged = mergeCodexServerFields(section.rootText, fields);
    text = `${text.slice(0, section.rootStart)}${merged}${text.slice(section.rootEnd)}`;
  }

  return {
    updatedText: text.replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n"),
    adoptedMcpServerBlocks: adoptedMcpServerBlocks.sort(),
    externalMcpServerBlocks: [],
  };
}

export function renderCodexManagedServers(servers: ResolvedServer[]): string {
  if (servers.length === 0) {
    return "# No subscribed MCP servers.\n";
  }
  return `${servers.map((server) => renderCodexServer(server.name, codexServerFields(server))).join("\n\n")}\n`;
}

function codexServerFields(server: ResolvedServer): Record<string, unknown> {
  return {
    ...(server.command ? { command: server.command } : {}),
    ...(server.url ? { url: server.url } : {}),
    ...(server.args.length > 0 ? { args: server.args } : {}),
    ...(server.startup_timeout_sec !== undefined ? { startup_timeout_sec: server.startup_timeout_sec } : {}),
  };
}

function renderCodexServer(name: string, fields: Record<string, unknown>): string {
  return TOML.stringify({ mcp_servers: { [name]: fields } } as never).trim();
}

function mergeCodexServerFields(rootText: string, fields: Record<string, unknown>): string {
  const parsed = TOML.parse(rootText) as { mcp_servers?: Record<string, Record<string, unknown>> };
  const [current] = Object.values(parsed.mcp_servers ?? {});
  const merged = { ...(current ?? {}) };
  for (const key of MANAGED_KEYS) {
    delete merged[key];
  }
  Object.assign(merged, fields);
  return `${renderCodexServer(Object.keys(parsed.mcp_servers ?? {})[0] ?? "", merged)}\n`;
}

function parseCodexServerFields(rootText: string): Record<string, unknown> {
  const parsed = TOML.parse(rootText) as { mcp_servers?: Record<string, Record<string, unknown>> };
  const [server] = Object.values(parsed.mcp_servers ?? {});
  const fields: Record<string, unknown> = {};
  for (const key of MANAGED_KEYS) {
    if (server?.[key] !== undefined) {
      fields[key] = server[key];
    }
  }
  return fields;
}

function findLegacyManagedServerNames(text: string): string[] {
  const begin = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) {
    return [];
  }
  return findCodexServerSections(text.slice(begin, end)).map((section) => section.name);
}

function removeLegacyMarkers(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.includes(BEGIN_MARKER) && !line.includes(END_MARKER))
    .join("\n");
}

function findCodexServerSections(text: string): Array<{ name: string; start: number; rootStart: number; rootEnd: number; end: number; rootText: string }> {
  const lines = text.split(/\r?\n/);
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const sections: Array<{ name: string; startLine: number; rootEndLine: number; endLine: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(MCP_SERVER_HEADER);
    if (!match) {
      continue;
    }
    let rootEndLine = index + 1;
    while (rootEndLine < lines.length && !TABLE_HEADER.test(lines[rootEndLine])) {
      rootEndLine += 1;
    }
    let endLine = rootEndLine;
    const childPrefix = `[mcp_servers.${match[1]}.`;
    while (endLine < lines.length) {
      const table = lines[endLine].match(TABLE_HEADER);
      if (table && !lines[endLine].startsWith(childPrefix)) {
        break;
      }
      endLine += 1;
    }
    sections.push({ name: match[1], startLine: index, rootEndLine, endLine });
  }
  return sections.map((section) => ({
    name: section.name,
    start: offsets[section.startLine],
    rootStart: offsets[section.startLine],
    rootEnd: section.rootEndLine < offsets.length ? offsets[section.rootEndLine] : text.length,
    end: section.endLine < offsets.length ? offsets[section.endLine] : text.length,
    rootText: text.slice(offsets[section.startLine], section.rootEndLine < offsets.length ? offsets[section.rootEndLine] : text.length),
  }));
}

export function replaceManagedBlock(existingText: string, block: string): ConfigAnalysis {
  const adoption = adoptMatchingExternalMcpServers(existingText, block);
  const externalMcpServerBlocks = findExternalMcpServerBlocks(adoption.text);
  const beginIndex = adoption.text.indexOf(BEGIN_MARKER);
  const endIndex = adoption.text.indexOf(END_MARKER);

  if (beginIndex !== -1 || endIndex !== -1) {
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
      throw new Error("Incomplete MCPFLEET marker block in Codex config");
    }
    const before = adoption.text.slice(0, beginIndex);
    const insideManaged = adoption.text.slice(beginIndex + BEGIN_MARKER.length, endIndex);
    const preservedManagedContent = extractNonMcpManagedContent(insideManaged);
    const after = adoption.text.slice(endIndex + END_MARKER.length);
    return {
      updatedText: normalizeJoin(before, preservedManagedContent, block, after),
      adoptedMcpServerBlocks: adoption.adoptedServers,
      externalMcpServerBlocks,
    };
  }

  return {
    updatedText: appendBlock(adoption.text, block),
    adoptedMcpServerBlocks: adoption.adoptedServers,
    externalMcpServerBlocks,
  };
}

function appendBlock(existingText: string, block: string): string {
  if (existingText.trim().length === 0) {
    return block;
  }

  const suffix = existingText.endsWith("\n") ? "" : "\n";
  return `${existingText}${suffix}\n${block}`;
}

function normalizeJoin(...parts: string[]): string {
  const pieces = parts
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/\s*$/, "");
      }
      if (index === parts.length - 1) {
        return part.replace(/^\s*/, "");
      }
      return part.trim();
    })
    .filter((part) => part.length > 0);
  return `${pieces.join("\n\n")}\n`;
}

function extractNonMcpManagedContent(text: string): string {
  const managedServers = parseTopLevelMcpServers(`${BEGIN_MARKER}${text}${END_MARKER}`)
    .filter((server) => server.insideManaged)
    .map((server) => ({
      start: server.range.start - BEGIN_MARKER.length,
      end: server.range.end - BEGIN_MARKER.length,
    }));

  if (managedServers.length === 0) {
    return text.trim();
  }

  return removeRanges(text, managedServers).trim();
}

function findExternalMcpServerBlocks(existingText: string): string[] {
  const beginIndex = existingText.indexOf(BEGIN_MARKER);
  const endIndex = existingText.indexOf(END_MARKER);
  const sections: string[] = [];

  const lines = existingText.split(/\r?\n/);
  let insideManaged = false;
  for (const line of lines) {
    if (line.includes(BEGIN_MARKER)) {
      insideManaged = true;
      continue;
    }
    if (line.includes(END_MARKER)) {
      insideManaged = false;
      continue;
    }
    if (!insideManaged) {
      const match = line.match(MCP_SERVER_HEADER);
      if (match) {
        sections.push(match[1]);
      }
    }
  }

  if ((beginIndex === -1) !== (endIndex === -1)) {
    return sections;
  }

  return Array.from(new Set(sections)).sort();
}

function adoptMatchingExternalMcpServers(existingText: string, block: string): {
  text: string;
  adoptedServers: string[];
} {
  const desiredServers = new Map(parseTopLevelMcpServers(block).map((server) => [server.name, server.normalized]));
  if (desiredServers.size === 0) {
    return { text: existingText, adoptedServers: [] };
  }

  const adoptedServers = parseTopLevelMcpServers(existingText)
    .filter((server) => !server.insideManaged)
    .filter((server) => {
      const desired = desiredServers.get(server.name);
      return desired !== undefined && sameManagedServer(server.normalized, desired);
    });

  const rangesToRemove = adoptedServers.map((server) => server.range);

  if (rangesToRemove.length === 0) {
    return { text: existingText, adoptedServers: [] };
  }

  return {
    text: removeRanges(existingText, rangesToRemove),
    adoptedServers: Array.from(new Set(adoptedServers.map((server) => server.name))).sort(),
  };
}

function parseTopLevelMcpServers(text: string): Array<{
  name: string;
  normalized: Record<string, unknown>;
  insideManaged: boolean;
  range: { start: number; end: number };
}> {
  const lines = text.split(/\r?\n/);
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  const servers: Array<{
    name: string;
    normalized: Record<string, unknown>;
    insideManaged: boolean;
    range: { start: number; end: number };
  }> = [];

  let insideManaged = false;
  let current:
    | {
        name: string;
        insideManaged: boolean;
        startLine: number;
        bodyLines: string[];
      }
    | undefined;

  const finalizeCurrent = (endLine: number) => {
    if (!current) {
      return;
    }
    const parsed = parseManagedServerBlock(current.bodyLines.join("\n"));
    if (parsed) {
      servers.push({
        name: current.name,
        normalized: parsed,
        insideManaged: current.insideManaged,
        range: {
          start: offsets[current.startLine],
          end: endLine < offsets.length ? offsets[endLine] : text.length,
        },
      });
    }
    current = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes(BEGIN_MARKER)) {
      finalizeCurrent(index);
      insideManaged = true;
      continue;
    }
    if (line.includes(END_MARKER)) {
      finalizeCurrent(index);
      insideManaged = false;
      continue;
    }

    const mcpHeader = line.match(MCP_SERVER_HEADER);
    if (mcpHeader) {
      finalizeCurrent(index);
      current = {
        name: mcpHeader[1],
        insideManaged,
        startLine: index,
        bodyLines: [line],
      };
      continue;
    }

    const tableHeader = line.match(TABLE_HEADER);
    if (tableHeader) {
      finalizeCurrent(index);
      continue;
    }

    if (current) {
      current.bodyLines.push(line);
    }
  }

  finalizeCurrent(lines.length);
  return servers;
}

function parseManagedServerBlock(block: string): Record<string, unknown> | undefined {
  try {
    const parsed = TOML.parse(block) as { mcp_servers?: Record<string, Record<string, unknown>> };
    const [server] = Object.values(parsed.mcp_servers ?? {});
    if (!server) {
      return undefined;
    }

    const normalized: Record<string, unknown> = {};
    for (const key of MANAGED_KEYS) {
      if (server[key] !== undefined) {
        normalized[key] = server[key];
      }
    }
    return normalized;
  } catch {
    return undefined;
  }
}

function sameManagedServer(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return MANAGED_KEYS.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

function removeRanges(text: string, ranges: Array<{ start: number; end: number }>): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let next = text;
  for (const range of sorted) {
    next = `${next.slice(0, range.start)}${next.slice(range.end)}`;
  }
  return next.replace(/\n{3,}/g, "\n\n");
}
