import { resolve } from "node:path";
import { startStudio } from "../studio/server.js";
import { ROOT } from "../studio/export.js";
import { demoConfig } from "./config.js";
import { existsSync } from "node:fs";
try {
  const config = demoConfig(process.env);
  if (
    config.listeners.bindAddress === "0.0.0.0" &&
    (process.platform !== "linux" || !existsSync("/.dockerenv"))
  )
    throw new Error("Container demo mode requires a Linux Docker container");
  const studio = await startStudio(config.panelPort, {
    listeners: config.listeners,
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
