import { access } from "node:fs/promises";
import path from "node:path";
import type { ResolvedServer } from "./types.js";

export interface DoctorItem {
  server: string;
  command: string;
  ok: boolean;
  detail: string;
}

export async function doctorServers(servers: ResolvedServer[]): Promise<DoctorItem[]> {
  return Promise.all(servers.map((server) => doctorServer(server)));
}

async function doctorServer(server: ResolvedServer): Promise<DoctorItem> {
  if (server.url) {
    return {
      server: server.name,
      command: server.url,
      ok: true,
      detail: "URL-based server; no local runtime check required in v0.1",
    };
  }

  if (!server.command) {
    return {
      server: server.name,
      command: "(missing)",
      ok: false,
      detail: "Server is missing both command and url",
    };
  }

  const executable = normalizeCommand(server.command);
  if (!["npx", "uvx", "docker"].includes(executable)) {
    return {
      server: server.name,
      command: server.command,
      ok: true,
      detail: "No specific runtime check required for this command in v0.1",
    };
  }

  const exists = await isOnPath(executable);
  return {
    server: server.name,
    command: server.command,
    ok: exists,
    detail: exists ? `${executable} is available on PATH` : `${executable} is not available on PATH`,
  };
}

function normalizeCommand(command: string): string {
  return path.basename(command.trim().split(/\s+/)[0] ?? command);
}

async function isOnPath(command: string): Promise<boolean> {
  const pathValue = process.env.PATH ?? "";
  for (const part of pathValue.split(path.delimiter)) {
    if (!part) {
      continue;
    }
    try {
      await access(path.join(part, command));
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
