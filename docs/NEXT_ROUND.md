# Sonraki tur: CLI, Linux beta ve web yönetimi

Bu belge yalnız tasarımdır. Bu turda CLI/Linux uygulaması, uzaktan MCP transportu, sunucu yayımlama, dış erişim, hesap/yetki veya gerçek credential oluşturulmadı. Masaüstü ürün odağı sürer.

## 1. Başsız üretim CLI'si

Önce aynı OpenAPI/manifest/export çekirdeğini kullanan `validate`, `list`, `generate` ve `export` komutları eklenebilir. Mevcut üretilen stdio sunucu yalnız seçili araçları bir MCP istemcisine sunar; bu yeni CLI ise **sunucu paketini üreten başsız authoring aracı** olur. Bu iki giriş noktası ve çıktı biçimleri ayrı kalmalı.

- `validate <local-file>`: destek matrisi ve işlem bazında nedenler, kararlı exit kodları.
- `list <local-file>`: desteklenen/desteklenmeyen işlemler; başlangıçta hiçbir otomatik seçim yok.
- `generate`: açık işlem seçimi ve doğrulanmış ad/açıklamalarla manifest üretimi.
- `export`: doğrulanmış manifesti mevcut bağımsız ZIP biçimine dönüştürme; çıktı yolu operatörce açıkça seçilir.

Makine çıktısı stdout JSON, güvenli tanı stderr olmalı; runtime'ın MCP stdout kuralıyla karıştırılmamalı. Aynı boyut/ref/şema/GET sınırları, hedef politikası ve hata kataloğu kullanılır. CLI'ye serbest HTTP isteği, otomatik dış ref çözümü veya credential argümanı eklenmez.

**Kabul:** JSON/YAML, seçimsiz durum, çakışma, desteklenmeyen şema, çıktı yolu kaçışı, sır maskeleme, exit kodları ve CLI'den üretilen paketin depo dışında kendi lockfile'ıyla MCP smoke testi. GUI ile aynı manifest ve runtime davranışı kanıtlanmalı.

## 2. Tek hedef Linux x64 AppImage beta

Mevcut Electron paketlemesinden önce yalnız bir AppImage hedefi çıkarılır. macOS, çoklu Linux paket biçimleri ve otomatik güncelleyici bu küçük beta kapısına eklenmez.

**Kabul:** gerçek, izole Linux ortamında uygulama açılışı; sandbox ve context isolation korunarak UI yükleme; dosya seçimi; örnek import; bundled Node ile stdio initialize/list/call; ZIP export ve depo dışında kurulum; izinler, büyük/küçük harfli yollar ve boşluklu dizinler; kapanışta port/child temizliği. CI gerekiyorsa Xvfb kullanabilir; `--no-sandbox`, TLS bypass veya API localhost istisnası kabul edilmez. Linux'ta gerçekten çalıştırılmadan destek iddiası yapılmamalı.

## 3. Tek kullanıcı / on-prem web yönetim paneli

Web yönü, yalnız dosya dönüştüren bir arayüz yerine operatörün ürettiği MCP sunucularını **yayımlayıp yönetmesi** için ayrı bir sonraki ürün adımı olarak ele alınmalı. İlk hedef tek kurulum ve tek operatör; tam SaaS, çok kiracılı hesap/faturalama ve bulut senkronizasyonu ertelenir.

| Alan | İlk tasarım ve kabul kapısı |
| --- | --- |
| Sunucu yaşam döngüsü | Draft → validated → stopped/starting → healthy/degraded → stopping/failed. Açık start/stop/restart, sınırlı child sayısı, crash/backoff sınırı ve kapanışta orphan/port temizliği. |
| Sürümleme | Seçili manifest ve runtime sürümü/hash'i ile değiştirilemez paket sürümleri. Düzenleme çalışan sürümü sessizce değiştirmez; operatör açıkça yeni sürüme geçirir veya geri döner. |
| Sağlık | Yerel MCP initialize ve tools/list bağlantı denetimi. Gerçek API'ye tools/call yalnız ayrıca açık operatör eylemiyle; mock başarısı gerçek API/auth sağlığı sayılmaz. |
| Loglar | Protokol stdout'undan ayrı, boyut/retention sınırlı güvenli olay kaydı: hata kodu, yaşam döngüsü ve durum. Query, header, credential, tool argümanı veya ham yanıt kaydı yok. |
| Erişim denetimi | Yerelde Host/Origin/CSRF sınırları korunur. Panel dışarı açılacaksa önce gerçek operatör kimliği ve oturum yetkilendirmesi tasarlanır; masaüstü CSRF token'ı uzaktan kimlik doğrulama sayılmaz. |
| Sırlar ve hedef | Sunucu başına operatör tanımlı credential referansı/env ve kesin hedef politikası. Panel sorguları secret değeri döndürmez. DNS sabitleme, TLS doğrulama, redirect reddi, timeout/yanıt sınırları her sürümde sürer. |
| Uzaktan MCP | Mevcut stdio yolu ayrı kalır. Streamable HTTP açılmadan güncel resmi MCP transport/auth kuralları, HTTPS, Origin, audience/resource doğrulaması, yetki kapsamı, iptal/expiry ve istemci token sınırları doğrulanmalı. Panel oturumu ile MCP istemci yetkisi ayrı sözleşmelerdir. |
| Dış erişim kapısı | Varsayılan loopback. Kimlik doğrulama/transport testleri, güvenli reverse proxy/TLS ve operatörün açık yayımlama isteği olmadan dış ağ veya public URL açılmaz. |

Bu tasarım bu turda hiçbir sunucuyu yayımlamaz ve credential/hesap/yetki oluşturmaz. Uzaktan transport/auth uygulaması başladığında [resmi MCP belirtimi](https://modelcontextprotocol.io/specification/latest) yeniden doğrulanmalı; şimdiki stdio runtime'ın güvenlik sınırları gevşetilmemeli.

## Ayrı Windows installer kabul kapısı

X570 geliştirme makinesinde installer install/uninstall çalıştırılmaz. Ayrı, disposable Windows VM'de temiz normal kullanıcı profiliyle per-user kurulum, başlatma, mock/export, yükseltme davranışı, kısayollar, kaldırma ve çalışan process/port kalıntıları sınanır. Kaynak/ZIP/packaged smoke başarısı bu kapının yerine geçmez. İmzalama ve SmartScreen dağıtım davranışı da ayrı dağıtım kanıtıdır.
