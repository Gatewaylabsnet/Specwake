import { resolve } from "node:path";
import { startStudio } from "../studio/server.js";
import { ROOT } from "../studio/export.js";
const port = Number(process.env.SPECWAKE_PORT ?? 4319);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid SPECWAKE_PORT");
try {
  const studio = await startStudio(port, {
    panelDataDir: resolve(
      process.env.SPECWAKE_DATA_DIR ?? resolve(ROOT, ".local-data"),
    ),
  });
  console.error(`Specwake demo panel: ${studio.origin}/panel`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void studio.close().then(() => process.exit(0));
    });
} catch {
  console.error(
    "Specwake panel could not start. Check the local port and data directory.",
  );
  process.exitCode = 1;
}
