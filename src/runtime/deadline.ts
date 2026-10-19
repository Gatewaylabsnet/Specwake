import { RuntimeFault } from "./errors.js";
/** Bound credential acquisition and DNS as well as the HTTP socket. */
export async function withinDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  deadline: number,
  external?: AbortSignal,
): Promise<T> {
  if (external?.aborted) throw new RuntimeFault("SW_CANCELLED");
  if (Date.now() >= deadline) throw new RuntimeFault("SW_TIMEOUT");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void = () => {};
  const gate = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        reject(new RuntimeFault("SW_TIMEOUT"));
        controller.abort();
      },
      Math.max(1, deadline - Date.now()),
    );
    abort = () => {
      reject(new RuntimeFault("SW_CANCELLED"));
      controller.abort();
    };
    external?.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      gate,
    ]);
  } finally {
    clearTimeout(timer!);
    external?.removeEventListener("abort", abort);
  }
}
