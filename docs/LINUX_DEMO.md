# Linux üzerinde yerel yönetim demosu

18 Ekim 2026. Bu rehber tek Linux sunucu ve yalnız o sunucudaki tarayıcı/MCP istemcisi içindir. Kurumsal auth, gerçek kullanıcı yetkisi, Apinizer bağlantısı veya dış yayın içermez. Proxy, içe aktarılan demo API grubunu ifade eder.

**Bu Windows geliştirme ortamında Docker CLI var; Linux motoru yok.** `docker info` mevcut olmayan `dockerDesktopLinuxEngine` pipe'ı nedeniyle başarısız oldu. Burada Docker build, container çalıştırma, Linux izinleri, container restart/kalıcılık testi **çalıştırılmadı**. Aşağıdaki doğrulayıcı bunları Linux motoru bulunan izole bir cihazda gerçekten ölçmek içindir; başarı çıktısı olmadan bu kontroller geçmiş sayılmaz. Motor/BIOS/WSL, güvenlik duvarı veya ağ ayarı değiştirilmedi.

## Ön koşullar ve ilk kurulum

Linux Docker motoru ve Docker Compose v2, kaynak repo, hostta **Node.js 24 + npm**, 4319/4320 boş loopback portları gerekir. Node hostta yalnız bağımsız SDK doğrulaması için gereklidir. İmaj build'i npm/base image indirmek için internet kullanır; kurum servisine bağlanmaz. Proxy/registry credential'ını build argümanı veya imaj dosyası olarak eklemeyin. Hazır Docker motoru yoksa aşağıdaki adımları durdurun; doğrulayıcı motoru kurmaz/açmaz.

```sh
cd /path/to/Specwake
docker info --format '{{.OSType}}'   # linux olmalı
docker compose version
npm ci --no-audit --no-fund
npm test

# Yeni bir yerel imaj etiketi; dış registry'ye gönderilmez.
export SPECWAKE_IMAGE=specwake:demo-20261018
export SPECWAKE_DATA_VOLUME=specwake-demo-data
docker compose config --quiet
docker compose build --no-cache
docker compose up -d --no-build
docker compose ps
curl --fail http://127.0.0.1:4319/api/panel/health
```

Panel: <http://127.0.0.1:4319/panel>. Çalışan MCP hizmeti: <http://127.0.0.1:4320/mcp>. MCP portu ancak panelden seçim kaydedilip hizmet başlatılınca dinler. Panelin önce/sonra süreci ve beş dakikalık senaryo [WEB_PROTOTYPE.md](WEB_PROTOTYPE.md) içinde; bağımsız istemci doğrulaması `npm run test:http` komutudur.

Compose içindeki bind, container ağ arayüzünde `0.0.0.0`; **host yayınları** tam olarak `127.0.0.1:4319:4319` ve `127.0.0.1:4320:4320`'dir. Tarayıcıda `localhost`, container IP'si veya sunucunun LAN adresi yerine tam `127.0.0.1` adresini kullanın; Host/Origin sınırları korunur. `--network host`, wildcard host yayını ve reverse proxy bu akışta kullanılmaz. Docker motorunun host loopback port yayınlamasını doğru uygulayan güncel bir sürümünü kullanın; eski Docker sürümlerinin loopback yayınına ilişkin bilinen sınırlamaları için motor sürümü ayrıca operatör tarafından değerlendirilmelidir. Başka bilgisayara erişim veya internet/kurum ağına yayın bu turda yapılmaz.

`SPECWAKE_CONTAINER_DEMO=1` yalnız Linux Docker container kullanımına özgüdür. CLI, Linux ve `/.dockerenv` işareti yoksa bu modu reddeder. Native hostta bu değişkeni ayarlamayın. Container içi wildcard bind, Compose'un kesin loopback host yayınlarına bağlıdır; tek başına kimlik doğrulama sağlamaz. Native varsayılanı `127.0.0.1` ve dinamik MCP portudur. Ortam değerleri panelden değiştirilemez. Paneldeki tarayıcı oturum token'ı CSRF içindir, kurumsal kullanıcı kimliği değildir. Diğer OCI ortamları bu turda doğrulanmadı.

## Container, veri ve kapanma

- İmajda mevcut `node` kullanıcısı, Compose'da açık `1000:1000` kullanılır. Root dosya sistemi salt okunur, Linux capability'leri kaldırılır, `no-new-privileges` açıktır. `/app/.tmp` ve `/tmp` 64'er MiB tmpfs'tir. `init: true` sinyal/çocuk süreç yönetimini sağlar; 20 saniye düzgün kapanma süresi vardır.
- `specwake-demo-data` named volume `/app/.local-data`'ya bağlanır. İmajda bu dizin UID/GID 1000 ve mod 0700'dır; **yeni named volume** bu sahipliği kopyalar. Önceden root olarak oluşturulmuş veya host bind mount'lu dizin aynı garantiye sahip değildir; health başarısızsa izinleri bilinçli olarak ayrı değerlendirin. `chmod 777` uygulamayın, uygulamayı root'a çevirmeyin. Sağlık kontrolü gerçek journal okuma/yazma yeteneğini doğrular; yalnız statik HTML kontrol etmez.
- `calls.json` yalnız izinli metadata alanlarını, en çok **7 gün / 5.000 olay / 3 MiB** saklar. Atomik yazma sırasında geçici ikinci dosya yaklaşık 6 MiB gerektirebilir. HTTP gövdeleri, argüman, prompt ve credential saklanmaz. Docker stdout/stderr logları ayrı sınırdır: `json-file`, dosya başına 5 MiB, en çok 3 dosya. Bu log sürücüsü üzerinde log toplama adaptörü kurulmaz.
- Normal stop journal kuyruğunu ve bekleyen çağrıları kapatır, `writer.lock` kalkar. Zorla öldürme/güç kaybında kilit kalabilir; önce volume'u kullanan hiçbir süreç/container olmadığını kanıtlayın. Yalnız o durumda operatör stale `writer.lock` dosyasını kaldırabilir. Doğrulayıcı bunu otomatik silmez; kayıt dosyasını ezmez. Bozuk/büyük journal sessizce sıfırlanmaz.
- API grupları, seçim ve çalışan hizmet bellektedir. **Restart sonrası kayıtlar korunur; hizmet durmuş, grup listesi boş başlar.** OpenAPI ve seçim yeniden yapılır; servis kendiliğinden ağa açılmaz.

```sh
docker compose stop --timeout 20
docker compose start
curl --fail http://127.0.0.1:4319/api/panel/health
docker compose logs --tail 100
# İsterseniz container/network kaldırılır; named volume korunur.
docker compose down --timeout 20
```

`docker compose down --volumes`, `docker volume rm`, `docker system prune` bu demo akışının parçası değildir. Tek volume'a aynı anda iki Specwake süreci bağlamayın.

## Gerçek Linux doğrulaması

Önce kullanıcıya ait demo container'ını `docker compose stop --timeout 20` ile kendiniz durdurun; 4319/4320 boş olsun. Doğrulayıcı var olan süreçleri durdurmaz. Host Node 24 ve `npm ci` sonrası:

```sh
npm run test:linux
# Alternatif:
node scripts/verify-linux.mjs
```

Doğrulayıcı yeni `specwake-verify-<rastgele>` Compose projesi, yeni image etiketi ve **ayrı yeni volume** oluşturur. Önce yerel Docker context yapılandırmasını okur; uzak TCP/SSH endpoint'ini motorla bağlantı kurmadan reddeder. Yalnız yerel Unix socket veya Windows named pipe desteklenir. Ardından `docker info` kontrolü yapar; motor yoksa **exit 1**, `not-run-engine-unavailable` raporu yazar. Docker veya OS ayarını değiştirmez. Çalışabildiğinde:

1. Linux motoru/Compose → cache'siz temiz imaj build'i (`npm ci`, typecheck/build).
2. Başlatma → gerçek writable-journal readiness → UID 1000, salt okunur root, data/tmp yazılabilirliği, named volume, loopback publish ve Docker log sınırları.
3. Hosttaki **ayrı resmi SDK istemcisi** ile gerçek HTTP initialize/list/call, başarı, hata, gecikme ve durdurma (`SPECWAKE_VERIFY_ORIGIN=http://127.0.0.1:4319 npm run test:http`). Bu panelin kendi düğmesinden bağımsızdır.
4. İstatistik ve olay kimlikleri → `calls.json` katı alan listesi, zaman/sayı/boyut sınırları ve test sentinel'larının yokluğu.
5. Gerçek SIGTERM stop → exit 0 → panel bağlantısı kapanmış → salt okunur volume inceleme container'ı ile `writer.lock` kaldırılmış ve kayıt dosyası duruyor.
6. Aynı container/volume start → çağrı/hata sayıları ve olay kimlikleri korunmuş → hizmet durmuş/gruplar boş → MCP portu yeni çağrı kabul etmiyor.
7. Uygulama loglarında çalıştırılmış secret sentinel'ları yok → yalnız doğrulayıcının kendi container/network'ünü kaldırır. **Volume ve image inceleme için kalır.**

Rapor: `artifacts/linux-verification.json`. İçinde gerçek durum, geçmiş kontrol adları, tarih ve oluşturulan volume/image isimleri bulunur. Hata raw subprocess output'unu rapora kopyalamaz. Hata varsa yalnız raporda adı yazan kendi doğrulama projesini `docker compose --project-name <rapordaki-proje> ...` ile inceleyin; başka projeyi durdurmayın. Script çalıştırılmadan bu liste bir kabul kapısıdır, başarı kanıtı değildir. Retention sınırlarının aktif budama davranışı ayrıca `npm test` journal testlerinde ölçülür; container smoke yeni metadata'nın sınır içinde kaldığını denetler.

Manuel kabul listesi: tarayıcıda panel açılıyor; en az iki GET seçiliyor; SDK gerçek porttan list/call yapıyor; başarılı/hatalı/yavaş çağrılar panelde gözleniyor; istemci etiketinin doğrulanmamış olduğu açık; durdurma ve SIGTERM başarılı; restart aynı metadata'yı tutuyor; auth'suz host portları loopback dışında yayınlanmıyor; health writable; root değil; loglar sınırlı ve sır içermiyor. Docker inspect, rapor ve görsel kanıtlar birlikte değerlendirilir; Linux motoru yokluğu bu listeyi geçmiş yapmaz.

## Yedekleme, güncelleme ve geri dönüş

Yedek yalnız metadata'dır; API tanımı/seçim tekrar yüklenir. Aşağıdaki komutlar **aynı Compose proje/ortam değerleriyle**, yerel Linux hostta kullanılır. Bu prosedür özel test verisi içindir; üretim audit/fsync veya şifreli arşiv garantisi sunmaz.

```sh
backup="$HOME/.local/share/specwake-backups/specwake-$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$backup"
docker compose stop --timeout 20
docker compose cp specwake:/app/.local-data/. "$backup/"
test -f "$backup/calls.json"
test ! -f "$backup/writer.lock"
sha256sum "$backup/calls.json" > "$backup/calls.sha256"
docker compose start
```

Dosya yoksa hiç çağrı kaydı olmayabilir; yedeği geçerli kabul etmeyin. `writer.lock` varsa zorla devam etmeyin; kapanışı araştırın. Backup dizinini `.dockerignore` allowlist'i imaja almaz; repo dışı korumalı dizine taşıyabilirsiniz. Yedekler Git'e veya açık paylaşıma gönderilmez.

Güncelleme: önce testleri ve Linux doğrulayıcıyı **ayrı volume** ile çalıştırın; mevcut imajın etiketini/ID'sini ve kullanılan volume'u kaydedin. Yukarıdaki yedeği alın. İncelenmiş yeni kaynakla farklı yerel imaj etiketi seçin, build alın, sonra aynı veri volume'uyla değiştirin:

```sh
# Eski değer/ID'yi güvenli bir operatör notuna kaydedin.
docker image inspect "$SPECWAKE_IMAGE" --format '{{.Id}}'
export SPECWAKE_IMAGE=specwake:demo-next
docker compose build
docker compose up -d --no-build
curl --fail http://127.0.0.1:4319/api/panel/health
```

Şema bu turda değişmedi. Gelecek sürüm migration gerektiriyorsa eski imajı yeni veriye bağlamadan önce uyumluluğu doğrulayın. Geri dönüş için eski imaj etiketi/ID'sini seçin, `docker compose up -d --no-build` çalıştırın. Uyumsuz veya bozuk metadata'da mevcut volume'u ezmek yerine yedeği **yeni bir volume'a** geri yükleyin:

```sh
# backup önceki adımın mutlak yoludur. Aynı isimle eski volume'u kullanmayın.
restore_volume="specwake-demo-restore-$(date -u +%Y%m%dT%H%M%SZ)"
docker volume create "$restore_volume"
docker run --rm --network none --read-only --user 1000:1000 \
  --mount "type=volume,src=$restore_volume,dst=/app/.local-data" \
  --mount "type=bind,src=$backup,dst=/backup,readonly" \
  "$SPECWAKE_IMAGE" node -e \
  "const fs=require('node:fs'),a=require('node:assert/strict');a.equal(fs.readdirSync('/app/.local-data').length,0);a.ok(!fs.existsSync('/backup/writer.lock'));JSON.parse(fs.readFileSync('/backup/calls.json','utf8'));fs.copyFileSync('/backup/calls.json','/app/.local-data/calls.json',fs.constants.COPYFILE_EXCL);fs.chmodSync('/app/.local-data/calls.json',0o600)"
docker compose stop --timeout 20
export SPECWAKE_DATA_VOLUME="$restore_volume"
docker compose up -d --no-build
curl --fail http://127.0.0.1:4319/api/panel/health
```

Yeni volume'daki boşluk kontrolü var olan verinin üzerine yazmayı engeller. Normal uygulama açılışı strict journal şemasını yeniden doğrular. Geçerli eski volume ve yedek saklanır; silme komutu verilmez. Geri yükleme de Linux kabulünün bir parçasıdır ve bu Windows ortamında çalıştırılmamıştır.

İmaj kaynak/tsx ve build bağımlılıklarını içerir; Electron indirme lifecycle scriptleri `npm ci --ignore-scripts` ile çalışmaz. `.dockerignore` allowlist'i gerçek credential, `.env`, kişisel metadata, test TLS anahtarları, screenshot, attachment, `.git` ve desktop binary'lerini build context dışında tutar. Base image tag'i Node 24'tür; onaylı digest ve container provenance incelemesi gerçek dağıtım öncesi ayrıca yapılmalıdır.
