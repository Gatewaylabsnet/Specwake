# Specwake 0.1.1 — Windows demo kurulumu

Bu paket yerel, sentetik API/MCP yönetim demosudur. Gerçek Apinizer bağlantısı, kurumsal kullanıcı kimliği veya yetkilendirmesi sağlamaz. Panel ve MCP hizmeti yalnız bilgisayarın loopback adresinden erişilir.

## Gerekenler

- Windows x64, kullanıcı hesabınızın yazabildiği bir klasör.
- Specwake uygulaması ve içindeki bağımsız HTTP MCP demo istemcisi için **Node.js, npm, kaynak kodu veya internet gerekmez**.
- Uygulamanın dışa aktardığı bağımsız **stdio sunucu ZIP'ini** başka yerde çalıştırmak farklı bir kullanım biçimidir: Node.js 24+ ve ilk npm kurulumu gerekir. Bu gereksinim EXE içindeki demo istemcisine ait değildir.
- Paketler bu teslimde imzasızdır. SmartScreen/kurum cihaz politikası açılışı engelleyebilir. Engeli otomatik aşan veya korumaları kapatan bir yöntem sağlanmaz; kurum yöneticisinin onaylı dağıtım politikası gerekir.

## İki kullanım seçeneği

**Portable:** `Specwake-0.1.1-Portable-x64.exe` dosyasını yerel bir klasöre kopyalayıp açın. Kurulum gerekmez. Uygulama kullanıcı verisini kullanıcı profilinde saklar; dosya tamamen iz bırakmadan çalışan bir veri taşıma biçimi değildir.

**Kurulum:** `Specwake-0.1.1-Setup-x64.exe` dosyasını açın. Kullanıcıya özel kurulumdur, yönetici yükseltmesi istemez. Kurulum konumu ve kısayollar sihirbazdan seçilir. Sonrasında Specwake kısayolunu açın. Kurulumu kaldırmak için Windows'un Yüklü Uygulamalar ekranından Specwake'i seçin. Kaldırmanın kişisel demo verisini sileceğini varsaymayın; veri yönetimi ayrı değerlendirilmelidir.

İki seçenek aynı uygulamadır; aynı anda iki ayrı kurulumdan çalıştırmayın. Uygulama açıldığında yönetim paneli gelir. Önceki bağımsız stdio oluşturucuya sol menüdeki **Bağımsız sunucu oluşturucu** bağlantısından erişilir.

## Beş dakikalık ilk demo

1. **API grupları & araçlar → Demo API ekle** kullanın. `/services`, `/summary`, `/simulate/error`, `/simulate/slow` GET'lerini seçin. POST ve `/services/{id}` seçili olmasın. Hiçbir işlem kendiliğinden seçilmez.
2. **Seçimi kaydet → Hizmeti başlat** kullanın. Gerçek SDK sağlık kontrolünden sonra hizmet çalışıyor görünür.
3. **MCP hizmeti** ekranında **Başarı, hata ve gecikme demosunu ayrı istemciyle çalıştır** bölümünü açın. **Tam demo komutunu kopyala** düğmesine basın.
4. Windows PowerShell'i açıp komutu yapıştırın. Komut mevcut EXE'yi ayrı bir istemci sürecinde çalıştırır; global Node/npm gerekmez. Terminal açık kalır ve JSON raporu görünür. Listeleme için üstteki **İstemci komutunu kopyala** seçeneği kullanılabilir. Komutun sonuna elle ek yapmak yerine hazırlanmış tam demo komutunu kullanın.
5. **Genel bakış → Görünümü yenile**: boş veri dizininde beş deneme ve iki hata (%40) beklenir. Bunlardan biri kontrollü 503, diğeri seçilmeyen araç reddidir. Gecikmeli araç yaklaşık 1,6 saniye bekler. Önceki kayıtlar varsa toplam farklıdır; filtre kullanın, veriyi silmeyin.
6. Çağrı zamanına tıklayıp güvenli metadata ayrıntısını ve korelasyon kimliğini inceleyin. Yerel istemci etiketi doğrulanmış kullanıcı değildir. **MCP hizmeti → Durdur** portu kapatır. Pencereyi kapatmak uygulamanın kendi yerel sunucularını da kapatır.

Portable EXE kendi dosyalarını geçici bir yere açabilir. Panelin ürettiği istemci komutunu yalnız uygulama açıkken kullanın; uygulama/hizmet yeniden açıldığında adresi ve komutu tekrar kopyalayın. Komutu kaynak koddaki sabit bir portla değiştirmeyin.

## Kayıtlar ve sorun çözme

Metadata kullanıcı profili altındaki Electron uygulama-verisi klasörünün `demo-data` dizinindedir. En çok 7 gün / 5.000 olay saklanır; gövde/header/argüman/credential kaydı tutulmaz. Uygulama yeniden açıldığında kayıtlar korunur; gruplar/seçimler tekrar eklenir ve hizmet durmuş başlar.

- Başlat düğmesi kapalıysa API kataloğunda GET seçimini tekrar gözden geçirip kaydedin. Tarayıcı/sayfa yenilemesi izinleri kendiliğinden geri yüklemez.
- Kopyalama engellenirse ekrandaki görünür komutu seçerek kopyalayın.
- İstemci bağlanamıyorsa hizmetin çalıştığını, güncel komutu kullandığınızı ve aynı bilgisayarda olduğunuzu kontrol edin.
- Kayıt dizini kilitliyse başka Specwake süreci olup olmadığını kontrol edin. Var olan süreci veya veri dosyasını otomatik silmeyin. Zorla kapanış sonrası kalan `writer.lock` ancak hiçbir süreç dizini kullanmıyorsa operatörce değerlendirilir.
- SHA-256 doğrulaması için `Get-FileHash .\Specwake-0.1.1-Portable-x64.exe -Algorithm SHA256` sonucunu aynı teslimdeki `SHA256SUMS-0.1.1.txt` ile karşılaştırın. Checksum, yayıncı imzasının yerine geçmez.

Temiz Windows kurulum/kaldırma testi için `WINDOWS_DELIVERY_VERIFICATION.md` içindeki ayrı Sandbox kabul kapısı esas alınır. Mevcut geliştirme bilgisayarındaki paket testleri temiz Windows kurulumunun yapıldığı anlamına gelmez.
