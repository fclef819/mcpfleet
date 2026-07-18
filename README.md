# mcpfleet
[![npm version](https://img.shields.io/npm/v/@fclef819/mcpfleet.svg)](https://www.npmjs.com/package/@fclef819/mcpfleet)
[![npm downloads](https://img.shields.io/npm/dw/@fclef819/mcpfleet.svg)](https://www.npmjs.com/package/@fclef819/mcpfleet)
[![license](https://img.shields.io/npm/l/@fclef819/mcpfleet.svg)](https://github.com/fclef819/mcpfleet/blob/main/LICENSE)

`mcpfleet` is a TypeScript CLI for managing Codex and Claude MCP server configuration across multiple environments.

It subscribes to static MCP package/profile registries and updates the selected target configuration.

## Goals

- Keep MCP server definitions consistent across machines
- Preserve settings that mcpfleet does not own
- Support a simple static registry model built from YAML files

## Managed MCP Servers

MCP servers from subscribed profiles are managed by mcpfleet. Their names are
recorded separately for each target:

```text
~/.config/mcpfleet/codex.json
~/.config/mcpfleet/claude.json
```

This is analogous to declaring a package with `uv add`: future `apply` runs
can add, update, or remove these MCP servers. MCP servers added manually to a
target configuration but absent from this state are unmanaged, analogous to a
`uv pip install`; mcpfleet leaves them unchanged.

When a manual MCP server has the same name and equivalent connection settings
as a subscribed server, `apply` adopts it into mcpfleet management. It does not
rewrite the existing entry during adoption. A same-named server with different
connection settings is an error rather than an overwrite.

For managed Codex MCP servers, mcpfleet updates only the connection fields it
owns (`command`, `url`, `args`, and `startup_timeout_sec`). It preserves other
server fields, including Codex-generated approval settings. For Claude, it
updates the server connection fields while preserving other fields on a managed
server.

Older Codex `# BEGIN MCPFLEET` / `# END MCPFLEET` blocks are migrated on the
next `apply`: their server names move into the external state file and the
markers are removed. Older Claude `mcpfleet.managedMcpServers` metadata is
migrated similarly.

## Install

```bash
npm install -g @fclef819/mcpfleet
```

Or run it without installing globally:

```bash
npx @fclef819/mcpfleet --help
```

## File Locations

- User config: `~/.config/mcpfleet/config.yaml`
- Local registry: `./mcp-registry`
- Codex config: `~/.codex/config.toml`
- Claude config: `~/.claude.json`
- Managed Codex MCP state: `~/.config/mcpfleet/codex.json`
- Managed Claude MCP state: `~/.config/mcpfleet/claude.json`

## Commands

```bash
mcpfleet registry init
mcpfleet package add <name> [--server-name <serverName>] [--env KEY=VALUE ...] [--startup-timeout-sec <sec>] (--url <url> | -- <command...>)
mcpfleet profile create <name>
mcpfleet profile add <profile> <package...>
mcpfleet registry build
mcpfleet init
mcpfleet registry add <name> <url>
mcpfleet subscribe <registry>/<profile>
mcpfleet plan --target codex
mcpfleet apply --target codex
mcpfleet plan --target claude
mcpfleet apply --target claude
mcpfleet doctor
```

`plan` and `apply` require a target. Pass `--target` (or `-t`) with `codex` or
`claude`; when it is omitted, `MCPFLEET_TARGET` is used. The command fails if
neither is set. For example: `MCPFLEET_TARGET=claude mcpfleet plan`.

The state file contains no server credentials or definitions; it only records
the MCP server names mcpfleet owns. Target configuration files contain only
Codex or Claude settings.

## Registry Format

### MCPPackage

```yaml
kind: MCPPackage
schemaVersion: 1
name: filesystem
description: Local filesystem tools
server:
  name: filesystem
  command: npx
  args:
    - -y
    - "@modelcontextprotocol/server-filesystem"
    - /workspace
  env:
    EXAMPLE_ENV: "1"
  startup_timeout_sec: 30
```

URL-based server:

```yaml
kind: MCPPackage
schemaVersion: 1
name: internal-api
server:
  name: internal-api
  url: https://example.com/mcp
  startup_timeout_sec: 10
```

### MCPProfile

```yaml
kind: MCPProfile
schemaVersion: 1
name: default
packages:
  - filesystem
```

### MCPFleetConfig

```yaml
kind: MCPFleetConfig
schemaVersion: 1
registries:
  - name: local
    url: ./mcp-registry/registry.yaml
subscriptions:
  - local/default
```

## Quick Start

Create a local registry:

```bash
mcpfleet registry init
mcpfleet package add filesystem --startup-timeout-sec 30 -- npx -y @modelcontextprotocol/server-filesystem /workspace
mcpfleet profile create default
mcpfleet profile add default filesystem
mcpfleet registry build
```

Initialize user config and subscribe:

```bash
mcpfleet init
mcpfleet registry add local ./mcp-registry/registry.yaml
mcpfleet subscribe local/default
```

Preview and apply:

```bash
mcpfleet plan -t codex
mcpfleet apply -t codex

# Or select the target through the environment.
MCPFLEET_TARGET=claude mcpfleet plan
MCPFLEET_TARGET=claude mcpfleet apply
```

Check local runtime availability:

```bash
mcpfleet doctor
```

## Doctor Checks

In v0.1, `doctor` checks:

- `npx` availability on `PATH`
- `uvx` availability on `PATH`
- `docker` availability on `PATH`

Environment-variable validation is intentionally minimal in this release.

## Development

```bash
npm ci
npm test
npm run build
```

## Status

This is the MVP line of `mcpfleet`. The current scope focuses on static registries, profile subscription, conflict detection, and safe partial updates to Codex config.
