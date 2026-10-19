import { z } from "zod";

// Same contract as schemas/http-connection-v1.schema.json. Deliberately exact:
// URL parsers alone normalize alternate IPs, default ports and path traversal.
export const LOCAL_MCP_ENDPOINT =
  /^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])\/mcp$(?![\s\S])/;
export const connectionName = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
export const httpConnectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: connectionName,
    transport: z.literal("streamable-http"),
    endpoint: z.string().max(100).regex(LOCAL_MCP_ENDPOINT),
    authentication: z.object({ type: z.literal("none") }).strict(),
    scope: z.literal("same-machine"),
  })
  .strict();
export type HttpConnection = z.infer<typeof httpConnectionSchema>;
export const HTTP_CONNECTION_FILENAME = "specwake-http-connection-v1.json";

export interface ConnectionServiceState {
  phase: string;
  listening: boolean;
  endpoint?: string;
  runId?: string;
}
export function liveConnectionKey(
  service: ConnectionServiceState,
): string | undefined {
  if (
    service.phase !== "running" ||
    !service.listening ||
    !service.endpoint ||
    !LOCAL_MCP_ENDPOINT.test(service.endpoint)
  )
    return;
  return JSON.stringify([service.runId, service.endpoint]);
}
export function createHttpConnection(
  service: ConnectionServiceState,
  name: string,
): HttpConnection {
  if (!liveConnectionKey(service)) throw new Error("Connection unavailable");
  return httpConnectionSchema.parse({
    schemaVersion: 1,
    name,
    transport: "streamable-http",
    endpoint: service.endpoint,
    authentication: { type: "none" },
    scope: "same-machine",
  });
}
