import React, { useEffect, useState } from "react";
import { ApiCatalog } from "./ApiCatalog.js";
import { ServiceConsole } from "./ServiceConsole.js";
import { StatisticsView } from "./StatisticsView.js";
import { panelApi, panelJson, toolDefaults, type PanelState } from "./api.js";
import { usePanelController } from "./usePanelController.js";
import { UpstreamSettings } from "./UpstreamSettings.js";
import { TargetNotice } from "./TargetNotice.js";
import { OverviewService } from "./OverviewService.js";

export default function Panel() {
  const [settingsPending, setSettingsPending] = useState(false);
  const [page, setPage] = useState<"overview" | "catalog" | "service" | "logs">(
    "catalog",
  );
  const {
    state,
    stats,
    filters,
    setFilters,
    groupId,
    setGroupId,
    selections,
    setSelections,
    tool,
    args,
    setArgs,
    client,
    setClient,
    busy,
    callBusy,
    error,
    setError,
    notice,
    setNotice,
    unavailable,
    group,
    service,
    locked,
    draftSaved,
    result,
    invalidate,
    refresh,
    action,
    chooseTool,
    runCall,
    online,
    setTool,
  } = usePanelController();
  useEffect(() => {
    document.title = "Specwake · Yerel MCP Yönetimi";
    document.documentElement.lang = "tr";
  }, []);
  return (
    <div className="manager">
      <aside className="mp-sidebar">
        <a className="mp-brand" href="/panel">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <path
              d="M5 10h15l11 8-11 8H5l11-8zM5 18h11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
          <strong>
            Specwake<span>by GatewayLabs</span>
          </strong>
        </a>
        <div className="mp-workspace">
          <i /> Yerel çalışma alanı<span>01</span>
        </div>
        <div className="mp-nav-label">ÇALIŞMA ALANI</div>
        <nav>
          {[
            ["overview", "▦", "Genel bakış"],
            ["catalog", "↗", "API grupları & araçlar"],
            ["service", "⌁", "MCP hizmeti"],
            ["logs", "≡", "Çağrı kayıtları"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => {
                invalidate();
                setPage(id as typeof page);
                window.scrollTo(0, 0);
              }}
            >
              <span>{icon}</span>
              {label}
              {id === "catalog" && <small>{state?.groups.length ?? 0}</small>}
            </button>
          ))}
        </nav>
        <div className="mp-sidebar-bottom">
          <div className="mp-local-card">
            <span className={online ? "mp-dot online" : "mp-dot"} />
            <strong>
              {unavailable
                ? "Bağlantı alınamıyor"
                : online
                  ? "MCP hizmeti çalışıyor"
                  : "MCP hizmeti durmuş"}
            </strong>
            <small>Yalnız 127.0.0.1 · dış erişim kapalı</small>
          </div>
          <div className="mp-session">
            <span>SW</span>
            <div>
              Yerel oturum<small>Kurumsal kimlik doğrulama yok</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="mp-main">
        <div className="mp-topbar">
          <div>
            Çalışma alanı <span>/</span>{" "}
            {page === "service"
              ? "MCP hizmeti & bağlantı"
              : page === "logs"
                ? "Çağrı kayıtları"
                : page === "catalog"
                  ? "API kataloğu"
                  : "Genel bakış"}
          </div>
          <div>
            <span className="mp-demo-badge">● YEREL ÇALIŞMA ALANI</span>
            <span className="mp-version">Yerel prototip</span>
          </div>
        </div>
        <main className="mp-content">
          <div className="mp-page-head">
            <div>
              <div className="mp-eyebrow">OPENAPI → MCP</div>
              <h1>
                {page === "service"
                  ? "MCP hizmeti ve istemci bağlantısı."
                  : page === "logs"
                    ? "Her çağrı görünür olsun."
                    : page === "catalog"
                      ? "API’lerinize yeni bir arayüz."
                      : "API’lerinizden çalışan MCP araçlarına."}
              </h1>
              <p>
                OpenAPI yükleyin, işlemleri hazırlayın ve bağlantı JSON’unu
                alın.
              </p>
            </div>
            <button className="mp-button" onClick={() => void refresh()}>
              ⟳ Görünümü yenile
            </button>
          </div>
          <TargetNotice targetMode={service?.deployment?.targetMode} />
          {unavailable && (
            <div role="alert" className="mp-error">
              Panel durumu alınamıyor. Ekrandaki veriler son alınan kayıtlardır;
              hizmetin çalıştığı doğrulanamıyor. Yerel süreci kontrol edip
              yenileyin.
            </div>
          )}
          {error && (
            <div role="alert" className="mp-error">
              {error}
              <button onClick={() => setError("")} aria-label="Hatayı kapat">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="mp-notice">
              ✓ {notice}
            </div>
          )}
          {busy && (
            <div role="status" className="mp-loading">
              <span />
              {busy}…
            </div>
          )}
          {!state && !unavailable && (
            <div role="status" className="mp-empty">
              Yerel panel yükleniyor…
            </div>
          )}
          <div className="mp-progress">
            {[
              ["OpenAPI yükle", !!state?.groups.length],
              ["İşlemleri seç ve kaydet", !!service?.deployment],
              [
                "Upstream hedefini yapılandır",
                service?.deployment?.targetMode === "api" ||
                  service?.deployment?.targetMode === "synthetic",
              ],
              ["MCP hizmetini başlat", !!online],
              ["Bağlantı JSON’unu indir", false],
            ].map(([text, done], i) => (
              <button
                key={String(text)}
                className={done ? "done" : ""}
                onClick={() => {
                  invalidate();
                  setPage(i < 2 ? "catalog" : "service");
                  window.scrollTo(0, 0);
                }}
              >
                <span>{done ? "✓" : `0${i + 1}`}</span>
                {text}
              </button>
            ))}
          </div>
          {page === "overview" && (
            <>
              <OverviewService
                state={state}
                unavailable={unavailable}
                onOpen={() => {
                  invalidate();
                  setPage(service?.deployment ? "service" : "catalog");
                  window.scrollTo(0, 0);
                }}
              />
              <StatisticsView
                stats={stats}
                state={state}
                filters={filters}
                onFilters={setFilters}
              />
            </>
          )}
          {page === "catalog" && (
            <ApiCatalog
              groups={state?.groups ?? []}
              hasDeployment={!!service?.deployment}
              group={group}
              selections={selections}
              locked={locked}
              busy={!!busy || unavailable}
              onGroup={(id) => {
                invalidate();
                setGroupId(id);
                setSelections(
                  state?.workspace?.profiles.find((p) => p.groupId === id)
                    ?.selections ?? [],
                );
              }}
              onSelections={(value) => {
                invalidate();
                setSelections(value);
                setNotice("");
              }}
              onImport={(source) =>
                void action("OpenAPI doğrulanıyor", async () => {
                  const imported = await panelJson<{ id: string }>("import", {
                    source,
                  });
                  setGroupId(imported.id);
                  setSelections([]);
                  setNotice(
                    "OpenAPI doğrulandı. GET veya onaylı POST işlemlerini seçip yapılandırın.",
                  );
                })
              }
              onSave={() =>
                void action("Araç seçimi kaydediliyor", async () => {
                  const next = await panelJson<PanelState["service"]>(
                    "configure",
                    { groupId, selections },
                  );
                  const first = next.deployment?.manifest.tools[0];
                  setTool(first?.name ?? "");
                  setArgs(first ? toolDefaults(first) : "{}");
                  setPage("service");
                  window.scrollTo(0, 0);
                  setNotice(
                    first
                      ? next.deployment?.targetMode === "unconfigured"
                        ? "Seçim kaydedildi. Upstream hedefini yapılandırıp izinleri onaylayın."
                        : next.deployment?.targetMode === "api"
                          ? "Seçim ve hedef onayı korundu; hizmeti başlatabilirsiniz."
                          : "Test profili seçimi kaydedildi. Gerçek API bağlantısı değildir."
                      : "Seçim ve POST onayları sunucudan kaldırıldı. Yeniden başlatmak için açık seçim gerekir.",
                  );
                })
              }
              onExport={() =>
                void action("Bağımsız ZIP hazırlanıyor", async () => {
                  const response = await panelApi("export", {
                    groupId,
                    selections,
                  });
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "specwake-server.zip";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setNotice(
                    "ZIP indirildi. Bağımsız stdio sunucusu için README ve hedef yapılandırmasını inceleyin.",
                  );
                })
              }
            />
          )}
          {page === "catalog" && service?.deployment && (
            <div className="mp-catalog-next">
              <p>
                Seçim kaydedildi. Hizmet ekranında hedef durumunu ve bağlantı
                seçeneklerini inceleyin.
              </p>
              <button
                className="mp-button"
                onClick={() => {
                  invalidate();
                  setPage("service");
                  window.scrollTo(0, 0);
                }}
              >
                MCP hizmetine geç →
              </button>
            </div>
          )}
          {page === "service" && service && (
            <>
              <UpstreamSettings
                onDirty={setSettingsPending}
                service={service}
                workspace={state?.workspace}
                busy={!!busy || unavailable}
                onTarget={(target) =>
                  void action("Hedef kaydediliyor", async () => {
                    await panelApi("target", {
                      groupId: service.deployment?.groupId,
                      revision: service.deployment?.revision,
                      target,
                      approveSelection: true,
                    });
                    setNotice(
                      "Hedef ve seçili işlem izinleri kaydedildi. Upstream çağrısı yapılmadı.",
                    );
                  })
                }
                onPort={(mcpPort) =>
                  void action("Yerel port kaydediliyor", async () => {
                    await panelApi("connection-settings", { mcpPort });
                    setNotice(
                      "Yerel MCP portu kaydedildi. Bağlantı JSON’unu yeniden indirin.",
                    );
                  })
                }
              />
              <ServiceConsole
                pendingSettings={settingsPending}
                desktopExecutable={state?.desktopClientExecutable}
                service={service}
                unavailable={unavailable}
                canStart={
                  draftSaved &&
                  !settingsPending &&
                  ["synthetic", "api"].includes(
                    service.deployment?.targetMode ?? "",
                  )
                }
                busy={busy}
                callBusy={callBusy}
                tool={tool}
                args={args}
                client={client}
                result={result}
                onTool={chooseTool}
                onArgs={(value) => {
                  invalidate();
                  setArgs(value);
                }}
                onClient={(value) => {
                  invalidate();
                  setClient(value);
                }}
                onReset={() => chooseTool(tool)}
                onCall={() => void runCall()}
                onReview={() => {
                  invalidate();
                  setPage("catalog");
                  window.scrollTo(0, 0);
                }}
                onStart={() =>
                  void action(
                    "MCP hizmeti doğrulanarak başlatılıyor",
                    async () => {
                      await panelApi("start", {});
                      setNotice(
                        "MCP hizmeti SDK initialize ve tools/list kontrolünden geçti.",
                      );
                    },
                  )
                }
                onStop={() =>
                  void action("MCP hizmeti durduruluyor", async () => {
                    await panelApi("stop", {});
                    setNotice(
                      "MCP listener kapatıldı; çağrı kayıtları korundu.",
                    );
                  })
                }
              />
            </>
          )}
          {page === "logs" && (
            <StatisticsView
              stats={stats}
              state={state}
              filters={filters}
              onFilters={setFilters}
              logsOnly
            />
          )}
          <footer className="mp-footer">
            <span>
              SPECWAKE <b> / </b> Kontrollü API → MCP geçişi
            </span>
            <span>
              Yerel kayıt · 7 gün / 5.000 olay · hassas gövde ve kimlik
              bilgileri kaydedilmez
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
