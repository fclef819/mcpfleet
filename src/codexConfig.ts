import { BEGIN_MARKER, END_MARKER } from "./render.js";

export interface ConfigAnalysis {
  updatedText: string;
  externalMcpServerBlocks: string[];
}

const MCP_SERVER_HEADER = /^\s*\[mcp_servers\.([^. \t\r\n\]]+)\]\s*$/;

export function replaceManagedBlock(existingText: string, block: string): ConfigAnalysis {
  const externalMcpServerBlocks = findExternalMcpServerBlocks(existingText);
  const beginIndex = existingText.indexOf(BEGIN_MARKER);
  const endIndex = existingText.indexOf(END_MARKER);

  if (beginIndex !== -1 || endIndex !== -1) {
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
      throw new Error("Incomplete MCPFLEET marker block in Codex config");
    }
    const before = existingText.slice(0, beginIndex);
    const after = existingText.slice(endIndex + END_MARKER.length);
    return {
      updatedText: normalizeJoin(before, block, after),
      externalMcpServerBlocks,
    };
  }

  return {
    updatedText: appendBlock(existingText, block),
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
