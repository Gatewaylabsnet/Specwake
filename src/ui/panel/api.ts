import type { ApiGroup } from "../../panel/catalog.js";
import type { DemoMcpService } from "../../panel/mcp-service.js";
import type { statistics } from "../../panel/statistics.js";
export type Stats = ReturnType<typeof statistics>;
export type PanelState = {
  groups: ApiGroup[];
  service: ReturnType<DemoMcpService["state"]>;
  clientLabels: string[];
  persistence: string;
};
let session: Promise<string> | undefined;
export async function panelApi(
  action: string,
  data?: unknown,
  signal?: AbortSignal,
) {
  const getToken = () =>
    (session ??= fetch("/api/session", { signal: AbortSignal.timeout(3000) })
      .then(async (response) => (await response.json()).token as string)
      .catch(() => {
        session = undefined;
        throw new Error("Yerel panel oturumu alınamadı.");
      }));
  const token = await getToken();
  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
    : AbortSignal.timeout(10000);
  const send = (value: string) =>
    fetch("/api/panel/" + action, {
      signal: deadline,
      ...(data === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Specwake-Token": value,
            },
            body: JSON.stringify(data),
          }),
    });
  let response = await send(token);
  if (response.status === 403 && data !== undefined) {
    // The local process may have restarted. Refresh its ephemeral CSRF session once.
    session = undefined;
    response = await send(await getToken());
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.error === "string"
        ? error.error
        : "Yerel panel bağlantısını kontrol edin.",
    );
  }
  return response;
}
export async function panelJson<T>(
  action: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return (await panelApi(action, data, signal)).json();
}
export function defaults(
  parameters: {
    inputName: string;
    required: boolean;
    enum?: (string | number | boolean)[];
    type: string;
  }[],
) {
  return JSON.stringify(
    Object.fromEntries(
      parameters
        .filter((p) => p.required)
        .map((p) => [
          p.inputName,
          p.enum?.[0] ??
            (p.type === "string" ? "orders" : p.type === "boolean" ? true : 1),
        ]),
    ),
    null,
    2,
  );
}

export type CallReply = Awaited<ReturnType<DemoMcpService["call"]>>;
