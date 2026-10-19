import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CLIENT_LABELS, type CallEvent, type EventSink } from "./types.js";

export const MAX_EVENTS = 5000;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE = 3 * 1024 * 1024;
const eventSchema = z
  .object({
    id: z.uuid(),
    at: z.iso.datetime(),
    runId: z.uuid(),
    groupId: z.uuid(),
    tool: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    client: z.enum(CLIENT_LABELS),
    outcome: z.enum(["success", "error"]),
    durationMs: z.number().int().min(0).max(60000),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  })
  .strict();
export class LocalJournal implements EventSink {
  private events: CallEvent[] = [];
  private pending = Promise.resolve();
  private closed = false;
  private constructor(private readonly folder: string) {}
  static async open(folder: string) {
    await mkdir(folder, { recursive: true, mode:0o700 });
    const journal = new LocalJournal(folder);
    // One writer per data directory. Do not silently recover a lock after a crash.
    const lock = await open(join(folder, "writer.lock"), "wx");
    await lock.close();
    try {
      const file = join(folder, "calls.json");
      try {
        if ((await stat(file)).size > MAX_FILE)
          throw new Error("Journal limit");
        journal.events = z
          .array(eventSchema)
          .max(MAX_EVENTS)
          .parse(JSON.parse(await readFile(file, "utf8")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const retained = journal.retained();
      if (retained.length !== journal.events.length)
        await journal.persist(retained);
      journal.events = retained;
      return journal;
    } catch (error) {
      await unlink(join(folder, "writer.lock"));
      throw error;
    }
  }
  private retained() {
    const cutoff = Date.now() - RETENTION_MS;
    return this.events
      .filter(
        (e) =>
          Date.parse(e.at) >= cutoff && Date.parse(e.at) <= Date.now() + 60000,
      )
      .slice(-MAX_EVENTS);
  }
  private async persist(events: CallEvent[]) {
    const content = JSON.stringify(events);
    if (Buffer.byteLength(content) > MAX_FILE) throw new Error("Journal limit");
    await writeFile(join(this.folder, "calls.pending"), content, {
      mode: 0o600,
    });
    await rename(
      join(this.folder, "calls.pending"),
      join(this.folder, "calls.json"),
    );
  }
  private enqueue<T>(work: () => Promise<T>) {
    if (this.closed) throw new Error("Journal closed");
    const operation = this.pending.then(work);
    this.pending = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  append(input: CallEvent) {
    // Strict allowlist: accidentally adding bodies, headers or tokens fails closed.
    const event = eventSchema.parse(input);
    return this.enqueue(async () => {
      const next = [...this.retained(), event].slice(-MAX_EVENTS);
      await this.persist(next);
      this.events = next;
    });
  }
  read() {
    return this.enqueue(async () => {
      const next = this.retained();
      if (next.length !== this.events.length) await this.persist(next);
      this.events = next;
      return this.events.map((e) => ({ ...e }));
    });
  }
  health() {
    return this.enqueue(async () => {
      const file = join(this.folder, `.health-${randomUUID()}`);
      const probe = await open(file, "wx", 0o600);
      try {
        await probe.close();
      } finally {
        await unlink(file);
      }
    });
  }
  async close() {
    this.closed = true;
    await this.pending;
    await unlink(join(this.folder, "writer.lock"));
  }
}
