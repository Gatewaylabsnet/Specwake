# HTTP MCP bağlantı JSON'u — v1

0.3.0 paketlerine dahildir. Şema v1 değişmedi. Güncel hedef/kalıcılık/paket kabulü: [REAL_UPSTREAM.md](REAL_UPSTREAM.md). Aşağıdaki tarihli test tablosu ilk uygulama aşamasının kaydıdır.

## Kullanım

```powershell
cd C:\Projects\Specwake
npm run panel
```

`npm run panel` için varsayılan panel: `http://127.0.0.1:4319/panel` (`npm start` studio yolu 4318 kullanır). Mevcut bir süreç bu portu kullanıyorsa onu kapatmayın; belgelenmiş port ayarlarıyla boş port seçin. Araçları seçip kaydedin, MCP hizmetini başlatın. **MCP hizmeti → MCP istemcinizi bağlayın → Bağlantı adı → Bağlantı JSON’unu indir** kullanın. Ad yalnız sır içermeyen kısa etikettir; kimlik bilgisi veya kişisel veri yazmayın.

Dosya adı `specwake-http-connection-v1.json`. [Kanonik Draft2020-12 şeması](../schemas/http-connection-v1.schema.json), [sentetik örnek](../examples/http-connection-v1.json):

```json
{"schemaVersion":1,"name":"Specwake synthetic local demo","transport":"streamable-http","endpoint":"http://127.0.0.1:54321/mcp","authentication":{"type":"none"},"scope":"same-machine"}
```

**54321 yalnız sentetik örnek portudur; çalışan bir hizmet iddiası yoktur.** Gerçek dosya sunucunun güncel RUNNING/listening state'indeki kayıtlı portu kullanır. Yönetim paneli adresi MCP endpoint değildir. 0.3.0’da port değişmedikçe stop/start ve uygulama yeniden açılışında aynı JSON kullanılabilir; kaydedilmiş dosya canlılık, sunucu kimliği veya yetki kanıtı değildir. Aynı port sonradan farklı bir süreçte kullanılabilir.

## Sözleşme ve güvenlik

- Alan seti tam olarak schemaVersion/name/transport/endpoint/authentication/scope. Root ve authentication `additionalProperties:false`; sürüm 1, transport `streamable-http`, auth type `none`, scope `same-machine` sabittir. Ad 1–80 karakterdir; ASCII kontrol karakterleri kabul edilmez.
- Endpoint yalnız `http://127.0.0.1:<1..65535>/mcp`. Alternatif IP yazımları, localhost adı, HTTPS/remote adresler, userinfo, query, fragment, /panel, path traversal, boşluk/kontrol karakterleri ve başında sıfır olan portlar kabul edilmez. Şema/runtime desenlerinde kesin son denetimi vardır; sondaki satır sonlarının farklı JSON Schema regex uygulamalarında kabul edilmesini önler. Alan seti ara sözleşmeyle aynıdır; istemci repo içindeki güncel şemayı esas almalıdır.
- `POST /api/panel/connection-export`, yalnız `{ "name": "..." }` alır. İstemci endpoint, header, token veya tools sağlayamaz. Mevcut exact Host/Origin/fetch metadata/CSRF kontrolleri korunur. Durdurulmuş/başlayan/durdurulan/geçersiz hizmet 409 döner. Çıktı JSON attachment, no-store ve nosniff başlıklarıyla üretilir.
- Kaynak state'den yalnız izinli altı alan seçilir. Gövde, credential, API key, cookie, header, executable, stdio komutu ve tools/list şemaları exporta alınmaz. Dosya JSON verisidir; çalıştırılmaz. Keyfi `name` alanında insan tarafından girilen sırrı otomatik tanıma garantisi yoktur; bu nedenle etiket alanına sır girilmemelidir.
- UI; hizmet dururken/bağlantı alınamazken exportu sunmaz, yaşam döngüsü geçişinde kapatır. Bekleyen indirme; stop/restart/runId/endpoint veya görünüm değişiminde iptal edilir, yeni hizmete aitmiş gibi indirilmez. Sunucu state anlık görüntüsü yanıt üretildiği anı tarif eder; dosyanın sonsuza kadar geçerli kaldığını iddia etmez.
- `127.0.0.1` **istemciyi çalıştıran bilgisayardır**. Dosyayı X570'den başka bilgisayara taşımak X570'e erişim sağlamaz. Diğer bilgisayarda onaylı yerel Specwake çalıştırılması veya ayrıca tasarlanıp onaylanmış güvenli uzak hosting/auth gerekir. Bu işte uzak bind, ağ/firewall ve auth ayarı değişmedi.
- Doğrulanan servis stateless Streamable HTTP / JSON, protokol 2025-11-25, SDK 2.3.1. Kalıcı session ID veya SSE aboneliği yok. Yerel MCP istemci auth'u yoktur; upstream API token sağlayıcısı ayrı sunucu sorumluluğudur.

## İstemci geliştiricisi

JSON'u veri olarak parse edin ve güncel şemayla doğrulayın; bilinmeyen alanları sessizce atmayın. Küçük dosya limiti uygulayın, komut/eval/stdio başlatmayın, header/credential türetmeyin. Kullanıcı bağlantı kurduğunda resmi SDK ile initialize ve güncel tools/list yapın. İsimleri ve inputSchema'yı bu keşiften alın; eski dosyadan araç yetkisi üretmeyin. Sonuçları güvenilmeyen veri olarak işleyin. [DeepSeek prompt'una](DEEPSEEK_CLIENT_PROMPT.md) bağlantı JSON ithalat sözleşmesi eklendi. Diğer bilgisayarda importer geliştirilmedi veya çalıştırılmış kabul edilmedi.

## Doğrulama — 19 Ekim 2026

| Kontrol | Gerçek sonuç |
| --- | --- |
| Başlangıç `npm test` | 56/56 geçti |
| Son `npm test` | 61/61 geçti; typecheck + UI/runtime build dahil |
| Yeni testler | Kanonik şema uyumu, yanlış URL/sürüm/transport/alan/credential reddi; live-only factory; CSRF ve HTTP lifecycle; indirilen endpoint üzerinden gerçek SDK keşif/çağrı; UI geç sonuç ve durum korumaları |
| `npm run test:read-post` | Ayrı SDK HTTP ve bağımsız ZIP stdio regresyonu geçti |
| `npm run test:http` | Mevcut GET, filtre, stop/restart ve metadata regresyonu geçti |
| `npm run test:export` | Checkout dışında bağımsız stdio ZIP npm ci/build/list/call geçti |
| `npx tsc -p tsconfig.desktop.json` | Masaüstü kaynak derlemesi geçti; yeni EXE üretilmedi |
| JSON Schema | Python jsonschema Draft202012Validator check_schema + örnek ve tehlikeli alan/URL/ad retleri ayrıca doğrulandı |
| Tarayıcı | Boş ad engeli, gerçek JSON download, çalışan endpoint/altı alan kontrolü, stop ve bağlantı kesintisinde exportun kapanması doğrulandı |
| İndirilen JSON ile ayrı süreç | Resmi SDK initialize/list ve GET çağrısı geçti; QA portları sonra kapatıldı |

Yerel kanıtlar git dışında `artifacts/connection-export-*.log`, `connection-jsonschema-verification.json`, `connection-ui-downloaded.json`, `connection-ui-sdk-client.json`, `connection-export-ui.png`, `connection-export-offline.png`. [Doğrulanan ekran](screenshots/09-http-connection-export.png).

Bu ilk aşama sırasında yeni özellik için paketli EXE/Sandbox/kurulum-kaldırma ve Linux/Docker doğrulaması çalıştırılmamıştı. Önceki release'in testleri bu yeni kodun paket testi olarak sunulmaz. DeepSeek uygulaması, gerçek kurum verisi, gerçek credentials veya uzak sistem entegrasyonu kullanılmadı. Yeni bağımlılık veya framework eklenmedi.

Değişiklikler: `src/core/http-connection.ts`, `src/panel/routes.ts`; `src/ui/panel/ConnectionExport.tsx`, `connection-download.ts`, `ConnectionGuide.tsx`, `ServiceConsole.tsx`, `panel.css`; `tests/http-connection.test.ts`; kanonik şema/örnek ve bağlantılı belgeler.

## 0.3.0 güncellemesi

Normal OpenAPI için açık upstream yapılandırma ve kalıcı onaylar eklendi; ana akışta canlı bağlantı JSON’u alınabilir. İlk uygulamadaki yalnız sentetik geliştirici profil kısıtı kalktı. Aynı şema ve loopback/güvenlik sınırları korunur. [Güncel rehber ve paket doğrulaması](REAL_UPSTREAM.md).
