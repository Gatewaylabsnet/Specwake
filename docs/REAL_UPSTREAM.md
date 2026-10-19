# Specwake 0.3.0 — gerçek hedef, kalıcılık ve doğrulama

## Tamamlananlar

Ana panel OpenAPI yükleme → seçilmiş GET / gözden geçirilmiş salt okunur POST → sabit upstream yapılandırma → yerel HTTP MCP → bağlantı JSON’u → çağrı/metadata akışını sunar. Demo ekleme/egzersiz düğmeleri ana arayüzde bulunmaz. Eski geliştirici oluşturucu yalnız manuel `/developer` yolundadır.

Hedef `api` modunda HTTPS ve tam IPv4 allowlist kullanır; DNS cevaplarının tümü izinli olmalı, bağlantı kontrol edilen IP'ye pinlenir. TLS doğrulaması, redirect reddi, SSRF engelleri ve 5 saniyelik toplam deadline korunur. Açık `local-test` yalnız literal `http://127.0.0.1:PORT` ve tek 127.0.0.1 iznine sahiptir. Kurum sistemine bu testlerde bağlanılmadı. İçe aktarma/kaydetme/başlatma upstream isteği göndermez; yalnız açık tools/call gönderir. POST otomatik tekrar oynatılmaz.

POST için operatör tam method/path listesine izin verir, body şemasını ve sorgu niteliğini onaylar, JSON yanıt adaptörünü yapılandırır. HTTP 200/numRows tamlık kanıtı değildir; yanıt kaynak/zaman, `complete:false` ve güvenilmeyen veri işaretini taşır. Uygulama hatası/401/403/gecikme güvenli sonuç üretir.

## Kalıcılık ve eski veriler

Masaüstü veri konumu değiştirilmedi: Electron `userData/demo-data`. Mevcut journal olayları/kimlikleri ve 7 gün / 5.000 olay sınırı korunur. Yeni `workspace.json` yalnız normalize edilmiş gruplar, seçimler, POST incelemeleri/şema override'ları, hedef/izinler, onay bağlamı ve MCP portunu tutar. Raw OpenAPI/examples, çağrı argüman/body/header ve credential değerleri tutulmaz. Serbest açıklamalar/etiketler sır deposu değildir; kullanıcı buralara sır yazmamalıdır.

Workspace v1 strict ve en çok 4 MiB / 8 grup / grup başına 200 işlem / 64 seçili araçtır. Onay hash'i grup+manifest+hedef bağlamını kontrol eder; yerel dosyaya yazabilen kişiye karşı kimlik doğrulama/imza değildir. Bağlam değişirse onay yürütme izni olarak kullanılmaz. Bozuk/bilinmeyen dosya üzerine yazılmaz. Güncelleme atomik pending/rename ile yapılır; yazma hatası aktif ayarı değiştirmez. Yeni POSIX dizini 0700/dosya0600; Windows'ta mevcut kullanıcı profili ACL'si esas, eski izinler değiştirilmez.

İlk açılışta kullanılabilir bir loopback MCP portu seçilip kaydedilir. Hizmet stop/start ve uygulama yeniden açılışında aynı portu kullanır. Doluysa `MCP_PORT_IN_USE` ile durur; sessiz fallback yoktur. Kullanıcı durmuşken portu değiştirirse yeni JSON gerekir. Seçimlerin tümünü kaldırıp kaydetmek o profilin izinlerini iptal eder; diğer grupları veya çağrı kayıtlarını silmez. Uygulama kendiliğinden hizmet başlatmaz.

Eski journal-only profil yerinde açılır ve yeni workspace oluşturulur. 0.2'de kalıcı olmayan gruplar/izinler geri kazanılamaz. Bağlantı JSON şeması **v1** değişmedi; eski dinamik port için bir kez güncel JSON alın. Sonraki yeniden açılışlarda aynı bilgisayar/port için yeniden export gerekmez. JSON canlılık veya sunucu kimliği kanıtı değildir; bağlanınca initialize/tools/list yapılır.

Yedek: uygulamayı normal kapatıp bütün `demo-data` klasörünü kopyalayın. Geri yükleme de uygulama kapalıyken yapılır; orijinali ayrıca saklayın. 0.2'ye geri dönmeden önce 0.3 verisini yedekleyin; eski sürüm workspace'i anlayıp izinleri geri yüklemez. Varsayılan veri silme/kilit temizleme komutu yoktur.

## Çalıştırma ve beş dakika

Windows için [ilk kullanım](WINDOWS_QUICK_START.md). Kaynak: `npm ci`, `npm run panel`; panel `http://127.0.0.1:4319/panel`. Studio `npm run dev` → `http://127.0.0.1:4318/`. MCP adresi ayrı kayıtlı porttur; panel adresini istemciye vermeyin.

0:00 OpenAPI yükle; 1:00 iki GET veya onaylı sorgu POST seç/kaydet; 2:00 sabit hedef/IP ve adaptör/onay kaydet; 3:00 hizmeti başlat/JSON indir/ayrı SDK istemcisiyle listele ve çağır; 4:00 metadata/hata/süre incele, durdur/yeniden başlat, aynı JSON'la yeniden keşfet. Kurum hedefi/credential bu demo testinin parçası değildir.

## Gerçek doğrulama

Başlangıç 64/64, son kaynak testleri **72/72** geçti; typecheck/UI/runtime build dahil. Sekiz yeni test gerçek bağımsız loopback API+resmi SDK GET/POST, yanlış body/mutation retleri, 401/403/timeout, stop/start/reopen/sabit-port çakışması, onay bağlamı, eski journal göçü, diğer profili koruyan izin iptali, loopback-only restore ve başarısız disk yazmasını kapsar. Önceki JSON/UI testleri ve tüm regresyonlar korunur.

Komutlar: `npm test`, `npm run test:http`, `npm run test:read-post`, `npm run test:export`, `npm run desktop:pack`, `npm run test:desktop`, `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-upstream-desktop.ps1`. Generic paket testi uygulamayı gerçekten iki kez açar, sandboxed BrowserWindow yüklenir, ayrı paketli SDK istemcisi bağımsız QA upstream'e gider; aynı JSON/adres ve metadata korunur, POST sayısı replay olmadığını doğrular. Bu test native GUI düğme tıklaması veya DeepSeek istemci uygulaması kabul testi değildir.

Tarayıcıda gerçek dosya seçici/import, GET/POST onayları, hedef kaydı, gerçek çağrı/redaksiyon, JSON indirme, sayfa yenilemesi ve kaydedilmemiş hedefin başlatmayı engellemesi doğrulandı. [Son ekran](screenshots/12-real-upstream.png). Bağlantı kesintisi güvenli hata olarak görüldü. QA süreçleri kendi Temp dizinleri/loopback portlarıyla kapatıldı.

Windows CI sürüm adayı Portable/Setup'ı bir kez üretir. Node/npm PATH'ten çıkarılmış geçici GitHub-hosted Windows runner'da Portable ve kurulan uygulama için temel+generic kabul, tekrar açılış, kurulum/kısayol/sürüm/kaldırma denetlenir. Yayın bu işin başarılı çalışmasının **aynı binary bytes** artifact'ından yapılır; CI/asset hash'leri release notlarında bulunur. Bu ortam tüketici Windows Sandbox veya kurum cihaz politikası testi değildir. Başarısız CI adayı yayımlanmaz.

## Sınırlar ve pilot

Paketler imzasızdır. Yerel MCP auth yoktur; istemci etiketleri doğrulanmaz. Başka bilgisayardan erişim, kurumsal auth/SSO/LDAP, token edinme/yenileme, Elastic/SIEM, çok kiracılık, otomatik updater ve DeepSeek UI entegrasyonu kapsam dışıdır. Linux Docker motoru/Windows Sandbox bu makinede kullanılabilir değildi; bu sürüm için Linux runtime doğrulaması yapılmadı. [Linux rehberi](LINUX_DEMO.md) ve çalıştırılabilir `npm run test:linux` kontrolü ayrıca uygulanmalıdır; başarılı sayılmaz.

Pilot için secretsiz örnek OpenAPI, onaylı HTTPS origin/base path, tüm sabit IPv4 hedefleri, sertifika güven zinciri, izinli GET/gerçekten salt okunur POST listesi, body şemaları/yanıt zarfı, auth türü ve token yaşam döngüsü, aynı bilgisayarda çalışacak MCP istemcisi ve kurumsal imzalı dağıtım politikası netleştirilmeli. Bu teslim kurum bağlantısını başlatmaz.
