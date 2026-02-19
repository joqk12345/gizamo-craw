import { getText } from "./http.js";

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  );
}

function normalizeText(input: string): string {
  return input
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html: string, name: string): string {
  const escaped = escapeRegExp(name);
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = re.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : "";
}

function extractElementById(html: string, id: string): string {
  const escapedId = escapeRegExp(id);
  const openRe = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>`, "i");
  const open = openRe.exec(html);
  if (!open) {
    return "";
  }
  const tag = open[1].toLowerCase();
  const startPos = open.index + open[0].length;
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = startPos;

  let depth = 1;
  let cursor = startPos;
  let next = tagRe.exec(html);
  while (next) {
    const token = next[0];
    const isClose = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isClose) {
      depth -= 1;
    } else if (!isSelfClosing) {
      depth += 1;
    }
    if (depth === 0) {
      return html.slice(cursor, next.index);
    }
    next = tagRe.exec(html);
  }
  return "";
}

function extractElementByClass(html: string, className: string): string {
  const escaped = escapeRegExp(className);
  const openRe = new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>`, "i");
  const open = openRe.exec(html);
  if (!open) {
    return "";
  }
  const tag = open[1].toLowerCase();
  const startPos = open.index + open[0].length;
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = startPos;

  let depth = 1;
  let cursor = startPos;
  let next = tagRe.exec(html);
  while (next) {
    const token = next[0];
    const isClose = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isClose) {
      depth -= 1;
    } else if (!isSelfClosing) {
      depth += 1;
    }
    if (depth === 0) {
      return html.slice(cursor, next.index);
    }
    next = tagRe.exec(html);
  }
  return "";
}

function extractArticleHtml(html: string, isWeixin: boolean): string {
  if (isWeixin) {
    const jsContent = extractElementById(html, "js_content");
    if (jsContent) {
      return jsContent;
    }
    const richContent = extractElementByClass(html, "rich_media_content");
    if (richContent) {
      return richContent;
    }
  }
  const article = extractElementByClass(html, "article");
  if (article) {
    return article;
  }
  return "";
}

export class ContentExtractor {
  private isWeixinUrl(url: URL): boolean {
    return /(^|\.)mp\.weixin\.qq\.com$/i.test(url.hostname);
  }

  private async tryReader(url: string, isWeixin: boolean): Promise<string> {
    const u = new URL(url);
    const compact = `${u.host}${u.pathname}${u.search}`;
    const candidates = Array.from(
      new Set(
        isWeixin
          ? [
              `https://r.jina.ai/${url}`,
              `https://r.jina.ai/https://${compact}`,
              `https://r.jina.ai/http://${compact}`
            ]
          : [`https://r.jina.ai/${url}`]
      )
    );

    for (const candidate of candidates) {
      try {
        const viaReader = await getText(candidate, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
          }
        });
        const normalized = normalizeText(viaReader);
        const minLen = isWeixin ? 120 : 400;
        if (normalized.length >= minLen) {
          return normalized;
        }
      } catch {
        // continue
      }
    }
    return "";
  }

  async extractText(url: string): Promise<string> {
    const cleanedUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanedUrl)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const parsed = new URL(cleanedUrl);
    const isWeixin = this.isWeixinUrl(parsed);

    const viaReader = await this.tryReader(cleanedUrl, isWeixin);
    if (viaReader) {
      return viaReader;
    }

    const html = await getText(cleanedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...(isWeixin ? { Referer: "https://mp.weixin.qq.com/" } : {})
      }
    });

    const title =
      extractMetaContent(html, "og:title") ||
      extractMetaContent(html, "twitter:title") ||
      extractElementById(html, "activity-name").trim();
    const articleHtml = extractArticleHtml(html, isWeixin) || html;
    const body = normalizeText(stripHtml(articleHtml));

    const blockedHints = [
      "环境异常",
      "访问过于频繁",
      "暂时无法浏览",
      "内容无法访问",
      "此内容因违规无法查看"
    ];
    if (isWeixin && blockedHints.some((s) => body.includes(s))) {
      throw new Error("微信文章访问受限（可能触发风控或地区限制）");
    }

    const finalText = normalizeText(title ? `标题：${title}\n\n${body}` : body);
    const minLen = isWeixin ? 120 : 200;
    if (finalText.length < minLen) {
      throw new Error("Extracted content too short");
    }
    return finalText;
  }
}
