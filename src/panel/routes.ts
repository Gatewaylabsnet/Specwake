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
          })
          .strict(),
      )
      .min(1)
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
export async function createPanel(root: string, dataDir: string) {
  const catalog = await DemoCatalog.create(root);
  const journal = await LocalJournal.open(dataDir);
  let demo: Awaited<ReturnType<typeof startDemoApi>>;
  try {
    demo = await startDemoApi();
  } catch (error) {
    await journal.close();
    throw error;
  }
  const service = new DemoMcpService(demo.target, journal);
  let calls = 0;
  return {
    async handle(req: IncomingMessage, res: ServerResponse, url: URL) {
      try {
        const action = url.pathname.slice("/api/panel/".length);
        if (req.method === "GET" && action === "state")
          return json(res, 200, {
            service: service.state(),
            groups: [...catalog.groups.values()],
            clientLabels: CLIENT_LABELS,
            demo: true,
            persistence:
              "Çağrı metadatası kalıcıdır; API grupları ve hizmet seçimi oturuma özeldir.",
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
        if (action === "import" || action === "sample") {
          const source =
            action === "sample"
              ? (parse(z.object({}).strict(), data), catalog.sample)
              : parse(
                  z.object({ source: z.string().max(1024 * 1024) }).strict(),
                  data,
                ).source;
          return json(res, 200, catalog.import(source));
        }
        if (action === "configure" || action === "export") {
          const input = parse(selectionSchema, data);
          const selected = catalog.select(input.groupId, input.selections);
          if (action === "configure")
            return json(
              res,
              200,
              service.configure(input.groupId, selected.manifest),
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
        if (action === "start" || action === "stop") {
          parse(z.object({}).strict(), data);
          return json(
            res,
            200,
            action === "start" ? await service.start() : await service.stop(),
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
      await service.stop();
      await demo.close();
      await journal.close();
    },
  };
}
