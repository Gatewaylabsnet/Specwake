const summaries: Record<string, string> = {
  OK: "Çağrı başarıyla tamamlandı.",
  SW_HTTP_STATUS:
    "Demo API başarılı olmayan bir HTTP yanıtı döndürdü. Hata gövdesi kaydedilmedi.",
  SW_HTTP_UNAUTHORIZED: "Hedef kimlik doğrulamayı reddetti.",
  SW_HTTP_FORBIDDEN: "Hedef bu işleme izin vermedi.",
  SW_HTTP_RATE_LIMITED: "Hedefin çağrı sınırına ulaşıldı.",
  SW_TIMEOUT: "Hedef, zaman sınırı içinde yanıt vermedi.",
  SW_PARAMETER_INVALID: "Argümanlar seçili aracın şemasına uymuyor.",
  SW_RESPONSE_TOO_LARGE: "Yanıt izin verilen boyutu aştı.",
  SW_MOCK_FIXTURE_MISSING: "Bu işlem için sentetik demo yanıtı bulunmuyor.",
  TOOL_NOT_SELECTED: "Çağrılan araç bu hizmetin izin verilen seçiminde değil.",
  MCP_REQUEST_REJECTED:
    "MCP isteği, araç şeması veya protokol denetiminde reddedildi.",
  CALL_CANCELLED:
    "Bağlantı kapandı veya hizmet durduruldu; çağrı iptal edildi.",
};
export function callSummary(code: string) {
  return Object.hasOwn(summaries, code)
    ? summaries[code]
    : "Çağrı tamamlanamadı. Güvenli hata kodunu ve hizmet durumunu kontrol edin.";
}
