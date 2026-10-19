import React, { useEffect, useState } from "react";
import { ApiCatalog } from "./ApiCatalog.js";
import { ServiceConsole } from "./ServiceConsole.js";
import { StatisticsView } from "./StatisticsView.js";
import { panelApi, panelJson, defaults, type PanelState } from "./api.js";
import { usePanelController } from "./usePanelController.js";
import { OverviewService } from "./OverviewService.js";
import "./panel.css";

export default function Panel() {
  const [page, setPage] = useState<"overview" | "catalog" | "service" | "logs">(
    "overview",
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
          <i /> Yerel demo ortamı<span>01</span>
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
        <div className="mp-nav-label mp-nav-spacer">GELİŞTİRİCİ</div>
        <a className="mp-builder-link" href="/">
          ↗ Bağımsız sunucu oluşturucu<span>STDIO / ZIP</span>
        </a>
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
              Demo oturumu<small>Kurumsal kimlik doğrulama yok</small>
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
            <span className="mp-demo-badge">● DEMO / SENTETİK VERİ</span>
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
                Seçin, başlatın, gerçek bir çağrıyla doğrulayın. Kontrol sizde.
              </p>
            </div>
            <button className="mp-button" onClick={() => void refresh()}>
              ⟳ Görünümü yenile
            </button>
          </div>
          <div className="mp-demo-note">
            <span>ⓘ</span>
            <p>
              <strong>İzole bir gösterim ortamındasınız.</strong> Tüm API
              yanıtları sentetiktir. API/proxy grubu bir içe aktarımı temsil
              eder; Apinizer bağlantısı ve doğrulanmış kurumsal kullanıcı
              yoktur.
            </p>
            <span className="mp-note-tag">LOOPBACK ONLY</span>
          </div>
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
              <div className="mp-progress">
                {[
                  ["API’yi içe aktar", !!state?.groups.length],
                  ["GET araçlarını seç", !!service?.deployment],
                  ["Seçimi kaydet", !!service?.deployment],
                  ["MCP hizmetini başlat", !!online],
                  ["MCP istemcisini bağla", false],
                  ["Çağrıyı incele", false],
                ].map(([text, done], i) => (
                  <button
                    key={String(text)}
                    className={done ? "done" : ""}
                    onClick={() => {
                      invalidate();
                      setPage(i < 3 ? "catalog" : i === 5 ? "logs" : "service");
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span>{done ? "✓" : `0${i + 1}`}</span>
                    {text}
                  </button>
                ))}
              </div>
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
              group={group}
              selections={selections}
              locked={locked}
              busy={!!busy || unavailable}
              onGroup={(id) => {
                invalidate();
                setGroupId(id);
                setSelections([]);
              }}
              onSelections={(value) => {
                invalidate();
                setSelections(value);
                setNotice("");
              }}
              onImport={(source) =>
                void action("OpenAPI doğrulanıyor", async () => {
                  const imported = await panelJson<{ id: string }>(
                    source === undefined ? "sample" : "import",
                    source === undefined ? {} : { source },
                  );
                  setGroupId(imported.id);
                  setSelections([]);
                  setNotice(
                    "OpenAPI doğrulandı. İzin vereceğiniz GET işlemlerini seçin.",
                  );
                })
              }
              onSave={() =>
                void action("Araç seçimi kaydediliyor", async () => {
                  const next = await panelJson<PanelState["service"]>(
                    "configure",
                    { groupId, selections },
                  );
                  const first = next.deployment!.manifest.tools[0];
                  setTool(first.name);
                  setArgs(defaults(first.parameters));
                  setPage("service");
                  window.scrollTo(0, 0);
                  setNotice(
                    "Araç seçimi kaydedildi. MCP hizmetini başlatabilirsiniz.",
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
                  link.download = "specwake-demo-server.zip";
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
                Seçim kaydedildiğinde hizmeti başlatıp bağımsız istemciyi
                bağlayabilirsiniz.
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
            <ServiceConsole
              desktopExecutable={state?.desktopClientExecutable}
              service={service}
              unavailable={unavailable}
              canStart={draftSaved}
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
                  setNotice("MCP listener kapatıldı; çağrı kayıtları korundu.");
                })
              }
            />
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
