import React, { useEffect, useRef, useState } from "react";
import type { Tool } from "../../core/model.js";
export function BodyForm({
  tool,
  args,
  onChange,
}: {
  tool: Tool;
  args: string;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const lastSent = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (args !== lastSent.current) setDrafts({});
  }, [args]);
  const emit = (value: string) => {
    lastSent.current = value;
    onChange(value);
  };
  const lastValid = useRef<Record<string, any>>({});
  let value: Record<string, any>;
  try {
    value = JSON.parse(args);
    lastValid.current = value;
  } catch {
    value = lastValid.current;
  }
  const body =
    value.body && typeof value.body === "object" && !Array.isArray(value.body)
      ? value.body
      : {};
  const properties = Object.entries(tool.bodySchema?.properties ?? {});
  return (
    <div className="mp-body-form">
      <p>
        JSON body · string değerler varsayılan olarak maskelidir. Gerçek kimlik
        bilgisi girmeyin.
      </p>
      <label>
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
        />{" "}
        Form değerlerini göster
      </label>
      {properties.map(([name, schema]) => (
        <label key={name}>
          {name}
          {tool.bodySchema?.required?.includes(name) ? " *" : " (isteğe bağlı)"}
          {["object", "array"].includes(schema.type) ? (
            <textarea
              aria-label={`${name} JSON`}
              disabled={!visible}
              placeholder="Önce form değerlerini göster seçeneğini açın"
              value={
                visible
                  ? (drafts[name] ??
                    (body[name] === undefined
                      ? ""
                      : JSON.stringify(body[name])))
                  : ""
              }
              onChange={(e) => {
                setDrafts((current) => ({
                  ...current,
                  [name]: e.target.value,
                }));
                try {
                  const next = { ...body };
                  if (!e.target.value) delete next[name];
                  else next[name] = JSON.parse(e.target.value);
                  emit(JSON.stringify({ ...value, body: next }, null, 2));
                } catch {
                  emit("{");
                }
              }}
            />
          ) : (
            <input
              aria-label={`${name} body değeri`}
              autoComplete="off"
              type={schema.type === "string" && !visible ? "password" : "text"}
              value={
                drafts[name] ??
                (body[name] === undefined ? "" : String(body[name]))
              }
              onChange={(e) => {
                setDrafts((current) => ({
                  ...current,
                  [name]: e.target.value,
                }));
                const next = { ...body };
                if (e.target.value === "") delete next[name];
                else {
                  if (
                    schema.type === "boolean" &&
                    !["true", "false"].includes(e.target.value)
                  ) {
                    emit("{");
                    return;
                  }
                  next[name] =
                    schema.type === "string"
                      ? e.target.value
                      : schema.type === "boolean"
                        ? e.target.value === "true"
                        : Number(e.target.value);
                }
                emit(JSON.stringify({ ...value, body: next }, null, 2));
              }}
            />
          )}
        </label>
      ))}
      <small>
        Body ayrıca runtime’da doğrulanır; bilinmeyen alanlar, yanlış tipler ve
        16 KiB üstü gövde reddedilir.
      </small>
      {args === "{" && (
        <p role="alert">
          Form değeri geçersiz; düzeltilmeden önceki değerlerle çağrı yapılmaz.
        </p>
      )}
    </div>
  );
}
