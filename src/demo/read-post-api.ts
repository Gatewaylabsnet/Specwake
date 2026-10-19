import type { IncomingMessage, ServerResponse } from "node:http";
import { MOCK_UPSTREAM_TOKEN, READ_POST_FIELDS } from "./read-post-profile.js";

export async function serveReadPost(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
) {
  const send = (status: number, value: unknown) => {
    if (!res.destroyed) {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    }
  };
  const fields = READ_POST_FIELDS[path];
  if (!fields)
    return send(403, { error: "Outside the synthetic read-only allowlist" });
  if (req.headers.authorization !== `Bearer ${MOCK_UPSTREAM_TOKEN}`)
    return send(401, { error: "Synthetic upstream credential required" });
  try {
    if (req.headers["content-type"] !== "application/json")
      return send(400, { error: "JSON object required" });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024) return send(413, { error: "Body limit" });
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => !fields.includes(k)) ||
      fields.some((k) => typeof body[k] !== "string" || !body[k])
    )
      return send(400, { error: "Expected declared string query fields" });
    const scenario = body.IdNo ?? body.IdTaxNo;
    if (scenario === "demo-401" || scenario === "demo-403")
      return send(scenario === "demo-401" ? 401 : 403, {
        error: "Synthetic rejected request; body omitted",
      });
    const data = [
      {
        category: "SENTETIK",
        ProductionYear: body.ProductionYear ?? "DEMO-2099",
        IdNo: scenario,
        IdTaxNo: scenario,
        fullName: "SYNTHETIC PERSON",
        address: "SYNTHETIC ADDRESS",
        IBAN: "DEMO-NOT-AN-ACCOUNT",
        note: `Synthetic echo ${scenario}`,
      },
    ];
    if (scenario === "demo-app-error")
      return send(200, {
        statusCode: 200,
        errors: ["synthetic-sensitive-error-omitted"],
        data,
      });
    if (scenario === "demo-missing")
      return send(200, { statusCode: 200, errors: [], numRows: 1 });
    if (scenario === "demo-large")
      return send(200, {
        statusCode: 200,
        errors: [],
        data: ["x".repeat(300 * 1024)],
      });
    if (scenario === "demo-slow") {
      const timer = setTimeout(
        () => send(200, { statusCode: 200, errors: [], data, numRows: 1 }),
        5500,
      );
      res.once("close", () => clearTimeout(timer));
      return;
    }
    return send(200, {
      statusCode: 200,
      errors: [],
      data: scenario === "demo-empty" ? [] : data,
      numRows:
        scenario === "demo-partial" ? 9 : scenario === "demo-empty" ? 0 : 1,
      partial: scenario === "demo-partial",
    });
  } catch {
    return send(400, { error: "Invalid synthetic query body" });
  }
}
