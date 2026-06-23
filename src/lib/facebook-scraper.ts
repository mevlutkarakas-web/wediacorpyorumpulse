import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { FacebookComment, FacebookVideo } from "./facebook";

const chromePaths = [
  process.env.FACEBOOK_BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter((path): path is string => Boolean(path));

let browserPromise: Promise<Browser> | undefined;

function browser() {
  browserPromise ||= chromium.launch({
    executablePath: chromePaths.find(existsSync),
    headless: process.env.FACEBOOK_BROWSER_HEADLESS !== "false",
    args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

async function context() {
  const instance = await browser();
  const result = await instance.newContext({
    locale: "tr-TR",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1000 },
  });
  const rawCookies = process.env.FACEBOOK_SESSION_COOKIES?.trim();
  if (rawCookies) {
    const cookies = rawCookies.split(";").map(item => item.trim()).filter(Boolean).map(item => {
      const separator = item.indexOf("=");
      return { name: item.slice(0, separator), value: item.slice(separator + 1), domain: ".facebook.com", path: "/", secure: true };
    }).filter(cookie => cookie.name && cookie.value);
    if (cookies.length) await result.addCookies(cookies);
  }
  return result;
}

async function prepare(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  for (const label of ["Allow all cookies", "Tüm çerezlere izin ver", "Only allow essential cookies", "Yalnızca gerekli çerezlere izin ver"]) {
    const button = page.getByRole("button", { name: label, exact: false });
    if (await button.count()) { await button.first().click().catch(() => undefined); break; }
  }
}

export async function scrapeFacebookVideos(pageUrl: string): Promise<{ data: FacebookVideo[] }> {
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    const parsedPageUrl = new URL(pageUrl);
    const profileId = parsedPageUrl.searchParams.get("id");
    const target = profileId
      ? `https://www.facebook.com/${profileId}/videos`
      : pageUrl.replace(/[#/]$/, "") + "/videos";
    await prepare(page, target);
    for (let index = 0; index < 30; index++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(900);
    }
    const links = await page.locator('a[href*="/videos/"],a[href*="/reel/"]').evaluateAll(nodes => nodes.map(node => ({
      href: (node as HTMLAnchorElement).href,
      text: (node.textContent || "").trim(),
      picture: (node.querySelector("img") as HTMLImageElement | null)?.src,
    })));
    const unique = new Map<string, FacebookVideo>();
    for (const link of links) {
      if (!link.href || link.href.includes("/videos/?")) continue;
      const cleanUrl = link.href.split("?")[0];
      const id = cleanUrl.match(/\/(?:videos|reel)\/(\d+)/)?.[1];
      if (!id) continue;
      if (!unique.has(id)) unique.set(id, { id, title: link.text.slice(0, 160) || "Facebook videosu", created_time: new Date().toISOString(), permalink_url: cleanUrl, picture: link.picture });
      if (unique.size >= 100) break;
    }
    if (!unique.size) throw new Error("Facebook video bağlantıları okunamadı. Sayfa giriş istiyor olabilir; FACEBOOK_SESSION_COOKIES tanımlayın.");
    return { data: [...unique.values()] };
  } finally {
    await ctx.close();
  }
}

export async function scrapeFacebookComments(videoUrl: string): Promise<{ data: FacebookComment[] }> {
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    await prepare(page, videoUrl);
    const sortButton = page.getByText(/En alakalı|Most relevant|Top comments/i, { exact: false });
    if (await sortButton.count()) {
      await sortButton.first().click().catch(() => undefined);
      await page.waitForTimeout(500);
      const allComments = page.getByText(/Tüm yorumlar|All comments/i, { exact: false });
      if (await allComments.count()) await allComments.last().click().catch(() => undefined);
      await page.waitForTimeout(700);
    }
    let lastArticleCount = 0;
    let stableRounds = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      const more = page.getByText(/Daha fazla yorum|Önceki yorumlar|Tüm yorumları gör|View more comments|View previous comments|View all comments/i);
      const moreCount = await more.count();
      if (moreCount) await more.last().click().catch(() => undefined);
      const replies = page.getByText(/yanıtı gör|yanıt daha|View.*repl|more repl/i, { exact: false });
      const replyCount = Math.min(await replies.count(), 20);
      for (let replyIndex = 0; replyIndex < replyCount; replyIndex++) await replies.nth(replyIndex).click().catch(() => undefined);
      await page.mouse.wheel(0, 1100);
      await page.waitForTimeout(550);
      const articleCount = await page.locator('[role="article"]').count();
      if (!moreCount && articleCount <= lastArticleCount) stableRounds++; else stableRounds = 0;
      lastArticleCount = Math.max(lastArticleCount, articleCount);
      if (stableRounds >= 3) break;
    }
    const rows = await page.locator('[role="article"]').evaluateAll(nodes => nodes.map(node => {
      const text = (node as HTMLElement).innerText?.trim() || "";
      const link = Array.from(node.querySelectorAll("a")).map(item => (item as HTMLAnchorElement).href).find(href => href.includes("comment_id=")) || "";
      return { text, link };
    }).filter(row => row.text.length > 2 && row.text.length < 2500));
    if (!rows.length && await page.getByText(/Giriş Yap|Log in/i, { exact: true }).count()) {
      throw new Error("Facebook yorumları giriş yapmayan tarayıcıya göstermiyor. API kullanmadan devam etmek için FACEBOOK_SESSION_COOKIES tanımlayın.");
    }
    const unique = new Map<string, FacebookComment>();
    for (const row of rows) {
      const lines = row.text.split("\n").map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) continue;
      const author = lines[0];
      const ignored = /^(Beğen|Yanıtla|Paylaş|Like|Reply|Share|Düzenlendi|Edited|Çevirisine Bak|See translation|Daha fazlasını gör|See more|\d+[gsad]|\d+ sa)$/i;
      const message = lines.slice(1).filter(line => !ignored.test(line)).join("\n").trim();
      if (!message || message.length > 1800) continue;
      const url = row.link || videoUrl;
      const id = row.link.match(/[?&]comment_id=(\d+)/)?.[1] || stableId("fbc", `${author}\n${message}\n${videoUrl}`);
      if (!unique.has(id)) unique.set(id, { id, message, from: { name: author }, created_time: new Date().toISOString(), permalink_url: url });
    }
    return { data: [...unique.values()].slice(0, 1000) };
  } finally {
    await ctx.close();
  }
}
