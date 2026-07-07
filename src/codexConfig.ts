import TOML from "@iarna/toml";
import { BEGIN_MARKER, END_MARKER } from "./render.js";

export interface ConfigAnalysis {
  updatedText: string;
  externalMcpServerBlocks: string[];
}

const MCP_SERVER_HEADER = /^\s*\[mcp_servers\.([^. \t\r\n\]]+)\]\s*$/;
const TABLE_HEADER = /^\s*\[([^\]]+)\]\s*$/;
const MANAGED_KEYS = ["args", "command", "startup_timeout_sec", "url"] as const;

export function replaceManagedBlock(existingText: string, block: string): ConfigAnalysis {
  const adoption = adoptMatchingExternalMcpServers(existingText, block);
  const externalMcpServerBlocks = findExternalMcpServerBlocks(adoption.text);
  const beginIndex = existingText.indexOf(BEGIN_MARKER);
  const endIndex = existingText.indexOf(END_MARKER);

  if (beginIndex !== -1 || endIndex !== -1) {
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
      throw new Error("Incomplete MCPFLEET marker block in Codex config");
    }
    const adoptedBeginIndex = adoption.text.indexOf(BEGIN_MARKER);
    const adoptedEndIndex = adoption.text.indexOf(END_MARKER);
    const before = adoption.text.slice(0, adoptedBeginIndex);
    const after = adoption.text.slice(adoptedEndIndex + END_MARKER.length);
    return {
      updatedText: normalizeJoin(before, block, after),
      externalMcpServerBlocks,
    };
  }

  return {
    updatedText: appendBlock(adoption.text, block),
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

function normalizeJoin(before: string, block: string, after: string): string {
  const normalizedBefore = before.replace(/\s*$/, "");
  const normalizedAfter = after.replace(/^\s*/, "");
  const pieces = [normalizedBefore, block.trimEnd(), normalizedAfter].filter((part) => part.length > 0);
  return `${pieces.join("\n\n")}\n`;
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

function adoptMatchingExternalMcpServers(existingText: string, block: string): { text: string } {
  const desiredServers = new Map(parseTopLevelMcpServers(block).map((server) => [server.name, server.normalized]));
  if (desiredServers.size === 0) {
    return { text: existingText };
  }

  const rangesToRemove = parseTopLevelMcpServers(existingText)
    .filter((server) => !server.insideManaged)
    .filter((server) => {
      const desired = desiredServers.get(server.name);
      return desired !== undefined && sameManagedServer(server.normalized, desired);
    })
    .map((server) => server.range);

  if (rangesToRemove.length === 0) {
    return { text: existingText };
  }

  return { text: removeRanges(existingText, rangesToRemove) };
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
  return JSON.stringify(a) === JSON.stringify(b);
}

function removeRanges(text: string, ranges: Array<{ start: number; end: number }>): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let next = text;
  for (const range of sorted) {
    next = `${next.slice(0, range.start)}${next.slice(range.end)}`;
  }
  return next.replace(/\n{3,}/g, "\n\n");
}
