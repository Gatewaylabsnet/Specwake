import React, { useState } from "react";
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="mp-copy-control">
      <button
        type="button"
        className="mp-button"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Kopyalandı");
          } catch {
            setStatus("Kopyalanamadı; görünür metni seçerek kopyalayın.");
          }
        }}
      >
        ⧉ {label}
      </button>
      <span role="status">{status}</span>
    </span>
  );
}
