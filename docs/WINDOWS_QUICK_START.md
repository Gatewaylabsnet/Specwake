# Specwake 0.3.0 — Windows ilk kullanım

Windows x64 Portable ve kullanıcıya özel Setup aynı uygulamadır. EXE uygulaması ve paket içindeki ayrı HTTP MCP istemcisi Node.js/npm, kaynak kodu veya internet gerektirmez. Bağımsız stdio ZIP için Node.js 24+ ve ilk npm kurulumu gerekir. API çağrıları elbette yapılandırdığınız hedefe erişim gerektirir.

## Kurulum ve güncelleme

1. Önce açık eski Specwake penceresini normal şekilde kapatın. Aynı kullanıcı verisiyle iki kopyayı aynı anda çalıştırmayın.
2. `Specwake-0.3.0-Portable-x64.exe` dosyasını açın veya `Specwake-0.3.0-Setup-x64.exe` ile kullanıcıya özel kurulum yapın. Setup yönetici yükseltmesi gerektirmez. Kaldırma Windows Yüklü Uygulamalar üzerinden yapılır; kişisel verinin silineceğini varsaymayın.
3. `Get-FileHash .\Specwake-0.3.0-Portable-x64.exe -Algorithm SHA256` sonucunu teslimdeki `SHA256SUMS-0.3.0.txt` ile karşılaştırın. Paketler imzasızdır; checksum yayıncı imzası değildir. Kurum cihaz politikası varsa onaylı dağıtım sürecini kullanın.

Portable, veriyi EXE yanında taşımaz: Electron kullanıcı profili içindeki mevcut `demo-data` klasörünü kullanır. Eski çağrı kayıtları korunur. 0.2 sürümündeki bellekte tutulan gruplar/seçimler geri getirilemez; 0.3 ilk kullanımında tekrar yüklenir. Bundan sonraki gruplar/seçimler/onaylar/hedef ve MCP portu kaydedilir. Hizmet uygulama açılışında **durmuş** başlar.

## Beş dakikalık akış

1. **API grupları & araçlar → OpenAPI yükle**: kendi izinli JSON/YAML OpenAPI dosyanızı seçin. İçe aktarma API çağrısı yapmaz; `servers` alanı otomatik hedef olmaz.
2. GET işlemlerini seçin. Salt okunur POST gerekiyorsa açıklama, body şeması ve ayrı onayları inceleyin. POST yan etki yapmayacağı teknik olarak kanıtlanmış değildir; yalnız operatörce izin verilen sorguları seçin. **Seçimi kaydet**.
3. **MCP hizmeti → API hedefini yapılandırın**: HTTPS sabit base URL ve hedefin tam IPv4 adreslerini girin. Yerel test için yalnız açık `http://127.0.0.1:PORT` modu vardır. POST varsa gerçek yanıt zarfına uygun adaptör alanlarını ayarlayın. Seçimi/hedefi gözden geçirip onaylayarak kaydedin. Kaydetmek çağrı yapmaz.
4. **Hizmeti başlat → Bağlantı JSON’unu indir**. Yerel MCP adresi `http://127.0.0.1:<kaydedilen-port>/mcp` olur. Aynı bilgisayardaki uyumlu istemciye JSON'u verin; initialize ve güncel tools/list gerekir. Panelin geliştirici bölümündeki EXE istemci komutu da ayrı süreçte çalışır.
5. Sentetik/izinli değerlerle açık bir çağrı yapın. Genel bakış ve çağrı kaydından süre, sonuç, güvenli hata ve korelasyon kimliğini inceleyin. Sonunda hizmeti durdurun. Uygulamayı yeniden açıp hizmeti başlatınca port değişmedikçe aynı JSON kullanılabilir.

İstemci etiketi doğrulanmış kullanıcı değildir. Aynı makinedeki MCP erişimi kimlik doğrulamasızdır. `127.0.0.1` diğer bilgisayara erişim sağlamaz. DeepSeek uygulamasında yerel importer/bağlantı ayrıca uygulanmalıdır; bu teslimde DeepSeek uygulaması test edilmedi.

## Hedef kimlik bilgileri ve sorunlar

Bearer için `SPECWAKE_BEARER_TOKEN`, X-* API key için `SPECWAKE_API_KEY` yalnız Specwake'i başlatan sürecin ortamından okunur. Değerleri panel/URL/JSON/loga girmeyin. `.env` otomatik yüklenmez. Token edinme/yenileme, SSO/LDAP ve kurumsal kullanıcı yetkilendirmesi yoktur.

- Port doluysa başka porta sessiz geçilmez. Başka süreci kapatmadan durmuş hizmette açık port seçip kaydedin; bu durumda bağlantı JSON’unu yeniden alın.
- Hedef/seçimler değişince yeniden onay gerekebilir. Kaydedilmemiş hedef/port taslağı varken başlatma kapalıdır.
- Eski 0.2 bağlantı JSON'u şema v1 ile uyumludur; eski dinamik adres artık aynı olmayabilir. 0.3'e geçerken bir kez yeni JSON alın. Sonraki stop/start ve uygulama yeniden açılışında aynı port korunur.
- Kilitli/bozuk veri dosyalarını otomatik silmeyin. Önce uygulamayı kapatıp `demo-data` klasörünü yedekleyin. Bozuk veya bilinmeyen workspace sürümü korunarak hata verir.
- Çağrı body/header/argümanları ve credential saklanmaz. Metadata en çok 7 gün / 5.000 olaydır. OpenAPI açıklamalarına veya serbest etiketlere sır yazmayın. Sonuç maskelemesi tüm kişisel veri türlerini bulma garantisi değildir.

Ayrıntılar: `Specwake-0.3.0-Yonetim.md` ve `Specwake-0.3.0-DeepSeek-Prompt.md` teslim dosyaları; kaynakta [gerçek upstream rehberi](REAL_UPSTREAM.md).
