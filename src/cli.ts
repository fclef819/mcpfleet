#!/usr/bin/env node
import { replaceManagedBlock } from "./codexConfig.js";
import { doctorServers } from "./doctor.js";
import { defaultPaths } from "./paths.js";
import { buildLocalRegistry, createLocalProfile, addLocalPackage, addPackagesToProfile, fetchRegistryIndex, initLocalRegistry } from "./registry.js";
import { renderManagedBlock } from "./render.js";
import { resolveSubscriptions } from "./resolver.js";
import { loadFleetConfig, readTextIfExists, saveFleetConfig, writeText } from "./store.js";
import type { RegistryRef } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const paths = defaultPaths(cwd);
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  switch (command) {
    case "registry":
      await handleRegistryCommand(rest, paths);
      return;
    case "package":
      await handlePackageCommand(rest, paths.localRegistryDir);
      return;
    case "profile":
      await handleProfileCommand(rest, paths.localRegistryDir);
      return;
    case "init":
      await initFleetConfig(paths.fleetConfigPath);
      console.log(`Initialized ${paths.fleetConfigPath}`);
      return;
    case "subscribe":
      await subscribe(paths.fleetConfigPath, rest[0]);
      return;
    case "plan":
      await plan(paths.fleetConfigPath, paths.codexConfigPath);
      return;
    case "apply":
      await apply(paths.fleetConfigPath, paths.codexConfigPath);
      return;
    case "doctor":
      await doctor(paths.fleetConfigPath, paths.codexConfigPath);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function handleRegistryCommand(args: string[], paths: ReturnType<typeof defaultPaths>): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "init":
      await initLocalRegistry(paths.localRegistryDir);
      console.log(`Initialized ${paths.localRegistryDir}`);
      return;
    case "build": {
      const index = await buildLocalRegistry(paths.localRegistryDir);
      console.log(`Built registry with ${index.packages.length} packages and ${index.profiles.length} profiles`);
      return;
    }
    case "add": {
      const [name, url] = rest;
      if (!name || !url) {
        throw new Error("Usage: registry add <name> <url>");
      }
      const config = await loadFleetConfig(paths.fleetConfigPath);
      config.registries = upsertRegistry(config.registries, { name, url });
      await saveFleetConfig(paths.fleetConfigPath, config);
      console.log(`Added registry ${name}`);
      return;
    }
    default:
      throw new Error(`Unknown registry command: ${subcommand ?? "(missing)"}`);
  }
}

async function handlePackageCommand(args: string[], localRegistryDir: string): Promise<void> {
  const [subcommand, name, ...rest] = args;
  if (subcommand !== "add") {
    throw new Error(`Unknown package command: ${subcommand ?? "(missing)"}`);
  }
  if (!name) {
    throw new Error("Usage: package add <name> -- <command...>");
  }
  const separator = rest.indexOf("--");
  if (separator === -1 || separator === rest.length - 1) {
    throw new Error("Usage: package add <name> -- <command...>");
  }
  const commandAndArgs = rest.slice(separator + 1);
  const [command, ...commandArgs] = commandAndArgs;
  const filePath = await addLocalPackage(localRegistryDir, name, command, commandArgs);
  console.log(`Wrote ${filePath}`);
}

async function handleProfileCommand(args: string[], localRegistryDir: string): Promise<void> {
  const [subcommand, name, ...rest] = args;
  switch (subcommand) {
    case "create": {
      if (!name) {
        throw new Error("Usage: profile create <name>");
      }
      const filePath = await createLocalProfile(localRegistryDir, name);
      console.log(`Wrote ${filePath}`);
      return;
    }
    case "add": {
      if (!name || rest.length === 0) {
        throw new Error("Usage: profile add <profile> <package...>");
      }
      const filePath = await addPackagesToProfile(localRegistryDir, name, rest);
      console.log(`Updated ${filePath}`);
      return;
    }
    default:
      throw new Error(`Unknown profile command: ${subcommand ?? "(missing)"}`);
  }
}

async function initFleetConfig(configPath: string): Promise<void> {
  const config = await loadFleetConfig(configPath);
  await saveFleetConfig(configPath, config);
}

async function subscribe(configPath: string, subscription: string | undefined): Promise<void> {
  if (!subscription) {
    throw new Error("Usage: subscribe <registry>/<profile>");
  }
  const config = await loadFleetConfig(configPath);
  config.subscriptions = Array.from(new Set([...config.subscriptions, subscription])).sort();
  await saveFleetConfig(configPath, config);
  console.log(`Subscribed to ${subscription}`);
}

async function plan(configPath: string, codexConfigPath: string): Promise<void> {
  const { renderedBlock, analysis, resolved } = await computePlan(configPath, codexConfigPath);
  if (analysis.externalMcpServerBlocks.length > 0) {
    console.warn(`Warning: unmanaged mcp_servers blocks found outside markers: ${analysis.externalMcpServerBlocks.join(", ")}`);
  }
  console.log(`Subscriptions: ${resolved.subscriptions.join(", ") || "(none)"}`);
  console.log(`Servers: ${resolved.servers.length}`);
  for (const server of resolved.servers) {
    const args = server.args.join(" ");
    console.log(`- ${server.name}: ${server.command}${args ? ` ${args}` : ""}`);
  }
  console.log("");
  process.stdout.write(renderedBlock);
}

async function apply(configPath: string, codexConfigPath: string): Promise<void> {
  const { analysis } = await computePlan(configPath, codexConfigPath);
  await writeText(codexConfigPath, analysis.updatedText);
  if (analysis.externalMcpServerBlocks.length > 0) {
    console.warn(`Warning: unmanaged mcp_servers blocks found outside markers: ${analysis.externalMcpServerBlocks.join(", ")}`);
  }
  console.log(`Updated ${codexConfigPath}`);
}

async function doctor(configPath: string, codexConfigPath: string): Promise<void> {
  const { analysis, resolved } = await computePlan(configPath, codexConfigPath);
  if (analysis.externalMcpServerBlocks.length > 0) {
    console.warn(`Warning: unmanaged mcp_servers blocks found outside markers: ${analysis.externalMcpServerBlocks.join(", ")}`);
  }
  const items = await doctorServers(resolved.servers);
  for (const item of items) {
    console.log(`${item.ok ? "OK" : "FAIL"} ${item.server}: ${item.detail}`);
  }
}

async function computePlan(configPath: string, codexConfigPath: string) {
  const config = await loadFleetConfig(configPath);
  const registries = await Promise.all(
    config.registries.map(async (ref) => ({
      ref,
      index: await fetchRegistryIndex(ref.url),
    })),
  );
  const resolved = resolveSubscriptions(registries, config.subscriptions);
  const renderedBlock = renderManagedBlock(resolved.servers);
  const currentCodexConfig = (await readTextIfExists(codexConfigPath)) ?? "";
  const analysis = replaceManagedBlock(currentCodexConfig, renderedBlock);
  return { resolved, renderedBlock, analysis };
}

function upsertRegistry(registries: RegistryRef[], next: RegistryRef): RegistryRef[] {
  const filtered = registries.filter((item) => item.name !== next.name);
  return [...filtered, next].sort((a, b) => a.name.localeCompare(b.name));
}

function printHelp(): void {
  console.log(`mcpfleet commands:
  registry init
  package add <name> -- <command...>
  profile create <name>
  profile add <profile> <package...>
  registry build
  init
  registry add <name> <url>
  subscribe <registry>/<profile>
  plan
  apply
  doctor`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
