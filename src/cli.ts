#!/usr/bin/env node
import { reconcileCodexManagedServers, renderCodexManagedServers } from "./codexConfig.js";
import { renderClaudeManagedServers, replaceClaudeManagedServers } from "./claudeConfig.js";
import { doctorServers } from "./doctor.js";
import { defaultPaths, targetStatePath } from "./paths.js";
import { addLocalPackageDefinition, addPackagesToProfile, buildLocalRegistry, createLocalProfile, fetchRegistryIndex, initLocalRegistry } from "./registry.js";
import { resolveSubscriptions } from "./resolver.js";
import { loadFleetConfig, readTextIfExists, saveFleetConfig, writeText } from "./store.js";
import type { RegistryRef } from "./types.js";
import { parseTarget, type Target } from "./target.js";
import { loadTargetState, saveTargetState } from "./targetState.js";

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
      await handleTargetedCommand("plan", rest, paths);
      return;
    case "apply":
      await handleTargetedCommand("apply", rest, paths);
      return;
    case "doctor":
      await doctor(paths.fleetConfigPath);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function handleTargetedCommand(command: "plan" | "apply", args: string[], paths: ReturnType<typeof defaultPaths>): Promise<void> {
  const { target, remainingArgs } = parseTarget(args);
  if (remainingArgs.length > 0) {
    throw new Error(`Usage: ${command} [--target <codex|claude>]`);
  }
  const configPath = target === "codex" ? paths.codexConfigPath : paths.claudeConfigPath;
  const statePath = targetStatePath(paths, target);
  if (command === "plan") {
    await plan(paths.fleetConfigPath, configPath, statePath, target);
    return;
  }
  await apply(paths.fleetConfigPath, configPath, statePath, target);
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
    throw new Error("Usage: package add <name> [--server-name <serverName>] [--env KEY=VALUE ...] [--startup-timeout-sec <sec>] (--url <url> | -- <command...>)");
  }
  const parsed = parsePackageAddArgs(rest);
  const filePath = await addLocalPackageDefinition(localRegistryDir, {
    name,
    server: {
      name: parsed.serverName ?? name,
      command: parsed.command,
      url: parsed.url,
      args: parsed.commandArgs,
      env: Object.keys(parsed.env).length > 0 ? parsed.env : undefined,
      startup_timeout_sec: parsed.startupTimeoutSec,
    },
  });
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

async function plan(configPath: string, targetConfigPath: string, statePath: string, target: Target): Promise<void> {
  const { renderedBlock, analysis, resolved } = await computePlan(configPath, targetConfigPath, statePath, target);
  printConfigAnalysis(analysis);
  if (analysis.externalMcpServerBlocks.length > 0) {
    console.warn(formatNotice("warn", `unmanaged mcp_servers blocks found outside markers: ${analysis.externalMcpServerBlocks.join(", ")}`));
  }
  console.log(`${highlight("Subscriptions", ANSI_BOLD)}: ${resolved.subscriptions.join(", ") || "(none)"}`);
  console.log(`${highlight("Servers", ANSI_BOLD)}: ${resolved.servers.length}`);
  for (const server of resolved.servers) {
    if (server.url) {
      console.log(`  ${highlight(server.name, ANSI_CYAN)}: ${server.url}`);
      continue;
    }
    const args = server.args.join(" ");
    console.log(`  ${highlight(server.name, ANSI_CYAN)}: ${server.command ?? "(missing)"}${args ? ` ${args}` : ""}`);
  }
  console.log("");
  process.stdout.write(renderedBlock);
}

async function apply(configPath: string, targetConfigPath: string, statePath: string, target: Target): Promise<void> {
  const { analysis, resolved } = await computePlan(configPath, targetConfigPath, statePath, target);
  await writeText(targetConfigPath, analysis.updatedText);
  await saveTargetState(statePath, resolved.servers.map((server) => server.name));
  printConfigAnalysis(analysis);
  if (analysis.externalMcpServerBlocks.length > 0) {
    console.warn(formatNotice("warn", `unmanaged mcp_servers blocks found outside markers: ${analysis.externalMcpServerBlocks.join(", ")}`));
  }
  console.log(`Updated ${targetConfigPath}`);
}

async function doctor(configPath: string): Promise<void> {
  const resolved = await resolvePlan(configPath);
  const items = await doctorServers(resolved.servers);
  for (const item of items) {
    console.log(`${item.ok ? "OK" : "FAIL"} ${item.server}: ${item.detail}`);
  }
}

async function computePlan(configPath: string, targetConfigPath: string, statePath: string, target: Target) {
  const resolved = await resolvePlan(configPath);
  const currentConfig = (await readTextIfExists(targetConfigPath)) ?? "";
  const state = await loadTargetState(statePath);
  const targetResult = target === "codex"
    ? (() => {
        const renderedBlock = renderCodexManagedServers(resolved.servers);
        const analysis = reconcileCodexManagedServers(currentConfig, resolved.servers, state.managedMcpServers);
        return { renderedBlock, analysis };
      })()
    : (() => {
        const renderedBlock = renderClaudeManagedServers(resolved.servers);
        const analysis = replaceClaudeManagedServers(currentConfig, resolved.servers, state.managedMcpServers);
        return {
          renderedBlock,
          analysis: {
            updatedText: analysis.updatedText,
            adoptedMcpServerBlocks: analysis.adoptedMcpServers,
            externalMcpServerBlocks: analysis.externalMcpServers,
          },
        };
      })();
  return { resolved, ...targetResult };
}

async function resolvePlan(configPath: string) {
  const config = await loadFleetConfig(configPath);
  const registries = await Promise.all(
    config.registries.map(async (ref) => ({
      ref,
      index: await fetchRegistryIndex(ref.url),
    })),
  );
  return resolveSubscriptions(registries, config.subscriptions);
}

function upsertRegistry(registries: RegistryRef[], next: RegistryRef): RegistryRef[] {
  const filtered = registries.filter((item) => item.name !== next.name);
  return [...filtered, next].sort((a, b) => a.name.localeCompare(b.name));
}

const ANSI_RESET = "\u001B[0m";
const ANSI_BOLD = "\u001B[1m";
const ANSI_CYAN = "\u001B[36m";
const ANSI_YELLOW = "\u001B[33m";
const ANSI_BLUE = "\u001B[34m";

function printConfigAnalysis(analysis: { adoptedMcpServerBlocks: string[] }): void {
  if (analysis.adoptedMcpServerBlocks.length === 0) {
    return;
  }

  console.log(formatNotice("info", `unmanaged mcp_servers blocks will be moved into the managed block: ${analysis.adoptedMcpServerBlocks.join(", ")}`));
}

function formatNotice(level: "info" | "warn", message: string): string {
  const color = level === "info" ? ANSI_BLUE : ANSI_YELLOW;
  return `${color}${level.toUpperCase()}${ANSI_RESET} ${message}`;
}

function highlight(text: string, color: string): string {
  return `${color}${text}${ANSI_RESET}`;
}

function printHelp(): void {
  console.log(`mcpfleet commands:
  registry init
  package add <name> [--server-name <serverName>] [--env KEY=VALUE ...] [--startup-timeout-sec <sec>] (--url <url> | -- <command...>)
  profile create <name>
  profile add <profile> <package...>
  registry build
  init
  registry add <name> <url>
  subscribe <registry>/<profile>
  plan --target <codex|claude>
  apply --target <codex|claude>
  doctor

For plan and apply, MCPFLEET_TARGET may be used instead of --target.`);
}

function parsePackageAddArgs(args: string[]): {
  serverName?: string;
  env: Record<string, string>;
  startupTimeoutSec?: number;
  url?: string;
  command?: string;
  commandArgs: string[];
} {
  const env: Record<string, string> = {};
  let serverName: string | undefined;
  let startupTimeoutSec: number | undefined;
  let url: string | undefined;
  let command: string | undefined;
  let commandArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      const remainder = args.slice(index + 1);
      if (remainder.length === 0) {
        throw new Error("package add requires a command after --");
      }
      [command, ...commandArgs] = remainder;
      break;
    }
    if (arg === "--url") {
      url = args[index + 1];
      if (!url) {
        throw new Error("--url requires a value");
      }
      index += 1;
      continue;
    }
    if (arg === "--server-name") {
      serverName = args[index + 1];
      if (!serverName) {
        throw new Error("--server-name requires a value");
      }
      index += 1;
      continue;
    }
    if (arg === "--startup-timeout-sec") {
      const raw = args[index + 1];
      const parsed = Number(raw);
      if (!raw || !Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--startup-timeout-sec requires a non-negative integer");
      }
      startupTimeoutSec = parsed;
      index += 1;
      continue;
    }
    if (arg === "--env") {
      const raw = args[index + 1];
      if (!raw || !raw.includes("=")) {
        throw new Error("--env requires KEY=VALUE");
      }
      const equals = raw.indexOf("=");
      const key = raw.slice(0, equals);
      env[key] = raw.slice(equals + 1);
      if (!key) {
        throw new Error("--env requires KEY=VALUE");
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown package add option: ${arg}`);
  }

  if (Boolean(url) === Boolean(command)) {
    throw new Error("package add requires exactly one of --url <url> or -- <command...>");
  }

  return {
    serverName,
    env,
    startupTimeoutSec,
    url,
    command,
    commandArgs,
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
