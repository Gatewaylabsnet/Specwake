import { createServer } from "node:http";
/** Explicit synthetic upstream. No remote target, environment credential or arbitrary URL. */
export async function startDemoApi() {
  let host = "";
  const services = [
    {
      id: "orders",
      name: "Sipariş API",
      team: "Ticaret",
      status: "healthy",
      version: "2.4.0",
    },
    {
      id: "catalog",
      name: "Katalog API",
      team: "Ürün",
      status: "healthy",
      version: "1.8.2",
    },
    {
      id: "billing",
      name: "Faturalama API",
      team: "Finans",
      status: "degraded",
      version: "3.1.0",
    },
  ];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.headers.host !== host || req.headers.origin) {
      res.writeHead(403);
      res.end('{"error":"Local synthetic upstream only"}');
      return;
    }
    const url = new URL(req.url!, "http://127.0.0.1");
    const send = (value: unknown) =>
      res.end(JSON.stringify({ demo: true, ...(value as object) }));
    if (req.method !== "GET") {
      res.writeHead(405);
      send({ error: "GET only" });
    } else if (url.pathname === "/demo/services")
      send({
        services: services.filter(
          (s) =>
            !url.searchParams.has("status") ||
            s.status === url.searchParams.get("status"),
        ),
      });
    else if (/^\/demo\/services\/[a-z]+$/.test(url.pathname)) {
      const service = services.find(
        (s) => s.id === url.pathname.split("/").at(-1),
      );
      if (!service) res.writeHead(404);
      send(service ? { service } : { error: "Synthetic item not found" });
    } else if (url.pathname === "/demo/summary")
      send({
        services: services.length,
        healthy: services.filter((s) => s.status === "healthy").length,
        teams: 3,
      });
    else if (url.pathname === "/demo/simulate/error") {
      res.writeHead(503);
      send({ error: "Intentional synthetic upstream failure" });
    } else if (url.pathname === "/demo/simulate/slow") {
      const timer = setTimeout(
        () => send({ status: "delayed", delayMs: 1600 }),
        1600,
      );
      res.once("close", () => clearTimeout(timer));
    } else {
      res.writeHead(404);
      res.setHeader("X-Specwake-Fixture", "missing");
      send({ error: "No synthetic fixture" });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  host = `127.0.0.1:${(server.address() as { port: number }).port}`;
  server.headersTimeout = 8000;
  server.requestTimeout = 8000;
  server.maxConnections = 16;
  return {
    target: {
      mode: "mock" as const,
      baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/demo`,
      allowedAddresses: ["127.0.0.1"],
      allowInsecureHttp: false,
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
