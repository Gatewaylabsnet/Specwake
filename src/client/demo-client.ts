import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/client";

export function localEndpoint(value: string | undefined) {
  const url = new URL(value ?? "");
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/mcp" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Local MCP endpoint required");
  return url;
}
export async function runDemoClient(argv: string[]) {
  const option = (name: string) => {
    const inline = argv.find(value => value.startsWith(`${name}=`));
    if (inline !== undefined) return inline.slice(name.length + 1);
    const index = argv.indexOf(name);
    return index < 0 ? undefined : argv[index + 1];
  };
  const endpoint = localEndpoint(option("--endpoint"));
  const client = new Client(
    { name: "specwake-independent-demo", version: "0.2.0" },
    { supportedProtocolVersions: [LATEST_PROTOCOL_VERSION] },
  );
  const correlations: string[] = [];
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        "X-Specwake-Client": "local-script",
        ...(argv.includes("--exercise")
          ? { Authorization: "Bearer never-log-this-secret" }
          : {}),
      },
    },
    fetch: async (input, init) => {
      const signal = init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000);
      const response = await fetch(input, { ...init, signal });
      if (
        typeof init?.body === "string" &&
        JSON.parse(init.body).method === "tools/call"
      ) {
        const id = response.headers.get("x-specwake-correlation");
        if (id) correlations.push(id);
      }
      return response;
    },
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const report = {
      passed: true,
      client: "separate-process-official-sdk",
      protocol: LATEST_PROTOCOL_VERSION,
      initialized: !!client.getServerVersion(),
      redactionCanarySent: argv.includes("--exercise"),
      tools: listed.tools.map((t) => t.name),
      calls: [] as { tool: string; outcome: string; elapsedMs: number }[],
      correlations,
    };
    if (argv.includes("--exercise")) {
      for (const prefix of [
        "list_services_",
        "service_summary_",
        "demo_failure_",
        "demo_delay_",
      ]) {
        const tool = listed.tools.find((t) => t.name.startsWith(prefix));
        assert.ok(tool, "Required demo tool must be selected");
        const started = performance.now();
        const result = await client.callTool({
          name: tool.name,
          arguments: {},
        });
        const elapsedMs = Math.round(performance.now() - started);
        if (prefix === "demo_failure_") {
          assert.equal(result.isError, true);
          assert.match(JSON.stringify(result), /SW_HTTP_STATUS/);
        } else {
          assert.ok(!result.isError);
          assert.match(JSON.stringify(result), /demo/);
        }
        if (prefix === "demo_delay_")
          assert.ok(
            elapsedMs >= 1000,
            "Real delayed upstream must be observed",
          );
        report.calls.push({
          tool: tool.name,
          outcome: result.isError ? "error" : "success",
          elapsedMs,
        });
      }
      const rejectedAt = performance.now();
      await assert.rejects(() =>
        client.callTool({ name: "never_selected_demo", arguments: {} }),
      );
      report.calls.push({
        tool: "unselected",
        outcome: "rejected",
        elapsedMs: Math.round(performance.now() - rejectedAt),
      });
      assert.equal(
        correlations.length,
        5,
        "Each actual call has a server correlation header",
      );
    } else if (option("--tool")) {
      const tool = option("--tool")!;
      const args = JSON.parse(option("--args") ?? "{}");
      assert.ok(args && typeof args === "object" && !Array.isArray(args));
      const started = performance.now();
      const result = await client.callTool({ name: tool, arguments: args });
      report.calls.push({
        tool,
        outcome: result.isError ? "error" : "success",
        elapsedMs: Math.round(performance.now() - started),
      });
      // Explicit interactive demo only; results are printed, never written to the journal by this client.
      return { ...report, result };
    }
    return report;
  } finally {
    await client.close();
  }
}
