# @fclef819/mcpfleet

`@fclef819/mcpfleet` is a TypeScript CLI for managing the Codex CLI MCP server configuration across multiple environments.

It subscribes to static MCP package/profile registries and updates only the managed block in `~/.codex/config.toml`.

## Goals

- Keep MCP server definitions consistent across machines
- Preserve all Codex settings outside the managed block
- Support a simple static registry model built from YAML files

## Managed Codex Config Block

`@fclef819/mcpfleet` only replaces the section between these markers in `~/.codex/config.toml`:

```toml
# BEGIN MCPFLEET
...
# END MCPFLEET
```

Important behavior:

- Settings outside the marker block are preserved
- If the marker block does not exist, it is appended to the end of the file
- If unmanaged `[mcp_servers.*]` blocks exist outside the markers, `plan`, `apply`, and `doctor` warn
- Duplicate MCP server names with different definitions cause an error
- Duplicate MCP server names with identical definitions are deduplicated

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

## Commands

```bash
mcpfleet registry init
mcpfleet package add <name> -- <command...>
mcpfleet profile create <name>
mcpfleet profile add <profile> <package...>
mcpfleet registry build
mcpfleet init
mcpfleet registry add <name> <url>
mcpfleet subscribe <registry>/<profile>
mcpfleet plan
mcpfleet apply
mcpfleet doctor
```

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
mcpfleet package add filesystem -- npx -y @modelcontextprotocol/server-filesystem /workspace
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
mcpfleet plan
mcpfleet apply
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
