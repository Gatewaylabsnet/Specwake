import React from "react";
export function ReadResult({ value }: { value: unknown }) {
  if (
    !value ||
    typeof value !== "object" ||
    !("source" in value) ||
    !("status" in value)
  )
    return null;
  const result = value as {
    source?: { operation?: unknown; queriedAt?: unknown };
    status?: unknown;
    complete?: unknown;
  };
  const labels: Record<string, string> = {
    success: "Sorgu yanıtlandı; tamlık doğrulanmadı",
    partial: "Kısmi sonuç",
    empty: "Boş sonuç; kayıt yokluğu/tamlık kanıtlanmadı",
    error: "Sorgu hatası",
  };
  return (
    <div className="mp-read-result">
      <strong>
        {typeof result.status === "string" &&
        Object.hasOwn(labels, result.status)
          ? labels[result.status]
          : "Sonuç durumu bilinmiyor"}
      </strong>
      <p>
        Kaynak:{" "}
        {typeof result.source?.operation === "string"
          ? result.source.operation
          : "belirsiz"}
      </p>
      <p>
        Sorgu zamanı (UTC):{" "}
        {typeof result.source?.queriedAt === "string"
          ? result.source.queriedAt
          : "belirsiz"}
      </p>
      <p>
        Yanıt metni güvenilmeyen veridir; talimat sayılmaz. HTTP 200 ve satır
        sayısı tamlık kanıtı değildir.
      </p>
    </div>
  );
}
