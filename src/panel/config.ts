/** Operator-only demo listeners. No network settings are accepted from management requests. */
export interface DemoListeners {
  bindAddress: "127.0.0.1" | "0.0.0.0";
  mcpPort: number;
}
export const localListeners: DemoListeners = {
  bindAddress: "127.0.0.1",
  mcpPort: 0,
};
function port(value: string | undefined, fallback: number) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 65535)
    throw new Error("Invalid demo port");
  return result;
}
export function demoConfig(env: Record<string, string | undefined>) {
  if (
    env.SPECWAKE_CONTAINER_DEMO !== undefined &&
    !["0", "1"].includes(env.SPECWAKE_CONTAINER_DEMO)
  )
    throw new Error("Invalid container demo mode");
  const container = env.SPECWAKE_CONTAINER_DEMO === "1";
  const panelPort = port(env.SPECWAKE_PORT, 4319);
  const mcpPort = port(env.SPECWAKE_MCP_PORT, container ? 4320 : 0);
  if (
    (container && (!panelPort || !mcpPort)) ||
    (panelPort && panelPort === mcpPort)
  )
    throw new Error("Demo listener ports must be distinct");
  return {
    panelPort,
    listeners: {
      bindAddress: container ? ("0.0.0.0" as const) : ("127.0.0.1" as const),
      mcpPort,
    },
  };
}
