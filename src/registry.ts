import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { ensureDir, loadRegistryIndex, loadRegistryPackage, loadRegistryProfile, writeYamlFile } from "./store.js";
import type { MCPPackage, MCPProfile, RegistryIndex } from "./types.js";
import { assert } from "./utils.js";

export function localRegistryPaths(baseDir: string): {
  packagesDir: string;
  profilesDir: string;
  indexFile: string;
} {
  return {
    packagesDir: path.join(baseDir, "packages"),
    profilesDir: path.join(baseDir, "profiles"),
    indexFile: path.join(baseDir, "registry.yaml"),
  };
}

export async function initLocalRegistry(baseDir: string): Promise<void> {
  const paths = localRegistryPaths(baseDir);
  await ensureDir(paths.packagesDir);
  await ensureDir(paths.profilesDir);
}

export async function addLocalPackage(baseDir: string, name: string, command: string, args: string[]): Promise<string> {
  await initLocalRegistry(baseDir);
  const filePath = path.join(localRegistryPaths(baseDir).packagesDir, `${name}.yaml`);
  const pkg: MCPPackage = {
    kind: "MCPPackage",
    schemaVersion: 1,
    name,
    server: {
      name,
      command,
      args,
    },
  };
  await writeYamlFile(filePath, pkg);
  return filePath;
}

export async function createLocalProfile(baseDir: string, name: string): Promise<string> {
  await initLocalRegistry(baseDir);
  const filePath = path.join(localRegistryPaths(baseDir).profilesDir, `${name}.yaml`);
  const profile: MCPProfile = {
    kind: "MCPProfile",
    schemaVersion: 1,
    name,
    packages: [],
  };
  await writeYamlFile(filePath, profile);
  return filePath;
}

export async function addPackagesToProfile(baseDir: string, profileName: string, packageNames: string[]): Promise<string> {
  const filePath = path.join(localRegistryPaths(baseDir).profilesDir, `${profileName}.yaml`);
  const profile = await loadRegistryProfile(filePath);
  const merged = Array.from(new Set([...profile.packages, ...packageNames])).sort();
  profile.packages = merged;
  await writeYamlFile(filePath, profile);
  return filePath;
}

export async function buildLocalRegistry(baseDir: string): Promise<RegistryIndex> {
  const paths = localRegistryPaths(baseDir);
  await initLocalRegistry(baseDir);
  const packageFiles = (await listYamlFiles(paths.packagesDir)).sort();
  const profileFiles = (await listYamlFiles(paths.profilesDir)).sort();

  const packages = await Promise.all(packageFiles.map((filePath) => loadRegistryPackage(filePath)));
  const profiles = await Promise.all(profileFiles.map((filePath) => loadRegistryProfile(filePath)));
  validateLocalRegistry(packages, profiles);

  const index: RegistryIndex = {
    kind: "MCPRegistry",
    schemaVersion: 1,
    packages,
    profiles,
  };
  await writeYamlFile(paths.indexFile, index);
  return index;
}

async function listYamlFiles(dirPath: string): Promise<string[]> {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  return items
    .filter((item: Dirent) => item.isFile() && (item.name.endsWith(".yaml") || item.name.endsWith(".yml")))
    .map((item: Dirent) => path.join(dirPath, item.name));
}

function validateLocalRegistry(packages: MCPPackage[], profiles: MCPProfile[]): void {
  const packageNames = new Set<string>();
  for (const pkg of packages) {
    assert(!packageNames.has(pkg.name), `Duplicate package name in local registry: ${pkg.name}`);
    packageNames.add(pkg.name);
  }

  const profileNames = new Set<string>();
  for (const profile of profiles) {
    assert(!profileNames.has(profile.name), `Duplicate profile name in local registry: ${profile.name}`);
    profileNames.add(profile.name);
    for (const packageName of profile.packages) {
      assert(packageNames.has(packageName), `Profile ${profile.name} references unknown package ${packageName}`);
    }
  }
}

export async function fetchRegistryIndex(url: string): Promise<RegistryIndex> {
  if (url.startsWith("file://")) {
    return loadRegistryIndex(new URL(url).pathname);
  }

  if (url.startsWith("/") || url.startsWith(".")) {
    return loadRegistryIndex(path.resolve(url));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry ${url}: ${response.status} ${response.statusText}`);
  }
  const raw = await response.text();
  const tempPath = `remote:${url}`;
  const parsed = (await import("yaml")).parse(raw) as RegistryIndex;
  assert(parsed.kind === "MCPRegistry", `Invalid registry kind: ${tempPath}`);
  assert(parsed.schemaVersion === 1, `Unsupported registry schemaVersion: ${tempPath}`);
  parsed.packages ??= [];
  parsed.profiles ??= [];
  return parsed;
}
