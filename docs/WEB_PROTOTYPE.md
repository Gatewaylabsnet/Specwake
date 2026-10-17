# Yerel web prototipi

17 Ekim 2026. Bu tur yalnız `C:\Projects\Specwake` içinde geliştirildi. Önceki commit edilmemiş ikinci tur korundu. Mevcut stdio oluşturucu ve bağımsız ZIP export yanında gerçek HTTP MCP yönetim prototipi bulunur. Eski `NEXT_ROUND.md` içindeki web tasarımının yerel demo bölümü bu turda uygulanmıştır; kurumsal/uzak yayın kısmı uygulanmamıştır.

## Başlatma

Node.js 24 ve npm gerekir. PowerShell:

```powershell
Set-Location C:\Projects\Specwake
npm ci
npm run panel
```

Panel: <http://127.0.0.1:4319/panel>. Mevcut stdio/ZIP oluşturucu: <http://127.0.0.1:4319/>. Daha önce build alındıysa `npm run panel:start` yeterlidir. Her iki arayüz de aynı origin üzerindedir; MCP çağrıları **ayrı, başlangıçta atanan loopback portunda** `/mcp` adresinden kabul edilir. Adres panelde gösterilir. `Ctrl+C` yerel süreci kapatır; paneldeki Durdur düğmesi yalnız MCP listener'ını durdurur.

İsteğe bağlı operatör ayarları (panelden değiştirilemez):

```powershell
$env:SPECWAKE_PORT = '4319'
$env:SPECWAKE_DATA_DIR = 'C:\Projects\Specwake\.local-data'
npm run panel:start
```

Varsayılan bind her zaman `127.0.0.1`; wildcard bind veya panelden hedef URL/komut girme seçeneği yoktur. Bir veri dizinine yalnız bir süreç yazabilir. `.local-data/` Git ve Docker bağlamı dışında tutulur. Masaüstünde kayıt yeri Electron kullanıcı-verisi dizinindeki `demo-data` klasörüdür; paket içine yazılmaz.

## Yönetici demosu — 5 adım

1. **API grupları & araçlar** sekmesinde **Demo API ekle** kullanın veya `examples/operations-demo.yaml` dosyasını yükleyin. OpenAPI çekirdeği JSON/YAML doğrulamasını yapar; hiçbir işlem önceden seçilmez.
2. Beş GET işlemini seçin. POST görünür fakat kapalıdır. Arama, yalnız uygun GET filtresi ve görünen uygun işlemleri toplu seçme kullanılabilir. En çok 8 API grubu ve hizmet başına 64 araç desteklenir. Tek MCP hizmeti aynı anda bir API grubuna bağlıdır.
3. **Seçimi kaydet → Hizmeti başlat**. Düğme gerçek listener açar; SDK initialize ve tools/list sağlık kontrolü başarılı olmadan durum “Çalışıyor” olmaz. Çalışan hizmetin seçimi değiştirilemez; önce durdurun.
4. `list_services_*` için `{}`, `get_service_*` için `{"path_id":"orders"}` ile **Çağrıyı çalıştır**. Panel backend'i resmi SDK istemcisiyle HTTP initialize → tools/list → tools/call çalıştırır. `demo_failure_*` kontrollü 503, `demo_delay_*` yaklaşık 1,6 saniye gecikme üretir. Bunlar sentetik upstream davranışlarıdır, sabit grafik değeri değildir.
5. **Genel bakış / Çağrı kayıtları** sekmesinde çağrı, hata, gecikme ve metadata kayıtlarını gösterin. API/proxy, araç, yerel istemci ve zaman aralığı filtrelerini deneyin. **Durdur** sonrasında port yeni çağrıları kabul etmez; bekleyen çağrıların sonlandırılması/kayıt yazımı beklenir. Süreci yeniden başlatınca kayıtlar korunur, API grupları ve hizmet seçimi yeniden içe aktarılır. Önceki oturumun grup kimliği geçmişte görünür.

Demo upstream yalnız uygulamanın açtığı sabit sentetik sunucudur. `servers` adresleri kullanılmaz; fixture dışında yol/parametre/auth içeren işlemler seçilemez. `proxy` burada içe aktarılan API grubudur, gerçek Apinizer kimliği değildir. `panel-demo`, `local-script`, `qa-demo` etiketleri doğrulanmış kullanıcı değildir; yabancı etiketler `local-unverified` olarak kaydedilir. GET'in yan etkisiz olduğu varsayılmaz; araç anotasyonları muhafazakârdır.

## MCP uyumluluğu ve sınırlar

Kurulu `@modelcontextprotocol/server` ve `client`: **2.3.1**. Kurulu paketin `LATEST_PROTOCOL_VERSION`: **2025-11-25**; destek listesi ayrıca 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07 içerir. Panel istemcisi 2025-11-25 sürümünü açıkça seçer. Gerçek HTTP entegrasyon testi initialize/list/call ve seçilmeyen araç reddini doğrular. Yeni bir protokol elle yazılmadı.

Kurulu SDK'nın `WebStandardStreamableHTTPServerTransport` sınıfı `sessionIdGenerator: undefined`, `enableJsonResponse: true` ile **stateless Streamable HTTP** olarak kullanılır. Node sınırında body önce boyut/deadline kontrolünden geçirilir; SDK'ya `parsedBody` olarak aktarılır. SSE aboneliği, server push, kalıcı MCP session veya eski HTTP+SSE transport bu prototipte yoktur. GET/DELETE 405 döndürür. Bu sınırlama request/response araç akışını engellemez. [Resmî SDK transport kaynağı](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/node/src/streamableHttp.ts) ve [oturum/stateless açıklaması](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/sessions-state-scaling.md) güncel ana dalı anlatabilir; bu teslimde kurulu 2.3.1 API'si ve çalışan test esastır.

Harici **yerel** MCP istemcisi panelde görünen adrese bağlanabilir. İsteğe bağlı `X-Specwake-Client: local-script` yalnız demo etiketi sağlar. Bu bir kimlik doğrulama yöntemi değildir. Panel üzerinden kimlik veya token oluşturulmaz.

## Kayıt ve hesaplama

`calls.json` yalnız şu alanları saklar: korelasyon kimliği, UTC olay zamanı, hizmet çalışma kimliği, API grubu kimliği, seçilmiş araç adı (ya da `unselected`), yerel istemci etiketi, success/error, süre ve güvenli hata kodu. İstek/yanıt gövdesi, argüman, header, token, parola, API key ve prompt kaydedilmez. Katı şema ek alanları reddeder. `EventSink` arayüzü başka hedefler için küçük bir sınırdır; Elastic/SIEM adaptörü yazılmamıştır.

- Sınır: **7 gün veya 5.000 olay**, hangisi önce gelirse. Açılışta, okumada ve yazmada süre denetlenir; süresi dolan kayıtlar diskten de düşer. Süreç kapalıyken zamanlayıcı çalışmaz; sonraki açılışta temizlik yapılır.
- Ana JSON dosyası en çok 3 MiB; atomik değiştirme sırasında geçici dosyayla yaklaşık 6 MiB üst sınır, ayrıca boş yazıcı kilidi. Dosya sistemi crash/fsync dayanıklılığı ve şifreli arşiv/audit garantisi sunulmaz. Kalıcı yazma başarısızsa çağrı başarı yanıtı verilmez.
- Tek yazıcı kilidi vardır. Normal kapanış kilidi kaldırır. Zorla process sonlandırma/güç kaybında kilit kalabilir: önce o dizini kullanan **hiçbir süreç kalmadığını** doğrulayın, yalnız `writer.lock` dosyasını operatör kaldırıp yeniden başlatsın. Kayıt dosyası silinmez. Bozuk/büyük kayıt dosyası sessizce ezilmez.
- Aralıklar: 15 dakika, 1 saat, 24 saat, 7 gün. Olayın tamamlanma zamanı filtrelenir; tüm kırılımlar aynı filtrelenmiş kümeye dayanır. Grafik 12 eşit dilimde gerçek olay sayısını gösterir. Overview en yeni 6, kayıt sekmesi en yeni 100 olayı gösterir; toplamlar tüm saklanan/filtrelenen kümeden hesaplanır.
- Çağrı sayısı: SDK'ya ulaşan ayrıştırılmış `tools/call` denemeleri; seçilmeyen araç ve yanlış argüman retleri dahil. Initialize/list/sağlık kontrolü ve JSON ayrıştırmasından önce reddedilen Host/Origin/boyut istekleri sayılmaz. Bu sayaç tüm HTTP trafiğinin metriği değildir.
- Hata oranı = hatalı kaydedilmiş çağrı / toplam kaydedilmiş çağrı. Sıfır çağrıda sıfır gösterilir ve “veri yok” durumu belirtilir. Gecikme, JSON okunmasından sonra SDK/MCP + upstream işleme süresidir; initialize/list, ağdan upload ve kayıt dosyası yazma süresi hariçtir. Ortalama aritmetik ortalama, P95 sıralı sürelerde `ceil(0.95*N)` konumudur. UI zamanı İstanbul/UTC+3, disk UTC'dir.

## Linux / Docker hazırlığı

**Bu makinede Docker CLI bulundu ancak `dockerDesktopLinuxEngine` motoruna bağlanılamadı. Docker build/container ve gerçek Linux smoke testi çalıştırılmadı.** Dockerfile bir hazırlıktır, doğrulanmış Linux dağıtımı değildir. Motor veya OS ayarı değiştirilmedi; sunucuya erişilmedi.

İzole Linux cihazında Node 24 ile aynı `npm ci && npm run panel` akışı kullanılabilir. Docker hazırlığı:

```sh
docker build -t specwake:local .
docker volume create specwake-demo-data
docker run --rm --name specwake-local-demo --network host \
  --mount source=specwake-demo-data,target=/app/.local-data \
  specwake:local
```

`--network host` burada **Linux** içindir: Node uygulamasının loopback bind'ini korur; panel ve dinamik MCP portu yalnız o makinedeki istemcilere açıktır. Portları `-p 0.0.0.0:...` ile yayımlamayın. Varsayılan container ağıyla çalıştırırsanız içerideki loopback'e sadece container içinden ulaşılır. Docker Desktop host networking ayarını açmanız istenmiyor. Base image'ın mevcut `node` kullanıcısı kullanılır; host hesabı veya izinleri değiştirilmez.

Docker kabul kapısı: temiz build → container içinde aynı HTTP MCP akışı → host loopback sınırı → restart + volume kayıt devamlılığı → stop sonrası bağlantı reddi → güvenli log kontrolü. Bu adımlar çalıştırılmadan başarılı dağıtım denemez. Demo image kaynak/tsx ve geliştirme bağımlılıklarını içerir, Electron binary indirme scriptleri çalışmaz. Üretim image küçültme, digest sabitleme ve ayrı dağıtım incelemesi sonraki aşamadır.

Loopback/izole ortam dışına çıkış için TLS, yönetim API'si ile MCP için ayrı ve uygun kimlik doğrulama/yetkilendirme, erişim politikası, denetlenmiş upstream/DNS/PKI ve güvenli secret yönetimi gerekir. LDAP/SSO ertelenmesi bu gereksinimleri kaldırmaz. Apinizer, Elastic, SIEM, hesap/credential oluşturma veya uzaktan/public yayın bu teslimde yoktur.

## Kontroller

```powershell
npm test
npm run test:export
npm run desktop:pack:dir
npm run test:desktop
```

Sonuçlar, ekranlar, değişen dosya haritası ve kalan riskler: [WEB_PROTOTYPE_VERIFICATION.md](WEB_PROTOTYPE_VERIFICATION.md). Installer kurulumu/kaldırması gerekmez ve bu turda yapılmamıştır.
