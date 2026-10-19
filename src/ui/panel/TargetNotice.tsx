import React from "react";

export function TargetNotice({
  targetMode,
}: {
  targetMode?: "synthetic" | "unconfigured" | "api";
}) {
  return (
    <div className="mp-demo-note" role="note">
      <span>ⓘ</span>
      <p>
        {targetMode === "synthetic" ? (
          <>
            <strong>Mevcut hizmet sentetik test profiline bağlı.</strong> Gerçek
            API çağrısı yapmaz. Önceki seçimler ve kayıtlar korunur.
          </>
        ) : targetMode === "api" ? (
          <>
            <strong>API hedefi ve seçim onaylı.</strong> İstekler yalnız açık
            araç çağrısıyla gönderilir. Kurumsal kullanıcı yetkilendirmesi
            yoktur.
          </>
        ) : (
          <>
            <strong>API hedefi yapılandırılmamış.</strong> OpenAPI yükleyip
            araçları seçin. Hizmet ekranında sabit API hedefini ve izinleri
            onaylayın. Hedef onaylanmadan HTTP hizmeti başlatılamaz.
          </>
        )}
      </p>
      <span className="mp-note-tag">YALNIZ BU BİLGİSAYAR</span>
    </div>
  );
}
