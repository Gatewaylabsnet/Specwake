import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { workspaceSchema, type WorkspaceData } from "./workspace-schema.js";

export const MAX_WORKSPACE = 4 * 1024 * 1024;
/** Journal owns the single-writer directory lock; no raw source, examples or credentials. */
export class WorkspaceStore {
  constructor(private readonly folder: string) {}
  async load(): Promise<WorkspaceData | undefined> {
    const file = join(this.folder, "workspace.json");
    try {
      if ((await stat(file)).size > MAX_WORKSPACE)
        throw new Error("Workspace limit");
      return workspaceSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new Error(
        "Stored workspace requires review; original file preserved",
      );
    }
  }
  async save(value: WorkspaceData) {
    const content = JSON.stringify(workspaceSchema.parse(value));
    if (Buffer.byteLength(content) > MAX_WORKSPACE)
      throw new Error("Workspace limit");
    await writeFile(join(this.folder, "workspace.pending"), content, {
      mode: 0o600,
    });
    await rename(
      join(this.folder, "workspace.pending"),
      join(this.folder, "workspace.json"),
    );
  }
}
export async function firstLocalPort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
