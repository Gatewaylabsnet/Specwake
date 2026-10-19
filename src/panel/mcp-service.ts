import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import type { Manifest } from "../core/model.js";
import type { Target } from "../runtime/http.js";
import type { EventSink, ClientLabel } from "./types.js";
import { makeProbeReceipt } from "../core/probe-context.js";
import { json, PanelFault } from "./http.js";
import { serveMcpRequest } from "./mcp-request.js";
import { localListeners, type DemoListeners } from "./config.js";

export const MCP_PROTOCOL = LATEST_PROTOCOL_VERSION;
export interface Deployment {
  groupId: string;
  manifest: Manifest;
  revision: string;
}
export class DemoMcpService {
  private listener?: Server;
  private endpoint?: string;
  private runId?: string;
  private deployment?: Deployment;
  private phase: "stopped" | "starting" | "running" | "stopping" | "error" =
    "stopped";
  private inflight = 0;
  private lastError?: string;
  private epoch = 0;
  private readonly tasks = new Set<Promise<void>>();
  constructor(
    private readonly target: Target,
    private readonly sink: EventSink,
    private readonly listeners: DemoListeners = localListeners,
  ) {}
  state() {
    return {
      phase: this.phase,
      listening: !!this.listener?.listening,
      endpoint: this.listener?.listening ? this.endpoint : undefined,
      runId: this.runId,
      deployment: this.deployment,
      protocol: MCP_PROTOCOL,
      lastError: this.lastError,
      inflight: this.inflight,
    };
  }
  configure(groupId: string, manifest: Manifest) {
    if (!["stopped", "error"].includes(this.phase))
      throw new PanelFault(
        409,
        "SERVICE_ACTIVE",
        "Seçimi değiştirmeden önce MCP hizmetini durdurun.",
      );
    this.deployment = { groupId, manifest, revision: randomUUID() };
    this.lastError = undefined;
    return this.state();
  }
  async start() {
    if (!this.deployment)
      throw new PanelFault(409, "SELECT_TOOLS", "Önce araç seçimini kaydedin.");
    if (!["stopped", "error"].includes(this.phase))
      throw new PanelFault(
        409,
        "SERVICE_ACTIVE",
        "Hizmet zaten çalışıyor veya durum değiştiriyor.",
      );
    this.phase = "starting";
    this.lastError = undefined;
    const deployment = structuredClone(this.deployment);
    const runId = randomUUID();
    const epoch = ++this.epoch;
    this.runId = runId;
    this.listener = createServer((req, res) => {
      const task = this.handle(req, res, deployment, runId);
      this.tasks.add(task);
      void task.finally(() => this.tasks.delete(task)).catch(() => {});
    });
    this.listener.headersTimeout = 8000;
    this.listener.requestTimeout = 8000;
    this.listener.maxRequestsPerSocket = 100;
    try {
      await new Promise<void>((resolve, reject) => {
        this.listener!.once("error", reject);
        this.listener!.listen(
          this.listeners.mcpPort,
          this.listeners.bindAddress,
          resolve,
        );
      });
      this.endpoint = `http://127.0.0.1:${(this.listener.address() as { port: number }).port}/mcp`;
      // Running is earned by an actual SDK initialize + tools/list handshake.
      const health = await this.withClient("qa-demo", (client) =>
        client.listTools(),
      );
      if (
        epoch !== this.epoch ||
        health.tools.length !== deployment.manifest.tools.length
      )
        throw new Error("Health check failed");
      this.phase = "running";
      return this.state();
    } catch {
      await this.closeListener();
      this.phase = "error";
      this.lastError = "MCP_START_FAILED";
      throw new PanelFault(
        503,
        "MCP_START_FAILED",
        "MCP hizmeti başlatılamadı; yerel portu ve kayıt dizinini kontrol edin.",
      );
    }
  }
  async stop() {
    if (this.phase === "starting" || this.phase === "stopping")
      throw new PanelFault(
        409,
        "SERVICE_BUSY",
        "Durum değişimi tamamlanınca yeniden deneyin.",
      );
    ++this.epoch;
    this.phase = "stopping";
    await this.closeListener();
    this.phase = "stopped";
    return this.state();
  }
  private async closeListener() {
    const listener = this.listener;
    this.listener = undefined;
    this.endpoint = undefined;
    if (listener)
      await new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      });
    await Promise.allSettled([...this.tasks]);
  }
  private async withClient<T>(
    label: ClientLabel,
    action: (client: Client) => Promise<T>,
  ) {
    if (!this.endpoint)
      throw new PanelFault(
        409,
        "SERVICE_STOPPED",
        "Önce MCP hizmetini başlatın.",
      );
    const client = new Client(
      { name: "specwake-local-demo", version: "0.1.0" },
      { supportedProtocolVersions: [MCP_PROTOCOL] },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.endpoint),
      {
        requestInit: { headers: { "X-Specwake-Client": label } },
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(7000) }),
      },
    );
    try {
      await client.connect(transport);
      return await action(client);
    } finally {
      await client.close();
    }
  }
  async call(tool: string, args: Record<string, unknown>, label: ClientLabel) {
    if (this.phase !== "running")
      throw new PanelFault(
        409,
        "SERVICE_STOPPED",
        "Önce MCP hizmetini başlatın.",
      );
    const epoch = this.epoch;
    const deployment = this.deployment!;
    const runId = this.runId;
    const receipt = {
      ...(await makeProbeReceipt(
        deployment.revision,
        deployment.manifest,
        tool,
        args,
      )),
      runId,
      revision: deployment.revision,
      tool,
    };
    // Hashing yields to the event loop: never let an old invocation use a new listener.
    if (epoch !== this.epoch || this.phase !== "running")
      throw new PanelFault(
        409,
        "CALL_STALE",
        "Hizmet sürümü değişti. Çağrıyı güncel seçimle yeniden çalıştırın.",
      );
    try {
      const response = await this.withClient(label, async (client) => {
        const tools = await client.listTools();
        const result = await client.callTool({ name: tool, arguments: args });
        return {
          initialized: true,
          protocol: MCP_PROTOCOL,
          listedTools: tools.tools.map((t) => t.name),
          result,
          receipt,
        };
      });
      if (epoch !== this.epoch || this.phase !== "running")
        throw new Error("Stale call");
      return response;
    } catch {
      throw new PanelFault(
        409,
        epoch !== this.epoch ? "CALL_STALE" : "MCP_CALL_FAILED",
        "Çağrı tamamlanamadı veya hizmet değişti. Güncel durumla yeniden deneyin.",
      );
    }
  }
  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
    deployment: Deployment,
    runId: string,
  ) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // MCP is a separate local-client boundary. Browser origins and management routes are never accepted.
    if (
      !this.endpoint ||
      req.headers.host !== new URL(this.endpoint).host ||
      req.headers.origin ||
      req.headers["sec-fetch-site"]
    )
      return json(res, 403, { error: "Local MCP client required." });
    if (req.url !== "/mcp")
      return json(res, 404, { error: "Unknown MCP route." });
    if (req.method !== "POST")
      return json(res, 405, {
        error:
          "Stateless JSON Streamable HTTP uses POST; SSE subscriptions are disabled.",
      });
    if (this.inflight >= 8)
      return json(res, 429, { error: "Local concurrency limit reached." });
    ++this.inflight;
    res.setTimeout(8000, () => res.destroy());
    try {
      await serveMcpRequest(req, res, {
        target: this.target,
        endpoint: this.endpoint,
        deployment,
        runId,
        sink: this.sink,
      });
    } finally {
      --this.inflight;
    }
  }
}
