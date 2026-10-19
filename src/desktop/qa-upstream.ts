import { createServer } from "node:http";
import { writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Public synthetic fixture only. Never used by normal application startup. */
export const PUBLIC_QA_TOKEN = "SPECWAKE_PUBLIC_QA_TOKEN_NOT_A_SECRET";
export async function startQaUpstream(folder: string, exit: () => void,options:{port?:number;timeoutMs?:number}={}) {
  await mkdir(folder, { recursive: true });
  let host = "";
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.host !== host || req.headers.origin) {
      res.writeHead(403);
      res.end("{}");
      return;
    }
    requests.push(`${req.method} ${req.url}`);
    await writeFile(join(folder, "requests.json"), JSON.stringify(requests));
    if (req.headers.authorization !== `Bearer ${PUBLIC_QA_TOKEN}`) {
      res.writeHead(401);
      res.end('{"secret":"do-not-return-qa-error"}');
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16 * 1024) {
        res.writeHead(413);
        res.end("{}");
        return;
      }
      chunks.push(chunk);
    }
    let body: any = {};
    try {
      if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      res.writeHead(400);
      res.end("{}");
      return;
    }
    if (
      req.method === "POST" &&
      (!body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.requestTag !== "string")
    ) {
      res.writeHead(400);
      res.end("{}");
      return;
    }
    if (req.url !== "/health" && req.url !== "/query") {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    if (body.requestTag === "401" || body.requestTag === "403") {
      res.writeHead(Number(body.requestTag));
      res.end('{"secret":"do-not-return-qa-error"}');
      return;
    }
    if (body.requestTag === "slow") {
      const timer = setTimeout(() => res.end("{}"), 5500);
      res.once("close", () => clearTimeout(timer));
      return;
    }
    res.end(
      JSON.stringify({
        statusCode: 200,
        errors:
          body.requestTag === "application-error"
            ? ["do-not-return-qa-error"]
            : [],
        data: [
          {
            requestTag: body.requestTag ?? "health",
            token: PUBLIC_QA_TOKEN,
            fullName: "SYNTHETIC-NOT-A-PERSON",
          },
        ],
        numRows: 1,
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port??0, "127.0.0.1", resolve);
  });
  host = `127.0.0.1:${(server.address() as { port: number }).port}`;
  await writeFile(
    join(folder, "upstream.json"),
    JSON.stringify({ baseUrl: `http://${host}` }),
  );
  const timer = setInterval(async () => {
    try {
      await access(join(folder, "stop"));
    } catch {
      return;
    }
    clearInterval(timer);
    clearTimeout(deadline);
    server.close(() => exit());
    server.closeAllConnections();
  }, 250);
  const deadline = setTimeout(() => {
    clearInterval(timer);
    server.close(() => exit());
    server.closeAllConnections();
  }, options.timeoutMs??240000);
}
