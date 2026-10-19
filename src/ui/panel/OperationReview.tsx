import React, { useState } from "react";
import type { Operation, Selection, Tool } from "../../core/model.js";
import {
  normalizeBodySchema,
  POST_REVIEW,
  BODY_REVIEW,
} from "../../core/body-schema.js";
import { inputSchema } from "../../core/contracts.js";

type Props = {
  operation: Operation;
  locked: boolean;
  onReview(value: Selection | undefined): void;
};
export function OperationReview(props: Props) {
  return props.operation.method === "GET" ? (
    <GetReview {...props} />
  ) : (
    <PostReview {...props} />
  );
}
function GetReview({ operation, locked, onReview }: Props) {
  const [description, setDescription] = useState(operation.description);
  const [readOnly, setReadOnly] = useState(false);
  const update = (text: string, consent: boolean) => {
    setDescription(text);
    setReadOnly(consent);
    onReview({
      id: operation.id,
      name: operation.name,
      description: text,
      ...(consent ? { readOnlyConfirmed: true } : {}),
    });
  };
  return (
    <details className="mp-operation-review">
      <summary>GET açıklaması / erişim onayı</summary>
      <p>
        GET yöntemi tek başına yan etkisizlik veya veri erişim yetkisi garantisi
        değildir.
      </p>
      <label>
        Araç açıklaması
        <textarea
          maxLength={2000}
          rows={2}
          value={description}
          disabled={locked || !!operation.issues.length}
          onChange={(e) => update(e.target.value, readOnly)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={readOnly}
          disabled={locked || !!operation.issues.length}
          onChange={(e) => update(description, e.target.checked)}
        />{" "}
        Salt-okuma olarak açıkça onaylıyorum (model ipucu; gerçek kurum etkisi
        doğrulanmadı).
      </label>
    </details>
  );
}
function PostReview({ operation, locked, onReview }: Props) {
  const [draft, setDraft] = useState({
    description: operation.description,
    schemaText: JSON.stringify(
      operation.requestBody?.schema ??
        operation.requestBody?.proposal ?? {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      null,
      2,
    ),
    readOnly: false,
    override: false,
    adapter: false,
  });
  const canReview = operation.issues.every((issue) =>
    [POST_REVIEW, BODY_REVIEW].includes(issue),
  );
  function selection(value: typeof draft): Selection | undefined {
    try {
      const schema = normalizeBodySchema(JSON.parse(value.schemaText));
      if (
        schema.type !== "object" ||
        !value.readOnly ||
        !value.override ||
        !value.adapter ||
        !canReview ||
        !value.description.trim()
      )
        return;
      return {
        id: operation.id,
        name: operation.name,
        description: value.description,
        readOnlyConfirmed: true,
        bodyOverride: schema,
        bodyOverrideApproved: true,
        responseAdapterApproved: true,
      };
    } catch {
      return;
    }
  }
  const change = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onReview(selection(next));
  };
  let preview: unknown;
  try {
    const bodySchema = normalizeBodySchema(JSON.parse(draft.schemaText));
    preview = inputSchema({
      ...operation,
      operationId: operation.id,
      bodySchema,
      readOnlyConfirmed: true,
      responseAdapterApproved: true,
    } as Tool);
  } catch {
    preview = {
      warning: "Geçersiz veya desteklenmeyen şema; etkinleştirme kapalı.",
    };
  }
  return (
    <details className="mp-operation-review">
      <summary>
        POST incelemesi ·{" "}
        {selection(draft) ? "Yönetici onayı hazır" : "Kapalı / onay bekliyor"}
      </summary>
      <p>
        Salt-okuma onayı gerçek API’nin yan etkisizliğini veya kişi/veri erişim
        yetkisini kanıtlamaz.
      </p>
      <p>
        Bildirilen body tipi:{" "}
        <code>{operation.requestBody?.declaredType ?? "missing"}</code>.
        Orijinal tanım değiştirilmez; aşağıdaki sözleşme ayrı override’dır.
      </p>
      {[
        ...(operation.requestBody?.warnings ?? []),
        ...(operation.responseWarnings ?? []),
      ].map((warning, i) => (
        <p key={i} className="mp-warning">
          {warning}
        </p>
      ))}
      {!canReview && (
        <p className="mp-error">
          Bu işlem demo izin listesi veya desteklenen sözleşme kapsamında değil;
          etkinleştirilemez.
        </p>
      )}
      <label>
        Araç açıklaması
        <textarea
          aria-label={`${operation.id} açıklaması`}
          maxLength={2000}
          rows={2}
          disabled={locked || !canReview}
          value={draft.description}
          onChange={(e) => change({ description: e.target.value })}
        />
      </label>
      <label>
        JSON object şeması / taslak
        <textarea
          aria-label={`${operation.id} body şeması`}
          spellCheck={false}
          rows={8}
          disabled={locked || !canReview}
          value={draft.schemaText}
          onChange={(e) => change({ schemaText: e.target.value })}
        />
      </label>
      <p>
        Örnekten yalnız tip taslağı önerilir; örnek değerler taşınmaz, required
        alanı tahmin edilmez. Zorunlulukları yalnız doğrulanmış sözleşmeye göre
        açıkça ekleyin.
      </p>
      <label>
        <input
          type="checkbox"
          disabled={locked || !canReview}
          checked={draft.override}
          onChange={(e) => change({ override: e.target.checked })}
        />{" "}
        Düzenlediğim body override’ını onaylıyorum.
      </label>
      <label>
        <input
          type="checkbox"
          disabled={locked || !canReview}
          checked={draft.readOnly}
          onChange={(e) => change({ readOnly: e.target.checked })}
        />{" "}
        Bu seçimi salt-okuma sorgusu olarak açıkça onaylıyorum.
      </label>
      <label>
        <input
          type="checkbox"
          disabled={locked || !canReview}
          checked={draft.adapter}
          onChange={(e) => change({ adapter: e.target.checked })}
        />{" "}
        Yanıt şemasına güvenmiyorum; yapılandırılmış sonuç adaptörünü
        onaylıyorum.
      </label>
      <details>
        <summary>Taslak MCP input şeması</summary>
        <pre>{JSON.stringify(preview, null, 2)}</pre>
      </details>
      <p>
        Bu üç onay aracı kendiliğinden etkinleştirmez. Satırdaki seçim kutusunu
        ayrıca işaretleyip kaydedin. Runtime hedef izin listesi de bağımsız
        olarak denetlenir.
      </p>
    </details>
  );
}
