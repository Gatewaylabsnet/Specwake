import React, { useEffect, useRef, useState } from "react";
import {
  connectionName,
  HTTP_CONNECTION_FILENAME,
  liveConnectionKey,
  type ConnectionServiceState,
} from "../../core/http-connection.js";
import { panelJson } from "./api.js";
import { loadCurrentConnection } from "./connection-download.js";

export function ConnectionExport({
  service,
  blocked = false,
}: {
  service: ConnectionServiceState;
  blocked?: boolean;
}) {
  const [name, setName] = useState("Specwake yerel bağlantı");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const latest = useRef<ConnectionServiceState | undefined>(service);
  const active = blocked ? undefined : service;
  latest.current = active;
  const controller = useRef<AbortController | undefined>(undefined);
  const key = active && liveConnectionKey(active);
  useEffect(() => {
    latest.current = active;
    setMessage("");
    return () => {
      latest.current = undefined;
      controller.current?.abort();
    };
  }, [key]);
  async function download() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage("");
    try {
      const manifest = await loadCurrentConnection(
        () => panelJson("connection-export", { name }, request.signal),
        () => (request.signal.aborted ? undefined : latest.current),
      );
      if (!manifest) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = HTTP_CONNECTION_FILENAME;
        link.click();
        setMessage(
          "Bağlantı JSON’u indirildi. Dosya canlılık veya yetki kanıtı değildir.",
        );
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (!request.signal.aborted)
        setMessage(
          "JSON indirilemedi. Hizmet durumunu yenileyip tekrar deneyin.",
        );
    } finally {
      if (controller.current === request) setBusy(false);
    }
  }
  return (
    <div className="mp-connection-export">
      <label>
        Bağlantı adı
        <input
          aria-label="Bağlantı adı"
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            setMessage("");
          }}
        />
      </label>
      <button
        className="mp-button"
        disabled={busy || !key || !connectionName.safeParse(name).success}
        onClick={() => void download()}
      >
        {busy ? "JSON hazırlanıyor…" : "Bağlantı JSON’unu indir"}
      </button>
      <p>
        Yalnız bağlantı bilgisi içerir; araçlar bağlanınca initialize ve güncel
        tools/list ile keşfedilir. Bağlantı adına sır veya kişisel veri
        yazmayın.
      </p>
      <p>
        <strong>Aynı bilgisayar:</strong> 127.0.0.1 istemcinin kendi
        bilgisayarıdır. Bu dosyayı başka bilgisayara vermek Specwake’e erişim
        açmaz. Uzak kullanım ayrıca onaylı güvenli kurulum gerektirir.
      </p>
      <small>
        Stateless Streamable HTTP / JSON · MCP istemci auth: yok · session/SSE
        aboneliği yok. Upstream kimlik bilgileri bu dosyaya dahil değildir. Port
        değişmedikçe aynı JSON yeniden kullanılabilir; dosya canlılık kanıtı
        değildir.
      </small>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
