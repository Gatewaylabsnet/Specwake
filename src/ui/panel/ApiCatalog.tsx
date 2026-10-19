import React, { useRef, useState } from "react";
import type { ApiGroup } from "../../panel/catalog.js";
import type { Selection } from "../../core/model.js";
import { OperationReview } from "./OperationReview.js";

interface Props {
  groups: ApiGroup[];
  group?: ApiGroup;
  selections: Selection[];
  locked: boolean;
  busy: boolean;
  hasDeployment: boolean;
  onGroup(id: string): void;
  onSelections(value: Selection[]): void;
  onImport(source?: string): void;
  onReadPostSample(): void;
  onSave(): void;
  onExport(): void;
}
export function ApiCatalog(p: Props) {
  const [reviews, setReviews] = useState<Record<string, Selection | undefined>>(
    {},
  );
  const file = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const [onlyAllowed, setOnlyAllowed] = useState(false);
  const [fileError, setFileError] = useState("");
  const operations =
    p.group?.operations.filter(
      (op) =>
        (!onlyAllowed || !op.issues.length) &&
        `${op.path} ${op.description} ${op.name}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    ) ?? [];
  const select = (id: string, checked: boolean) => {
    const op = p.group!.operations.find((op) => op.id === id)!;
    p.onSelections(
      checked
        ? [
            ...p.selections,
            reviews[`${p.group!.id}:${op.id}`] ?? {
              id,
              name: op.name,
              description: op.description,
            },
          ]
        : p.selections.filter((s) => s.id !== id),
    );
  };
  return (
    <section className="mp-card" aria-labelledby="catalog-title" id="catalog">
      <div className="mp-section-head">
        <div>
          <div className="mp-eyebrow">01 / API KATALOĞU</div>
          <h2 id="catalog-title">Tanımdan araca</h2>
          <p>
            GET veya açıkça onayladığınız salt-okuma POST işlemlerini seçin.
          </p>
        </div>
        <div className="mp-button-row">
          <input
            ref={file}
            type="file"
            accept=".json,.yaml,.yml"
            hidden
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              if (picked.size > 1024 * 1024) {
                setFileError("Dosya 1 MiB sınırını aşıyor.");
                return;
              }
              setFileError("");
              try {
                p.onImport(await picked.text());
              } catch {
                setFileError("Dosya okunamadı.");
              }
            }}
          />
          <button
            className="mp-button"
            disabled={p.busy || p.locked}
            onClick={() => file.current?.click()}
          >
            ↑ OpenAPI yükle
          </button>
          <button
            className="mp-button mp-button-dark"
            disabled={p.busy || p.locked || p.groups.length >= 8}
            onClick={() => p.onImport()}
          >
            ＋ Demo API ekle
          </button>
        </div>
      </div>
      <div className="mp-button-row" style={{ padding: "0 24px 16px" }}>
        <button
          className="mp-button"
          disabled={p.busy || p.locked || p.groups.length >= 8}
          onClick={p.onReadPostSample}
        >
          JSON POST demosu ekle
        </button>
      </div>
      {fileError && (
        <div role="alert" className="mp-error">
          {fileError}
        </div>
      )}
      {!p.groups.length ? (
        <div className="mp-empty">
          <span>↗</span>
          <h3>İlk API grubunuzu ekleyin</h3>
          <p>
            Sentetik Operations Demo API ile başlayın veya uyumlu JSON/YAML
            dosyasını yükleyin.
            <br />
            Hiçbir işlem kendiliğinden seçilmez. Dosyadaki sunucu adresleri
            kullanılmaz.
          </p>
        </div>
      ) : (
        <>
          <div className="mp-groups">
            {p.groups.map((g, i) => (
              <button
                key={g.id}
                disabled={p.locked}
                className={`mp-group ${g.id === p.group?.id ? "selected" : ""}`}
                onClick={() => p.onGroup(g.id)}
              >
                <span className="mp-api-icon">↗</span>
                <span>
                  <strong>{g.title}</strong>
                  <small>
                    Grup {String(i + 1).padStart(2, "0")} ·{" "}
                    {g.operations.length} endpoint · Demo proxy
                  </small>
                </span>
                <span className="mp-chip">OAS {g.version}</span>
              </button>
            ))}
          </div>
          <div className="mp-table-tools">
            <label className="mp-search">
              <span>⌕</span>
              <input
                aria-label="Endpoint filtrele"
                placeholder="Endpoint veya araç ara…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <label className="mp-check">
              <input
                type="checkbox"
                checked={onlyAllowed}
                onChange={(e) => setOnlyAllowed(e.target.checked)}
              />{" "}
              Yalnız uygun GET
            </label>
            <span>{p.selections.length} araç seçili</span>
          </div>
          <div className="mp-table-scroll">
            <table className="mp-endpoint-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Görünen uygun GET işlemlerini seç"
                      disabled={
                        p.locked || !operations.some((op) => !op.issues.length)
                      }
                      checked={
                        operations.some((op) => !op.issues.length) &&
                        operations
                          .filter((op) => !op.issues.length)
                          .every((op) =>
                            p.selections.some((s) => s.id === op.id),
                          )
                      }
                      onChange={(e) => {
                        const visible = operations.filter(
                          (op) => !op.issues.length,
                        );
                        p.onSelections(
                          e.target.checked
                            ? [
                                ...p.selections.filter(
                                  (s) => !visible.some((op) => op.id === s.id),
                                ),
                                ...visible.map(
                                  (op) =>
                                    reviews[`${p.group!.id}:${op.id}`] ?? {
                                      id: op.id,
                                      name: op.name,
                                      description: op.description,
                                    },
                                ),
                              ].slice(0, 64)
                            : p.selections.filter(
                                (s) => !visible.some((op) => op.id === s.id),
                              ),
                        );
                      }}
                    />
                  </th>
                  <th>İşlem / endpoint</th>
                  <th>MCP aracı</th>
                  <th>Uygunluk</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((op) => (
                  <tr
                    key={op.id}
                    className={
                      p.selections.some((s) => s.id === op.id)
                        ? "mp-row-selected"
                        : ""
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${op.method} ${op.path} seç`}
                        disabled={
                          p.locked ||
                          (op.method === "POST"
                            ? !reviews[`${p.group!.id}:${op.id}`] &&
                              !p.selections.some((s) => s.id === op.id)
                            : !!op.issues.length) ||
                          (p.selections.length >= 64 &&
                            !p.selections.some((s) => s.id === op.id))
                        }
                        checked={p.selections.some((s) => s.id === op.id)}
                        onChange={(e) => select(op.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <div className="mp-route">
                        <span
                          className={`mp-method ${op.method !== "GET" ? "muted" : ""}`}
                        >
                          {op.method}
                        </span>
                        <code>{op.path}</code>
                      </div>
                      <small>{op.description}</small>
                      {["GET", "POST"].includes(op.method) && (
                        <OperationReview
                          key={`${p.group!.id}:${op.id}`}
                          operation={op}
                          locked={p.locked}
                          onReview={(value) => {
                            setReviews((current) => ({
                              ...current,
                              [`${p.group!.id}:${op.id}`]: value,
                            }));
                            if (p.selections.some((s) => s.id === op.id))
                              p.onSelections(
                                value
                                  ? p.selections.map((s) =>
                                      s.id === op.id ? value : s,
                                    )
                                  : p.selections.filter((s) => s.id !== op.id),
                              );
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <code className="mp-tool-name">{op.name}</code>
                    </td>
                    <td>
                      {op.issues.length ? (
                        <span
                          className="mp-unsupported"
                          title={op.issues.join(" ")}
                        >
                          {reviews[`${p.group!.id}:${op.id}`]
                            ? "Yönetici onayı hazır"
                            : "Kapalı / inceleme gerekli"}
                          <small>
                            {op.method === "POST"
                              ? "Salt-okuma onayı + JSON sözleşmesi + runtime izin listesi gerekir."
                              : op.issues[0]}
                          </small>
                        </span>
                      ) : (
                        <span className="mp-allowed">● İzin verilebilir</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!operations.length && (
              <div className="mp-empty compact">
                Filtreyle eşleşen endpoint yok.
              </div>
            )}
          </div>
          <div className="mp-card-foot">
            <span>
              GET işlemleri de yan etki oluşturabilir. Seçim açık kullanıcı izni
              gerektirir.
            </span>
            <div className="mp-button-row">
              <button
                className="mp-button"
                disabled={p.busy || !p.selections.length}
                onClick={p.onExport}
              >
                ZIP dışa aktar ↗
              </button>
              <button
                className="mp-button mp-button-dark"
                disabled={
                  p.busy ||
                  p.locked ||
                  (!p.selections.length && !p.hasDeployment)
                }
                onClick={p.onSave}
              >
                Seçimi kaydet →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
