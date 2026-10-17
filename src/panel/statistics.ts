import type { CallEvent, StatFilter } from "./types.js";

function summarize(events: CallEvent[]) {
  const errors = events.filter((e) => e.outcome === "error").length;
  const sorted = events.map((e) => e.durationMs).sort((a, b) => a - b);
  return {
    calls: events.length,
    errors,
    errorRate: events.length ? errors / events.length : 0,
    averageMs: events.length
      ? Math.round(events.reduce((n, e) => n + e.durationMs, 0) / events.length)
      : 0,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0,
  };
}
export function statistics(
  all: CallEvent[],
  filter: StatFilter,
  now = Date.now(),
) {
  const from = now - filter.minutes * 60000;
  const events = all.filter(
    (e) =>
      Date.parse(e.at) >= from &&
      Date.parse(e.at) <= now &&
      (!filter.groupId || e.groupId === filter.groupId) &&
      (!filter.tool || e.tool === filter.tool) &&
      (!filter.client || e.client === filter.client),
  );
  const breakdown = (key: "tool" | "groupId" | "client") =>
    [...new Set(events.map((e) => e[key]))].map((value) => ({
      value,
      ...summarize(events.filter((e) => e[key] === value)),
    }));
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const start = from + ((filter.minutes * 60000) / 12) * i;
    const end = from + ((filter.minutes * 60000) / 12) * (i + 1);
    return {
      at: new Date(start).toISOString(),
      ...summarize(
        events.filter(
          (e) =>
            Date.parse(e.at) >= start &&
            (i === 11 ? Date.parse(e.at) <= end : Date.parse(e.at) < end),
        ),
      ),
    };
  });
  return {
    ...summarize(events),
    from: new Date(from).toISOString(),
    to: new Date(now).toISOString(),
    buckets,
    byTool: breakdown("tool"),
    byGroup: breakdown("groupId"),
    byClient: breakdown("client"),
    recent: events.slice(-100).reverse(),
    retained: all.length,
    maxEvents: 5000,
    retentionDays: 7,
  };
}
