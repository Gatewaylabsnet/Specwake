# İkinci tur — uygulama ve kabul kanıtı

17 Ekim 2026, yalnız `C:\Projects\Specwake`. Başlangıç: `f003349548aef01f6c0e4c1d1e21b1568046568f`, temiz çalışma ağacı; ek AGENTS.md yoktu. Mevcut ana dal ve kullanıcı değişiklikleri korundu. Sohbetin ConfigDiffTool proje metadatası kullanılmadı; o depoda çalışma yapılmadı. Commit/push/PR/tag/release/deploy veya uzaktan CI çalıştırması yapılmadı.

## Değişen davranış

- Runtime, stdio başlangıcı ve masaüstü başlangıcında güvenli `SW_*` hata kodları, sabit mesaj ve çözüm yönlendirmesi. Parametre, hedef/DNS, credential, 401/403/429, redirect, TLS/ağ, timeout ve boyut sınırı ayrılıyor. Ham native hata, URL query, header, credential veya başarısız yanıt gövdesi tanıya eklenmiyor. Başlangıç tanısı stderr JSON; stdout MCP protokolü olarak kalıyor.
- MCP SDK'nın Standard Schema uzantı noktası kullanılarak **aynı** JSON giriş şeması korunuyor; SDK giriş doğrulaması sabit `[SW_PARAMETER_INVALID]` metniyle güvenli hale getiriliyor. Yanlış JSON-RPC/araç adı protokol hataları SDK kapsamındadır. Studio, SDK parametre tanısını ortak yapılandırılmış biçime çeviriyor.
- Eski DNS mismatch testi mock hedef doğrulamasında duruyordu. Yeni test, geçerli API/HTTPS + sentetik özel IP yapılandırmasıyla gerçek DNS allowlist dalına ulaştığını (`lookup=1`, bağlantı=0) kanıtlıyor. Karışık/boş DNS yanıtları da bağlantı açılmadan reddediliyor.
- Yeni testler, Node 24'ün `lookup(..., {all:true})` callback biçimindeki bir hatayı yakaladı. Tek adres yerine istenen biçimde **aynı doğrulanmış sabit adres** döndürülüyor; ağ politikasına istisna eklenmedi.
- Mock cevabı belge kimliği, tam manifest hash'i, seçili araç ve argüman hash'iyle bağlı. Arayüz ayrıca çağrı nesli ve görünüm girdilerini denetliyor. Geri dönüş, ad/açıklama/seçim/araç değişimi, argüman düzenleme veya sıfırlama eski sonucu temizliyor; geç gelen cevap/hata yeni görünümü kirletmiyor.
- Fixture kapsamı olmayan rota, `SW_MOCK_FIXTURE_MISSING` / “No fixture” olarak gösteriliyor. Gerçek API/auth doğrulanmış sayılmıyor ve export durumunda doğrulanmamış bilgisi korunuyor.
- ZIP smoke testi artık depo dışındaki temiz OS temp dizininde kendi lockfile'ıyla kuruyor; yerel bağımlılık çözümü ve global/proje modül yolundan bağımsızlık kontrol ediliyor.
- Windows/Node 24 CI tanımı eklendi: temiz checkout, npm ci, build/test, bağımsız ZIP, yalnız unpacked desktop, desktop smoke ve desktop'tan üretilen ZIP'in bağımsız doğrulanması. Action sürümleri resmi depolardan doğrulanan commit SHA'larına sabitlendi; repo token yetkisi salt okunur, otomatik yayınlama yok.
- Desktop smoke testi ayrı kullanıcı-verisi profili kullanıyor, process çıkışını ve port temizliğini denetliyor. Script yalnız unpacked uygulama veya portable wrapper kabul ediyor; installer testine yönlendirmiyor.

## Gerçek sonuçlar

| Kontrol | Sonuç |
| --- | --- |
| `npm run build` / tür kontrolü | Başarılı; UI ve runtime derlendi |
| `npm test` | **33/33 geçti**, atlanan/iptal edilen yok |
| Temiz kaynak kopyası | OS temp altında node_modules/dist olmadan oluşturuldu; kendi `npm ci` kurulumu, build ve **33/33** testi geçti |
| `npm run test:export` | Depo dışında npm ci/build, paket içi dependency resolution, MCP initialize/list/call, seçilmeyen araç reddi ve kararlı parametre kodu geçti |
| `npm run desktop:pack:dir` | ASAR unpacked Windows masaüstü paketi üretildi; installer çalıştırılmadı ve yayınlama yok |
| `npm run test:desktop` | Bundled Electron 44.8.0 / Node 24.22.0; kaynak cwd ve global Node olmadan import/preview/MCP mock/export; sandbox, yabancı origin reddi ve çıkışta port temizliği geçti |
| `npm run test:export -- artifacts/desktop-verification-server.zip` | **Gerçek desktop paketinden üretilen** ZIP'in depo dışındaki bağımsız kurulumu ve MCP çağrısı geçti |
| Arayüz regresyonu | Araç/argüman bağlama, geri dönüş, Reset arguments, araç değişimi, No fixture ve istek sürerken argüman değiştirme sonrası geç cevabın düşürülmesi gözlendi; error/warn konsol kaydı yok |
| CI YAML | Yerelde parse edilip Windows runner/Node 24/read-only sözleşmesi kontrol edildi; **uzaktaki GitHub CI çalıştırılmadı** |
| `npm audit --omit=dev --audit-level=high` | 0 runtime bağımlılık açığı raporlandı |

Temiz kaynak kopyası bir Git checkout'u gibi bağımlılıksız oluşturulan **yerel snapshot** idi; uncommitted çalışma kodu test edildi, yeni bir commit veya worktree oluşturulmadı. Uzak temiz checkout kanıtı, sonraki yetkilendirilmiş commit/CI çalıştırmasında ayrıca alınmalıdır. Raporlar `artifacts/desktop-verification.json`, `artifacts/export-verification.json`; desktop çıktısı `release/win-unpacked/Specwake.exe`. Kaynak snapshot ve bağımsız ZIP klasörleri OS temp'te inceleme için bırakıldı.

## API/auth test izolasyonu ve sınırları

Üretim API modu, HTTPS varsayılanı, kesin IPv4 izin listesi, her çağrıda DNS kontrolü/sabitleme ve ortam değişkenli Bearer/X-* auth korundu. Üretim koduna DNS resolver enjeksiyonu, TLS bypass, özel CA ayarı veya localhost istisnası eklenmedi.

`tests/api-security.test.ts`, yalnız kendi process'inde DNS/transport yöntemlerini mock ediyor: doğrulanan sentetik `10.42.0.8` adresi test shim'inde loopback TLS fixture'ına bağlanıyor. Uygulamanın DNS policy ve pinning callback'i gerçekten çalışıyor; gerçek TLS bağlantısı hostname/CA doğrulamasıyla kuruluyor. Yanlış CA ve hostname reddediliyor. Hiçbir gerçek DNS/API/üretim servisi çağrılmıyor; fake credential'lar yalnız fixture için kullanılıyor. Test CA'sı sadece o test isteğine veriliyor; OS trust store değiştirilmedi.

TLS PEM'leri Node.js'in **zaten herkese açık, MIT lisanslı test fixture'larıdır**; yeni veya gerçek bir anahtar/credential oluşturulmadı. Atıf/lisans ve kullanım sınırı `tests/fixtures/tls/README.md` içinde. Bu public test key hiçbir gerçek serviste kullanılmamalıdır.

Anonim/Bearer/X-* başarı ve ret, 401/403/429, eksik/geçersiz credential, bilinmeyen parametre, gerçek DNS mismatch dalı, sabitleme, CA/hostname doğrulaması, redirect reddi, DNS/yanıt timeout'u, yanıt boyutu ve credential echo maskelemesi kapsanıyor. Bu fixture kanıtı gerçek kurumsal DNS/PKI, API yetkisi veya üretim credential doğrulaması değildir. Başarılı API verisi istemciye dönmeye devam eder; exact secret maskelemesi kapsamlı anonimleştirme değildir.

## Kabul kapıları ve kalan işler

- Bu turdaki yerel kaynak, bağımsız export, unpacked desktop ve UI geçerlilik kapıları geçti.
- GitHub Windows/Node 24 koşusu **bekliyor**; çalıştırılmadığı için başarı iddiası yok.
- Installer install/uninstall **çalıştırılmadı**. X570 üzerinde yasak; disposable Windows VM'de ayrı kabul kapısı [NEXT_ROUND.md](NEXT_ROUND.md) içinde.
- CLI, Linux AppImage beta ve tek kullanıcı/on-prem MCP sunucu yönetim paneli yalnız tasarlandı; uygulanmadı. Uzaktan MCP transport/auth, dış ağ açma, hesap/yetki ve credential oluşturma bu turda yok.
- Mevcut yayınlanmış v0.1.0 portable/setup dosyaları değişmedi: SHA-256 değerleri sırasıyla `93ed4d5003afdd7c39681aa39fd56299fa8a17614a4525e721816899a8cebe72` ve `50a538fd228a5a3106bb81913d3dfff062e60a49b9e4c52f479690073367f28e`. Bu çalışma henüz yeni bir sürüm değildir.

## Dosya haritası

Runtime: `src/runtime/{errors,http,server,cli}.ts`. Mock/UI bağlamı: `src/core/probe-context.ts`, `src/ui/main.tsx`, `src/studio/{server,probe,export}.ts`, `src/mock/server.ts`. Masaüstü: `src/desktop/{main,self-test}.ts`. Doğrulama: `scripts/verify-{export.ts,desktop.ps1}`, `tests/{api-security,startup,probe-context,runtime,studio}.test.ts`, public TLS fixture'ları. CI: `.github/workflows/windows-ci.yml`, `package.json`. Rehberler: README, DESKTOP, bu rapor, NEXT_ROUND ve `templates/RUNTIME_ERRORS.md` / `RUNTIME_README.md`. Bağımlılık sürümü/lockfile değiştirilmedi.
