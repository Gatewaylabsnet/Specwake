# Web prototipi — teslim ve inceleme kanıtı

17 Ekim 2026. Yerel Windows / Node 24. Başlangıç HEAD `f003349548aef01f6c0e4c1d1e21b1568046568f`; önceki ikinci tur değişiklikleri zaten commit edilmemişti ve korundu. Başlangıçta yeniden çalıştırılan **33/33** test geçti. Bu tur commit, push, PR, tag, release, public deployment veya uzaktan CI çalıştırması yoktur. ConfigDiffTool/başka proje üzerinde çalışma yapılmadı.

## Teslim edilen davranış

- `/panel`: Türkçe yönetici görünümü; API grupları/endpoint seçimi, gerçek hizmet durumu/adresi, MCP çağrı konsolu, gerçek çağrılardan grafik ve metrikler, boyutlara göre filtre/kırılım ve güvenli metadata kayıtları.
- Import ve GET seçimi mevcut OpenAPI/manifest çekirdeğini kullanır. Statik demo hedefi ayrı modüldedir; dosyanın `servers` URL'sine veya kurum ağına bağlantı yapılmaz. Fixture dışındaki yol, parametre veya auth tanımı seçilemez.
- MCP hizmeti ayrı loopback listener'ıdır. Resmî SDK 2.3.1 Streamable HTTP transportuyla gerçek initialize/list/call çalışır; panel istemcisinin protokolü 2025-11-25'tir. Başlatma, SDK initialize/list sağlık kontrolünü gerektirir; Durdur portu kapatır, açık çağrıları ve kayıt yazımlarını bekler.
- API/proxy grubu bir içe aktarımı temsil eder. Yerel istemci etiketleri doğrulanmış kullanıcı değildir. Sentetik veri ve kurumsal auth/API doğrulanmadığı bilgisi görünürdür.
- Kalıcı kayıt: metadata allowlist, tek yazıcı, atomik snapshot değişimi, 7 gün / 5.000 olay, açılış/okuma/yazmada diskten retention temizliği. API grupları ve hizmet seçimi oturuma özeldir; restart'ta hizmet durmuş başlar, kayıtlar korunur.
- Eski stdio oluşturucu `/` altında devam eder; panelden bağımsız ZIP de üretilebilir. Runtime hedef güvenliği yeniden yazılmadı.

Başlatma ve 5 adımlı gösterim: [WEB_PROTOTYPE.md](WEB_PROTOTYPE.md).

## Çalıştırılan kontroller

| Kontrol | Gerçek sonuç |
| --- | --- |
| Başlangıç `npm test` | 33/33 başarılı |
| Refactor ve son yarış düzeltmesi sonrası `npm test` | **40/40 başarılı**, sıfır atlanan/başarısız; pretest build ve TypeScript kontrolü dahil |
| `npm run test:export` | Depo dışındaki temiz klasörde kendi lockfile'ıyla npm ci/build + gerçek stdio MCP initialize/list/call; seçilmeyen araç ve yanlış argüman reddi; stdout yalnız protokol; başarılı |
| `npm run desktop:pack:dir` / `npm run test:desktop` | Unpacked masaüstü paketleme ve mevcut import/preview/stdio mock/ZIP/sandbox/origin regresyonu başarılı; installer çalıştırılmadı |
| Tarayıcı | Gerçek yerel YAML dosya seçimi, demo import, çoklu GET seçimi, arama, configure/start/call/stop, başarılı sonuç, kontrollü 503, bekleyen çağrıda argüman değişimi, istemci filtresi/kırılımı ve önceki oturum kaydı doğrulandı; console error/warn listesi boş |
| `npm audit --omit=dev --audit-level=high` | 0 runtime bağımlılık açığı raporlandı; yeni uygulama bağımlılığı eklenmedi |
| `git diff --check` | Başarılı (mevcut Windows LF/CRLF uyarıları dışında hata yok) |
| Docker / Linux | **Çalıştırılmadı.** Docker CLI mevcut, Linux motoruna named-pipe bağlantısı kurulamadı. Motor/OS ayarı değiştirilmedi |
| GitHub CI / üretim API / Apinizer / Elastic / SIEM | Çalıştırılmadı, bağlantı kurulmadı |

Bağımsız stdio export klasörü: `C:\Users\orkun\AppData\Local\Temp\specwake-export-OSAwe7`. Raporu: `artifacts/export-verification.json`. Masaüstü smoke: `artifacts/desktop-verification.json`. Tarayıcı sayıları test süitinin sabit değerleri değildir: ekranda gösterilen 4 çağrı, gerçek UI denemeleriyle oluştu (1 kontrollü hata, %25 hata oranı); yaklaşık 1,6 saniyelik demo çağrısı gerçek ölçülen gecikmeye dahildir. Tekrarlanan demo çağrıları bu değerleri değiştirir.

### Yeni otomasyon kapsamı

`tests/panel.test.ts`:

1. Gerçek HTTP MCP başlat/list/call/durdur/yeniden başlat; izinli ve seçilmeyen araç, yanlış argüman, hatalı JSON nesnesi, Host/Origin, protokol ve 64 KiB body sınırı, örnek auth/header sentinel'larının response/journal/console'a sızmaması, filtreli istatistikler.
2. Tek yazıcı, katı metadata şeması, paralel kayıt yazımının seri hale gelmesi ve store yeniden açılınca kalıcılık.
3. Zaman penceresi, ortalama, hata oranı, P95 ve boyut filtrelerinin hesaplama doğruluğu.
4. Kalıcı yazıcı hata verirse başarı yanıtı yerine redakte edilmiş hata dönmesi.
5. Süresi dolmuş kayıtların gerçekten diskten temizlenmesi ve 5.000 olay üst sınırı.
6. Araç/argüman/istemci/manifest/run değişimi ve reset sonrasında eski görünüm sonucunun reddi.
7. Bağlam hash'i beklerken restart yarışının eski çağrıyı yeni hizmete taşıyamaması.

Mevcut API/HTTPS/DNS/TLS/timeout/response-limit ve stdio testleri aynı tam süitte geçmeye devam eder. Sentetik API/auth fixture testleri, gerçek kurumsal yetki/PKI veya Apinizer bağlantısının kanıtı değildir.

## Kritik güvenlik ve kod kalitesi incelemesi

İnceleme yerel kod, kurulu SDK API'si, testler ve tarayıcı üzerinden yapıldı; bağımsız penetrasyon testi veya production sertifikasyonu değildir.

| Alan | İnceleme / kapatılan bulgu |
| --- | --- |
| Erişim sınırları | Yönetim API'si mevcut exact Host/Origin/fetch metadata ve POST CSRF kontrolünün arkasında. MCP ayrı portta; exact Host, tarayıcı Origin/fetch metadata reddi ve yalnız `/mcp` POST. CORS izni yok. Loopback dışına bind seçeneği yok |
| Upstream sınırı | Demo sunucusu da Host/Origin kontrolüyle loopback'e bağlı. Sabit fixture yolları; keyfi URL/OS komutu veya gerçek credential girişi yok. Mevcut üretim HTTPS, IP allowlist, DNS pinning, timeout ve 256 KiB yanıt limiti korunuyor |
| Kaynak sınırları | Import 1 MiB; yeni yönetim/MCP JSON çağrıları 64 KiB (import zarfı ayrı limitli), upload deadline 8 sn, istemci HTTP deadline 7 sn, mevcut upstream deadline 5 sn. MCP en çok 8 eşzamanlı istek, panel en çok 4 çağrı. Stateless yapı session biriktirmiyor; batch/SSE aboneliği yok |
| Hata redaksiyonu | SDK protokol hataları çağıranın araç adını içerebileceği için ham mesajlar sabit mesajla değiştiriliyor. Runtime güvenli kodları korunuyor; hata gövdesi/header/argüman kaydı yok. Sentinel testleri yanıt, disk ve console için geçti |
| Durdurma ve geç yanıt | Listener kapatılırken açık işlerin kayıt tamamlanması bekleniyor; iptal `CALL_CANCELLED`. UI generation + full manifest/args hash receipt kullanıyor; düzenleme/reset/araç/istemci/hizmet/gezinme değişimi eski sonucu geçersiz kılıyor |
| Restart yarışı | İnceleme testi, hash hesaplanırken restart'ın eski çağrıyı yeni listener'da çalıştırabildiğini **önce başarısız testle doğruladı** (yeni hizmette 1 çağrı). Manifest/run snapshot ve ağ çağrısı öncesi epoch kontrolü eklendi. Aynı test şimdi yeni hizmette **0 çağrı** doğruluyor |
| Kalıcı kayıt | İlk incelemede retention'ın sadece bellekte kalması riski giderildi; disk pruning testle doğrulandı. Tek yazıcı, seri yazım ve strict şema var; yazma hatası başarı gibi gösterilmiyor |
| Modüller ve tekrarlar | UI durum yönetimi `usePanelController`, ekranlar ayrı bileşenler. Lifecycle `mcp-service`, transport isteği `mcp-request`, kayıt `journal`, hesaplama `statistics`, seçim `catalog`, yönetim yönlendirme `routes`. JSON hata/limitleri ortak küçük HTTP modülünde. Karmaşık hata kodu ternary'si düz koşullara ayrıldı; yeni dosyalar biçimlendirildi |

### Açık sınırlar / sonraki işler

- Yerel process erişimi güven varsayımıdır; bu prototip kullanıcı kimliği doğrulamaz. Başka yerel process istemci etiketini taklit edebilir. TLS, MCP ve yönetim için uygun ayrı auth/authz olmadan kurum ağına veya internete açılmaz.
- Tek süreç / tek MCP hizmeti / bir aktif API grubu; grup seçimleri diskten geri yüklenmez. Yönetilen çoklu sunucu, kalıcı servis sürümleme ve kurumsal upstream seçimi sonraki geliştirmedir.
- JSON journal küçük demo yüküne yöneliktir; her olay snapshot yazar. Şifreli audit arşivi, fsync/crash dayanıklılığı, çok yazıcı, SIEM/Elastic ve veri tabanı bu turda yoktur. Zorla process öldürülürse boş writer.lock operatör müdahalesi gerektirebilir; mevcut çağrı kayıtları silinmez.
- Panel istatistikleri kayıtlı tools/call denemelerini sayar; ağ/HTTP kenarında erken reddedilen trafik ve initialize/list hata oranının kapsamı dışındadır. Ortalama/P95 istemci uçtan uca gecikmesi değildir.
- Gerçek tarayıcı kontrolü masaüstü IAB'de yapıldı. Responsive CSS hazır; gerçek mobil cihaz kabulü yapılmadı. Tam klavye/ekran okuyucu sertifikasyonu yoktur.
- Dockerfile hazır fakat Linux/Docker kabulü bekler. Demo image geliştirme araçları içerir; üretim image küçültme/digest ve dağıtım incelemesi tamamlanmadı. Installer kurulumu/kaldırması yapılmadı.
- LDAP/SSO, Apinizer eşlemesi, uzaktan kimlik doğrulanmış MCP yayını, Elastic/SIEM adaptörleri, tam SaaS ve headless authoring CLI bu turda uygulanmadı.

## Değişen dosya haritası

Bu tur eklenenler:

- `src/panel/{catalog,cli,http,journal,mcp-request,mcp-service,routes,statistics,types}.ts`
- `src/demo/server.ts`, `examples/operations-demo.yaml`
- `src/ui/panel/{Panel,ApiCatalog,ServiceConsole,StatisticsView}.tsx`, `api.ts`, `usePanelController.ts`, `result-context.ts`, `panel.css`
- `tests/panel.test.ts`, `Dockerfile`, `.dockerignore`, bu rapor ve `WEB_PROTOTYPE.md`

Mevcut dosyalara sınırlı ekler: `src/studio/server.ts` panel API/static route/cleanup; `src/ui/main.tsx` panel route ve oluşturucudan panel bağlantısı; `src/desktop/main.ts` panel kayıtları için kullanıcı-verisi dizini; `package.json` panel komutları; `.gitignore` yerel kayıt dizini; `README.md` prototip başlangıcı. Önceki turdan gelen diğer modified/untracked dosyalar korunmuştur. `package-lock.json` ve bağımlılık sürümleri değiştirilmedi.

## Görsel kanıt

- `artifacts/panel-overview.png`: gerçek çağrı sayılarıyla yönetici özeti.
- `artifacts/panel-first-call.png`: ilk initialize/list/call sonucu.
- `artifacts/panel-call-error.png`: güvenli kodlu kontrollü upstream hatası.
- `artifacts/panel-late-result-discarded.png`: argüman değişimi sonrası geç gelen yanıtın gösterilmemesi.
- `artifacts/panel-stopped.png`: kapalı listener, boş adres ve devre dışı çağrı düğmesi. QA bitiminde geçici panel sunucusu da normal kapanışla durduruldu; 4319/MCP test portları kapalı ve writer.lock kaldırılmıştır. Dört sentetik demo kaydı inceleme/yeniden başlatma için korunmuştur.

Görev bazlı token/kullanım verisi bu araçlardan alınamadı: **bilinmiyor**. Hesap kotası bu görevin kesin tüketimi olarak kullanılmadı. Kullanıcının istediği model/efor ayarının gerçek çalışma zamanı kimliği bu araçlarla doğrulanamadı; ayar uygulanmış gibi raporlanmıyor. Süre veya kesin maliyet taahhüdü verilmedi.
