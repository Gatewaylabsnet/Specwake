import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { createMcpServer } from "../runtime/server.js";
import { diagnostics } from "../runtime/errors.js";
import type { Target } from "../runtime/http.js";
import type { Deployment } from "./mcp-service.js";
import { CLIENT_LABELS, type ClientLabel, type EventSink } from "./types.js";
import { json, PanelFault, readJson, safeFailure } from "./http.js";

export async function serveMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: {
    target: Target;
    endpoint: string;
    deployment: Deployment;
    runId: string;
    sink: EventSink;
  },
) {
  let server: ReturnType<typeof createMcpServer> | undefined;
  try {
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new PanelFault(
        400,
        "MCP_INPUT_INVALID",
        "Tek bir MCP JSON-RPC nesnesi gönderin.",
      );
    const rpc = body as { method?: unknown; params?: { name?: unknown } };
    const isCall = rpc.method === "tools/call";
    const started = performance.now();
    const id = randomUUID();
    const labelHeader = req.headers["x-specwake-client"];
    const client = CLIENT_LABELS.includes(labelHeader as ClientLabel)
      ? (labelHeader as ClientLabel)
      : "local-unverified";
    const selectedTool = context.deployment.manifest.tools.find(
      (t) => t.name === rpc.params?.name,
    );
    server = createMcpServer(context.deployment.manifest, context.target);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 64 * 1024,
    });
    await server.connect(transport);
    const headers = new Headers({
      "content-type": "application/json",
      accept: String(req.headers.accept ?? ""),
    });
    if (req.headers["mcp-protocol-version"])
      headers.set(
        "mcp-protocol-version",
        String(req.headers["mcp-protocol-version"]),
      );
    const response = await transport.handleRequest(
      new Request(context.endpoint, { method: "POST", headers }),
      { parsedBody: body },
    );
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    // SDK protocol errors may include caller-controlled tool names. Never return their raw messages.
    if (payload?.error)
      payload.error = {
        code: payload.error.code,
        message:
          "MCP request rejected. Check the selected tool and input schema.",
      };
    if (isCall) {
      const failed =
        res.destroyed ||
        !response.ok ||
        !!payload?.error ||
        !!payload?.result?.isError;
      const candidate = payload?.result?.structuredContent?.error?.code;
      let code = "MCP_REQUEST_REJECTED";
      if (res.destroyed) code = "CALL_CANCELLED";
      else if (!selectedTool) code = "TOOL_NOT_SELECTED";
      else if (!failed) code = "OK";
      else if (
        typeof candidate === "string" &&
        Object.hasOwn(diagnostics, candidate)
      )
        code = candidate;
      await context.sink.append({
        id,
        at: new Date().toISOString(),
        runId: context.runId,
        groupId: context.deployment.groupId,
        tool: selectedTool?.name ?? "unselected",
        client,
        outcome: failed ? "error" : "success",
        durationMs: Math.min(60000, Math.round(performance.now() - started)),
        code,
      });
    }
    res.setHeader("X-Specwake-Correlation", id);
    json(res, response.status, payload);
  } catch (error) {
    safeFailure(res, error);
  } finally {
    await server?.close();
  }
}
