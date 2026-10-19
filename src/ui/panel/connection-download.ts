import {
  httpConnectionSchema,
  liveConnectionKey,
  type ConnectionServiceState,
  type HttpConnection,
} from "../../core/http-connection.js";

/** A delayed download must not survive a service stop/restart or view change. */
export async function loadCurrentConnection(
  load: () => Promise<unknown>,
  current: () => ConnectionServiceState | undefined,
): Promise<HttpConnection | undefined> {
  const before = current();
  const key = before && liveConnectionKey(before);
  if (!key) return;
  const value = await load();
  const after = current();
  if (!after || key !== liveConnectionKey(after)) return;
  const manifest = httpConnectionSchema.parse(value);
  if (manifest.endpoint !== after.endpoint)
    throw new Error("Connection changed");
  return manifest;
}
