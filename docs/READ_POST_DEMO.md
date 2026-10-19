# Specwake 0.2.0 — kontrollü JSON POST demosu

Bu sürüm yerel, sentetik yönetim demosudur. Gerçek kurum dosyası, kişisel veri veya kimlik bilgisi kullanılmadı; gerçek kurum sunucusuna bağlanılmadı. Kurumsal erişim, gerçek yan etkisizlik ve veri tamlığı doğrulanmış özellikler değildir.

## Değişiklikler ve sınırlar

- POST varsayılan kapalıdır. Yönetici işlem açıklamasını ve JSON object override'ını düzenler, ayrı body / salt-okuma / sonuç adaptörü onaylarını verir, satırı seçer ve kaydeder. GET akışı korunur; GET salt-okuma ipucu da ayrıca onaylanabilir.
- Şema/örnek string-object çelişkisi açık uyarıdır. Örnekten yalnız alan/tip taslağı önerilir; örnek değer ve `required` tahmini taşınmaz. Orijinal import bellekte korunur, override ayrı sözleşmedir. Dış referanslar, 1 MiB üstü ve bozuk dosyalar mevcut kontrollerden geçemez.
- Runtime'da manifest onayı tek başına yetmez: sabit hedefin tam `POST /path` izin listesi ve yapılandırılmış sonuç adaptörü gerekir. Tek JSON object gövde gönderilir; bilinmeyen alan/tipler ve 16 KiB üstü gövde reddedilir. Upstream HTTPS/IP izinleri/DNS pinning/redirect korumaları gevşetilmedi.
- Token-provider soyutlaması upstream'e aittir. Panel yalnız açık sentetik sağlayıcı kullanır; standalone runtime ortam değişkeni kullanır. Token alma + DNS + HTTP aynı 5 saniyelik deadline/cancellation içindedir. Kurum login/refresh/RBAC geliştirilmedi. MCP istemci kimlik doğrulaması sağlanmaz.
- Sonuç adaptörü statusCode/errors/data ve isteğe bağlı iç result/numRows/partial alanlarıyla yapılandırılır. HTTP 200, satır sayısı veya boş errors tek başına tamlık kanıtı değildir. `status: success|empty|partial|error`, `complete:false`, kaynak işlem/UTC sorgu zamanı ve `untrustedData:true` döner. SDK şema/protokol retleri bu zarfın dışında olabilir.
- İsim bazlı redaksiyon ve hassas input echo maskelemesi vardır; genel PII tespiti değildir. Saha pilotundan önce gerçek alan sözleşmesi ayrıca incelenmelidir. Maskeli body formu yalnız sentetik demo içindir. Bu panel profili path/query parametresiz üç POST sorgusuna sınırlıdır; genel runtime path/query alanlarını da doğrular.
- Çağrı journal'ı gövde/header/argüman/token tutmaz; yalnız mevcut metadata, 7 gün / 5.000 olay. Başarı/boş/kısmi sonuçlar hata olmayan tools/call sayılır; tamlık oranı ölçülmez. **Diskte yalnız çağrı metadata'sı korunur. API grupları, manifestler ve onaylar process yeniden başlatıldığında geri gelmez.**
- Durdurduktan sonra tüm seçimleri kaldırıp kaydetmek sunucu manifestini temizler; eski seçimi tekrar başlatmak mümkün değildir. Katalog yeniden açıldığında mevcut seçimi kaldırabilirsiniz; yeniden eklemek için yeni inceleme gerekir. İnceleme panelinin yerel onay taslağı kalıcı değildir.

## Sentetik profil

`examples/read-post-synthetic.json`: 38 işlem (2 GET, 36 POST); 31 string request / object example çelişkisi, 36 string response / object example çelişkisi ve 2 GET'te eksik response schema. Bu tamamen oluşturulmuş fixture gerçek kurum tanımının kopyası değildir.

Panelin ayrı demo profili yalnız `/realPersonSearch`, `/GetFieldProductPerson`, `/PetitionProductionYear` POST sorgularını açabilir. Diğer POST işlemleri kapalıdır. Alanlar string olarak korunur: IdNo, IdTaxNo, ProductionYear. Bu kurallar genel OpenAPI importer'a gömülmez.

## Başlatma ve beş dakikalık demo

Kaynak kod için Node.js 24+:

```powershell
cd C:\Projects\Specwake
npm ci
npm run panel
```

Varsayılan yönetim adresi `http://127.0.0.1:4318/panel`; port doluysa mevcut süreci kapatmayın, belgelenen yapılandırmayla boş port seçin. EXE kullanıcısı Portable/Setup paketini açar; Node/npm gerekmez. MCP adresi yönetim adresinden ayrıdır: hizmet başladıktan sonra ekranda görünen `http://127.0.0.1:<dinamik-port>/mcp`.

1. **0:00–1:00:** API kataloğu → JSON POST demosu ekle. İlk iki sorguyu filtreleyin; varsayılan seçimin kapalı olduğunu gösterin.
2. **1:00–2:00:** Her işlemde açıklama/uyarı/şema inceleyin. Bu sentetik sözleşmede `required` alanlarını açıkça ekleyin: IdNo; ProductionYear + IdTaxNo. Üç onayı verip iki satırı seçin, kaydedin.
3. **2:00–3:00:** Hizmeti başlatın. Ekrandaki gerçek adres ve SDK örneğiyle bağımsız istemci üzerinden initialize/list/call yapın. Test istemcisi için `scripts/mcp-demo-client.ts --endpoint ... --tool ... --args ...` veya EXE'nin `--mcp-client` modu kullanılır. Windows EXE için değerleri `--tool=ARAÇ_ADI` ve tek argüman olarak `--args={"body":...}` biçiminde verin; Node CLI eski boşluk biçimini de kabul eder. `--exercise` komutu dört eski GET demosu içindir, POST seçimine uygulanmaz.
4. **3:00–4:00:** Panelde IdNo=`DEMO-ID-0001` ile maskeli çağrı yapın; kaynak/zaman, `complete:false`, redaksiyon ve metadata istatistiklerini gösterin. İkinci sorgu body: `{"ProductionYear":"DEMO-2099","IdTaxNo":"DEMO-TAX-0001"}`.
5. **4:00–5:00:** IdNo=`demo-app-error`, `demo-partial`, `demo-empty` veya `demo-slow` ile hata/kısmi/boş/timeout ayrımını inceleyin. Hizmeti durdurun, tüm seçimleri kaldırıp kaydedin; başlatmanın kapanmasını gösterin.

## Gerçek doğrulama

2026-10-19, bu Windows geliştirme bilgisayarında:

| Komut / kontrol | Sonuç |
| --- | --- |
| Başlangıç `npm test` | 47/47 geçti; mevcut testler korundu |
| Son `npm test` (typecheck + UI/runtime build dahil) | 56/56 geçti |
| `npm run test:read-post` | Ayrı resmi SDK süreçleriyle iki POST, gerçek HTTP list/call, uygulama hatası, yanlış body, seçilmeyen araç, iptal edilen manifest, metadata restart ve bağımsız ZIP stdio geçti |
| `npm run test:http` | Mevcut GET başarı/hata/gecikme, filtre, durdurma/restart ve korelasyon geçti |
| `npm run test:export` | Checkout dışında temiz npm ci/build, SDK stdio list/call ve protokol stdout regresyonu geçti |
| Tarayıcı | Üç açık onay, maskeli başarılı body çağrısı, güvenli hata, katalog remount sonrası seçimi kaldırma, boş kaydetme ve başlatmanın kapanması doğrulandı |

Yeni test geliştirilirken iki harness varsayımı düzeltildi: SDK stdio import yolu ve yanlış body'nin `isError` sonucu; ayrıca yeni test RuntimeFault message yerine code denetleyecek şekilde düzeltildi. Son çalıştırmalar yukarıdaki sonuçları verdi.

Paketli masaüstü testi, sistem Node/npm PATH dışında ve repo dışındaki çalışma dizininde iki kez geçti: dört GET üzerinden 5 deneme, ardından paket içindeki ayrı SDK istemcisiyle POST başarı/hata üzerinden 2 deneme; restart metadata korundu. Windows Electron ayrı bayrak değerlerini dosya/URL argümanı gibi yorumladığından `--tool=name` / `--args=JSON` biçimi eklendi; bu, paket regresyonunda bulunan ve giderilen hatadır. Portable wrapper testi ve son paket hash'leri sürüm notlarında ayrıca kaydedilir. Geliştirme makinesindeki paket testi, temiz Windows kurulum/kaldırma testi değildir. EXE'ler imzasızdır. Linux Docker motoru yoktu; Linux/Docker başarılı kabul edilmedi, sistem ayarları değiştirilmedi. [Linux kurulumu/doğrulaması](LINUX_DEMO.md), [Windows teslim sınırları](WINDOWS_DELIVERY_VERIFICATION.md).

Yerel ham kanıtlar (git dışında): `artifacts/read-post-final-tests.log`, `read-post-verification.json`, `http-verification.json`, `read-post-final-export.log`; ekranlar `read-post-review.png`, `read-post-result.png`, `read-post-error.png`, `read-post-revoked.png`. Sonuç ekranının paylaşılabilir kopyası [burada](screenshots/08-read-post-result.png).

Son kod incelemesinde şema sınırları, hedef izin listesi, token deadline/cancel, sonuç redaksiyonu ve seçim iptali denetlendi. Yeni modüller şema, sağlayıcı, deadline, adaptör ve UI sorumluluklarını ayırır; yeni uygulama bağımlılığı eklenmedi. Bağımsız güvenlik sertifikasyonu değildir.

Sonraki kurum pilotu için doğrulanmış OpenAPI/body ve response sözleşmeleri, işlem bazlı yan etki onayı, veri erişim yetkileri, redaksiyon alanları, kurumsal upstream auth/refresh sözleşmesi, onaylı hedef/IP/TLS ve istemci erişim yöntemi gerekir. Uzak yayın, LDAP/SSO, kurumsal yetkilendirme veya gerçek veri entegrasyonu bu sürüme dahil değildir.
