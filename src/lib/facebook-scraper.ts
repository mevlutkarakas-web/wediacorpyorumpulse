import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import type { FacebookComment, FacebookVideo } from "./facebook";
import { logger } from "./logger";

const chromePaths = [
  process.env.FACEBOOK_BROWSER_PATH,
  // macOS (worker şu an yerel bir Mac'te çalışıyor)
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  // Linux / konteyner
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter((path): path is string => Boolean(path));

/** Bir taramanın toplam süre bütçesi. Eski kod 1000 iterasyona kadar dönüyordu (3-50 dk, öngörülemez). */
export const SCRAPE_BUDGET_MS = Math.max(
  60_000,
  Number(process.env.FACEBOOK_SCRAPE_BUDGET_MS || 900_000),
);

let browserPromise: Promise<Browser> | undefined;

function browser() {
  browserPromise ||= chromium.launch({
    executablePath: chromePaths.find(existsSync),
    headless: process.env.FACEBOOK_BROWSER_HEADLESS !== "false",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      // Konteynerde root olarak çalışırken Chromium sandbox olmadan başlamaz.
      ...(process.env.FACEBOOK_BROWSER_NO_SANDBOX === "true" ? ["--no-sandbox"] : []),
    ],
  });
  return browserPromise;
}

/** Kapanışta çağrılır: tarayıcı süreci ve alt Chromium'ları bırakılır. */
export async function closeFacebookBrowser() {
  const pending = browserPromise;
  browserPromise = undefined;
  if (!pending) return;
  const instance = await pending.catch(() => undefined);
  await instance?.close().catch(() => undefined);
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

const turkishMonths: Record<string, number> = {
  ocak: 0,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  ağustos: 7,
  eylül: 8,
  ekim: 9,
  kasım: 10,
  aralık: 11,
};

const relativeUnitMs: Record<string, number> = {
  sn: 1_000,
  s: 1_000,
  dk: 60_000,
  m: 60_000,
  sa: 3_600_000,
  g: 86_400_000,
  d: 86_400_000,
  // Türkçe arayüzde "h" hafta demektir ("5 h" ≈ 5 hafta); tarayıcı tr-TR açıldığı için hafta sayılır.
  h: 604_800_000,
  hf: 604_800_000,
  w: 604_800_000,
  ay: 2_592_000_000,
  y: 31_536_000_000,
};

// Zaman damgası linkinin aria-label'ından ("23 Haziran 2026 Salı, 08:45") kesin tarih,
// olmazsa görünür göreli değerden ("5 sa", "3 g") yaklaşık tarih üretir.
function parseScrapedTimestamp(
  label: string,
  lines: string[],
): { date: Date; exact: boolean } | null {
  const normalized = label.toLocaleLowerCase("tr-TR");
  const absolute = normalized.match(
    /(\d{1,2})\s+([a-zçğıiöşü]+)\s+(\d{4})(?:\D+?(\d{1,2})[:.](\d{2}))?/,
  );
  if (absolute) {
    const month = turkishMonths[absolute[2]];
    if (month !== undefined) {
      const date = new Date(
        Number(absolute[3]),
        month,
        Number(absolute[1]),
        Number(absolute[4] ?? 12),
        Number(absolute[5] ?? 0),
      );
      if (!Number.isNaN(date.getTime())) return { date, exact: true };
    }
  }
  for (const line of lines) {
    const relative = line.trim().match(/^(\d+)\s?(sn|dk|sa|hf|ay|[gshmdwy])$/i);
    if (!relative) continue;
    const ms = relativeUnitMs[relative[2].toLocaleLowerCase("tr-TR")];
    if (ms) return { date: new Date(Date.now() - Number(relative[1]) * ms), exact: false };
  }
  return null;
}

// Profil linklerindeki base64 comment_id ("comment:<postId>_<yorumId>") sayısal kimliğe çözülür.
function decodeTrackedCommentId(value: string) {
  if (!value) return null;
  if (/^\d+(_\d+)*$/.test(value)) return value.split("_").at(-1) || null;
  try {
    const decoded = atob(decodeURIComponent(value));
    if (decoded.startsWith("comment:")) return decoded.match(/(\d+)$/)?.[1] || null;
  } catch {}
  return null;
}

async function context() {
  const instance = await browser();
  const result = await instance.newContext({
    locale: "tr-TR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1000 },
  });
  const rawCookies = process.env.FACEBOOK_SESSION_COOKIES?.trim();
  if (rawCookies) {
    const cookies = rawCookies
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return {
          name: item.slice(0, separator),
          value: item.slice(separator + 1),
          domain: ".facebook.com",
          path: "/",
          secure: true,
        };
      })
      .filter((cookie) => cookie.name && cookie.value);
    if (cookies.length) await result.addCookies(cookies);
  }
  return result;
}

async function prepare(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  for (const label of [
    "Allow all cookies",
    "Tüm çerezlere izin ver",
    "Only allow essential cookies",
    "Yalnızca gerekli çerezlere izin ver",
  ]) {
    const button = page.getByRole("button", { name: label, exact: false });
    if (await button.count()) {
      await button
        .first()
        .click()
        .catch(() => undefined);
      break;
    }
  }
}

export async function scrapeFacebookVideos(
  pageUrl: string,
): Promise<{ data: FacebookVideo[] }> {
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    const parsedPageUrl = new URL(pageUrl);
    const profileId = parsedPageUrl.searchParams.get("id");
    const target = profileId
      ? `https://www.facebook.com/${profileId}/videos`
      : pageUrl.replace(/[#/]$/, "") + "/videos";
    await prepare(page, target);
    const collectedLinks = new Map<
      string,
      { href: string; text: string; picture?: string }
    >();
    let previousLinkCount = 0;
    let stableRounds = 0;
    const deadline = Date.now() + SCRAPE_BUDGET_MS;
    for (let index = 0; stableRounds < 15 && Date.now() < deadline; index++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(900);
      const visibleLinks = await page
        .locator('a[href*="/videos/"],a[href*="/reel/"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            href: (node as HTMLAnchorElement).href,
            text: (node.textContent || "").trim(),
            picture: (node.querySelector("img") as HTMLImageElement | null)?.src,
          })),
        );
      for (const link of visibleLinks)
        if (link.href) collectedLinks.set(link.href.split("?")[0], link);
      if (collectedLinks.size <= previousLinkCount) stableRounds++;
      else stableRounds = 0;
      previousLinkCount = collectedLinks.size;
    }
    const links = [...collectedLinks.values()];
    const unique = new Map<string, FacebookVideo>();
    for (const link of links) {
      if (!link.href || link.href.includes("/videos/?")) continue;
      const cleanUrl = link.href.split("?")[0];
      const id = cleanUrl.match(/\/(?:videos|reel)\/(\d+)/)?.[1];
      if (!id) continue;
      if (!unique.has(id))
        unique.set(id, {
          id,
          title: link.text.slice(0, 160) || "Facebook videosu",
          created_time: new Date().toISOString(),
          permalink_url: cleanUrl,
          picture: link.picture,
        });
    }
    if (!unique.size)
      throw new Error(
        "Facebook video bağlantıları okunamadı. Sayfa giriş istiyor olabilir; FACEBOOK_SESSION_COOKIES tanımlayın.",
      );
    return { data: [...unique.values()] };
  } finally {
    await ctx.close();
  }
}

export async function scrapeFacebookComments(
  videoUrl: string,
): Promise<{ data: FacebookComment[] }> {
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    await prepare(page, videoUrl);
    const sortButton = page.getByText(
      /En alakalı|Most relevant|Top comments/i,
      { exact: false },
    );
    if (await sortButton.count()) {
      await sortButton
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(500);
      const allComments = page.getByText(/Tüm yorumlar|All comments/i, {
        exact: false,
      });
      if (await allComments.count())
        await allComments
          .last()
          .click()
          .catch(() => undefined);
      await page.waitForTimeout(700);
    }
    const collectedRows = new Map<
      string,
      { text: string; link: string; tracked: string; timeLabel: string }
    >();
    const collectVisibleRows = async () => {
      const visibleRows = await page
        .locator('[role="article"]')
        .evaluateAll((nodes) =>
          nodes
            .map((node) => {
              const text = (node as HTMLElement).innerText?.trim() || "";
              const hrefs = Array.from(node.querySelectorAll("a")).map(
                (item) => (item as HTMLAnchorElement).href,
              );
              const link =
                hrefs
                  .filter((href) => href.includes("comment_id="))
                  .find((href) =>
                    /\/(videos?\/|watch|reel\/|posts\/|permalink\.php|story\.php)/.test(
                      href,
                    ),
                  ) || "";
              // Profil linkleri comment_id'yi base64 izleme değeri olarak taşır; ham hali saklanır.
              const tracked =
                hrefs
                  .map((href) => href.match(/[?&]comment_id=([^&]+)/)?.[1] || "")
                  .find(Boolean) || "";
              // Zaman damgası linkinin aria-label'ı tam tarihi taşır ("23 Haziran 2026 Salı, 08:45").
              const timeLabel =
                Array.from(node.querySelectorAll("a"))
                  .map((item) => item.getAttribute("aria-label") || "")
                  .find((value) => /\d{4}/.test(value)) || "";
              return { text, link, tracked, timeLabel };
            })
            .filter((row) => row.text.length > 2 && row.text.length < 2500),
        );
      for (const row of visibleRows)
        collectedRows.set(row.link || row.text, row);
    };
    let lastRowCount = 0;
    let stableRounds = 0;
    const deadline = Date.now() + SCRAPE_BUDGET_MS;
    let truncated = false;
    for (let attempt = 0; ; attempt++) {
      if (Date.now() >= deadline) {
        truncated = true;
        break;
      }
      const more = page.getByText(
        /Diğer yorumları gör|Daha fazla yorum(?:ları)? gör|Önceki yorumlar|Tüm yorumları gör|See more comments|View more comments|View previous comments|View all comments/i,
        { exact: false },
      );
      const moreCount = await more.count();
      // Tıklamalara kısa zaman aşımı: varsayılan 30s ile tek bir iterasyon
      // (20 + 100 tıklama) süre bütçesini tek başına aşabiliyordu.
      for (let index = Math.min(moreCount, 20) - 1; index >= 0 && Date.now() < deadline; index--)
        await more.nth(index).click({ timeout: 3_000 }).catch(() => undefined);
      const replies = page.getByText(
        /yanıtı gör|yanıt daha|Yanıtları gör|View.*repl|more repl/i,
        { exact: false },
      );
      const replyCount = Math.min(await replies.count(), 100);
      for (let replyIndex = 0; replyIndex < replyCount && Date.now() < deadline; replyIndex++)
        await replies
          .nth(replyIndex)
          .click({ timeout: 3_000 })
          .catch(() => undefined);
      await page.mouse.wheel(0, 1100);
      await page.waitForTimeout(550);
      await collectVisibleRows();
      if (!moreCount && collectedRows.size <= lastRowCount) stableRounds++;
      else stableRounds = 0;
      lastRowCount = collectedRows.size;
      if (stableRounds >= 8) break;
    }
    await collectVisibleRows();
    if (truncated)
      logger.warn("facebook_scrape_budget_exhausted", {
        videoUrl,
        collected: collectedRows.size,
        budgetMs: SCRAPE_BUDGET_MS,
      });
    const rows = [...collectedRows.values()];
    if (
      !rows.length &&
      (await page.getByText(/Giriş Yap|Log in/i, { exact: true }).count())
    ) {
      throw new Error(
        "Facebook yorumları giriş yapmayan tarayıcıya göstermiyor. API kullanmadan devam etmek için FACEBOOK_SESSION_COOKIES tanımlayın.",
      );
    }
    const unique = new Map<string, FacebookComment>();
    for (const row of rows) {
      const lines = row.text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length < 2) continue;
      const ignored =
        /^(Sıkı Hayran|Top Fan|Takip Et|Follow|·|Beğen|Yanıtla|Paylaş|Like|Reply|Share|Düzenlendi|Edited|Çevirisine Bak|See translation|Daha fazlasını gör|See more|\d+[snmg]|\d+ sa|\d+[hdwmy])$/i;
      const contentLines = lines.filter((line) => !ignored.test(line));
      if (contentLines.length < 2) continue;
      const author = contentLines[0];
      const message = contentLines
        .slice(1)
        .filter((line) => !ignored.test(line))
        .join("\n")
        .trim();
      if (!message || message.length > 1800) continue;
      const trackedId = decodeTrackedCommentId(row.tracked);
      let url = row.link || videoUrl;
      if (!row.link && trackedId) {
        // /videos/ adresleri watch yüzeyine yönlenirken comment_id düşüyor; /reel/ korunuyor.
        const videoId = videoUrl.match(/\/(?:videos|reel)\/(\d+)/)?.[1];
        if (videoId) {
          url = `https://www.facebook.com/reel/${videoId}/?comment_id=${trackedId}`;
        } else {
          try {
            const withComment = new URL(videoUrl);
            withComment.searchParams.set("comment_id", trackedId);
            url = withComment.toString();
          } catch {}
        }
      }
      const id =
        row.link.match(/[?&]comment_id=(\d+)/)?.[1] ||
        stableId("fbc", `${author}\n${message}\n${videoUrl}`);
      const timestamp = parseScrapedTimestamp(row.timeLabel, lines);
      if (!unique.has(id))
        unique.set(id, {
          id,
          message,
          from: { name: author },
          created_time: (timestamp?.date || new Date()).toISOString(),
          created_time_exact: timestamp?.exact ?? false,
          permalink_url: url,
        });
    }
    return { data: [...unique.values()] };
  } finally {
    await ctx.close();
  }
}
