> Tarihsel ara çalışma raporu. Buradaki eksikler 0.3.0 ile tamamlandı; güncel davranış ve sınırlar: [REAL_UPSTREAM.md](REAL_UPSTREAM.md). Aşağıdaki testler önceki aşamanın kanıtıdır.

# Ana çalışma alanı ve bağlantı kolaylığı değerlendirmesi

19 Ekim 2026. Bu değişiklikler yalnız yerel çalışma ağacındadır. Önceden commitlenmemiş HTTP bağlantı JSON export kodu/şema/örneği korundu. Yeni commit, push, release veya EXE üretilmedi; yayımlanmış 0.2.0 dosyaları değiştirilmedi.

## Uygulanan UI temizliği

`/` ve `/panel` artık aynı sade çalışma alanını açar. Açılış API kataloğudur; tek giriş OpenAPI yüklemedir. Dört adım görünür: **OpenAPI yükle → işlemleri seç ve kaydet → MCP hizmetini başlat → bağlantı JSON’unu indir**. Demo API ekleme, JSON POST demosu ekleme, demo başlatma çağrıları ve beş denemelik sentetik exercise yönlendirmesi ana arayüzden çıkarıldı. JSON dışa aktarımı birincil bağlantı yoludur; SDK/CLI örnekleri geliştirici ayrıntısına alındı.

Eski bağımsız stdio/mock oluşturucu yalnız `/developer` altında ve açık geliştirici/test uyarısıyla bulunur. Ana navigasyonda bu sayfaya bağlantı yoktur; yalnız geliştirici belgelerindeki manuel adresle açılır. Fixture dosyaları, `/api/panel/sample`, `/api/panel/read-post-sample` ve mevcut mock/test API'leri korunur. Ana upload işlemi bunları çağırmaz.

GET ve POST incelemesi, şema uyarıları, ayrı salt-okuma/body/adaptör onayları ve runtime hedef kontrolleri korunur. UI metinleri sadeleştirildi; istemci etiketi değerleri ve geçmişteki kimlikler değiştirilmedi. Kayıt tabloları önceki sentetik kayıtları gerçek kurum kullanımı gibi sunmaz.

## Gerçek kullanım sınırı — tamamlanmış gibi gösterilmez

Mevcut panelin backend'i `DemoCatalog` + `startDemoApi` kullanıyordu. Demo etiketlerini silip aynı hedefe çağrı göndermek gerçek API entegrasyonu sayılmaz. Bu nedenle yüklenen dosyalar artık ayrı **unconfigured** kaynağı olarak işaretlenir. Şema ve araç seçimi hazırlanıp kaydedilebilir; gerçek API hedefini panele bağlama henüz uygulanmadığı için start, call ve bağlantı JSON'u kapalı kalır. API'den start denemesi de **409 TARGET_NOT_CONFIGURED** döndürür. Import edilen `servers` adresleri çağrılmaz; fixture ile aynı path'i taşıyan upload bile sentetik hedefe yönlenmez.

Sentetik test kaynakları ayrı **synthetic** türündedir; mevcut fixture izin listesi ve POST body profili aynen uygulanır. Authoring işlemleri ile execution izni ayrıdır. İstemci `targetMode` göndererek kaynağı değiştiremez. Mevcut test profili çalışıyorsa açıkça sentetik olarak etiketlenir; kullanıcı süreçleri veya seçimleri otomatik durdurulmaz/silinmez.

Kullanıcı veri dizinlerine, journal dosyalarına ve mevcut çalışan uygulamalara müdahale edilmedi. Reset, migration veya silme yok. Test, önceki grup ve korelasyon kimliği/metadatasının yeni upload ve reddedilen başlatmadan sonra aynı kaldığını doğrular. Önceden de yalnız journal metadata'sı diskten korunuyordu: gruplar/manifest/onayların process restart sonrası kalıcı geri yüklenmesi bu işte eklenmedi. Sayfa yenilemesi sunucudaki grup ve manifesti silmez; düzenleme taslağı yeniden incelenir.

Normal upload için örnek çağrı paneli gösterilmez; **Seçim hazır · API hedefi bekleniyor** görünür. Sahte MCP adresi/çalışıyor durumu veya indirilebilir canlı bağlantı dosyası üretilmez. Bu teslim gerçek kurum kullanımı için hazır API hedefi/auth platformu değildir.

## Gerçek doğrulama

- Başlangıç: `npm test` **61/61**.
- Son: `npm test` **64/64**, typecheck + UI/runtime build dahil. Önceki testler korunur; upload import testi yeni authoring davranışı ve geçersiz seçim reddine uyarlanmıştır.
- Üç yeni regresyon: demo eylemsiz upload boş ekranı; JSON korunurken exercise yönlendirmesinin kaldırılması ve hedef-bekleme durumu; gerçek HTTP üzerinden GET + onaylı POST hazırlama, sahte source türü reddi, fixture path çakışmasının da start/call/export yapamaması ve mevcut kayıt/grup korunması.
- `npm run test:read-post`: ayrı resmi SDK HTTP + bağımsız ZIP stdio geçti.
- `npm run test:http`: mevcut GET, filtreler, stop/restart ve metadata regresyonları geçti.
- `npm run test:export`: checkout dışında temiz bağımsız ZIP ci/build/stdio geçti.
- `npx tsc -p tsconfig.desktop.json`: masaüstü kaynak derlemesi geçti. Yeni paketli EXE regresyonu ve kurulum/kaldırma çalıştırılmadı; mevcut release testi yeni kodun paket testi sayılmaz.
- Tarayıcı: `/` sade açılış, sentetik dosyanın gerçek dosya seçici ile yüklenmesi, GET/POST onaylarıyla iki araç kaydı, başlatmanın kapalı oluşu, sayfa yenilemesinde grubun korunması ve `/developer` ayrımı doğrulandı. Gerçek kurum dosyası/credential kullanılmadı.
- QA süreçleri yalnız Temp veri dizini + boş loopback portuyla çalıştı, sonunda normal kapanışla kapatıldı. Ana kullanıcı süreçleri durdurulmadı. Linux/Docker bu işte çalıştırılmadı.

Kanıtlar git dışında `artifacts/ui-cleanup-*.log`, `workspace-empty.png`, `workspace-uploaded.png`, `workspace-target-blocked.png`. [Açılış ekranı](screenshots/10-workspace-empty.png), [hedef-bekleme ekranı](screenshots/11-workspace-target-blocked.png).

Değişen gerçek kaynaklar: `src/ui/main.tsx`; `src/ui/panel/{Panel,ApiCatalog,OverviewService,ServiceConsole,ConnectionGuide,ConnectionExport,TargetNotice,StatisticsView,CallHistory,BodyForm,OperationReview}`; `panel.css`; `src/panel/{catalog,mcp-service,routes}.ts`; `src/studio/server.ts`; `tests/panel.test.ts`, `tests/workspace-ui.test.ts`. Önceki JSON-export dosyaları korundu ve ilgili belgeler bağlandı. Kayıt saklama, istatistik hesabı, HTTP/MCP transport güvenliği veya ortam port ayarları değiştirilmedi.

## Bağlantıyı kolaylaştırma — yalnız değerlendirme, uygulanmadı

İki uygulamayı her seferinde komut/port arayarak bağlamak gerekmemeli. Mevcut bağlantı JSON'u zaten tek indirilebilir dosyadır. Dosyanın eskimesinin nedeni stateless protokol değil, dinamik listener portudur. Servis yeniden başlatıldığında endpoint değişebilir; bağlanırken initialize ve güncel tools/list gerekir.

| Seçenek | Headless panel | Paketli masaüstü | Değişiklik ve sınır |
| --- | --- | --- | --- |
| Ayrı, sabit loopback MCP portu | `src/panel/config.ts` mevcut `SPECWAKE_MCP_PORT` desteğini `src/panel/cli.ts` üzerinden listener'a geçirir. Normal varsayılan MCP portu 0'dır; operatörce sabit değer verilebilir. Bu işte değer değiştirilmedi. | `src/desktop/main.ts` doğrudan `startStudio(0)` çağırır; listeners vermediği için MCP de 0/ephemeral kalır. Aynı env desteğinin masaüstünde var olduğu varsayılamaz. Kullanıcı profiline doğrulanan port ayarı kaydetmek ve mevcut listener seçeneğine geçirmek ayrı küçük uygulama işi olur. | En az refaktör: ayrı MCP listener, Host/Origin sınırları ve yönetim CSRF ayrımı korunur. Port doluysa anlaşılır hata gerekir; sessizce başka porta düşmek bağlantı dosyasını yine eskitir. Sabit port kimlik/auth sağlamaz. |
| Panel sunucusu altında kararlı `/mcp` | Panel CLI portu sabitse URL de kararlı olabilir. `npm run panel` / `panel:start` varsayılanı 4319; `npm start` doğrudan studio varsayılanı 4318'dir. | Yönetim listener'ı da şu an ephemeral olduğundan yalnız path'i taşımak masaüstündeki eskimeyi çözmez; yönetim portunu da sabitlemek gerekir. | Daha büyük lifecycle/router refaktörü. `DemoMcpService` kendi listener'ını ve sağlık kontrolünü sahiplenir. Mevcut studio POST girişindeki CSRF kontrolü, ayrı MCP'nin token istemeyen fakat tarayıcı Origin/fetch reddi uygulayan sınırıyla bilinçli ayrılmalıdır. MCP route'u eklemek için yönetim kontrolleri genel olarak kaldırılamaz. Stop yalnız MCP kabulünü kapatmalı, yönetim listener'ını bozmamalıdır. |

**En az değişiklikli öneri:** ayrı MCP listener'ını koruyun. Headless kullanımda mevcut operatör port yapılandırmasını, masaüstünde ise ileride eklenecek yerel kalıcı port tercihini kullanın. Bağlantı JSON'unu bir kez alın; istemcide açık Bağlan/Yeniden bağlan, sınırlı geri çekilmeli initialize/list reconnect ve son durum gösterimi olsun. İşlem çağrılarını, özellikle POST'u, bağlantı hatasında otomatik tekrar oynatmayın. Bunların hiçbiri bu görevde uygulanmadı.

Tam “bir kez kur, sonra açınca kullan” deneyimi için sabit port tek başına yetmez: panelin gerçek API hedefi bağlama ve güvenli manifest/izin kalıcılığı da eksiktir. Mevcut gruplar/manifestler process'e özeldir. Hedef, şema, izin ve auth değişikliklerinde yeniden onay gereksinimini koruyacak kalıcılık ayrı tasarlanmalıdır. Bu turda otomatik servis açma veya onay geri yükleme yoktur.

DeepSeek başka bilgisayardaysa `127.0.0.1` o bilgisayarı gösterir. Sabit port X570'e erişim sağlamaz. En basit loopback deneyimi iki uygulamayı aynı bilgisayarda çalıştırmaktır. Farklı bilgisayarlar için ayrıca onaylı güvenli hosting/auth/ağ tasarımı gerekir; firewall, uzak bind, credential veya uzak proje bu işte değiştirilmedi.
