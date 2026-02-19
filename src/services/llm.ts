import { postJson } from "./http.js";

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface LLMClient {
  complete(prompt: string): Promise<string>;
  summarizeLongText(text: string, instruction: string): Promise<string>;
}

export class OpenRouterLLM implements LLMClient {
  private activeModel: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallbackModels: string[] = []
  ) {
    this.activeModel = model;
  }

  private modelCandidates(): string[] {
    const all = [this.activeModel, this.model, ...this.fallbackModels];
    const unique: string[] = [];
    for (const m of all) {
      const key = (m || "").trim();
      if (key && !unique.includes(key)) {
        unique.push(key);
      }
    }
    return unique;
  }

  private isRegionBlockedError(err: unknown): boolean {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      message.includes(" 403 ") &&
      (message.includes("region") ||
        message.includes("not allow in your region") ||
        message.includes("not available in your region") ||
        message.includes("is not allowed in your region"))
    );
  }

  async complete(prompt: string): Promise<string> {
    const candidates = this.modelCandidates();
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const payload = {
        model: candidate,
        messages: [
          {
            role: "system",
            content:
              "你是新闻采编官助理。输出必须中文，结构清晰，避免空话。优先给结论，再给依据。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2
      };

      try {
        const res = await postJson<OpenRouterResponse>(
          "https://openrouter.ai/api/v1/chat/completions",
          payload,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`
            }
          }
        );
        const content = res.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error("OpenRouter returned empty content");
        }
        if (this.activeModel !== candidate) {
          this.activeModel = candidate;
        }
        return content;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`${candidate}: ${detail.replace(/\s+/g, " ").slice(0, 180)}`);
        const canTryNext = this.isRegionBlockedError(err);
        if (!canTryNext || i === candidates.length - 1) {
          break;
        }
      }
    }

    throw new Error(
      [
        "OpenRouter 调用失败：当前模型可能在你所在地区不可用。",
        "请在 .env 调整 OPENROUTER_MODEL，或配置 OPENROUTER_FALLBACK_MODELS（逗号分隔）。",
        `尝试记录：${errors.join(" | ")}`
      ].join(" ")
    );
  }

  async summarizeLongText(text: string, instruction: string): Promise<string> {
    const chunkSize = 6000;
    if (text.length <= chunkSize) {
      return this.complete(`${instruction}\n\n内容如下：\n${text}`);
    }

    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    const partials: string[] = [];
    for (let i = 0; i < Math.min(chunks.length, 8); i++) {
      const part = await this.complete(
        `${instruction}\n\n这是第 ${i + 1}/${chunks.length} 段，请仅提取核心事实、观点和结论：\n${chunks[i]}`
      );
      partials.push(part);
    }

    return this.complete(
      `${instruction}\n\n请将以下分段摘要合并成最终版本，去重并统一口径：\n${partials.join(
        "\n\n---\n\n"
      )}`
    );
  }
}

export class DisabledLLM implements LLMClient {
  async complete(_prompt: string): Promise<string> {
    return [
      "当前未配置 `OPENROUTER_API_KEY`，所以无法进行模型总结与分析。",
      "请在 `.env` 中补充该配置后重试。"
    ].join("\n");
  }

  async summarizeLongText(_text: string, _instruction: string): Promise<string> {
    return this.complete("");
  }
}
