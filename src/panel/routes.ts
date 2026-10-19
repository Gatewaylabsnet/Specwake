import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { DemoCatalog } from "./catalog.js";
import { LocalJournal } from "./journal.js";
import { DemoMcpService } from "./mcp-service.js";
import { startDemoApi } from "../demo/server.js";
import { CLIENT_LABELS } from "./types.js";
import { statistics } from "./statistics.js";
import { json, PanelFault, readJson, safeFailure } from "./http.js";
import { exportPackage } from "../studio/export.js";
import { NAME } from "../core/contracts.js";
import type { DemoListeners } from "./config.js";
import { Workspace } from "./workspace.js";
import {
  connectionName,
  createHttpConnection,
  liveConnectionKey,
  HTTP_CONNECTION_FILENAME,
} from "../core/http-connection.js";

const selectionSchema = z
  .object({
    groupId: z.uuid(),
    selections: z
      .array(
        z
          .object({
            id: z.string().max(600),
            name: z.string().regex(NAME),
            description: z.string().max(2000),
            readOnlyConfirmed: z.boolean().optional(),
            bodyOverride: z.unknown().optional(),
            bodyOverrideApproved: z.boolean().optional(),
            responseAdapterApproved: z.boolean().optional(),
          })
          .strict(),
      )
      .min(0)
      .max(64),
  })
  .strict();
const callSchema = z
  .object({
    tool: z.string().regex(NAME),
    args: z.record(z.string(), z.unknown()),
    client: z.enum(CLIENT_LABELS),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new PanelFault(
      400,
      "INPUT_INVALID",
      "Alanları, araç seçimini ve JSON argümanlarını kontrol edin.",
    );
  return result.data;
}
export async function createPanel(
  root: string,
  dataDir: string,
  listeners?: DemoListeners,
  desktopClientExecutable?: string,
) {
  const catalog = await DemoCatalog.create(root);
  const journal = await LocalJournal.open(dataDir);
  let demo: Awaited<ReturnType<typeof startDemoApi>>;
  try {
    demo = await startDemoApi();
  } catch (error) {
    await journal.close();
    throw error;
  }
  let workspace: Workspace;
  try {
    workspace = await Workspace.open(
      catalog,
      dataDir,
      demo,
      journal,
      listeners,
    );
  } catch {
    await demo.close();
    await journal.close();
    throw new Error("Workspace unavailable; data preserved");
  }
  const service = workspace.service;
  let calls = 0;
  return {
    async handle(req: IncomingMessage, res: ServerResponse, url: URL) {
      try {
        const action = url.pathname.slice("/api/panel/".length);
        if (req.method === "GET" && action === "health") {
          await journal.health();
          return json(res, 200, {
            ready: true,
            demo: true,
            storage: "writable",
            service: service.state().phase,
          });
        }
        if (req.method === "GET" && action === "state")
          return json(res, 200, {
            service: service.state(),
            groups: [...catalog.groups.values()],
            clientLabels: CLIENT_LABELS,
            demo: true,
            desktopClientExecutable,
            workspace: workspace.publicState(),
            persistence:
              "API grupları, doğrulanmış seçim/hedef ve yerel MCP portu kalıcıdır. Hizmet yeniden açılışta durmuş başlar.",
          });
        if (req.method === "GET" && action === "statistics") {
          const query = parse(
            z
              .object({
                minutes: z.coerce
                  .number()
                  .int()
                  .refine((v) => [15, 60, 1440, 10080].includes(v))
                  .default(60),
                groupId: z.uuid().optional(),
                tool: z.string().regex(NAME).optional(),
                client: z.enum(CLIENT_LABELS).optional(),
              })
              .strict(),
            Object.fromEntries(url.searchParams),
          );
          return json(res, 200, statistics(await journal.read(), query));
        }
        if (req.method !== "POST")
          throw new PanelFault(
            404,
            "ACTION_UNKNOWN",
            "Bilinmeyen panel işlemi.",
          );
        const data = await readJson(
          req,
          action === "import" ? 1100000 : 64 * 1024,
        );
        if (action === "connection-export") {
          const input = parse(
            z.object({ name: connectionName }).strict(),
            data,
          );
          const state = service.state();
          if (!liveConnectionKey(state))
            throw new PanelFault(
              409,
              "CONNECTION_UNAVAILABLE",
              "Bağlantı JSON’u için güncel MCP hizmetini başlatın.",
            );
          const manifest = createHttpConnection(state, input.name);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${HTTP_CONNECTION_FILENAME}"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(manifest, null, 2) + "\n");
          return;
        }
        if (
          action === "import" ||
          action === "sample" ||
          action === "read-post-sample"
        ) {
          const source =
            action !== "import"
              ? (parse(z.object({}).strict(), data),
                action === "sample" ? catalog.sample : catalog.readPostSample)
              : parse(
                  z.object({ source: z.string().max(1024 * 1024) }).strict(),
                  data,
                ).source;
          return json(
            res,
            200,
            await workspace.serial(() =>
              workspace.import(
                source,
                action === "import" ? "unconfigured" : "synthetic",
              ),
            ),
          );
        }
        if (action === "configure" || action === "export") {
          const input = parse(selectionSchema, data);
          if (action === "configure")
            return json(
              res,
              200,
              await workspace.serial(() =>
                workspace.configure(
                  input.groupId,
                  input.selections as import("../core/model.js").Selection[],
                ),
              ),
            );
          const selected = catalog.select(
            input.groupId,
            input.selections as import("../core/model.js").Selection[],
          );
          const zip = await exportPackage(selected.manifest, root);
          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition":
              'attachment; filename="specwake-demo-server.zip"',
          });
          res.end(zip);
          return;
        }
        if (action === "target") {
          const input = parse(
            z
              .object({
                groupId: z.uuid(),
                revision: z.uuid(),
                target: z.unknown(),
                approveSelection: z.literal(true),
              })
              .strict(),
            data,
          );
          return json(
            res,
            200,
            await workspace.serial(() =>
              workspace.target(input.groupId, input.revision, input.target),
            ),
          );
        }
        if (action === "connection-settings") {
          const input = parse(
            z.object({ mcpPort: z.number().int().min(1).max(65535) }).strict(),
            data,
          );
          return json(
            res,
            200,
            await workspace.serial(() => workspace.port(input.mcpPort)),
          );
        }
        if (action === "start" || action === "stop") {
          parse(z.object({}).strict(), data);
          return json(
            res,
            200,
            await workspace.serial(() =>
              action === "start" ? service.start() : service.stop(),
            ),
          );
        }
        if (action === "call") {
          if (calls >= 4)
            throw new PanelFault(
              429,
              "CALL_LIMIT",
              "En çok 4 panel çağrısı aynı anda çalışabilir.",
            );
          const input = parse(callSchema, data);
          ++calls;
          try {
            return json(
              res,
              200,
              await service.call(input.tool, input.args, input.client),
            );
          } finally {
            --calls;
          }
        }
        throw new PanelFault(404, "ACTION_UNKNOWN", "Bilinmeyen panel işlemi.");
      } catch (error) {
        safeFailure(res, error);
      }
    },
    async close() {
      await workspace.serial(() => service.stop());
      await demo.close();
      await journal.close();
    },
  };
}
