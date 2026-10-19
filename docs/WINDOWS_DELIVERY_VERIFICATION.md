# Windows 0.1.1 teslimi ve kalan kabul kapıları

19 Ekim 2026. Yerel Windows x64 geliştirme ortamında doğrulandı. Önceki 18 Ekim yönetim geliştirmeleri korundu; mevcut 46 test kaldırılmadı. Bu belge yerel doğrulama sonuçlarını kaydeder. Kullanıcının sonraki yayın talebiyle dağıtım hedefi [v0.1.1 GitHub Release](https://github.com/Gatewaylabsnet/Specwake/releases/tag/v0.1.1) olarak belirlendi; yayınlanmış varlıklar ve kaynak tag bu sayfadan doğrulanabilir. Eski 0.1.0 EXE'leri ve checksum dosyası korundu; güncel yerel paketler farklı **0.1.1** adını taşır.

## Teslim dosyaları

- [Portable EXE](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.1.1/Specwake-0.1.1-Portable-x64.exe), yaklaşık 102 MB.
- [Kullanıcıya özel Setup EXE](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.1.1/Specwake-0.1.1-Setup-x64.exe), yaklaşık 102 MB.
- [SHA-256 manifesti](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.1.1/SHA256SUMS-0.1.1.txt).
- [Paket yanında kullanım kılavuzu](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.1.1/Specwake-0.1.1-Kullanim.md), kaynak [WINDOWS_QUICK_START.md](WINDOWS_QUICK_START.md).

Dosyalar yerel `release/` klasöründedir ve Git dışında tutulur. Kullanıcı Specwake ve içindeki HTTP demo istemcisi için Node/npm, kaynak kodu veya internet kurmak zorunda değildir. Bağımsız **stdio sunucu ZIP'i** ayrı üründür: kendi ortamında Node.js 24+ ve ilk npm kurulumu gerekir. Portable, uygulama verisini kullanıcı profilinde tutar; tamamen iz bırakmayan veri taşıma garantisi değildir.

## Yapılan geliştirmeler

- Masaüstü ilk açılışı `/panel` yönetim ekranıdır; önceki stdio oluşturucu aynı origin'in `/` adresinde, sol menüden erişilebilir.
- EXE'ye `--mcp-client --endpoint http://127.0.0.1:PORT/mcp` modu eklendi. Ayrı resmi SDK istemci sürecidir; UI tek-instance kilidini almaz, pencere veya yeni sunucu açmaz. Endpoint tam loopback `/mcp` adresiyle sınırlı, query/hash/credential reddedilir. SDK transport ve protokol değişmedi.
- Mevcut kaynak istemci kodu `src/client/demo-client.ts` içine taşındı; `scripts/mcp-demo-client.ts` ince bir sarmalayıcı oldu. Paketli ve kaynak istemci aynı implementasyonu kullanır. Kaynak dışı terminal testi de korundu.
- Masaüstü backend'i kendi gerçek executable yolunu trusted yapılandırmadan panel state'ine verir. HTTP istekleri executable/komut seçemez. Web modu hâlâ Node/tsx komutunu, masaüstü modu PowerShell'de gerçek EXE komutunu gösterir.
- Listeleme ve tam başarı/hata/gecikme demosu için ayrı kopyalama düğmeleri bulunur. PowerShell executable yolu tek tırnaklarla güvenle alıntılanır; iç tek tırnak ikiye katlanır. Buna bir regresyon testi eklendi. Portable çıkarma yolu ve MCP portu oturuma özeldir; yeniden açılışta komut tekrar alınır.
- Paketli self-test, yönetim backend'inden dört GET seçip hizmeti başlatır, aynı paketin EXE'sini **ayrı süreç** olarak çalıştırır. Global Node/npm kullanılmadan initialize/list, başarı, kontrollü 503, gerçek gecikme ve seçilmeyen araç reddi doğrulanır. Beş olayın korelasyon kimlikleri gerçek HTTP yanıtlardaki kimliklerle eşleşir.
- `verify-desktop.ps1` paketi iki kez çalıştırır. İkinci açılışta ilk çalışmanın olay sayısı/kimlikleri korunur; her kapanışta panel/MCP portları ve metadata kilidi kalkar. Kişisel profile dokunulmaz; test profili kanıt dizinindedir.
- Kullanıcı kurulum kılavuzu, versioned checksum üretici, Sandbox hazırlayıcı ve temiz Windows kabul script'i eklendi. Yeni script'ler SHA-256'yı .NET streaming API ile hesaplar; ek hashing aracı gerekmez.

Kamusal, kişisel yolları içermeyen doğrulama özeti: [WINDOWS_0.1.1_EVIDENCE.json](WINDOWS_0.1.1_EVIDENCE.json). Yerel ayrıntılı artifacts raporları repo dışında kalır.

## Gerçek sonuçlar

| Komut/kontrol | Sonuç |
| --- | --- |
| `npm test` | **47/47**; typecheck, Vite ve runtime build dahil; 0 fail / skip / cancelled |
| `npm run desktop:pack` | Güncel 0.1.1 Portable ve NSIS Setup üretildi; publish kapalı |
| `npm run desktop:checksums` | İki EXE'nin product version'ı ve hash'leri doğrulandı; manifest ayrı Node crypto hesabıyla da kontrol edildi |
| `npm run test:desktop` | Final unpacked pakette gerçek yönetim ekranı, stdio oluşturucu/ZIP, bundled ayrı HTTP istemci, iki süreç açılışı, kalıcılık ve port temizliği geçti |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop.ps1 -Executable release\Specwake-0.1.1-Portable-x64.exe -EvidenceDirectory artifacts\windows-portable-011` | **Final tek dosyalı Portable** çıkarma sonrası aynı testlerden iki açılışla geçti; PATH yalnız System32, kaynak cwd/global Node olmadan |
| `npm run test:export` | Repo dışındaki boş dizinde temiz npm ci/build ve gerçek stdio MCP testi geçti |
| `npm run test:export -- artifacts/desktop-verification-server.zip` | Final masaüstü paketinden üretilen ZIP de bağımsız kurulumdan geçti |
| `npm audit --omit=dev --audit-level=high` | 0 bildirilen production bağımlılık açığı |
| PowerShell AST, Sandbox XML ve host guard | Parse/static kontroller geçti; kurulum script'i geliştirme hostunda çalışmayı reddetti |
| Authenticode kontrolü | İki EXE **NotSigned**; imzalı olarak sunulmaz |
| `npm run test:linux` | exit 1 / `not-run-engine-unavailable`; Linux runtime kontrolleri çalıştırılmadı |

Paket testlerinde PATH kısıtlamak gerçek temiz Windows kurulumuyla aynı şey değildir. Setup üretildi; geliştirme makinesine kurulmadı/kaldırılmadı. SmartScreen, kurumsal cihaz politikası ve tüm Windows sürümleri için uygunluk iddia edilmez.

İlk checksum çalıştırmasında bu oturumun Windows PowerShell ortamı `Get-FileHash` komutunu bulamadı. Script .NET streaming SHA-256 kullanacak şekilde düzeltildi ve tekrar başarıyla çalıştırıldı. Son kaynak/paket testlerinde çözülmemiş hata yoktur; aşağıdaki ortam/sertifika kapıları açık kalır.

Makine kanıtları: [özet](../artifacts/windows-delivery-summary.json), [unpacked rapor](../artifacts/desktop-verification.json), [Portable rapor](../artifacts/windows-portable-011/desktop-verification.json), [temiz Windows hazırlık durumu](../artifacts/windows-clean-availability.json), [Linux durumu](../artifacts/linux-verification.json). Test logları `artifacts/windows-delivery-*.log` içindedir; kaynak Git'e dahil edilmez.

## Arayüz kanıtı

Final Portable paketin gerçek BrowserWindow görüntüsü: [desktop-verification.png](screenshots/08-desktop-management.png). Açılışın yönetim paneli olduğu executable içinde de doğrulanır. Beklenmedik origin, sandbox veya Node integration gevşetilmedi.

Ek tarayıcı QA'sında masaüstü executable yapılandırmasıyla aynı arayüz açıldı; tam demo komutu görüntülendi ve kopyalama başarı geribildirimi görüldü. Görünen PowerShell komutu doğrudan çalıştırıldı: EXE ayrı istemci sürecinde dört aracı listeledi, beş deneme/tam iki hata üretti; panel %40 ve gerçek gecikmeyi gösterdi. Clipboard içeriğinin tarayıcı otomasyonundan geri okunması doğrulanamadı; kullanıcıya gösterilen komutun çalışması ayrıca ölçüldü. Bu QA'nın hostu kaynak server'dı; paketli backend/EXE kanıtı yukarıdaki ayrı self-testlerdir. Ayrımlar gizlenmedi.

[Bağlantı ekranı](screenshots/09-bundled-client.png) · [Beş çağrılı gerçek panel](screenshots/07-management-overview.png). Yalnız sentetik veri var. QA süreçleri kapatıldı; portlar ve kilit temizliği doğrulandı.

## Temiz Windows kurulum/kaldırma — hazır, çalıştırılmadı

Bu makinede `WindowsSandbox.exe` yok. Hyper-V modülü mevcut ancak oturum VM sorgulama yetkisine sahip değil; **VM yoktur** sonucu çıkarılmadı. Hiçbir sanallaştırma, güvenlik duvarı, ağ veya sistem özelliği değiştirilmedi; başka makineye bağlanılmadı.

`npm run test:windows:prepare`, mevcut iki EXE ve hash manifestini yeni `.tmp/windows-clean-<id>/input` klasörüne alır; iki QA script'ini ayrı read-only klasöre koyar. `artifacts/windows-clean-<id>/Specwake-Clean-Windows.wsb` üretir. Ağ/vGPU/clipboard kapalıdır; input/QA read-only, yalnız o teste ait çıktı dizini yazılabilir. Kullanıcı veri klasörü veya tüm repo Sandbox'a paylaşılmaz. Yapılandırma biçimi [Microsoft'un resmi Sandbox belgesine](https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file) dayanır.

Sandbox **zaten kurulu ve izinli** bir test hostunda aynı kaynak/paketlerle:

```powershell
npm run desktop:checksums
npm run test:windows:prepare
# Önce üretilen WSB içindeki üç klasörü inceleyin.
# Üretilen Specwake-Clean-Windows.wsb dosyasını açın.
# Alternatif: aynı hazırlık ve açılış için:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-windows-sandbox.ps1 -Launch
```

Hazırlayıcı Windows Sandbox kurmaz/etkinleştirmez. `-Launch` yoksa açmaz. `.wsb` açıldığında `verify-clean-windows.ps1 -DisposableEnvironment` otomatik çalışır. Script hem açık switch'i hem Sandbox'ın `WDAGUtilityAccount` hesabını şart koşar; normal geliştirme hostunda kurulum yapmaz.

Kesin kabul sırası: Node/npm yok → iki package hash'i → Portable'da iki açılış/gerçek ayrı istemci/kalıcılık → daha önce kurulum olmadığı kontrolü → boşluk içeren kullanıcı dizinine silent Setup → aynı kurulu-paket self-test'i iki kez → kısayol → gerçek uninstaller → EXE/kısayol/uninstall kaydı kalkmış. NSIS `/S`, son parametre `/D` ve uninstall `_?=` davranışı [resmi NSIS belgesine](https://nsis.sourceforge.io/Docs/Chapter3.html) göre hazırlanmıştır. Script, kendi paketinin uninstaller'ını çağırır; recursive klasör silme yapmaz.

Başarı kanıtı **yalnız gerçekten Sandbox içinde oluşmuş** `clean-windows-verification.json` içindeki `status: passed` ve iki alt rapordur. Şu an bu dosya yoktur; mevcut `windows-clean-availability.json` değeri `prepared-not-run`, `sandboxAvailable: false`'tur. Sessiz installer testi SmartScreen onayını veya sihirbazın tüm görsel adımlarını doğrulamaz; bunlar izinli test Windows'unda ayrıca elle gözlenmelidir. Başka temiz VM kullanılırsa kurulum/kaldırma kontrol listesi manuel uygulanır; script'in Sandbox guard'ı gevşetilmez.

## Kod imzalama — sertifika bekliyor

CurrentUser/LocalMachine kod imzalama sertifika depolarında uygun sertifika bulunmadı. `CSC_LINK`, `WIN_CSC_LINK`, `CSC_NAME` yapılandırmaları yok; secret değer okunmadı/raporlanmadı. Bir sertifika satın alınmadı, self-signed sertifika ile yayıncı güveni taklit edilmedi ve Windows korumaları değiştirilmedi. İmzalama için GatewayLabs'ın yetkili kod imzalama sertifikası veya onaylı imzalama hizmeti/erişimi gerekir. Bunlar sağlanınca imzalı iki EXE yeniden üretilmeli, Authenticode yayıncı/zincir/zaman damgası doğrulanmalı, hash'ler yenilenip aynı final-paket testleri tekrar çalıştırılmalıdır. İmza tek başına her cihazda SmartScreen uyarısız çalışmayı garanti etmez.

## Kalan kapsam

Bu teslim **yerel sentetik Windows yönetim demosu** olarak paketlendi ve doğrulandı. Tam “temiz bilgisayarda kurulum/kaldırma geçti” kabulü Sandbox sonucunu, imzalı dağıtım kabulü ise gerçek sertifikayı bekliyor. Linux engine kabulü [LINUX_DEMO.md](LINUX_DEMO.md) içindeki kapıdır. Kurumsal auth/yetkilendirme ve gerçek Apinizer/Elastic entegrasyonu eklenmedi. Ağda yayın veya kurum pilotu başlatılmadı.

## 0.2.0 ek doğrulaması

0.1.1 kayıtları tarihsel kanıttır. 0.2.0 için `READ_POST_DEMO.md` ve `RELEASE_0.2.0.md` sonuçları esas alınır. 56/56 kaynak testine ek olarak paketli self-test artık ayrı EXE istemcisiyle POST başarı/hatası, iki restart arasındaki metadata ve iki MCP listener kapanışını denetler. Kaynak testindeki Windows Electron positional argüman sorunu `--tool=name` / `--args=JSON` biçimiyle giderildi. Temiz Windows kurulum/kaldırma ve imzalama kapıları hâlâ açıktır; paket smoke testi bunların yerine geçmez.
