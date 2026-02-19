import { getText } from "./http.js";

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export class ContentExtractor {
  async extractText(url: string): Promise<string> {
    const cleanedUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanedUrl)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    try {
      const viaReader = await getText(
        `https://r.jina.ai/${cleanedUrl}`,
        {
          headers: {
            "User-Agent": "news-editer-agent/0.1"
          }
        }
      );
      if (viaReader.length > 400) {
        return viaReader;
      }
    } catch {
      // Reader fallback failed, continue with raw fetch.
    }

    const html = await getText(cleanedUrl, {
      headers: {
        "User-Agent": "news-editer-agent/0.1"
      }
    });
    const text = stripHtml(html);
    if (text.length < 200) {
      throw new Error("Extracted content too short");
    }
    return text;
  }
}

