import React, { useEffect, useState } from "react";
import type { PanelState } from "./api.js";
import type { Target } from "../../runtime/http.js";
const defaultAdapter = {
  statusField: "statusCode",
  successValues: [200],
  errorsField: "errors",
  dataField: "data",
  rowCountField: "numRows",
  partialField: "partial",
  maskFields: [
    "IdNo",
    "IdTaxNo",
    "IBAN",
    "address",
    "fullName",
    "token",
    "password",
    "Authorization",
  ],
};
export function UpstreamSettings({
  service,
  workspace,
  busy,
  onTarget,
  onPort,
  onDirty,
}: {
  service: PanelState["service"];
  workspace: PanelState["workspace"];
  busy: boolean;
  onTarget(target: Target): void;
  onPort(port: number): void;
  onDirty(value: boolean): void;
}) {
  const profile = workspace?.profiles.find(
    (p) => p.groupId === service.deployment?.groupId,
  );
  const [mode, setMode] = useState<"api" | "local-test">("api");
  const [baseUrl, setUrl] = useState("");
  const [ips, setIps] = useState("");
  const [adapter, setAdapter] = useState(
    JSON.stringify(defaultAdapter, null, 2),
  );
  const [approved, setApproved] = useState(false);
  const [port, setPort] = useState("");
  const [error, setError] = useState("");
  const saved = JSON.stringify(profile?.target);
  useEffect(() => {
    const target = profile?.target;
    setMode(target?.mode === "local-test" ? "local-test" : "api");
    setUrl(target?.baseUrl ?? "");
    setIps(target?.allowedAddresses.join(", ") ?? "");
    setAdapter(
      JSON.stringify(target?.responseAdapter ?? defaultAdapter, null, 2),
    );
    setApproved(false);
    setError("");
  }, [saved, service.deployment?.groupId]);
  useEffect(() => setApproved(false), [service.deployment?.revision]);
  useEffect(
    () => setPort(String(workspace?.mcpPort ?? "")),
    [workspace?.mcpPort],
  );
  const locked = busy || !["stopped", "error"].includes(service.phase);
  const posts =
    service.deployment?.manifest.tools.filter((t) => t.method === "POST") ?? [];
  let changed = false;
  try {
    changed =
      baseUrl !== (profile?.target?.baseUrl ?? "") ||
      mode !==
        (profile?.target?.mode === "local-test" ? "local-test" : "api") ||
      (mode === "api" &&
        ips !== (profile?.target?.allowedAddresses.join(", ") ?? "")) ||
      (posts.length > 0 &&
        JSON.stringify(JSON.parse(adapter)) !==
          JSON.stringify(profile?.target?.responseAdapter ?? defaultAdapter));
  } catch {
    changed = true;
  }
  const pending =
    changed || (port !== "" && Number(port) !== workspace?.mcpPort);
  useEffect(() => onDirty(pending), [pending, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  function reset() {
    const target = profile?.target;
    setMode(target?.mode === "local-test" ? "local-test" : "api");
    setUrl(target?.baseUrl ?? "");
    setIps(target?.allowedAddresses.join(", ") ?? "");
    setAdapter(
      JSON.stringify(target?.responseAdapter ?? defaultAdapter, null, 2),
    );
    setPort(String(workspace?.mcpPort ?? ""));
    setApproved(false);
    setError("");
  }
  function save() {
    try {
      const responseAdapter = posts.length ? JSON.parse(adapter) : undefined;
      setError("");
      onTarget({
        mode,
        baseUrl,
        allowedAddresses:
          mode === "local-test"
            ? ["127.0.0.1"]
            : ips.split(/[,;\s]+/).filter(Boolean),
        allowInsecureHttp: false,
        allowedReadPosts: posts.map((t) => t.operationId),
        ...(responseAdapter ? { responseAdapter } : {}),
      });
    } catch {
      setError("Adaptör geçerli bir JSON nesnesi olmalı.");
    }
  }
  return (
    <section
      className="mp-card mp-settings"
      aria-label="Hedef ve bağlantı ayarları"
    >
      <div className="mp-section-head">
        <div>
          <div className="mp-eyebrow">UPSTREAM VE BAĞLANTI</div>
          <h2>API hedefini yapılandırın</h2>
          {profile?.target && (
            <p>
              {service.deployment?.targetMode === "api"
                ? "Onaylı hedef"
                : "Hedef taslağı"}{" "}
              ·{" "}
              {profile.target.mode === "local-test"
                ? "Yerel test API’si"
                : "HTTPS API"}{" "}
              · <code>{profile.target.baseUrl}</code>
            </p>
          )}
          <p>
            Kaydetmek ve hizmeti başlatmak upstream çağrısı yapmaz. İstek yalnız
            açık tools/call eyleminde gönderilir.
          </p>
        </div>
      </div>
      <div className="mp-settings-body">
        {pending && (
          <p role="status">
            Kaydedilmemiş hedef/port taslağı var. Hizmet başlatılmadan önce
            kaydedin veya{" "}
            <button
              className="mp-text-button"
              onClick={reset}
              disabled={locked}
            >
              Kaydedilmiş ayara dön
            </button>
            .
          </p>
        )}
        <details open={service.deployment?.targetMode === "unconfigured"}>
          <summary>Sabit upstream hedefi / işlem izni</summary>
          {!service.deployment ? (
            <p>Önce API kataloğunda araçları seçip kaydedin.</p>
          ) : service.deployment.targetMode === "synthetic" ? (
            <p>
              Mevcut seçim geliştirici test profiline aittir. Kendi OpenAPI
              dosyanızı yükleyin.
            </p>
          ) : (
            <>
              <label>
                Hedef türü
                <select
                  aria-label="Hedef türü"
                  disabled={locked}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setUrl("");
                    setIps("");
                    setApproved(false);
                  }}
                >
                  <option value="api">HTTPS API</option>
                  <option value="local-test">
                    Açık yerel test API’si · yalnız 127.0.0.1
                  </option>
                </select>
              </label>
              <label>
                API kök adresi
                <input
                  aria-label="API kök adresi"
                  autoComplete="off"
                  value={baseUrl}
                  disabled={locked}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setApproved(false);
                  }}
                />
              </label>
              {mode === "api" ? (
                <label>
                  İzinli tam IPv4 adresleri
                  <input
                    aria-label="İzinli tam IPv4 adresleri"
                    value={ips}
                    disabled={locked}
                    onChange={(e) => {
                      setIps(e.target.value);
                      setApproved(false);
                    }}
                  />
                </label>
              ) : (
                <p>
                  Yerel test modu yalnız açıkça girdiğiniz 127.0.0.1 portuna
                  gider; uzaktaki HTTP adresleri kabul edilmez.
                </p>
              )}
              <p>
                URL’ye token, parola veya kişisel veri yazmayın. HTTPS/TLS
                doğrulaması ve her çağrıda DNS/IP denetimi korunur; redirect
                izlenmez. OpenAPI servers otomatik bağlanmaz.
              </p>
              {!!posts.length && (
                <>
                  <p>
                    İzin verilecek POST sorguları:{" "}
                    {posts.map((t) => t.operationId).join(", ")}.
                  </p>
                  <label>
                    Yanıt adaptörü · JSON
                    <textarea
                      aria-label="Yanıt adaptörü"
                      rows={8}
                      value={adapter}
                      disabled={locked}
                      onChange={(e) => {
                        setAdapter(e.target.value);
                        setApproved(false);
                      }}
                    />
                  </label>
                </>
              )}
              <p>
                Bearer işlemleri için sunucu sürecindeki SPECWAKE_BEARER_TOKEN,
                X-* API key için SPECWAKE_API_KEY kullanılır. Sırlar burada
                girilmez/kaydedilmez; eksik credential güvenli hatadır.
                Login/refresh veya kurumsal yetkilendirme sağlanmaz.
              </p>
              <label className="mp-check">
                <input
                  type="checkbox"
                  aria-label="Hedef ve seçili işlem izinlerini onayla"
                  checked={approved}
                  disabled={locked}
                  onChange={(e) => setApproved(e.target.checked)}
                />{" "}
                Seçili işlemleri, POST salt-okuma onaylarını ve adaptörü bu
                hedef için yeniden onaylıyorum. Gerçek yan etkisizlik/veri
                erişim yetkisi sorumluluğunu inceledim.
              </label>
              <button
                className="mp-button mp-button-dark"
                disabled={locked || !approved || !baseUrl}
                onClick={save}
              >
                Hedefi ve izinleri kaydet
              </button>
            </>
          )}
        </details>
        <details open={service.lastError === "MCP_PORT_IN_USE"}>
          <summary>Kalıcı yerel MCP portu</summary>
          <p>
            Yalnız 127.0.0.1 üzerinde dinlenir. Doluysa başka porta sessizce
            geçilmez. Portu değiştirirseniz eski JSON için yeni dosya indirin.
          </p>
          <label>
            MCP portu
            <input
              aria-label="MCP portu"
              type="number"
              min={1}
              max={65535}
              value={port}
              disabled={locked}
              onChange={(e) => setPort(e.target.value)}
            />
          </label>
          <button
            className="mp-button"
            disabled={
              locked ||
              !Number.isInteger(Number(port)) ||
              Number(port) < 1 ||
              Number(port) > 65535 ||
              Number(port) === workspace?.mcpPort
            }
            onClick={() => onPort(Number(port))}
          >
            Yerel portu kaydet
          </button>
        </details>
        {workspace?.warning && (
          <p role="alert">
            Kayıtlı onayın bağlamı değişmiş; hedefi ve seçimi yeniden inceleyip
            onaylayın.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
