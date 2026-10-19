import React from "react";
import { BodyForm } from "./BodyForm.js";
import { ReadResult } from "./ReadResult.js";
import { ConnectionGuide } from "./ConnectionGuide.js";
import type { PanelState } from "./api.js";
import type { CallReply } from "./api.js";

export function ServiceConsole(p: {
  service: PanelState["service"];
  unavailable: boolean;
  canStart: boolean;
  busy: string;
  callBusy: boolean;
  tool: string;
  args: string;
  client: string;
  result?: CallReply;
  onStart(): void;
  onStop(): void;
  onTool(value: string): void;
  onArgs(value: string): void;
  onClient(value: string): void;
  onReset(): void;
  onCall(): void;
  onReview(): void;
  desktopExecutable?: string;
  pendingSettings?: boolean;
}) {
  const running =
    !p.unavailable && p.service.phase === "running" && p.service.listening;
  const labels = {
    stopped: "Hizmet durmuş",
    starting: "Başlatılıyor",
    running: "Çalışıyor",
    stopping: "Durduruluyor",
    error: "Başlatılamadı",
  };
  const failed = !!p.result?.result?.isError;
  return (
    <section className="mp-card" id="console" aria-labelledby="console-title">
      <div className="mp-section-head">
        <div>
          <div className="mp-eyebrow">02 / MCP HİZMETİ</div>
          <h2 id="console-title">Bağlantıdan sonuca</h2>
          <p>
            Ayrı loopback portu · Streamable HTTP · Protokol{" "}
            {p.service.protocol}
          </p>
        </div>
        <span className={`mp-status ${running ? "online" : ""}`}>
          <i />
          {p.unavailable ? "Durum alınamıyor" : labels[p.service.phase]}
        </span>
      </div>
      <div className="mp-service-strip">
        <div>
          <span className="mp-eyebrow">MCP ADRESİ</span>
          <code>
            {p.service.endpoint ??
              p.service.configuredEndpoint ??
              "Yerel port ayarlanıyor"}
          </code>
          <small>
            {running
              ? `SDK sağlık kontrolü geçti · ${p.service.deployment?.manifest.tools.length} araç`
              : p.service.deployment?.targetMode === "unconfigured"
                ? "API hedefi yapılandırılmamış; seçim saklandı, yürütme kapalı."
                : "Hizmet kapalıyken çağrı kabul edilmez."}
          </small>
        </div>
        <div className="mp-button-row">
          <button
            className="mp-button"
            disabled={!!p.busy || !running}
            onClick={p.onStop}
          >
            ■ Durdur
          </button>
          <button
            className="mp-button mp-button-green"
            disabled={
              !!p.busy ||
              p.unavailable ||
              running ||
              !p.canStart ||
              p.pendingSettings ||
              p.service.deployment?.targetMode === "unconfigured" ||
              !p.service.deployment
            }
            onClick={p.onStart}
          >
            ▶ Hizmeti başlat
          </button>
        </div>
      </div>
      {!running &&
        !p.canStart &&
        !p.unavailable &&
        !p.pendingSettings &&
        p.service.deployment?.targetMode !== "unconfigured" && (
          <div className="mp-catalog-next">
            <p>
              Başlatmak için API kataloğunda GET veya onaylı POST seçimini
              kaydedin. Sayfa yenilendiğinde seçim yeniden onaylanır.
            </p>
            <button className="mp-button" onClick={p.onReview}>
              Araç seçimini gözden geçir →
            </button>
          </div>
        )}
      {!p.unavailable && (
        <ConnectionGuide
          service={p.service}
          toolName={p.tool}
          desktopExecutable={p.desktopExecutable}
          busy={!!p.busy}
        />
      )}
      {!p.service.deployment ||
      p.service.deployment.targetMode === "unconfigured" ? (
        <div className="mp-empty compact">
          <h3>
            {p.service.deployment
              ? "Seçim hazır · API hedefi bekleniyor"
              : "Önce OpenAPI yükleyin"}
          </h3>
          <p>
            API hedefi tamamlanmadan çağrı veya bağlantı JSON’u oluşturulmaz.
          </p>
        </div>
      ) : (
        <div className="mp-console-grid">
          <div className="mp-call-form">
            <h3>Araç çağrısı</h3>
            <p>
              Her deneme gerçek HTTP MCP initialize → tools/list → tools/call
              akışını çalıştırır.
            </p>
            <label>
              Araç
              <select
                aria-label="Çağrılacak araç"
                value={p.tool}
                onChange={(e) => p.onTool(e.target.value)}
                disabled={!p.service.deployment}
              >
                <option value="" disabled>
                  Araç seçin
                </option>
                {p.service.deployment?.manifest.tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Yerel istemci etiketi
              <select
                aria-label="Yerel istemci etiketi"
                value={p.client}
                onChange={(e) => p.onClient(e.target.value)}
              >
                <option value="panel-demo">Yerel panel (doğrulanmamış)</option>
                <option value="local-script">local-script</option>
                <option value="qa-demo">Test istemcisi (doğrulanmamış)</option>
              </select>
            </label>
            <small className="mp-disclaimer">
              Bu etiket doğrulanmış bir kullanıcı veya kurumsal kimlik değildir.
            </small>
            <div className="mp-label-row">
              <label htmlFor="panel-args">Argümanlar · JSON</label>
              <button className="mp-text-button" onClick={p.onReset}>
                Varsayılanlara dön
              </button>
            </div>
            {p.service.deployment?.manifest.tools.find((t) => t.name === p.tool)
              ?.bodySchema ? (
              <BodyForm
                key={p.tool}
                tool={
                  p.service.deployment.manifest.tools.find(
                    (t) => t.name === p.tool,
                  )!
                }
                args={p.args}
                onChange={p.onArgs}
              />
            ) : (
              <textarea
                id="panel-args"
                spellCheck={false}
                value={p.args}
                onChange={(e) => p.onArgs(e.target.value)}
                rows={6}
              />
            )}
            <button
              className="mp-button mp-button-dark mp-full"
              disabled={!running || !p.tool || p.callBusy || !!p.busy}
              onClick={p.onCall}
            >
              {p.callBusy ? "Çağrı çalışıyor…" : "Çağrıyı çalıştır →"}
            </button>
          </div>
          <div className="mp-call-result">
            <div className="mp-result-head">
              <span className="mp-eyebrow">MCP YANITI</span>
              <span
                className={`mp-chip ${p.result ? (failed ? "danger" : "success") : ""}`}
              >
                {p.callBusy
                  ? "Bekleniyor"
                  : p.result
                    ? failed
                      ? "Hatalı çağrı"
                      : "Başarılı çağrı"
                    : "Henüz sonuç yok"}
              </span>
            </div>
            {p.result ? (
              <>
                <div className="mp-handshake">
                  <span>✓ initialize</span>
                  <span>✓ {p.result.listedTools.length} araç listelendi</span>
                  <span>{failed ? "×" : "✓"} tools/call</span>
                </div>
                <ReadResult value={p.result.result.structuredContent} />
                <pre>{JSON.stringify(p.result.result, null, 2)}</pre>
                <p className="mp-result-note">
                  Yalnız bu hizmet sürümü, araç ve argümanlar için geçerlidir.
                  Kurum API/auth doğrulaması değildir.
                </p>
              </>
            ) : (
              <div className="mp-empty">
                <span>⌁</span>
                <h3>
                  {running
                    ? "İlk çağrınızı çalıştırın"
                    : "Hizmeti başlatarak deneyin"}
                </h3>
                <p>
                  Sonuçlar burada görünür.
                  <br />
                  Düzenleme ve hizmet değişimi önceki sonucu geçersiz kılar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
