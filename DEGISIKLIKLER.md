# Değişiklik Günlüğü

Bu dosya, YorumPulse projesinde yapılan değişikliklerin özetidir.

## "BETA" etiketinin kaldırılması

Sidebar'daki BETA rozeti (`globals.css`'teki `::after` CSS kuralı), sayfa başlığı/meta açıklaması (`layout.tsx`), login sayfasındaki "YorumPulse Beta" yazısı ve hatırlatma mailindeki "YORUMPULSE BETA" ibaresi kaldırıldı. Hepsi "YorumPulse" oldu.

## Görsel sadeleştirme: mor→teal, gradient/font-black/emoji azaltma

Kullanıcı geri bildirimi: tasarım "AI yapımı gibi duruyor, aşırı bağırıyor". Marka rengi mor/indigo (89 ham Tailwind class'ı, aynı gradient buton/avatar/logo'da tekrarlanıyordu) tamamen kaldırılıp **teal**'e çevrildi — YouTube kırmızısı ve Facebook mavisiyle çakışmayan, sakin bir aksan rengi. Buton/avatar/logo/login sayfasındaki tüm gradientler düz renge indirgendi (avatar rozeti artık nötr slate-700/800). `font-black`, küçük rozet/tek harf gibi yerlerden `font-bold`/`font-semibold`'a düşürüldü, sadece sayfa başlıkları ve büyük istatistik sayılarında kaldı. Bildirim listesindeki tekrarlayan renkli-daire ikon süslemesi düz ikona çevrildi. Dashboard'daki dönen emoji selamlamalar ve hatırlatma mailindeki emoji'ler (ve mailin kalan mor tonları) kaldırıldı. Yan ürün: dashboard'daki kategori pasta grafiğinin ilk render'da "-1/-1" boyut hatası verip bozuk görünmesi de düzeltildi (GrowthChart'a daha önce uygulanan aynı fix). Gerçek admin oturumuyla hem light hem dark modda tüm sayfalar ekran görüntüsüyle doğrulandı, BETA rozetinin (font-weight seçici bağımlılığı vardı) hâlâ göründüğü teyit edildi.

## Site geneli pagination + tasarım/UX düzeltmeleri

Hiçbir sayfada pagination yoktu (Görevler ~5.757 satırı hiç limitsiz çekiyordu). Tüm liste sayfalarına numaralı sayfa pagination'ı eklendi (`?page=`, Görevler'de her kolon `?todoPage=`/`?progressPage=`/`?donePage=` ile bağımsız), Yorumlar'da platform artık gerçek server-side filtre. Ayrıca: mobilde çıkış yapılamıyordu (düzeltildi), işlevsiz arama kutusu kaldırıldı, oturumu düşen ama deaktive edilmiş kullanıcı 500 hatası alıyordu (düzeltildi, `redirect("/login")`), Facebook sayfasındaki sınırsız iç içe video sorgusu `_count`/`groupBy` ile değiştirildi, tüm route'lara `loading.tsx`/genel `error.tsx`/`not-found.tsx` eklendi, tekrarlanan bileşenler (`EmptyState`, `SegmentedControl`, `Modal`, `AvatarBadge`, `StatCard`, platform renk haritası) ortak hale getirildi, dark mode'da kontrastsız kalan rozetlere `dark:` varyantları eklendi, eksik `aria-label`'lar tamamlandı. Yeni "Ekip performansı" liderlik tablosu bölümü sadece ADMIN/MANAGER'a görünecek şekilde kısıtlandı (patron isteği). Gerçek admin/mobil/dark-mode oturumlarıyla headless Chrome'da uçtan uca doğrulandı.

## Önceki oturum — yorum linki ve worker dayanıklılığı (git geçmişi)

- **Facebook direkt-yorum linki, yorumcu profiline değil yoruma gidiyordu** — scraper ve `directCommentUrl()`, içinde `comment_id=` geçen her linki kabul ediyordu; ama yorumcunun profil linki de aynı takip parametresini taşıyabiliyordu. Artık yalnızca içerik URL'leri (video/watch/reel/post) kabul ediliyor, reddedilen bir profil linkinden `comment_id` kurtarılıp video URL'sine yeniden ekleniyor.
- **`comment_id` değeri base64 çözülmüyordu** — taranan profil linkleri `comment_id`'yi base64 token olarak taşıyordu (`comment:<postId>_<commentId>`), Facebook bunu parametre olarak kabul etmiyordu. Hem kayıtlı linkler render edilirken hem de scraper linki oluştururken artık sayısal id'ye çözülüyor.
- **Direkt-yorum linkleri `/reel/` formatına çevrildi** — Facebook, `/<sayfa>/videos/<id>?comment_id=...` linkini `watch` sayfasına yönlendirirken `comment_id` parametresini düşürüyordu. Facebook'un kendi yorum permalink formatı olan `/reel/<videoId>/?comment_id=<numericId>` kullanılınca parametre korunuyor ve yorum panelinde ilgili yoruma kayıyor (canlı tarayıcıda doğrulandı).
- **Scrape edilen Facebook yorumlarının tarihi yanlıştı** — scraper her yorumu tarama anının zaman damgasıyla kaydediyordu, bu da 7 günlük grafiği, 24 saatlik uyarı pencerelerini ve görev eşiklerini bozuyordu. Artık yorumun zaman linkindeki `aria-label`'dan tam tarih okunuyor (yaklaşık tarihlerde mevcut `publishedAt` değeri korunuyor, üzerine yazılmıyor).
- **Worker restart'tan sağ çıkamıyordu, kendi kuyruğunu boğuyordu** — SIGTERM/SIGINT yakalanmadığı için her durdurma iş ortasında kilit bırakıyordu; kilit kurtarma yalnızca açılışta ve 30 dakikalık eşikle çalıştığı için restart'lar bu kilitleri asla geri alamıyordu (65 iş RUNNING'de yetim kalmış, 22.932 iş PENDING'de birikmiş, hiçbir kanal bir aydır senkronlanmamıştı). Düzeltmeler: nazik kapanma, 30 sn kilit heartbeat'i, periyodik 3 dakikalık süpürme, terminal yazmalarda fencing token; video başına koşulsuz yorum job'ı üretimi yerine gerçek yorum sayısı karşılaştırması; tekli `FOR UPDATE SKIP LOCKED` claim sorgusu ve öncelik bantları; backlog devre kesicileri, iş saklama süresi, tarama zaman bütçesi ve `/api/jobs/health` + Ayarlar paneli.

## Bu oturum — worker'ı bu Mac'te çalışır hale getirme

### Ortam / kurulum
- `.env` dosyası baştan sona incelendi; `FACEBOOK_BROWSER_PATH` Windows yoluna ayarlıydı (`C:\Program Files\...`), bu Mac'te işe yaramazdı — boşaltıldı, kod artık Chrome'u otomatik buluyor.
- `SCHEDULER_ENABLED` `false`'tan `true`'ya çevrildi (bu Mac'teki worker tek/ana worker olduğu için).
- `node_modules` Windows'tan kopyalanmış haldeydi (`esbuild` win32-x64 binary'si, `.bin` dosyalarında çalıştırma izni yoktu) — silinip bu Mac (arm64) için yeniden kuruldu.
- `npm run worker:verify` ile worker'ın iş mantığı (retry, öncelik bantları, kota hesapları, SQL üretimi) test edildi, tüm testler geçti.

### Veritabanı bağlantı krizi
- Worker ilk çalıştırıldığında **prod sitede (Vercel) 500 hataları** başladı (`max clients reached in session mode - pool_size: 15`) — sebep, local worker'ın prod ile aynı Supabase session-mode pooler'ını (port 5432) paylaşması ve Prisma'nın varsayılan bağlantı havuzunun bunu doldurmasıydı.
- Worker hemen durduruldu, ardından `WORKER_DATABASE_URL` ayrı bir transaction-mode pooler'a (port 6543, `pgbouncer=true&connection_limit=8`) yönlendirilerek prod'un havuzundan tamamen izole edildi. Bu tasarım zaten `.env.example`'da öngörülmüştü.

### YouTube
- `YOUTUBE_API_KEY` Google Cloud Console'dan alınıp eklendi.
- Manuel olarak en eski senkronlanmış 50 kanal için `SYNC_CHANNEL` job'ı kuyruğa eklenip tarama başlatıldı (uygulamadaki "Ayarlar" sayfasının manuel senkron düğmesiyle aynı mantık, elle).
- Taramada **3 kanalda `playlistNotFound` (404)** hatası bulundu — bu kanalların kayıtlı YouTube UC/playlist bilgisi geçersiz/eski. Worker bunları `BENIGN` sınıflandırıp birkaç kez otomatik denedi, sonra `FAILED` yaptı; diğer kanalları etkilemedi. **Bu kanalların YouTube linki/UC'si düzeltilmeli (sonraya bırakıldı).**

### Yorum işleme darboğazı (teşhis edildi, kendiliğinden çözüldü)
- `WORKER_CONCURRENCY=2` düşük olduğu ve kod, kanal/video senkronunu ("kökler") her zaman yorum fan-out'unun önüne aldığı için, 50 kanallık toplu taramada tüm slotlar köklerle doldu, yorum çekme geçici olarak tamamen durdu.
- Ayrıca `MAX_PENDING_COMMENT_JOBS=2000` eşiği zaten aşılmış olduğu için (`comment_fanout_truncated` uyarıları) yeni videolar için ek yorum job'ı da üretilmiyordu.
- Kök iş yükü zamanla eridikçe (~20-25 dk) worker kendiliğinden yorum çekmeye geçti; müdahale gerekmedi.

### Facebook
- Test sırasında **Facebook oturum çerezlerinin ölü olduğu** ortaya çıktı — gerçek bir Chrome ile bu çerezlerle giriş denendiğinde hesap tanınıyor ("Furkan Kılıç, Devam") ama "Devam"a tıklayınca şifre ekranına düşüyordu, yani token'lar kalıcı oturumu tamamlayamıyordu.
- Tarayıcıdan taze çerezler (`c_user, datr, fr, presence, ps_l, ps_n, sb, wd, xs`) alınıp `.env`'e yazıldı; canlı testte tam giriş yaptığı doğrulandı (profil sayfasına düştü, şifre ekranı yok).
- Worker yeniden başlatılınca Facebook yorumlarının gerçekten çekildiği DB'den doğrulandı.

### AI analiz sağlayıcıları
- AI analizinin nerede/nasıl çalıştığı belgelendi: `src/lib/gemini.ts` → `analyzeComments()`, sağlayıcı sırası `AI_PROVIDER=AUTO` iken Groq → OpenRouter → Gemini, hepsi başarısız olursa yerel regex tabanlı `fallbackAnalysis()`'e düşüyor.
- Test sırasında **Groq'un günlük token kotası (100.000 TPD) dolduğu** görüldü — worker çökmedi, otomatik olarak fallback analiz'e geçti.
- **OpenRouter** key eklendi; `.env`'deki varsayılan model (`openai/gpt-4o-mini`) **ücretliydi**, önce ücretsiz `meta-llama/llama-3.3-70b-instruct:free` ile değiştirildi — ama bu model kısa süre sonra OpenRouter'ın ücretsiz katmanından kaldırıldı (404 "unavailable for free"). Yerine denenen `openai/gpt-oss-20b:free` bir "reasoning" modeliydi, görünmez iç muhakeme kodun sabit `max_tokens: 2000` sınırını yiyip JSON'ı yarıda kesiyordu. Birkaç ücretsiz model gerçek toplu-analiz isteğiyle test edildi; `nvidia/nemotron-nano-9b-v2:free` tam ve geçerli JSON döndürdü, şu an o kullanılıyor (yine de çok büyük — 40 yorumluk — gruplarda nadiren kesilme riski taşıyabilir, o durumda otomatik olarak yerel fallback analize düşer).
- **Gemini** key eklendi; `.env`'deki `gemini-2.5-flash` / `gemini-2.5-flash-lite` modellerinin Google tarafından **yeni key'lere kapatıldığı** tespit edildi (Ekim 2026'da tamamen kaldırılıyor). Bunun yerine her zaman güncel modele işaret eden `gemini-flash-latest` / `gemini-flash-lite-latest` alias'larına geçildi. Ardından worker'da sürekli 429 alındığı görüldü — sebep, `gemini-flash-latest`'in (şu an `gemini-3.6-flash`) free tier kotasının **günde sadece 20 istek** olması (Google'ın hata mesajındaki `QuotaFailure` detayından teşhis edildi). `gemini-flash-lite-latest` (`gemini-3.5-flash-lite`) çok daha geniş günlük kotaya sahip olduğu için birincil model yapıldı, `gemini-flash-latest` yedeğe alındı; gerçek istekle doğrulandı.
- OpenRouter'da JSON'ın yarıda kesilmesi sorunu koda `reasoning: {exclude: true}` eklenip `max_tokens` 2000'den 4000'e çıkarılarak düzeltildi (`src/lib/gemini.ts`, `generateOpenAiCompatible`). Küçük ücretsiz modelin talimatı tam uygulamaması (40 yorumdan bazılarını atlaması) kalıcı bir sınır, ama zaten kod her yorumu tek tek eşleyip provider'ın atladıklarını otomatik yerel fallback'e düşürüyor — yorum kaybı olmuyor, sadece o kısım AI yerine kural tabanlı analiz alıyor.
- Sonuç: Groq, OpenRouter, Gemini üçü de dolu ve hepsi ücretsiz katmanda (kredi kartı/faturalandırma yok, kota dolunca sadece hata verir, ücret kesmez).

## Ekip performansı (yorum liderlik tablosu) — patron isteği

- Dashboard'a "Ekip performansı — cevaplanan yorumlar" bölümü eklendi: hangi kullanıcının kaç yorumu "Yaptım" diye işaretlediğini (Comment.completed/completedById) gösteren, Bugün/Bu hafta/Bu ay/Tümü aralığında filtrelenebilen bir liderlik tablosu.
- Sistemde YouTube/Facebook'a gerçek yanıt gönderen bir özellik yok; "cevap verme" burada mevcut "Yaptım" işaretlemesi olarak tanımlandı (kullanıcıyla netleştirildi).
- Yeni dosyalar: `src/lib/dashboard-range.ts` (aralık hesaplama), `src/components/dashboard-range-picker.tsx` (URL tabanlı filtre seçici). `src/app/page.tsx` güncellendi. Şema değişikliği yok.
- Gerçek veriyle (admin JWT + headless Chrome) uçtan uca test edildi, ekran görüntüleriyle doğrulandı.

## Admin / Kullanıcı Yönetimi paneli (`/yonetim`)

Panelde kullanıcı yönetimi hiç yoktu: `/ekip` sayfası yalnızca MANAGER/EDITOR hesabı açıp kanal atıyordu, admin hesapları salt-okunur etiket listesi olarak duruyordu. Parola sıfırlama, rol değiştirme, ADMIN hesabı açma, hesap pasifleştirme/silme, ad-eposta düzeltme ve mükerrer hesap birleştirme yapılamıyordu. Somut tetikleyici: CEO için hesap açılacaktı, hesap zaten vardı ama parolası bilinmiyordu. İlginç şekilde parola sıfırlama API'si (`/api/users` `PATCH`, e-posta ile) aslında **vardı** ama hiçbir yerden çağrılmıyordu — sorun backend değil, arayüz eksikliğiydi.

**Veritabanındaki durum (canlı Supabase'den okundu):** 29 aktif hesap — 8 ADMIN (3'ü sistem/test: `admin@yorumpulse.local` 4097 görev oluşturmuş, `test@yorumpulse.local` 1495 görev, `yorumpulse-test@thebrownpig.org` boş), 3 MANAGER, 18 EDITOR. `src/lib/team-sync.ts` Excel'deki isimlerden `@yorumpulse.local` hesapları otomatik açtığı, sonra kurumsal hesaplar da eklendiği için **5 kişi ikiye bölünmüştü** ve verileri iki hesaba dağılmıştı: Alper (1 kanal+30 görev / 3 kanal+21 tamamlanan yorum+1173 okunan bildirim), Aslıhan (5 kanal+10 görev+2037 bildirim / boş), Görkem (3 kanal+265 görev / 1 kanal+24 görev, ayrıca "Görkem Büyük" MANAGER olarak üçüncü hesap), Melek (3 görev / 6 kanal+64 görev), Yağmur (boş / 3 kanal+20 görev).

### Eklenenler
- **`src/app/yonetim/page.tsx` + `loading.tsx`** — ADMIN'e özel yeni sayfa. Arama (`?q=`), rol ve durum filtresi, sayfalama (`PAGE_SIZE.ADMIN_USERS`). Özet kutuları: toplam hesap / aktif admin / pasif hesap.
- **`src/components/user-admin.tsx`** — `team-manager.tsx` ile aynı tasarım dili (`Modal`, `AvatarBadge`, `EmptyState`, `PaginationControls`, `sonner`). Modallar: hesap ekle (ADMIN rolü dahil), düzenle, parola sıfırla, birleştir, sil.
- **`src/lib/user-admin.ts`** — paylaşılan guard'lar ve birleştirme mantığı; rotalar ince kaldı.
- **`src/app/api/users/[id]/route.ts`** — `PATCH` (ad/e-posta/rol/aktiflik/parola, hepsi opsiyonel, tek transaction) ve `DELETE`. Çağrısız olan e-posta tabanlı eski `PATCH` (`/api/users`) kaldırıldı.
- **`src/app/api/users/merge/route.ts`** — `POST {sourceId, targetId}`.
- **`generatePassword()`** `src/lib/utils.ts`'e eklendi (Web Crypto, hem tarayıcıda hem Node'da çalışır) — modallarda "güçlü parola üret" + "kopyala" düğmeleri. Parola bir daha gösterilmiyor, kaydetmeden önce kopyalanması gerekiyor.
- Sol menüye "Kullanıcı Yönetimi" (`adminOnly`), `/ekip`'teki salt-okunur admin bloğuna da `/yonetim`'e giden buton eklendi — iki çakışan yönetim yüzeyi olmasın diye `/ekip` kanal atamasına odaklı bırakıldı.

### Şemadan gelen kısıtlar (tasarımı bunlar şekillendirdi)
- **`Task.createdById` zorunlu ilişki** (Prisma varsayılanı `Restrict`) → görev oluşturmuş hesap **silinemez**. `admin@yorumpulse.local` (4097) ve `test@yorumpulse.local` (1495) bu yüzden asla hard-delete edilemez. Silme denenirse 409 + "pasife alın veya birleştirin" mesajı dönüyor. Birleştirme de bu yüzden kaynağı silmiyor, **pasife alıyor**.
- **`Comment.completedById` ilişki değil, düz `String?` alanı** ve dashboard liderlik tablosu bunu `groupBy` ile okuyor (`src/app/page.tsx`). Birleştirme ve silme bu alanı elle güncelliyor, yoksa liderlik tablosu bozulurdu. Aynısı `AiSettings.updatedById` için.
- **`Channel.responsibleName` / `teamLeadName` denormalize string kopyalar** — id değişince isim alanı da güncelleniyor (`/api/users/[id]/channels` rotasındaki mevcut desen korundu). Kullanıcının adı düzenlenirse kanallardaki kopyalar da güncelleniyor.
- **`AlertRead` bileşik PK'lı** (`@@id([alertId, userId])`) — iki hesabın ortak okuduğu bildirim çakışıyor. Birleştirmede önce kaynaktaki çakışan satırlar ham SQL ile siliniyor, sonra kalanlar taşınıyor (`in` listesi 2000+ satıra çıkabildiği için Prisma yerine `$executeRaw`; sorgu planı `EXPLAIN` ile doğrulandı, indeks kullanıyor).
- **`getSession()` rolü ve `active` alanını her istekte DB'den okuduğu için** pasife alma ve rol değişikliği anında etkili — ekstra bir şey gerekmedi.

### Güvenlik kuralları
- Admin **kendi hesabının** rolünü/aktifliğini değiştiremiyor, kendini silemiyor/birleştiremiyor.
- **Son aktif ADMIN kilitli** — yetkisi düşürülemez, pasife alınamaz, silinemez, birleştirilemez. Kimse sistemi kilitleyemiyor.
- Rol değişince artık geçersiz kalan kanal bağı koparılıyor (MANAGER `teamLead`, EDITOR `responsible` ilişkisini kullanır; ADMIN'e kanal atanamadığı için ikisi de). Kaç bağın kopacağı modalda önceden uyarı olarak gösteriliyor.
- Birleştirmede kanal bağları **hedefin rolüne göre** taşınıyor, uymayan bağ koparılıyor; ikisi de önizlemede sayı olarak gösteriliyor.

### Doğrulama
`npm run typecheck` ve `npm run build` temiz. Canlı veriye karşı test edildi ama **gerçek hesaplara dokunulmadı**: iki tek kullanımlık `ZZ Test` hesabı, iki geçici kanal, iki görev ve çakışma senaryosu için bildirim okuma kaydı oluşturulup tüm akış denendi, sonra hepsi silindi (kullanıcı 29'a, kanal 143'e geri döndü, yetim referans kalmadığı sorgulandı). Doğrulananlar: parola sıfırlama → yeni parolayla giriş oluyor/eskisi reddediliyor; pasif hesap giriş yapamıyor; birleştirmede kanal taşındı + isim kopyası güncellendi, role uymayan bağ koparıldı, görevler taşındı, çakışan bildirim okuması silinip kalanlar taşındı (hedefte 4 değil 3 kayıt kaldı — bileşik PK çakışması doğru işlendi); EDITOR hesap `/yonetim`'e giremiyor (`NEXT_REDIRECT`, içerik sızmıyor, menüde link görünmüyor) ve tüm yazma uçlarından 403 alıyor; kendi rolünü düşürme/kendini pasife alma/kendini silme 400, görev oluşturmuş hesabı silme 409 dönüyor. Arayüz gerçek admin oturumuyla headless Chrome'da ekran görüntüleriyle doğrulandı (Serhat üzerinde "22 kanal bağı kaldırılacak" uyarısı görüldü ama **kaydedilmedi**, hesabı değişmedi).

## Mükerrer hesapların birleştirilmesi ve tespit kartının kaldırılması

`src/lib/team-sync.ts` Excel'deki isimlerden `@yorumpulse.local` hesapları otomatik açtığı, sonra aynı kişilere kurumsal hesaplar da eklendiği için 5 kişinin verisi iki hesaba bölünmüştü. Bu hesaplar kurumsal (`@wediacorp.com`) karşılıklarıyla birleştirildi; kaynak hesaplar sonrasında silindi. Toplam hesap sayısı 29'dan 24'e indi.

| Kaynak (silindi) | Hedef | Taşınan | Hedefin son hali |
| --- | --- | --- | --- |
| `alper@yorumpulse.local` | `alper.ozturk@wediacorp.com` | 1 kanal, 30 görev | 4 kanal, 30 görev, 21 yorum, 1173 bildirim |
| `aslihan@yorumpulse.local` | `aslihan.akay@wediacorp.com` | 5 kanal, 10 görev, 5 tamamlanan yorum, 2037 okunan bildirim | 5 kanal, 10 görev, 5 yorum, 2037 bildirim |
| `gorkem@yorumpulse.local` | `gorkem.durumlu@wediacorp.com` | 1 kanal, 265 görev | 4 kanal, 289 görev |
| `melek@yorumpulse.local` | `melek.erbas@wediacorp.com` | 3 görev | 6 kanal, 67 görev |
| `yagmur@yorumpulse.local` | `yagmur.arslan@wediacorp.com` | (hesap boştu) | 3 kanal, 20 görev |

**Görkem üç hesaplıydı** (`gorkem@yorumpulse.local`, `gorkem.durumlu@wediacorp.com` EDITOR, `gorkem.buyuk@wediacorp.com` MANAGER) ve 265 görev söz konusu olduğu için hedef veriyle doğrulandı: `.local` hesabı EDITOR ve "Pis Yedili Türkçe"nin sorumlusu, ekip lideri Can — tıpkı Durumlu gibi (o da EDITOR, ekip lideri Can, "Pis Yedili" sorumlusu). Büyük ise MANAGER, yani ekip lideri; farklı bir işlev. Durumlu'ya birleştirildi.

Birleştirme, panelden tıklamayla aynı kod yolundan (`mergeUsers`) çalıştırıldı. Beş çiftin hepsi EDITOR→EDITOR olduğu için hiçbir kanal bağı kopmadı. Öncesinde etkilenecek tüm satırların (5 kullanıcı, 7 kanal, 308 görev, 5 yorum, 2037 bildirim okuması) JSON yedeği alındı. Sonrasında yetim kanal bağı kalmadığı (`responsibleId` boş ama `responsibleName` dolu = 0) ve dashboard liderlik tablosunun (`completedById` groupBy) tutarlı olduğu doğrulandı.

**Not:** Script `src/lib/user-admin.ts`'i doğrudan import ettiği için `WORKER_DATABASE_URL` boşaltılarak çalıştırılmalı — `src/lib/prisma.ts` önce onu okuyor, o da pgbouncer transaction-mode pooler'ına (6543) işaret ediyor ve interaktif transaction'ları desteklemiyor. Vercel'deki web süreci bu değişkeni tanımlamadığı için zaten `DATABASE_URL` (session pooler, 5432) üzerinden çalışıyor.

Birleştirme tek seferlik bir temizlikti; panelde sürekli durmasına gerek kalmadığı için **"Olası mükerrer hesaplar" kartı kaldırıldı** (`user-admin.tsx`'teki bölüm ve `DuplicateGroup` tipi, `yonetim/page.tsx`'teki `duplicateGroups()`, `user-admin.ts`'teki `firstNameKey()`; `team-sync.ts`'te `slug()` tekrar module-private oldu). Satır bazlı "birleştir" işlemi panelde duruyor — ileride tekrar gerekirse elle kullanılabilir.

Birleştirilemeyen `.local` hesapları (kurumsal karşılıkları yok): `can@yorumpulse.local` (MANAGER, 37 kanalın lideri), `ali.ihsan.erman@yorumpulse.local`, ve iki sistem hesabı `admin@yorumpulse.local` / `test@yorumpulse.local`.

## Açık / sonraya bırakılan işler
- 3 kanalın bozuk YouTube UC/playlist bilgisi düzeltilmeli.
- Yorum backlog'u büyük (~20 bin+), `WORKER_CONCURRENCY=2` ile toplu taramalarda yorum işleme geçici olarak yavaşlıyor/duruyor — istenirse concurrency artırılabilir.
- `SMTP_*` ve `REMINDER_EMAILS` boş, hatırlatma maili özelliği şu an pasif.
- 3 sistem/test admin hesabı (`admin@yorumpulse.local`, `test@yorumpulse.local`, `yorumpulse-test@thebrownpig.org`) hâlâ aktif ve tam yetkili — gözden geçirilip pasife alınmalı.
- `can@yorumpulse.local` (MANAGER, 37 kanalın ekip lideri) ve `ali.ihsan.erman@yorumpulse.local` hâlâ `.local` adresinde — kurumsal hesapları açılıp birleştirilmeli ya da e-postaları panelden düzeltilmeli.
- **Parola değişince kullanıcının açık oturumu düşmüyor** (JWT 12 saat geçerli, token sürümü yok). Zorunlu çıkış için `User`'a `passwordChangedAt` eklenip `getSession()`'da JWT `iat` ile karşılaştırılması gerekir — şema migration'ı demek, kapsam dışı bırakıldı. Pratik geçici çözüm: hesabı pasife alıp tekrar aktifleştirmek oturumu anında düşürüyor (modalda not olarak yazılı).
