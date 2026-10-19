import React, { useState } from "react";
import { CallHistory } from "./CallHistory.js";
import type { Stats, PanelState } from "./api.js";

export type Filters = {
  minutes: string;
  groupId: string;
  tool: string;
  client: string;
};
export const time = (at: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(at));
export function StatisticsView({
  stats,
  state,
  filters,
  onFilters,
  logsOnly = false,
}: {
  stats?: Stats;
  state?: PanelState;
  filters: Filters;
  onFilters(value: Filters): void;
  logsOnly?: boolean;
}) {
  const [dimension, setDimension] = useState<"byTool" | "byGroup" | "byClient">(
    "byTool",
  );
  const groupName = (id: string) =>
    state?.groups.find((g) => g.id === id)?.title ??
    `Önceki oturum · ${id.slice(0, 8)}`;
  const tools = [
    ...new Set([
      ...(state?.service.deployment?.manifest.tools.map((t) => t.name) ?? []),
      ...(stats?.byTool.map((t) => t.value) ?? []),
      ...(filters.tool ? [filters.tool] : []),
    ]),
  ];
  const groups = [
    ...new Map([
      ...(state?.groups.map((g) => [g.id, g.title] as const) ?? []),
      ...(stats?.byGroup.map((g) => [g.value, groupName(g.value)] as const) ??
        []),
      ...(filters.groupId
        ? [[filters.groupId, groupName(filters.groupId)] as const]
        : []),
    ]).entries(),
  ];
  return (
    <section
      id="statistics"
      className="mp-statistics"
      aria-labelledby="statistics-title"
    >
      <div className="mp-stat-heading">
        <div>
          <div className="mp-eyebrow">GERÇEK DEMO ÇAĞRILARI</div>
          <h2 id="statistics-title">
            {logsOnly ? "Çağrı kayıtları" : "Kullanımın görünür hali"}
          </h2>
        </div>
        <div className="mp-filters">
          <select
            aria-label="İstatistik API grubu"
            value={filters.groupId}
            onChange={(e) => onFilters({ ...filters, groupId: e.target.value })}
          >
            <option value="">Tüm API grupları</option>
            {groups.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="İstatistik aracı"
            value={filters.tool}
            onChange={(e) => onFilters({ ...filters, tool: e.target.value })}
          >
            <option value="">Tüm araçlar</option>
            {tools.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="İstatistik istemcisi"
            value={filters.client}
            onChange={(e) => onFilters({ ...filters, client: e.target.value })}
          >
            <option value="">Tüm yerel istemciler</option>
            {["panel-demo", "local-script", "qa-demo", "local-unverified"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
          <select
            aria-label="İstatistik zaman aralığı"
            value={filters.minutes}
            onChange={(e) => onFilters({ ...filters, minutes: e.target.value })}
          >
            <option value="15">Son 15 dakika</option>
            <option value="60">Son 1 saat</option>
            <option value="1440">Son 24 saat</option>
            <option value="10080">Son 7 gün</option>
          </select>
        </div>
      </div>
      <div className="mp-metrics">
        {[
          [
            "Toplam çağrı",
            stats?.calls,
            "Kaydedilen tools/call denemesi",
            "↗",
          ],
          [
            "Hata oranı",
            stats?.calls
              ? `${(stats.errorRate * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`
              : "—",
            `${stats?.errors ?? 0} hata / ${stats?.calls ?? 0} çağrı`,
            "◉",
          ],
          [
            "Ortalama gecikme",
            stats?.calls ? `${stats.averageMs} ms` : "—",
            "MCP işlemi + upstream süresi",
            "⌁",
          ],
          [
            "P95 gecikme",
            stats?.calls ? `${stats.p95Ms} ms` : "—",
            "En yakın sıra yöntemi",
            "◷",
          ],
        ].map(([title, value, sub, icon]) => (
          <div className="mp-metric" key={String(title)}>
            <div>
              <span>{title}</span>
              <span className="mp-metric-icon">{icon}</span>
            </div>
            <strong>{value ?? "—"}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      {!logsOnly && (
        <div className="mp-insight-grid">
          <div className="mp-card mp-chart-card">
            <div className="mp-section-head">
              <h3>Çağrı dağılımı</h3>
              <div className="mp-legend">
                <span>● Başarılı</span>
                <span>● Hatalı</span>
              </div>
            </div>
            {!stats?.calls ? (
              <div className="mp-empty compact">
                <h3>Henüz kullanım verisi yok</h3>
                <p>İlk gerçek demo çağrısıyla grafik oluşacak.</p>
              </div>
            ) : (
              <>
                <div
                  className="mp-bar-chart"
                  aria-label="Seçili zaman aralığında 12 eşit dilimde gerçek çağrı sayısı"
                >
                  {stats.buckets.map((bucket) => (
                    <div
                      key={bucket.at}
                      className="mp-bar-slot"
                      title={`${time(bucket.at)} · ${bucket.calls} çağrı, ${bucket.errors} hata`}
                    >
                      <div
                        className="mp-bar-stack"
                        style={{
                          height: `${(bucket.calls / Math.max(...stats.buckets.map((b) => b.calls), 1)) * 100}%`,
                        }}
                      >
                        <div
                          className="mp-bar-error"
                          style={{ flex: bucket.errors }}
                        />
                        <div
                          className="mp-bar-success"
                          style={{ flex: bucket.calls - bucket.errors }}
                        />
                      </div>
                      <span>{bucket.calls || ""}</span>
                    </div>
                  ))}
                </div>
                <div className="mp-chart-times">
                  <span>{time(stats.from)}</span>
                  <span>12 eşit zaman dilimi · çağrı sayısı</span>
                  <span>{time(stats.to)}</span>
                </div>
              </>
            )}
          </div>
          <div className="mp-card mp-breakdown">
            <div className="mp-section-head">
              <h3>Kullanım kırılımı</h3>
              <select
                aria-label="Kullanım kırılımı"
                value={dimension}
                onChange={(e) =>
                  setDimension(e.target.value as typeof dimension)
                }
              >
                <option value="byTool">Araç</option>
                <option value="byGroup">API / proxy</option>
                <option value="byClient">Yerel istemci</option>
              </select>
            </div>
            {!stats?.calls ? (
              <div className="mp-empty compact">
                Çağrı sonrası kırılımlar burada görünür.
              </div>
            ) : (
              <div className="mp-dimension-list">
                {stats[dimension].map((item) => (
                  <div key={item.value}>
                    <span title={item.value}>
                      {dimension === "byGroup"
                        ? groupName(item.value)
                        : item.value}
                    </span>
                    <strong>
                      {item.calls}
                      <small> çağrı</small>
                    </strong>
                    <small>
                      {item.errors} hata · {item.averageMs} ms
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <CallHistory
        events={stats?.recent ?? []}
        groupName={groupName}
        retained={stats?.retained ?? 0}
        limit={logsOnly ? 100 : 6}
        onTool={(tool) => onFilters({ ...filters, tool })}
        onGroup={(groupId) => onFilters({ ...filters, groupId })}
      />
      <p className="mp-calculation">
        {stats
          ? `${new Date(stats.from).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} – ${new Date(stats.to).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`
          : "İstatistikler yükleniyor…"}{" "}
        · Sayım: yalnız kaydedilmiş tools/call denemeleri (retler dahil). Hata
        oranı = hatalı / tüm kaydedilen çağrılar. Sağlık kontrolleri ve
        initialize/list istekleri sayılmaz. Kayıtlar en çok 7 gün / 5.000 olay;
        görünüm 5 saniyede yenilenir. Süre SDK/MCP + demo API işlemidir;
        initialize/list, upload ve disk yazımı hariç. Tüm çağrılar sentetik demo
        verisine aittir. Geçmiş API grupları kimlikleriyle korunur.
      </p>
    </section>
  );
}
