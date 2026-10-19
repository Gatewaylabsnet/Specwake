# Yönetim demosu — doğrulama ve teslim

> Bu belge 18 Ekim web yönetim turunun kaydıdır. Sonraki 19 Ekim yerel Windows 0.1.1 teslimi, EXE içinde bağımsız istemci ve güncel test sayısı için [WINDOWS_DELIVERY_VERIFICATION.md](WINDOWS_DELIVERY_VERIFICATION.md) esas alınır. 0.1.1 yayın bilgisi Windows teslim belgesindedir.

18 Ekim 2026, Windows / Node 24.15.0. Çalışma yalnız `C:\Projects\Specwake` içinde yapıldı; Specfold ve ConfigDiffTool değiştirilmedi. Başlangıç HEAD `8ae8ef79064e77a91888f194eff4971c47877818`, dal `main`, çalışma ağacı temizdi. Başlangıç **40/40** test geçti; önceki raporun test iddiası böylece doğrulandı. Kullanıcı değişikliği geri alınmadı. Bu tur commit, push, PR, tag, release, installer kurulumu veya paket yayını yapılmadı. Yerel unpacked masaüstü paketi yalnız regresyon için üretildi; eski GitHub v0.1.0 binary'leri güncellenmedi.

## Tamamlanan akış

Mevcut React/TypeScript/Vite tasarımı korunarak genel bakış, API kataloğu, MCP hizmeti/bağlantı ve çağrı kayıtları ayrıldı. Yeni framework veya bağımlılık eklenmedi. Hizmetin gerçek durumu ve adresi, grup/araç sayısı, gerçek çağrı/hata/gecikme metrikleri, altı adımlı yönlendirme ve duruma uygun yardım bulunur. Sayfa yenilemesinden sonra GET seçim onayı gerektiği açıklanır; otomatik izin verilmez.

Gerçek `/mcp` adresi, ayrı resmi SDK istemcisinin komutu ve protokole uygun SDK kodu kopyalanabilir. Adres, kullanıcı adı/parola/query/hash taşımayan kesin `http://127.0.0.1:PORT/mcp` adresiyle sınırlandırılır. İstemci etiketinin doğrulanmamış olduğu belirtilir. Kopyalama sonucu erişilebilir status alanında gösterilir; clipboard izin vermiyorsa görünür metin üzerinden kopyalama açıklanır.

Çağrı zamanından açılan native dialog; güvenli Türkçe özet, sonuç/kod, UTC/İstanbul zamanı, süre, API/araç, istemci etiketi, korelasyon ve çalışma kimliğini gösterir. Gövde, argüman ve credential eklenmedi. Ayrıntıdan API veya araç filtresine geçilir. Escape kapatır ve odağı açan satıra döndürür. Veri yokken grafik üretilmez; oran/gecikme `—` görünür. Sayım kapsamı, zaman penceresi, P95 ve süre ölçümünün sınırları ekranda açıklanır.

## Gerçek bağımsız HTTP kanıtı

`npm run test:http`, ayrı geçici veri dizininde gerçek OpenAPI import eder, dört GET'i seçer ve gerçek MCP listener açar. Ardından **ayrı işletim sistemi sürecinde** `scripts/mcp-demo-client.ts` resmi `@modelcontextprotocol/client` 2.3.1 SDK'sı ile bağlanır. Protokol **2025-11-25**, stateless Streamable HTTP/JSON'dur. SSE/server push/session desteği iddia edilmez.

- Initialize ve dört araçlı tools/list başarılı.
- `/services` ve `/summary` çağrıları başarılı; `/simulate/error` kontrollü `SW_HTTP_STATUS` hatası; `/simulate/slow` gerçekten bekler. Bağımsız çalışmada ölçülen gecikme yaklaşık **1.619 ms** idi; sabit istatistik değildir.
- Seçilmeyen araç reddedilir. Toplam **5 kaydedilmiş deneme / 2 hata / %40**. Initialize/list/sağlık kontrolleri sayılmaz.
- Her gerçek tools/call yanıtının korelasyon header'ı, paneldeki beş kalıcı olayın kimlik kümesiyle eşleşir. API/araç/istemci filtresi ve zaman dilimi toplamı doğrulanır.
- Sadece redaksiyon testi için gönderilen kamuya açık sahte Authorization canary'si journal'da bulunmaz. Katı dokuz alanlı metadata şeması doğrulanır; bu bir auth özelliği değildir.
- MCP durdurulduğunda port bağlantı kabul etmez. Native süreç kapatılıp aynı veri diziniyle açıldığında beş kayıt korunur; grup listesi boş ve hizmet durmuş başlar.

Rapor: [http-verification.json](../artifacts/http-verification.json). Bu dosya yerel, Git dışında üretilen kanıttır; yeniden çalıştırma üzerine günceller, dolayısıyla ölçülen milisaniyeler sonraki koşuda değişebilir. Yerel veriye yeni kayıt ekleyen `SPECWAKE_VERIFY_ORIGIN` seçeneği yalnız açıkça verilen loopback demo içindir; normal komut kendi izole ortamını kullanır. Çalışan mevcut MCP hizmetini değiştirmez/durdurmaz.

## Test sonuçları

| Gerçek çalıştırılan kontrol | Sonuç |
| --- | --- |
| Başlangıç `npm test` | **40/40**, hata yok |
| Son kod incelemesi sonrası `npm test` | **46/46**, 0 fail / skip / cancelled; build ve iki TypeScript kontrolü dahil |
| `npm run test:http` | Ayrı SDK süreci, gerçek HTTP, başarı/hata/gecikme/ret, filtreler, korelasyon, stop ve restart kalıcılığı geçti |
| `npm run test:export` | Repo dışı boş dizinde ZIP açma → kendi lockfile'ıyla npm ci → build → stdio initialize/list/call; seçilmeyen araç ve yanlış argüman reddi geçti |
| `npm run desktop:pack:dir` | Güncel kaynakla Windows x64 unpacked paket üretildi; yayın kapalı |
| `npm run test:desktop` | Bundled UI/runtime, kaynak cwd/global Node olmadan MCP, ZIP üretimi, yabancı origin reddi ve renderer sandbox geçti; kendi portu kapandı |
| `npm run test:export -- artifacts/desktop-verification-server.zip` | Paketlenmiş masaüstünün ürettiği ZIP de repo dışı temiz kurulum ve gerçek stdio testinden geçti |
| `npm audit --omit=dev --audit-level=high` | **0** bildirilen production bağımlılık açığı; bütün kodun güvenlik garantisi değildir |
| Compose YAML güvenlik alanları + `node --check scripts/verify-linux.mjs` | Statik kontroller geçti; container çalıştırma kanıtı değildir |
| `git diff --check` | Boşluk hatası yok |

Eklenen altı test: native/container yapılandırma sınırları; güvenli bağlantı örneği; bilinmeyen hata metninin yansıtılmaması; retention disk yazma hatasının tekrar denenmesi; writable-journal readiness/istekten listener değiştirme reddi; bağımsız SDK süreciyle tam HTTP kalıcılık testi. Mevcut 40 test silinmedi/değiştirilmedi. Başlangıç hatası veya son native test hatası yoktur. Paketli test Chromium penceresi/oluşturucu/runtime regresyonudur; tüm yönetim ekranlarının Electron içindeki etkileşimlerini otomatikleştirdiği iddia edilmez. Yönetim akışı ayrıca tarayıcıda doğrulandı.

Yerel loglar: `artifacts/management-tests.log`, `management-http.log`, `management-export.log`, `management-desktop-build.log`, `management-desktop-test.log`, `management-desktop-export.log`. Makine raporları: `http-verification.json`, `export-verification.json`, `desktop-verification.json`, `linux-verification.json`. Dosyalar Git dışında tutulur.

### Çalıştırılamayan kontroller

`npm run test:linux`: **exit 1 / not-run-engine-unavailable**, `checks: []`. Mevcut `dockerDesktopLinuxEngine` erişilemedi. Linux image build, container başlatma/izinler/health/SIGTERM/restart/volume, backup/restore/güncelleme-rollback **çalıştırılmadı**. Motor/WSL/BIOS/firewall/ağ ayarı değiştirilmedi; uzak Docker context veya başka makineye bağlanılmadı. Doğrulayıcı yerel endpoint'i kanıtlayamıyorsa bağlantıyı da reddeder.

Kurulum dosyaları ve kesin çalıştırılabilir kabul kapısı hazırdır: [LINUX_DEMO.md](LINUX_DEMO.md), `compose.yaml`, `scripts/verify-linux.mjs`. Host yayınları yalnız 127.0.0.1:4319/4320; container içi bind farklıdır. Nonroot, writable named volume/tmpfs, readonly root ve sınırlı Docker logları yapılandırıldı. Bunlar çalışan Linux kanıtı yerine geçmez. Installer kurulumu/kaldırma, Linux EXE/AppImage, gerçek kurum API'si/auth, başka MCP istemci ürünü ve uzaktan CI bu turda denenmedi.

## Görsel ve etkileşim kanıtı

Tarayıcıda gerçek yerel OpenAPI fixture → dört GET seçimi → kaydet → başlat → ayrı SDK terminali → panel/filtre/ayrıntı → durdur akışı çalıştırıldı. Adres kopyalandı ve clipboard'da gerçek MCP adresi okundu. İlk beş bağımsız çağrının ardından düzenleme/geç sonuç testi ve yeniden başlatma sonrası panel çağrısı yapıldı: son genel görünüm **7 gerçek deneme / 2 hata / %28,6**, ortalama 462 ms ve P95 1.616 ms gösterir. Otomatik izole beş çağrılı rapor ile bu yedi çağrılı manuel oturum ayrı kanıtlardır.

Araç ayrıntısından filtre bir hatayı %100 olarak gösterdi; kaydı olmayan `qa-demo` filtresi sıfır ve boş görünüm verdi. Gecikmeli çağrı sırasında JSON değiştirildi; geç gelen başarı yeni forma taşınmadı. Hizmet durdurulup yeniden başlatıldı; yeni port gösterildi. Normal akışta tarayıcı error/warn kaydı yoktu. Offline denemesi ayrı olarak kendi QA süreci kapatılarak yapıldı; beklenen network hataları bu senaryoya aittir.

390×844 dar ekran testinde `innerWidth=390`, belge genişliği **375** idi: sayfa yatay taşmıyor. Geniş tablolar ve mobil gezinme kendi içinde yatay kaydırılır. Diyalog klavye odak dönüşü elle doğrulandı; tam WCAG sertifikasyonu iddia edilmez.

| Görsel | Kanıt |
| --- | --- |
| Önce | [17 Ekim'den mevcut ekran](../artifacts/management-before-20261018.png); bu turun başında yeniden çekilmiş bir baseline değildir |
| Son genel görünüm | [management-overview.png](../artifacts/management-overview.png) |
| Bağlantı ve gerçek panel sonucu | [management-connection.png](../artifacts/management-connection.png) |
| Çağrı ayrıntısı | [management-call-detail.png](../artifacts/management-call-detail.png) |
| Güvenli hata özeti | [management-error.png](../artifacts/management-error.png) |
| Dar ekran | [management-narrow.png](../artifacts/management-narrow.png) |
| Boş durum | [management-empty.png](../artifacts/management-empty.png) |
| Durdurulmuş hizmet | [management-stopped.png](../artifacts/management-stopped.png) |
| Bağlantı kesintisi | [management-offline.png](../artifacts/management-offline.png) |

Görseller yalnız sentetik demo verisi taşır. Canlı QA portları geçiciydi; göreve ait süreçler düzgün kapatıldı, yönetim/MCP portlarının kapalı ve journal kilidinin kaldırılmış olduğu doğrulandı. Yedi olayda katı metadata alanları ve canary yokluğu ayrıca diskten kontrol edildi: [management-ui-verification.json](../artifacts/management-ui-verification.json). Tekrarlanabilir başlatma/senaryo: [MANAGER_DEMO_5_MIN.md](MANAGER_DEMO_5_MIN.md).

## Kod ve güvenlik incelemesi

| Değişen dosyalar | Sorumluluk |
| --- | --- |
| `src/ui/panel/Panel.tsx`, `ApiCatalog.tsx`, `ServiceConsole.tsx`, `StatisticsView.tsx`, `panel.css` | Mevcut tasarımda gezinme, altı adım, seçim yardımı, ölçüm açıklaması, boş durum ve responsive görünüm |
| `OverviewService.tsx`, `ConnectionGuide.tsx`, `CopyValue.tsx`, `connection.ts`, `CallHistory.tsx` | Hizmet özeti, gerçek bağlantı örneği, kopyalama ve metadata ayrıntısı ayrı küçük UI modülleri |
| `src/core/call-summary.ts` | Allowlist kodlardan güvenli Türkçe hata/sonuç özetleri; bilinmeyen metin veya prototype alanı yansıtılmaz |
| `src/panel/config.ts`, `cli.ts`, `mcp-service.ts`, `src/studio/server.ts` | Açık native/container dinleme seçenekleri; CLI Linux Docker sınırı; mevcut yaşam döngüsüne küçük bağlantı |
| `src/panel/routes.ts`, `journal.ts` | Gerçek writable-storage readiness; retention başarısız persist durumunda bellek/disk tutarlılığı |
| `scripts/mcp-demo-client.ts`, `verify-http.ts`, `tests/management-demo.test.ts`, `package.json` | Bağımsız SDK istemcisi, yeniden çalıştırılabilir HTTP testi, altı regresyon testi/komutlar |
| `Dockerfile`, `.dockerignore`, `compose.yaml`, `scripts/verify-linux.mjs` | Yerel Linux çalıştırma hazırlığı, sır/data dışlayan context ve çalıştırılabilir kabul kapısı |
| `README.md`, `WEB_PROTOTYPE*.md`, bu belge, `MANAGER_DEMO_5_MIN.md`, `LINUX_DEMO.md` | Güncel kullanım, kanıt, demo ve işletim rehberi |

İncelemede retention budaması disk hatasında belleği erken değiştirebiliyordu; böylece sonraki okumada disk temizliği atlanabiliyordu. Aday kayıt kümesi artık yalnız başarılı persist'ten sonra belleğe alınır. Yeni test iki başarısız okumayı, dosyanın hâlâ eski kaydı taşımasını ve disk düzeldiğinde gerçek budamayı doğrular. Journal/istatistik/HTTP yaşam döngüsü/UI sorumlulukları ayrı kaldı; harici log adaptörü eklenmedi.

Mevcut SSRF/DNS pinning/IPv4 allowlist/HTTPS, redirect ve boyut/deadline, ortam değişkeni credential okuma, güvenli error-code ve exact Host/Origin/Fetch Metadata/CSRF korumaları kaldırılmadı. Önceki testler mixed/empty DNS, hedef dışı IP, TLS zinciri/hostname, redaksiyon, bozuk/büyük/derin OpenAPI, dış referans/cycle, seçilmeyen GET dışı yöntem ve argüman sınırlarını yeniden geçti. Demo istisnası hâlâ yalnız uygulamanın oluşturduğu kesin yerel fixture hedefidir; yüklenen `servers` ziyaret edilmez. Wildcard container listener, upstream erişim politikasını değiştirmez.

Kayıt şeması dokuz metadata alanıyla sınırlı, 7 gün / 5.000 olay / 3 MiB'dir; atomik yazma sırasında ikinci dosya için yaklaşık 6 MiB alan gerekir. Power-loss/fsync, audit immutability ve at-rest encryption garantisi yoktur. Zorla kapanıştaki stale lock operatör incelemesi gerektirir. Auth'suz panel/MCP yalnız yerel demo kapsamındadır; istemci etiketleri erişim kontrolü değildir. SDK uyumluluğu kurulu sürüm ve ayrı SDK süreciyle doğrulandı; her üçüncü taraf istemci için garanti verilmez.

## Sonraki kurum pilotu

Bu aşama uygulanmadı. Gerekli bilgiler: hassas değerlerden arındırılmış gerçek Apinizer OpenAPI örneği ve sürümü; seçilecek GET'lerin iş anlamı/yan etkisi, parametre ve desteklenen security scheme; onaylı test ortamı, exact IPv4/DNS/PKI ve erişim politikası; kimlik/yetki modeli ve secret sağlama yöntemi; gerçek MCP istemci ürünü/sürümü/transportu ve veri paylaşım davranışı; sorumlu API sahibi, ölçüm/başarı kriteri, log saklama ve veri sınıflandırması. Elastic sürümü/kurum bilgileri doğrulanmadı. Önce küçük, yazma etkisi olmayan bir test API'si için auth ve yetki tasarımını onaylayın; ardından ayrı kapsamla pilot hazırlayın. LDAP/SSO, SIEM/Elastic, SaaS, ödeme, Kubernetes ve GET dışı yöntemler eklenmedi.

Model, düşünme seviyesi, token tüketimi ve maliyeti araçlardan doğrulanmadı; tahmin verilmedi.
