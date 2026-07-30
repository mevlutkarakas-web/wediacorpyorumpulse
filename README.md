# YorumPulse

YouTube ve Facebook kanallarındaki yorumları toplayan, AI ile sınıflandıran ve aksiyon
gerektirenleri ekibe atanabilir görevlere dönüştüren dahili panel.

İki süreçten oluşur:

| Süreç | Ne yapar | Nerede çalışır |
|---|---|---|
| **Web** (`next start`) | Panel, API, veri okuma | Vercel |
| **Worker** (`npm run worker`) | Senkronizasyon, tarama, AI analizi, e-posta | Vercel'de **çalışamaz** — ayrı bir makinede sürekli açık olmalı |

> Worker durduğunda panelde veri **eskimeye başlar ama hiçbir hata görünmez**.
> Bu yüzden `/api/jobs/health` ve Ayarlar sayfasındaki durum paneli var; kurulumu
> tamamlarken dış izlemeyi de ayarlayın (aşağıda).

---

## Worker kurulumu (yerel makine, macOS)

### 1. Ortam dosyası

```bash
cp .env.example .env
```

Worker için zorunlu minimum:

- `DATABASE_URL`, `DIRECT_URL` — Supabase bağlantısı
- `WORKER_DATABASE_URL` — aynı veritabanı, ama `?connection_limit=10&pool_timeout=30` ekli
  (Supabase pooler'ı/6543 kullanıyorsanız `&pgbouncer=true` de ekleyin).
  Havuz `WORKER_CONCURRENCY + 6` olacak şekilde boyutlandırılmalı; küçüğü `P2024`
  hatalarına ve işlerin boşuna FAILED'a düşmesine yol açar.
- `JWT_SECRET` ve `AI_SETTINGS_ENCRYPTION_KEY` — **web ile birebir aynı** olmalı,
  yoksa kayıtlı AI anahtarları çözülemez
- `YOUTUBE_API_KEY`
- En az bir AI sağlayıcı anahtarı (`GROQ_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY`)
- `FACEBOOK_SESSION_COOKIES` — Graph API token'ı yoksa tarama için gerekli
- `NEXT_PUBLIC_APP_URL`
- SMTP bloğu — hatırlatma e-postaları isteniyorsa

**`FACEBOOK_COMMENT_MIRROR_URL` boş kalsın.** Worker doğrudan veritabanına yazdığı için
mirror gereksiz bir çift yazma yolu ve eksik taramada yorumları kalıcı silebiliyor.

### 2. Şemayı uygula

```bash
npm ci
npx prisma db push
```

### 3. Tek seferlik kuyruk temizliği (yalnızca ilk kurulumda)

Eski kod bir birikim bıraktıysa (bekleyen iş sayısı binlerde), worker'ı başlatmadan
önce Supabase SQL Editor'de temizleyin:

```sql
-- Yetim kilitler
UPDATE "SyncJob" SET status='PENDING', "lockedAt"=NULL, "lockedBy"=NULL,
       "runAfter"=now(), "updatedAt"=now() WHERE status='RUNNING';

-- Bayat yaprak işler — 0 satır dönene kadar tekrarlayın
DELETE FROM "SyncJob" WHERE id IN (
  SELECT id FROM "SyncJob" WHERE status='PENDING'
     AND type IN ('SYNC_COMMENTS','SYNC_FACEBOOK_COMMENTS','ANALYZE_COMMENTS')
     AND "createdAt" < now() - interval '2 days' LIMIT 5000);

DELETE FROM "SyncJob" WHERE status='FAILED' AND "createdAt" < now() - interval '14 days';

VACUUM (ANALYZE) "SyncJob";   -- transaction dışında
```

Bunları silmek güvenli: `SYNC_COMMENTS` payload'ı yeniden üretilebilir (sonraki video
senkronu yorum sayısı değişmiş videoları yeniden kuyruğa alır) ve analiz bekleyen
yorumlar `analyzedAt IS NULL` üzerinden geri kazanılır. Kök işlere dokunulmaz.

### 4. Süpervizör altında başlat

```bash
npm i -g pm2
pm2 start "caffeinate -is npm run worker" --name yorumpulse-worker --max-memory-restart 1500M
pm2 save && pm2 startup      # makine yeniden başlayınca otomatik ayağa kalkar
pm2 logs yorumpulse-worker
```

- `caffeinate -is` macOS'un uykuya geçip worker'ı durdurmasını engeller.
  **Kapak kapanınca uyku yine devreye girer** — dizüstünde çalıştırıyorsanız kapağı açık tutun.
- `--max-memory-restart` Chromium sızıntısına karşı emniyet.
- `pm2 stop` SIGINT gönderir; worker uçuştaki işleri boşaltıp kilitlerini bırakır.

### 5. Dış izleme (atlamayın)

`/api/jobs/health` kimlik doğrulaması istemez ve yalnızca toplam sayılar döndürür.
Senkron bayatladığında, kuyruk tıkandığında veya yetim kilit oluştuğunda **HTTP 503** verir.

Ücretsiz bir uptime servisine (UptimeRobot, BetterStack) 5 dakikalık kontrol ekleyin:

```
https://<uygulama-adresi>/api/jobs/health
```

Worker nerede çalışırsa çalışsın işler, çünkü kontrol veritabanı tazeliğine bakar.

---

## İşleyiş

Worker bir veritabanı tabanlı kuyruk (`SyncJob`) işletir:

```
SYNC_CHANNEL ──▶ SYNC_VIDEOS ──▶ SYNC_COMMENTS ──▶ ANALYZE_COMMENTS
(kanal bilgisi)  (video listesi)  (yalnızca değişen  (40'lık paketler)
                                   videolar için)
```

Facebook tarafı aynı zinciri izler (`SYNC_FACEBOOK_*`).

Önemli davranışlar:

- **Öncelik** (`SyncJob.priority`, küçük önce): kökler 10, video listeleme 20,
  analiz 40, yorum fan-out 60. Analiz için ayrılan slot sayısı hem taban hem tavan
  olduğundan hiçbir sınıf diğerini açlığa mahkûm etmez.
- **Değişiklik kontrolü**: bir videonun yorumları yalnızca platformun bildirdiği yorum
  sayısı değiştiyse, video 48 saatten yeniyse veya son senkrondan 7 gün geçtiyse
  yeniden çekilir. Tur başına iş sayısını ~%98 azaltan şey bu.
- **Kota farkındalığı**: her turda kaç YouTube kanalının ziyaret edileceği günlük kota
  bütçesinden türetilir; kanallar `lastSyncedAt`'e göre en eskiden başlanarak seçilir.
  Kanal sayısı yüksekse etkin tazelik `SYNC_INTERVAL_MINUTES`'ten uzun olur.
- **Devre kesiciler**: bekleyen iş sayısı `MAX_PENDING_BACKLOG`'u aşarsa yeni tur
  planlanmaz; yorum fan-out'u `MAX_PENDING_COMMENT_JOBS` ile sınırlanır ve kırpma
  `comment_fanout_truncated` olarak loglanır.
- **Kilitler**: çalışan işler 30 saniyede bir heartbeat atar, 3 dakika sessiz kalan kilit
  süpürülür. Terminal yazmalarda `lockedBy` fencing token'ı kullanılır, böylece kirasını
  kaybetmiş bir worker yeni sahibin durumunu ezemez.

## Faydalı komutlar

```bash
npm run typecheck        # tsc
npm run worker:verify    # kuyruk/hata/kota mantığı testleri (veritabanı gerekmez)
npm run worker           # worker'ı önplanda çalıştır (geliştirme)
```

Kuyruk durumu:

```sql
SELECT status, count(*) FROM "SyncJob" GROUP BY 1;
SELECT max("lastSyncedAt") FROM "Channel";
SELECT * FROM "ApiQuotaUsage" WHERE day = current_date;
SELECT count(*) FROM "SyncJob"
 WHERE status='RUNNING' AND "lockedAt" < now() - interval '3 minutes';  -- 0 olmalı
```

İzlenecek log olayları: `periodic_sync_scheduled` (her turda gelmeli — gelmiyorsa worker
durmuş), `stale_locks_swept`, `periodic_sync_skipped_backlog`, `comment_fanout_truncated`,
`job_lock_lost`, `periodic_task_failed`.
