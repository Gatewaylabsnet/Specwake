import React from "react";
import type { PanelState } from "./api.js";
import { connectionExample } from "./connection.js";
import { CopyValue } from "./CopyValue.js";
export function ConnectionGuide({
  service,
  toolName,
  desktopExecutable,
}: {
  service: PanelState["service"];
  toolName: string;
  desktopExecutable?: string;
}) {
  if (!service.endpoint || !service.listening || service.phase !== "running")
    return (
      <div className="mp-connect-empty">
        03 / İstemci bağlantısı · Gerçek adres ve bağlantı örneği hizmet
        başlatılınca açılır.
      </div>
    );
  const tool =
    service.deployment?.manifest.tools.find((t) => t.name === toolName) ??
    service.deployment?.manifest.tools[0];
  const example = connectionExample(service.endpoint, tool, service.protocol, desktopExecutable);
  return (
    <div className="mp-connection">
      <div className="mp-section-head">
        <div>
          <div className="mp-eyebrow">03 / BAĞIMSIZ İSTEMCİ</div>
          <h3>MCP istemcinizi bağlayın</h3>
          <p>
            Stateless Streamable HTTP · JSON yanıtı · yalnız yerel demo erişimi
          </p>
        </div>
        <CopyValue value={service.endpoint} label="MCP adresini kopyala" />
      </div>
      <div className="mp-connection-body">
        <p>
          {desktopExecutable
            ? "PowerShell’i açıp bu komutu yapıştırın. Uygulamadaki bağımsız SDK istemcisi araçları listeler; Node.js, npm veya kaynak klasörü gerekmez."
            : "Proje klasöründe bu komut, panelden ayrı bir resmi SDK istemcisi başlatır ve gerçek araç listesini alır."} Güncel adres:{" "}
          <code>{service.endpoint}</code>
        </p>
        <div className="mp-code-copy">
          <pre tabIndex={0}>{example.command}</pre>
          <CopyValue value={example.command} label="İstemci komutunu kopyala" />
        </div>
        <details>
          <summary>Başarı, hata ve gecikme demosunu ayrı istemciyle çalıştır</summary>
          <p>/services, /summary, /simulate/error ve /simulate/slow GET araçları seçili olmalıdır. Beş gerçek deneme yapılır; kontrollü hata ve seçilmeyen araç reddi beklenir.</p>
          <div className="mp-code-copy">
            <pre tabIndex={0}>{example.exerciseCommand}</pre>
            <CopyValue value={example.exerciseCommand} label="Tam demo komutunu kopyala" />
          </div>
        </details>
        <details>
          <summary>SDK ile initialize → tools/list → tools/call örneği</summary>
          <p>
            Node.js 24 ile proje klasöründe <code>client-demo.mjs</code> olarak
            kaydedip çalıştırın. Örnek argümanlar sentetiktir; kimlik bilgisi
            içermez.
          </p>
          <CopyValue value={example.sdk} label="SDK örneğini kopyala" />
          <pre tabIndex={0}>{example.sdk}</pre>
        </details>
        <small>
          <code>local-script</code> yalnız istemci etiketidir; kullanıcı kimliği
          veya erişim yetkisi sağlamaz. Hizmet yeniden başladığında adresi
          ve Portable uygulama yeniden açıldığında adresi/komutu tekrar alın.
        </small>
      </div>
    </div>
  );
}
