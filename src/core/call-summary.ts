const summaries: Record<string, string> = {
  SW_OPERATION_FORBIDDEN: "İşlem, runtime salt-okuma POST izin listesinde değil.",
  SW_APPLICATION_ERROR: "HTTP başarılı olsa da uygulama zarfı hata bildirdi. Hassas hata içeriği atlandı.",
  SW_RESPONSE_ENVELOPE: "Yanıt onaylı sonuç zarfına uymuyor; başarı veya tamlık doğrulanamadı.",
  SW_RESULT_MISSING: "Beklenen sonuç alanı bulunamadı; eksik veri tam sonuç sayılmaz.",
  SW_REQUEST_TOO_LARGE: "JSON body 16 KiB sınırını aşıyor.",
  SW_CANCELLED: "Çağrı iptal edildi; eski sonuç kullanılmaz.",
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
