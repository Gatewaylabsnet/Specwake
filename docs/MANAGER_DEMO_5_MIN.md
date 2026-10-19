# Beş dakikalık yönetici demosu

Windows 0.1.1 EXE ile Node/npm kurmadan gösterim için [WINDOWS_QUICK_START.md](WINDOWS_QUICK_START.md) kullanın. Aşağıdaki terminal komutları kaynak koddan web çalıştırma biçimidir.

Bu gösterim yalnız sentetik yerel API kullanır. API/proxy grubu içe aktarılan bir OpenAPI tanımıdır; Apinizer bağlantısı değildir. Yerel istemci etiketi doğrulanmış kullanıcı değildir.

## Hazırlık

Node.js 24+ ve ilk kurulum için npm registry erişimi gerekir. PowerShell:

```powershell
Set-Location C:\Projects\Specwake
npm ci
npm run panel
```

Panel: <http://127.0.0.1:4319/panel>. MCP portu başlatınca ayrıca atanır; aşağıdaki komutta paneldeki **güncel gerçek adresi** kullanın. Port doluysa mevcut süreci kapatmayın; `SPECWAKE_PORT` ile başka bir boş yerel port seçin. Daha önce build alındıysa `npm run panel:start` yeterlidir. Sunum öncesi `npm test` ve `npm run test:http` çalıştırılabilir; bunlar ayrı geçici veri dizini kullanır.

Linux Docker alternatifi, sabit MCP 4320 portu ve doğrulama kapısı: [LINUX_DEMO.md](LINUX_DEMO.md).

## 0:00–1:00 — İzin verilen yüzey

Genel bakıştaki hizmet durumu, veri yok durumu ve altı adımlı yönlendirmeyi gösterin. **API grupları & araçlar → Demo API ekle** veya **OpenAPI yükle → `examples/operations-demo.yaml`** kullanın. Dosyanın sunucu adresine bağlantı kurulmadığını açıklayın. Hiçbir araç kendiliğinden seçilmez. Şu dört GET'i seçin; POST ve `/services/{id}` seçili olmasın:

- `/services`
- `/summary`
- `/simulate/error`
- `/simulate/slow`

## 1:00–2:00 — Gerçek hizmet

**Seçimi kaydet → Hizmeti başlat** kullanın. Başarı, gerçek SDK initialize/list kontrolünden sonra görünür. MCP hizmeti ekranındaki gerçek `/mcp` adresini ve **İstemci komutunu kopyala** düğmesini gösterin. Transport stateless Streamable HTTP/JSON; protokol 2025-11-25'tir. Eski SSE abonelik adresi kullanılmaz.

## 2:00–3:00 — Bağımsız istemci kanıtı

Ayrı terminalde, proje klasöründe kopyalanmış komutu çalıştırın: gerçek dört araç listelenir. Sonuna `--exercise` ekleyip tekrar çalıştırın:

```powershell
# PORT yerine paneldeki güncel portu yazın.
node --import tsx scripts/mcp-demo-client.ts --endpoint "http://127.0.0.1:PORT/mcp" --exercise
```

İstemci resmi SDK'yı kullanır ve panelin çağrı düğmesinden bağımsız bir süreçtir. Üç başarılı, iki hatalı/ret olmak üzere beş gerçek `tools/call` denemesi yapar. 503 hatası ve yaklaşık 1,6 saniye gecikme gerçek yerel demo API'den gelir. Seçilmeyen bir araç ayrıca reddedilir. Initialize/list sayaca dahil değildir. Testte gönderilen sahte redaksiyon canary'si bir kimlik bilgisi veya auth uygulaması değildir.

Tek sonucu görmek için araç listesindeki gerçek adı kullanın:

```powershell
node --import tsx scripts/mcp-demo-client.ts --endpoint "http://127.0.0.1:PORT/mcp" --tool list_services_GUNCEL_EK --args '{}'
```

## 3:00–4:00 — Ölçülebilir kullanım

**Genel bakış → Görünümü yenile**: yeni/boş veri dizininde beş çağrı, iki hata, %40 hata oranı beklenir. Önceki çağrılar varsa toplam farklıdır; veri silmeyin, API grubu filtresi kullanın. Ortalama/P95 ölçülür; gecikme değerinin her çalışmada değişebileceğini söyleyin. API grubu, araç ve `local-script` filtresini deneyin. Çağrı zamanına tıklayın: güvenli hata özeti, süre ve korelasyon kimliğini gösterin. Hassas gövde/header kaydı yoktur. Olaysız istemci filtresinde boş görünüm gerçek veri eksikliğini gösterir.

## 4:00–5:00 — Kontrollü kapanış ve sınırlar

**MCP hizmeti → Durdur** kullanın. Aynı bağımsız istemci komutunu tekrar çalıştırınca bağlantı kurulamaz; hizmet durmuş görünür. Panel sürecini Ctrl+C ile düzgün kapatıp tekrar açınca çağrı metadatası korunur; gruplar/seçimler yeniden eklenir ve hizmet durmuş başlar. Kayıt sınırı 7 gün / 5.000 olaydır.

Kapanış mesajı: “OpenAPI'den açık seçimle MCP araçları ve ölçülebilir gerçek yerel çağrı akışını gösterdik. Kurumsal auth, gerçek kullanıcı yetkilendirmesi, Apinizer/Elastic bağlantısı ve ağ yayını bu demoda uygulanmadı.” Sonraki pilot için gereken bilgiler [doğrulama raporundadır](MANAGEMENT_DEMO_VERIFICATION.md#sonraki-kurum-pilotu).
