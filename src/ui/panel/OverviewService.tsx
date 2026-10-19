import React from "react";
import type { PanelState } from "./api.js";
export function OverviewService({
  state,
  unavailable,
  onOpen,
}: {
  state?: PanelState;
  unavailable: boolean;
  onOpen(): void;
}) {
  const service = state?.service;
  const running =
    !unavailable && service?.phase === "running" && service.listening;
  const label = unavailable
    ? "Durum alınamıyor"
    : !service
      ? "Yükleniyor"
      : running
        ? "MCP hizmeti çalışıyor"
        : service.phase === "error"
          ? "Başlatma hatası"
          : service.phase === "starting"
            ? "Başlatılıyor"
            : service.phase === "stopping"
              ? "Durduruluyor"
              : "MCP hizmeti durmuş";
  return (
    <section className="mp-overview-service" aria-label="MCP hizmet durumu">
      <div>
        <span className={`mp-live-orb ${running ? "online" : ""}`}>↗</span>
        <div>
          <div className="mp-eyebrow">TEK YEREL MCP HİZMETİ</div>
          <h2>{label}</h2>
          <p>
            {running
              ? service.endpoint
              : "API seçiminizi kaydedin ve hizmet ekranında başlatın."}
          </p>
        </div>
      </div>
      <div className="mp-service-counts">
        <span>
          <strong>{state?.groups.length ?? "—"}</strong> API grubu
        </span>
        <span>
          <strong>{service?.deployment?.manifest.tools.length ?? "—"}</strong>{" "}
          seçili araç
        </span>
      </div>
      <button className="mp-button mp-button-green" onClick={onOpen}>
        {service?.deployment
          ? "Hizmeti ve bağlantıyı aç →"
          : "Demo akışını başlat →"}
      </button>
    </section>
  );
}
