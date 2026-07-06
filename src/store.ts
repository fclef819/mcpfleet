import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { assert } from "./utils.js";
import type { MCPFleetConfig, MCPPackage, MCPProfile, RegistryIndex } from "./types.js";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

function parseYaml<T>(raw: string, filePath: string): T {
  try {
    return YAML.parse(raw) as T;
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${filePath}: ${(error as Error).message}`);
  }
}

export async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseYaml<T>(raw, filePath);
}

export async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  const content = YAML.stringify(data, { indent: 2 });
  await writeText(filePath, content);
}

export async function loadFleetConfig(filePath: string): Promise<MCPFleetConfig> {
  const raw = await readTextIfExists(filePath);
  if (!raw) {
    return {
      kind: "MCPFleetConfig",
      schemaVersion: 1,
      registries: [],
      subscriptions: [],
    };
  }

  const config = parseYaml<MCPFleetConfig>(raw, filePath);
  assert(config.kind === "MCPFleetConfig", `Invalid kind in ${filePath}`);
  assert(config.schemaVersion === 1, `Unsupported schemaVersion in ${filePath}`);
  config.registries ??= [];
  config.subscriptions ??= [];
  return config;
}

export async function saveFleetConfig(filePath: string, config: MCPFleetConfig): Promise<void> {
  await writeYamlFile(filePath, config);
}

export async function loadRegistryPackage(filePath: string): Promise<MCPPackage> {
  const data = await readYamlFile<MCPPackage>(filePath);
  assert(data.kind === "MCPPackage", `Invalid package kind: ${filePath}`);
  assert(data.schemaVersion === 1, `Unsupported package schemaVersion: ${filePath}`);
  return data;
}

export async function loadRegistryProfile(filePath: string): Promise<MCPProfile> {
  const data = await readYamlFile<MCPProfile>(filePath);
  assert(data.kind === "MCPProfile", `Invalid profile kind: ${filePath}`);
  assert(data.schemaVersion === 1, `Unsupported profile schemaVersion: ${filePath}`);
  return data;
}

export async function loadRegistryIndex(filePath: string): Promise<RegistryIndex> {
  const data = await readYamlFile<RegistryIndex>(filePath);
  assert(data.kind === "MCPRegistry", `Invalid registry kind: ${filePath}`);
  assert(data.schemaVersion === 1, `Unsupported registry schemaVersion: ${filePath}`);
  data.packages ??= [];
  data.profiles ??= [];
  return data;
}
