import { readTextIfExists, writeText } from "./store.js";

export interface TargetState {
  version: 1;
  managedMcpServers: string[];
}

export async function loadTargetState(statePath: string): Promise<TargetState> {
  const text = await readTextIfExists(statePath);
  if (text === null) {
    return { version: 1, managedMcpServers: [] };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isTargetState(parsed)) {
      throw new Error("expected { version: 1, managedMcpServers: string[] }");
    }
    return { version: 1, managedMcpServers: Array.from(new Set(parsed.managedMcpServers)).sort() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid mcpfleet target state at ${statePath}: ${detail}`);
  }
}

export async function saveTargetState(statePath: string, managedMcpServers: string[]): Promise<void> {
  const state: TargetState = {
    version: 1,
    managedMcpServers: Array.from(new Set(managedMcpServers)).sort(),
  };
  await writeText(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function isTargetState(value: unknown): value is TargetState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.managedMcpServers)
    && record.managedMcpServers.every((name) => typeof name === "string");
}
