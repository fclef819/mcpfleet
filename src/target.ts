export const TARGETS = ["codex", "claude"] as const;
export type Target = (typeof TARGETS)[number];

export function parseTarget(args: string[], environment: NodeJS.ProcessEnv = process.env): {
  target: Target;
  remainingArgs: string[];
} {
  let targetValue: string | undefined;
  const remainingArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target" || arg === "-t") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires either \"codex\" or \"claude\"`);
      }
      if (targetValue !== undefined) {
        throw new Error("--target may only be specified once");
      }
      targetValue = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      if (targetValue !== undefined) {
        throw new Error("--target may only be specified once");
      }
      targetValue = arg.slice("--target=".length);
      continue;
    }
    remainingArgs.push(arg);
  }

  const candidate = targetValue ?? environment.MCPFLEET_TARGET;
  if (!candidate) {
    throw new Error('A target is required: pass --target <codex|claude> or set MCPFLEET_TARGET');
  }
  if (!isTarget(candidate)) {
    throw new Error(`Invalid target \"${candidate}\": expected \"codex\" or \"claude\"`);
  }
  return { target: candidate, remainingArgs };
}

function isTarget(value: string): value is Target {
  return TARGETS.includes(value as Target);
}
