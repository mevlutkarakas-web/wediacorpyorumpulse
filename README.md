# YorumPulse Beta

> Beta sürüm: `0.1.0-beta.1`

YouTube ve Facebook kanal, video ve yorum operasyonlarını gerçek PostgreSQL verileriyle yöneten Next.js uygulaması.

## Yerel kurulum

1. `.env.example` dosyasını `.env` olarak kopyalayın ve gizli değerleri doldurun.
2. PostgreSQL'i başlatın: `docker compose up -d postgres`
3. Bağımlılıkları kurun: `npm install`
4. Şemayı uygulayın: `npm run db:push`
5. Uygulamayı başlatın: `npm run dev`
6. `http://localhost:3000/setup` adresinden ilk yönetici hesabınızı oluşturun.
7. Diğer kullanıcıları Ekip Yönetimi ekranından tek tek ekleyin.
8. YouTube/Facebook senkronizasyonu için ayrı terminalde worker'ı başlatın: `npm run worker`

Demo kullanıcı veya örnek iş verisi oluşturulmaz. Kanallar Excel'den, kullanıcılar arayüzden eklenir; videolar ve yorumlar platform senkronizasyonuyla alınır.

## Facebook kurulumu

Meta geliştirici uygulamanızdan yönettiğiniz sayfaları okuyabilen uzun ömürlü bir Page Access Token oluşturun. Token'ın en az `pages_show_list`, `pages_read_engagement` ve yorum içeriği için gereken sayfa izinlerine sahip olması gerekir.

`.env` içine aşağıdaki değerleri ekleyin:

```env
FACEBOOK_ACCESS_TOKEN="..."
FACEBOOK_GRAPH_API_VERSION="v24.0"
```

Graph API sürümü Meta uygulamanızın desteklediği sürüme göre değiştirilebilir. Excel aktarımı Facebook bağlantılarını otomatik tanır; worker sayfanın son 10 videosunu ve bu videoların yorumlarını senkronize eder.

API anahtarı verilmezse worker yüklü Chrome/Edge tarayıcısıyla public sayfaları okumayı dener. Facebook giriş ekranı gösterirse tarayıcınızdaki Facebook çerezlerini tek satırlık `name=value; name2=value2` biçiminde `FACEBOOK_SESSION_COOKIES` değişkenine ekleyin. Bu yöntem resmi API kadar kararlı değildir ve Facebook arayüzü değiştiğinde seçicilerin güncellenmesi gerekebilir.

## Excel aktarımı

Başlık satırı ilk 30 satır içinde otomatik bulunur. `Kanal` alanı zorunludur. Aynı YouTube veya Facebook bağlantısı yeniden yüklenirse mevcut kayıt güncellenir.

## Güvenlik

`.env` dosyasını repoya eklemeyin. `JWT_SECRET` ve `CRON_SECRET` için benzersiz rastgele değerler kullanın. API anahtarlarını yalnızca `.env` içinde saklayın.

## GitHub ve Vercel

- `.env`, Facebook oturum çerezleri, API anahtarları, loglar ve yerel veritabanları Git'e eklenmez.
- Vercel projesinde `DATABASE_URL`, `JWT_SECRET`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET` ve `NEXT_PUBLIC_APP_URL` değişkenlerini proje ayarlarından tanımlayın.
- Üretimde yerel Docker PostgreSQL yerine Neon, Supabase, Vercel Postgres veya benzeri yönetilen PostgreSQL kullanın. İlk kurulumda üretim `DATABASE_URL` değeriyle `npx prisma db push` çalıştırın.
- Vercel sürekli çalışan `npm run worker` sürecini barındırmaz. Worker'ı Railway, Render, Fly.io veya bir VPS üzerinde ayrı servis olarak çalıştırın.
- API'siz Facebook taraması Chrome ve kalıcı worker gerektirir; `FACEBOOK_SESSION_COOKIES` yalnızca worker servisinin gizli ortam değişkenlerinde tutulmalıdır.
