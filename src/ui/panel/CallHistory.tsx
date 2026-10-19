import React, { useEffect, useRef, useState } from "react";
import type { CallEvent } from "../../panel/types.js";
import { callSummary } from "../../core/call-summary.js";
import { CopyValue } from "./CopyValue.js";
export const callTime = (at: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(at));
export function CallHistory({
  events,
  groupName,
  retained,
  limit,
  onTool,
  onGroup,
}: {
  events: CallEvent[];
  groupName(id: string): string;
  retained: number;
  limit: number;
  onTool(name: string): void;
  onGroup(id: string): void;
}) {
  const [selected, setSelected] = useState<CallEvent>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  return (
    <>
      <div className="mp-card mp-logs">
        <div className="mp-section-head">
          <div>
            <h3>Son çağrılar</h3>
            <p>
              Gerçekleştirilen sentetik demo çağrıları · en yeni {limit} kayıt ·
              İstanbul / UTC+3
            </p>
          </div>
          <span className="mp-chip">{retained} / 5.000 saklanan</span>
        </div>
        <div className="mp-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Zaman / ayrıntı</th>
                <th>Araç / API grubu</th>
                <th>Yerel istemci</th>
                <th>Sonuç</th>
                <th>Süre</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, limit).map((e) => (
                <tr key={e.id}>
                  <td>
                    <button
                      className="mp-call-open"
                      aria-label={`Çağrı ayrıntısı ${e.id.slice(0, 8)}`}
                      onClick={() => setSelected(e)}
                    >
                      {callTime(e.at)}
                      <small>{e.id.slice(0, 8)} ↗</small>
                    </button>
                  </td>
                  <td>
                    <button
                      className="mp-entity-link"
                      onClick={() => onTool(e.tool)}
                    >
                      {e.tool}
                    </button>
                    <small>{groupName(e.groupId)}</small>
                  </td>
                  <td>
                    <code>{e.client}</code>
                    <small>Doğrulanmamış demo etiketi</small>
                  </td>
                  <td>
                    <span
                      className={`mp-chip ${e.outcome === "success" ? "success" : "danger"}`}
                    >
                      {e.outcome === "success" ? "Başarılı" : "Hatalı"}
                    </span>
                    <small>{e.code}</small>
                  </td>
                  <td className="mp-duration">{e.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events.length && (
            <div className="mp-empty compact">
              Bu filtrelerde kayıt yok. Bir demo çağrısı çalıştırın veya
              filtreleri değiştirin.
            </div>
          )}
        </div>
      </div>
      <dialog
        ref={dialog}
        className="mp-call-dialog"
        aria-labelledby="call-detail-title"
        onClose={() => setSelected(undefined)}
        onCancel={() => setSelected(undefined)}
      >
        {selected && (
          <>
            <div className="mp-section-head">
              <div>
                <div className="mp-eyebrow">KAYDEDİLMİŞ DEMO METADATASI</div>
                <h2 id="call-detail-title">Çağrı ayrıntısı</h2>
              </div>
              <button
                className="mp-button"
                autoFocus
                onClick={() => dialog.current?.close()}
              >
                Kapat ×
              </button>
            </div>
            <div className="mp-call-detail-body">
              <p
                className={`mp-detail-summary ${selected.outcome === "error" ? "error" : ""}`}
              >
                {callSummary(selected.code)}
              </p>
              <dl>
                <dt>Sonuç / güvenli kod</dt>
                <dd>
                  {selected.outcome === "success" ? "Başarılı" : "Hatalı"} ·{" "}
                  <code>{selected.code}</code>
                </dd>
                <dt>Zaman (İstanbul)</dt>
                <dd>
                  {new Date(selected.at).toLocaleString("tr-TR", {
                    timeZone: "Europe/Istanbul",
                  })}{" "}
                  / UTC+3
                </dd>
                <dt>Zaman (UTC)</dt>
                <dd>
                  <code>{selected.at}</code>
                </dd>
                <dt>İşleme süresi</dt>
                <dd>{selected.durationMs} ms</dd>
                <dt>Endpoint / araç</dt>
                <dd>
                  <code>{selected.tool}</code>
                </dd>
                <dt>API / demo proxy grubu</dt>
                <dd>
                  {groupName(selected.groupId)}
                  <small>{selected.groupId}</small>
                </dd>
                <dt>Yerel istemci</dt>
                <dd>
                  {selected.client}
                  <small>
                    Doğrulanmamış etiket; kurumsal kullanıcı değildir.
                  </small>
                </dd>
                <dt>Korelasyon kimliği</dt>
                <dd>
                  <code>{selected.id}</code>
                  <CopyValue
                    value={selected.id}
                    label="Korelasyon kimliğini kopyala"
                  />
                </dd>
                <dt>Hizmet çalışma kimliği</dt>
                <dd>
                  <code>{selected.runId}</code>
                </dd>
              </dl>
              <p className="mp-disclaimer">
                Süre SDK/MCP ve upstream işlemeyi kapsar; bağlantı kurma, upload
                ve disk yazımı hariçtir. İstek/yanıt gövdesi, prompt ve kimlik
                bilgileri bu kayıtta tutulmaz.
              </p>
              <div className="mp-button-row">
                <button
                  className="mp-button"
                  onClick={() => {
                    onTool(selected.tool);
                    dialog.current?.close();
                  }}
                >
                  Bu aracı filtrele
                </button>
                <button
                  className="mp-button"
                  onClick={() => {
                    onGroup(selected.groupId);
                    dialog.current?.close();
                  }}
                >
                  Bu API grubunu filtrele
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
