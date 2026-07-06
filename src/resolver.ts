import type { MCPPackage, RegistryIndex, RegistryRef, ResolvedPlan, ResolvedServer } from "./types.js";
import { sortObject } from "./utils.js";

interface NamedRegistry {
  ref: RegistryRef;
  index: RegistryIndex;
}

export function resolveSubscriptions(
  registries: NamedRegistry[],
  subscriptions: string[],
): ResolvedPlan {
  const warnings: string[] = [];
  const servers = new Map<string, ResolvedServer>();

  for (const subscription of subscriptions) {
    const slash = subscription.indexOf("/");
    if (slash <= 0 || slash === subscription.length - 1) {
      throw new Error(`Invalid subscription format: ${subscription}`);
    }

    const registryName = subscription.slice(0, slash);
    const profileName = subscription.slice(slash + 1);
    const registry = registries.find((item) => item.ref.name === registryName);
    if (!registry) {
      throw new Error(`Unknown registry in subscription: ${subscription}`);
    }

    const profile = registry.index.profiles.find((item) => item.name === profileName);
    if (!profile) {
      throw new Error(`Unknown profile ${profileName} in registry ${registryName}`);
    }

    for (const packageName of profile.packages) {
      const pkg = registry.index.packages.find((item) => item.name === packageName);
      if (!pkg) {
        throw new Error(`Profile ${profile.name} references unknown package ${packageName}`);
      }
      mergePackage(servers, pkg, `${registryName}/${profileName}`);
    }
  }

  return {
    servers: [...servers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    warnings,
    subscriptions: [...subscriptions],
  };
}

function mergePackage(target: Map<string, ResolvedServer>, pkg: MCPPackage, source: string): void {
  const name = pkg.server.name ?? pkg.name;
  const next: ResolvedServer = {
    name,
    command: pkg.server.command,
    args: pkg.server.args ?? [],
    env: sortObject(pkg.server.env ?? {}),
    sources: [source],
  };

  const current = target.get(name);
  if (!current) {
    target.set(name, next);
    return;
  }

  if (!sameServer(current, next)) {
    throw new Error(`Conflicting MCP server definition for ${name}`);
  }

  current.sources = Array.from(new Set([...current.sources, source])).sort();
}

function sameServer(a: ResolvedServer, b: ResolvedServer): boolean {
  return JSON.stringify({
    name: a.name,
    command: a.command,
    args: a.args,
    env: a.env,
  }) === JSON.stringify({
    name: b.name,
    command: b.command,
    args: b.args,
    env: b.env,
  });
}
