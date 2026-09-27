import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'Temel bilgiler',
    title: 'Dosya biçimi aslında nedir',
    summary: 'Dosya adının sonundaki uzantı ve dosyanın içinde gerçekte ne olduğu.',
    body: `Dosya biçimi, bir programın bilgiyi geri okuyabilmesi için üzerinde anlaşılmış bir düzenleme şeklidir. Bir JPEG fotoğraf, bir WAV kaydı ve bir Word belgesi yalnızca uzun bayt dizileridir; biçim, hangi baytın ne anlama geldiğini söyleyen kurallar bütünüdür.

## Uzantı yalnızca bir etikettir

Dosya adında noktadan sonra gelen .jpg veya .mp3 gibi harflere uzantı denir. Cihazınız, dosyayı hangi programın açması gerektiğini tahmin etmek için bunları kullanır. Ancak uzantı dışarıya yapıştırılmış bir etiketten ibarettir. Gerçek biçimi, içeriğin nasıl düzenlendiği belirler.

Bu yüzden bir dosyanın adını değiştirmek onu dönüştürmez. foto.png dosyasının adını foto.jpg yaparsanız elinizde hâlâ bir PNG vardır, yalnızca adı yanıltıcıdır. Bazı programlar içeriğe baktıkları için yine de açar, bazıları reddeder. Dönüştürmek, dosyayı gerçekten okuyup bilgiyi farklı bir düzenle yeniden yazmak demektir.

## Kapsayıcılar ve içlerindekiler

Video ve ses ikinci bir katman ekler. MP4 veya MOV gibi bir video dosyası bir **kapsayıcıdır**: bir görüntü izini, bir ses izini ve bazı zamanlama bilgilerini barındıran bir kutu. İçerideki görüntü ve ses bir **codec** ile, yani bir sıkıştırma yöntemiyle saklanır; örneğin video için H.264, ses için AAC.

Dolayısıyla iki dosyanın ikisi de .mp4 ile bitip farklı codec'ler içerebilir, farklı uzantılı iki dosya da tamamen aynı codec'i içerebilir. Bir video oynatılmadığında ya da bir dönüştürücü onu kabul etmediğinde, neden çoğu zaman dosyanın bütünü değil, kapsayıcı veya codec'tir.

## Neden bu kadar çok biçim var

Biçimler farklı işler için tasarlanır. Bazıları her ayrıntıyı korur, bazıları daha küçük bir dosya için ayrıntıdan vazgeçer, bazıları saydamlığı veya animasyonu destekler, bazıları da yalnızca belirli bir cihazın ya da programın seçtiği biçimdir. Dönüştürücü, içeriğinizi bulunduğu biçimden ihtiyaç duyduğunuz biçime taşımak için vardır.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'Temel bilgiler',
    title: 'Bazı dönüştürmeler neden kalite kaybettirir ya da yapılamaz',
    summary: 'Yolda neyin kaybolduğu ve neden her zaman geri gelmediği.',
    body: `Bir dosyayı dönüştürmek, suyu bir bardaktan diğerine boşaltmaya benzemez. Her biçim bazı şeyleri tutabilir, bazılarını tutamaz ve bir dönüştürme yalnızca iki biçimin de anladığı şeyleri taşıyabilir.

## Kayıplı biçimler ayrıntı atar

JPEG, WebP, MP3, AAC ve H.264 video gibi biçimler, pek fark etmeyeceğiniz ayrıntıları atarak dosyaları küçültür. Bir dosya bu biçimlerden birinde her yazıldığında biraz daha kayıp olur. İki kayıplı biçim arasında dönüştürmek ya da aynı biçimde yeniden kaydetmek her seferinde biraz kaliteye mal olur.

Üstelik bu geri alınamaz. Bir MP3'ü WAV veya FLAC gibi kayıpsız bir biçime dönüştürmek çok daha büyük bir dosya verir, ancak MP3'ün daha önce attığı şeyi geri getirmez. Yalnızca kalanı korur.

## Eksik özellikler

Bazen hedef biçimde, orijinalde bulunan bir şeye yer yoktur:

- **Saydamlık.** JPEG saydam alanları saklayamaz, bu yüzden bu alanlar beyazla doldurulur.
- **Animasyon.** PNG, JPEG, WebP ve AVIF burada hareketsiz resim olarak yazılır; bu nedenle bunlardan birine dönüştürülen hareketli bir GIF yalnızca ilk karesini korur.
- **Renkler.** Bir GIF, kare başına en fazla 256 renk tutabilir; bu yüzden fotoğraflar ve yumuşak geçişler daha kaba görünür.
- **Ses.** GIF'in ses izi yoktur; dolayısıyla GIF'e dönüştürülen bir video sessizdir.
- **Sayfa düzeni.** PDF'ye dönüştürülen bir belge, içeriğinden yeniden dizilir. Yazı tipleri, sütunlar, üst ve alt bilgiler, metin kutuları ve serbest konumlu şekiller korunmaz.

Universal Converter bu kayıpları sonradan fark etmenize bırakmak yerine dosyanın satırında ya da panelde size bildirir.

## Yapılamayan dönüştürmeler

Bazı dosyalar burada hiç dönüştürülemez; genellikle bunları okumak çok farklı türde bir program gerektireceği için. Birkaç örnek: bu uygulamanın açamadığı kapsayıcıları kullanan MKV, AVI ve WMV videoları; Excel ve PowerPoint dosyaları; ve bu uygulamanın yalnızca yazdığı PDF'ler. Her durumda dosya, nedenini ve varsa bunun yerine ne yapılabileceğini açıklayan bir cümleyle geri çevrilir.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Nasıl çalışır',
    title: 'Universal Converter neleri dönüştürebilir',
    summary: 'Sekmeler, kabul ettikleri biçimler ve ürettikleri.',
    body: `Universal Converter'ın beş sekmesi vardır. **All** (tümü) her şeyi kabul eder ve her dosyayı sizin yerinize doğru sekmeye yerleştirir. Diğer dördü ise her biri bir dosya türüyle ilgilenir.

## Audio (ses)

- **Girdi:** WAV, MP3, M4A ve AAC, FLAC, OGG, Opus, AIFF ve WebM ses.
- **Çıktı:** MP3, M4A, Opus, FLAC, WAV ve AIFF. M4A ve Opus, tarayıcınızın desteğine bağlıdır.
- Kırpabilir, örnekleme hızını değiştirebilir, mono'ya çevirebilir ve ses düzeyini eşitleyebilirsiniz. Başlık ve sanatçı gibi bilgiler MP3 ve Opus dosyalarına kopyalanabilir.
- Yalnızca sesini almak için bir videoyu buraya bırakın.

## Images (resimler)

- **Girdi:** PNG, JPEG, iPhone'dan HEIC ve HEIF, WebP, GIF, BMP, AVIF ve SVG.
- **Çıktı:** WebP, JPEG, PNG, tarayıcınız yazabiliyorsa AVIF ve GIF.
- Boyutlandırabilir ve kaliteyi ayarlayabilirsiniz. Her satır, dönüştürmeden önce yeni boyutun bir tahminini gösterir. GIF'e dönüştürülen hareketli bir GIF hareketli kalır.

## Video

- **Girdi:** MP4, M4V ve MOV.
- **Çıktı:** H.264 video ve AAC sesli MP4 ya da hareketli bir GIF.
- Kırpabilir, boyutlandırabilir ve kaliteyi ayarlayabilirsiniz. Kırpmalar en yakın anahtar kareden başlar; anahtar kare, çevresindeki karelerin dayandığı tam bir görüntüdür. Bu yüzden bir kesim, seçtiğiniz noktadan biraz önce başlayabilir.
- MP4 çıktısı için Chrome, Edge ya da Safari 16.4 ve sonrası gibi yerleşik H.264 video kodlayıcısı olan bir tarayıcı gerekir.

## Files (belgeler)

- **Girdi:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV ve JSON.
- **Çıktı:** PDF, düz metin, HTML ve Markdown. CSV ve JSON yalnızca dosyada zaten satır ve sütunlar olduğunda, örneğin bir CSV veya JSON dosyasında sunulur.

## Diğer dışa aktarımlar

Bazı işler bir dosya türünü başka bir türe dönüştürür ve her biri başlamadan önce neyden vazgeçtiğini söyler:

- **Save as one PDF.** Kuyruktaki her resim bir sayfa olur. Saydamlık beyazla doldurulur ve seçilebilir metin olmaz.
- **Save the sound only.** Bir videonun ses izini MP3, M4A veya WAV olarak çıkarır.
- **Join into one PDF.** Kuyruktaki tüm belgeler, her biri yeni bir sayfada başlayacak şekilde tek dosyada.`,
  },
  {
    id: 'converting-documents',
    group: 'Nasıl çalışır',
    title: 'Belgeleri dönüştürme',
    summary: "Word'den ve diğer dosyalardan neyin aktarıldığı, neyin aktarılmadığı.",
    body: `Files sekmesi bir belgeyi okur, yapısını çıkarır ve bu yapıyı seçtiğiniz biçimde yeniden yazar. Her sayfanın fotoğrafını çekmez. Sonuçta gerçek, seçilebilir metin olmasının nedeni budur; ancak orijinalle birebir aynı görünmemesinin nedeni de budur.

## Aktarılanlar

Bir Word belgesinden (DOCX) dönüştürücü şunları korur:

- başlıklar ve paragraflar
- iç içe olanlar dahil madde işaretli ve numaralı listeler
- tablolar
- kalın, italik ve altı çizili metin
- bağlantılar
- metnin içine yerleştirilmiş resimler
- kendi eklediğiniz sayfa sonları

OpenDocument (ODT) ve RTF dosyaları da benzer şekilde aktarılır.

## Aktarılmayanlar

- **Sayfanın tam görünümü.** Belge yeniden dizildiği için yazı tipleri, sütunlar ve boşluklar farklı olur.
- **Üst bilgiler, alt bilgiler, dipnotlar ve yorumlar.** Bunlar dışarıda bırakılır; grafikler, metin kutuları ve sayfada serbestçe konumlandırılmış her şey de öyle. Dosyada bunlar varsa satırda belirtilir.
- **Eski Word dosyaları (DOC).** Yalnızca metin, biçimlendirme olmadan aktarılır. Değişiklikleri izle açıkken silinen metin yine görünebilir, çünkü eski biçim bu metni geri kalanıyla birlikte saklar.

## Başka alfabelerdeki harfler

PDF'ler, her PDF okuyucusunda zaten bulunan standart yazı tipleriyle yazılır. Bunlar Latin alfabelerini kapsar. Yunanca, Kiril ve İbranice için uygulama, bir belge ilk kez ihtiyaç duyduğunda ek bir yazı tipi indirir ve sonraki kullanımlar için saklar. Çince, Japonca, Korece ve Arapça henüz yazılamaz. Yazılamayan karakterler satırda listelenir; böylece tam olarak neyin eksik olduğunu bilirsiniz.

## Birkaç ipucu

- Bir elektronik tabloyu önce CSV olarak kaydedin ve onu dönüştürün.
- Bir sunuyu, onu oluşturan programdan PDF olarak dışa aktarın.
- Bir PDF'yi düzenlemek, bölmek veya imzalamak için Universal PDF'yi kullanın. Bu uygulama PDF yazar ama okumaz.
- Birkaç belgeyi kuyruğa ekleyin ve tek bir dosyada birleştirmek için **Join into one PDF** seçeneğini kullanın.`,
  },
  {
    id: 'converting-folders',
    group: 'Nasıl çalışır',
    title: 'Klasörlerin tamamını dönüştürme',
    summary: 'Bir klasörü bırakın, aynı düzende tek bir ZIP olarak geri alın.',
    body: `Dosyaları tek tek seçmek yerine Universal Converter'a bir klasörün tamamını verebilirsiniz. Dönüştürülebilen her şey dönüştürülür ve sonuçlar başladığınız klasör yapısıyla geri gelir.

## Klasör ekleme

1. Klasörü dairenin üzerine sürükleyin. Bilgisayarda dairenin altındaki **or choose a folder** (ya da bir klasör seçin) seçeneğini de kullanabilirsiniz. Telefonlar yalnızca tek tek dosya seçmeye izin verdiği için bu seçenek orada görünmez.
2. Uygulama klasörün ve tüm alt klasörlerin içine bakar ve her dosyayı doğru sekmeye yerleştirir: resimler, ses, video veya belgeler.
3. Her sekmede ayarlarınızı seçin ve her zamanki gibi dönüştürün.

## Dönüştürülemeyen dosyalara ne olur

Bir klasör "burada ne dönüştürülebiliyorsa onu dönüştür" olarak anlaşılır. Uygulamanın okuyabildiği bir resim, ses, video veya belge olmayan dosyalar atlanır. Uzun bir ad listesi yerine kaç dosyanın atlandığını görürsünüz. Bunlar yalnızca sonuca dahil edilmez; orijinallere hiçbir şey olmaz.

## Sonuçları geri alma

Dönüştürülmüş birden fazla dosyayı birlikte indirdiğinizde tek bir ZIP dosyası olarak gelirler:

- Dönüştürülen her dosya, klasör ağacında orijinaliyle aynı yerde durur. Örneğin JPEG'e dönüştürdüyseniz Tatil/Gün 1/IMG_0001.heic, Tatil/Gün 1/IMG_0001.jpg olarak geri gelir.
- Her şey tek bir klasörden geldiyse ZIP o klasörün adını taşır.
- İki dosya aynı adı alacaksa, örneğin foto.png ve foto.heic ikisi de foto.jpg olacaksa, ikincisi foto (2).jpg gibi numaralandırılır; böylece hiçbiri diğerinin üzerine yazılmaz.
- Bir klasörde birden çok dosya türü varsa sonuçlar birkaç sekmeye dağılır. Bu durumda bir düğme, tüm sekmelerdeki her şeyi tek bir ZIP olarak indirmenizi sağlar.

ZIP yalnızca dosyaları bir araya getirir. Dönüştürülmüş dosyaların çoğu zaten sıkıştırılmış olduğundan onları daha fazla sıkıştırmaz.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Gizlilik ve güvenlik',
    title: 'Dosyalarınız cihazınızda kalır',
    summary: 'Bir sunucuya ne gönderilir ve ne asla gönderilmez.',
    body: `Universal Converter tüm dönüştürmeleri kendi cihazınızda yapar. Dosyalarınız dönüştürülmek için asla yüklenmez.

## İş nerede yapılır

Bir dosya eklediğinizde, cihazınızda çalışan uygulama onu okur ve yeni sürümü yazar. Resimler tarayıcınızın kendi resim araçlarıyla dönüştürülür. Video, tarayıcınızın yerleşik video kod çözücüsünü ve kodlayıcısını kullanır. Ses, tarayıcınız tarafından çözülür ve uygulamanın içinde çalışan kodlayıcılarla yazılır. Belgeler uygulamanın kendisi tarafından okunur ve dizilir. Burada bir HTML dosyası açmak, içindeki komut dosyalarının hiçbirini çalıştırmaz.

Sonuçlar doğrudan cihazınıza kaydedilir. Dosyalarınız yalnızca uygulama açıkken bellekte tutulur, uygulama tarafından saklanmaz ve uygulamayı kapattığınızda silinir. Hiçbir şey yüklenmediği için boyut sınırı ya da günlük kota yoktur; tek sınır cihazınızın belleğidir.

## Uygulamanın indirdikleri

Uygulamanın bazı bölümleri büyüktür ve yalnızca ara sıra gerekir; bu yüzden ilk ihtiyaç duyduğunuzda kendi sitemizden indirilir ve sonraki kullanımlar için saklanır: FLAC kodlayıcısı, iPhone HEIC fotoğrafları için kod çözücü ve Yunanca, Kiril ve İbranice belgeler için ek yazı tipi. Bunlar program kodu indirmeleridir. Bunları almak için dosyalarınız hakkında hiçbir şey gönderilmez.

## Uygulamanın gönderdikleri

- **Oturum açma**, eğer siz isterseniz. Uygulamadaki hiçbir şey hesap gerektirmez.
- Oturum açtığınızda, Universal ID etkinliğinizin doğru olması için **"uygulama açıldı" bildirimi**. Dosyalarınız hakkında hiçbir şey içermez.
- Uygulama açık ve ekrandayken her 45 saniyede bir **"uygulama kullanımda" sinyali**. Uygulamanın adını, cihazınızda oluşturulan rastgele bir kimliği ve oturum açtıysanız hesabınızı içerir. Uygulamayı kaç kişinin kullandığını göstermek için kullanılır.
- **Güncellemelerin denetlenmesi** ve yenilikler listesinin alınması.

Reklam ya da üçüncü taraf izleme yoktur.

## Kendiniz doğrulayın

İnternet bağlantınızı kapatın ve bir şey dönüştürün. Daha önce hiç kullanmadığınız, yukarıda sözü edilen ara sıra gereken bölümler dışında yine çalışır. Uygulama ayrıca açık kaynaklıdır; herkes tam olarak ne yaptığını okuyabilir.`,
  },
]

export default articles
