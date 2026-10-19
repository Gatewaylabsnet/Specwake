## Specwake v0.2.0 — kontrollü JSON POST demosu

OpenAPI'den seçilen GET araçlarına ek olarak, yönetici tarafından ayrı şema / salt-okuma / yanıt-adaptörü onayı verilen JSON POST sorguları artık izole sentetik panelde gösterilebilir. Varsayılan kapalıdır; runtime ayrıca tam işlem izin listesini denetler. Gerçek kurumsal sistemlere bağlanılmaz.

- String/object şema çelişkisi uyarıları, ayrı override ve örnekten required tahmin etmeyen alan taslağı.
- Maskeli body formu, güvenli uygulama hataları, kaynak/zaman bilgisi; başarı/boş/kısmi sonuç ayrımı. HTTP 200 ve satır sayısı tamlık kanıtı değildir; `complete:false` korunur.
- Token-provider ayrımı ve token alma + DNS + HTTP için ortak timeout/iptal; mevcut SSRF/DNS/TLS/redirect sınırları korunur.
- Seçim iptali sunucu manifestini temizler. Yalnız çağrı metadata'sı restart sonrası korunur; API grupları, manifest ve onaylar tekrar oluşturulur.
- Bağımsız stdio ZIP ve Windows EXE içindeki ayrı resmi SDK istemcisi üzerinden POST başarı/hata doğrulaması. Windows tek araç CLI bayrakları `--tool=...` / `--args=...` biçimini destekler.

### İndir ve çalıştır

Windows x64 için Portable EXE veya kullanıcıya özel Setup EXE kullanın. Yerel panel ve EXE içindeki MCP demo istemcisi için Node.js/npm gerekmez. Bağımsız dışa aktarılmış stdio ZIP farklıdır: Node.js 24+ ve ilk npm kurulumu gerekir. SHA-256 dosyasını kontrol edin; checksum yayıncı imzasının yerine geçmez.

- [Windows hızlı başlangıç](https://github.com/Gatewaylabsnet/Specwake/blob/v0.2.0/docs/WINDOWS_QUICK_START.md)
- [POST demo ve doğrulama raporu](https://github.com/Gatewaylabsnet/Specwake/blob/v0.2.0/docs/READ_POST_DEMO.md)
- [DeepSeek istemci prompt'u](https://github.com/Gatewaylabsnet/Specwake/blob/v0.2.0/docs/DEEPSEEK_CLIENT_PROMPT.md)
- [Linux kurulum ve doğrulama rehberi](https://github.com/Gatewaylabsnet/Specwake/blob/v0.2.0/docs/LINUX_DEMO.md)

### Gerçek kontrol sonuçları

- `npm test`: **56/56**, typecheck + UI/runtime build dahil; başlangıçtaki 47 test korundu.
- `npm run test:read-post`: ayrı resmi SDK HTTP süreçleri, iki onaylı POST, retler/uygulama hatası, metadata restart, seçim iptali ve checkout dışındaki bağımsız ZIP stdio geçti.
- `npm run test:http`, `npm run test:export`: mevcut GET, filtre, durdurma/restart ve stdio regresyonları geçti.
- Paketli unpacked uygulama ve Portable wrapper: sistem Node/npm olmadan, repo dışında iki açılış; GET başarı/hata/gecikme ve POST başarı/hata, metadata kalıcılığı ve listener kapanması doğrulandı.
- Tarayıcıda onay, maskeli çağrı/sonuç, güvenli hata ve seçim iptali kontrol edildi.

### Açık sınırlar

EXE'ler **imzasızdır**. Temiz Windows VM/Sandbox üzerinde kurulum/kaldırma kabulü yapılmadı; Setup dosyası üretildi fakat kurulum akışı yeni bir bilgisayarda doğrulanmadı. Linux Docker motoru bu ortamda erişilebilir değildi; Docker/Linux başarılı test edilmiş olarak sunulmaz.

Bu sürüm yerel/sentetik demodur. LDAP/SSO, gerçek kullanıcı yetkisi, kurumsal token login/refresh, gerçek Apinizer/kurum verisi, uzak MCP auth veya ağ yayını içermez. `127.0.0.1` yalnız aynı bilgisayardır; başka bilgisayarda çalışan DeepSeek buraya bu adresle erişemez. Redaksiyon yapılandırılmış alan/echo maskelemesidir; genel PII tespiti veya upstream yan etkisizlik/tamlık garantisi değildir. Önceki release'ler korunmuştur.
