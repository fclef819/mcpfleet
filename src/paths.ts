import os from "node:os";
import path from "node:path";

export interface AppPaths {
  fleetConfigPath: string;
  localRegistryDir: string;
  codexConfigPath: string;
  claudeConfigPath: string;
}

export function defaultPaths(cwd: string = process.cwd()): AppPaths {
  const home = os.homedir();
  return {
    fleetConfigPath: path.join(home, ".config", "mcpfleet", "config.yaml"),
    localRegistryDir: path.join(cwd, "mcp-registry"),
    codexConfigPath: path.join(home, ".codex", "config.toml"),
    claudeConfigPath: path.join(home, ".claude.json"),
  };
}
