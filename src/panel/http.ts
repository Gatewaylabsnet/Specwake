import type { IncomingMessage, ServerResponse } from "node:http";

export class PanelFault extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function json(res: ServerResponse, status: number, value: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
export function safeFailure(res: ServerResponse, error: unknown) {
  const fault =
    error instanceof PanelFault
      ? error
      : new PanelFault(
          500,
          "PANEL_INTERNAL",
          "İşlem tamamlanamadı. Yerel hizmeti ve kayıt dizinini kontrol edin.",
        );
  json(res, fault.status, { code: fault.code, error: fault.message });
}
export async function readJson(
  req: IncomingMessage,
  limit = 64 * 1024,
): Promise<unknown> {
  if (Number(req.headers["content-length"] ?? 0) > limit)
    throw new PanelFault(
      413,
      "INPUT_TOO_LARGE",
      "İstek boyut sınırını aşıyor.",
    );
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new PanelFault(
      415,
      "JSON_REQUIRED",
      "JSON biçiminde bir istek gönderin.",
    );
  const chunks: Buffer[] = [];
  let bytes = 0;
  // Absolute upload deadline also covers slow chunked clients. No input is printed.
  const deadline = setTimeout(() => req.destroy(), 8000);
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > limit)
        throw new PanelFault(
          413,
          "INPUT_TOO_LARGE",
          "İstek boyut sınırını aşıyor.",
        );
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new PanelFault(400, "INVALID_JSON", "Geçerli JSON kullanın.");
    }
  } finally {
    clearTimeout(deadline);
  }
}
