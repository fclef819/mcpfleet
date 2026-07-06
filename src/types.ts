export interface MCPPackage {
  kind: "MCPPackage";
  schemaVersion: 1;
  name: string;
  description?: string;
  server: {
    name?: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface MCPProfile {
  kind: "MCPProfile";
  schemaVersion: 1;
  name: string;
  packages: string[];
}

export interface RegistryRef {
  name: string;
  url: string;
}

export interface MCPFleetConfig {
  kind: "MCPFleetConfig";
  schemaVersion: 1;
  registries: RegistryRef[];
  subscriptions: string[];
}

export interface RegistryIndex {
  kind: "MCPRegistry";
  schemaVersion: 1;
  packages: MCPPackage[];
  profiles: MCPProfile[];
}

export interface ResolvedServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  sources: string[];
}

export interface ResolvedPlan {
  servers: ResolvedServer[];
  warnings: string[];
  subscriptions: string[];
}
