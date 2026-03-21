import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { postJson } from "./http.js";
import {
  ChunkExtract,
  chunkExtractSchema,
  normalizeChunkExtract,
  normalizeStructuredSummary,
  StructuredSummary,
  structuredSummarySchema
} from "../skills/schemas/structured-summary.js";

const DISABLED_MESSAGE = [
  "当前未配置 `OPENROUTER_API_KEY`，所以无法进行模型总结与分析。",
  "请在 `.env` 中补充该配置后重试。"
].join("\n");

const TARGET_CHUNK_SIZE = 6000;
const MAX_CHUNKS = 8;

export interface StructuredSummaryInput {
  sourceType: "text" | "url";
  sourceLabel: string;
  text: string;
}

export interface StructuredSummaryRunMeta {
  model: string;
  attemptedModels: string[];
  schemaFallbackUsed: boolean;
}

export interface StructuredSummaryRun {
  summary: StructuredSummary;
  meta: StructuredSummaryRunMeta;
}

export interface StructuredSummaryGenerator {
  readonly isConfigured: boolean;
  getDisabledMessage(): string;
  summarize(input: StructuredSummaryInput): Promise<StructuredSummaryRun>;
}

interface MergedChunkExtracts {
  segmentSummaries: string[];
  audienceHints: string[];
  claims: string[];
  evidence: string[];
  risks: string[];
  actions: string[];
  concepts: ChunkExtract["concepts"];
  formalRelations: string[];
  relationships: ChunkExtract["relationships"];
  logicSteps: string[];
  facts: string[];
  opinions: string[];
  faq: ChunkExtract["faq"];
  analogies: string[];
  quotes: string[];
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function normalizeSoul(soul: string): string {
  return soul.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string, limit: number): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const value of values) {
    const key = keyFn(value).trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= TARGET_CHUNK_SIZE) {
    return [text];
  }
  const chunkCount = Math.min(Math.ceil(text.length / TARGET_CHUNK_SIZE), MAX_CHUNKS);
  const actualChunkSize = Math.ceil(text.length / chunkCount);
  const chunks: string[] = [];
  for (let index = 0; index < chunkCount; index++) {
    const slice = text.slice(index * actualChunkSize, (index + 1) * actualChunkSize).trim();
    if (slice) {
      chunks.push(slice);
    }
  }
  return chunks;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractJsonObject(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }
  return trimmed;
}

function mergeChunkExtracts(extracts: ChunkExtract[]): MergedChunkExtracts {
  return {
    segmentSummaries: uniqueStrings(extracts.map((item) => item.segmentSummary), 8),
    audienceHints: uniqueStrings(extracts.flatMap((item) => item.audienceHints), 6),
    claims: uniqueStrings(extracts.flatMap((item) => item.claims), 12),
    evidence: uniqueStrings(extracts.flatMap((item) => item.evidence), 12),
    risks: uniqueStrings(extracts.flatMap((item) => item.risks), 8),
    actions: uniqueStrings(extracts.flatMap((item) => item.actions), 8),
    concepts: uniqueBy(
      extracts.flatMap((item) => item.concepts),
      (item) => `${item.zh}|${item.en}`,
      14
    ),
    formalRelations: uniqueStrings(extracts.flatMap((item) => item.formalRelations), 8),
    relationships: uniqueBy(
      extracts.flatMap((item) => item.relationships),
      (item) => `${item.kind}|${item.from.zh}|${item.from.en}|${item.to.zh}|${item.to.en}|${item.relation}`,
      14
    ),
    logicSteps: uniqueStrings(extracts.flatMap((item) => item.logicSteps), 10),
    facts: uniqueStrings(extracts.flatMap((item) => item.facts), 14),
    opinions: uniqueStrings(extracts.flatMap((item) => item.opinions), 14),
    faq: uniqueBy(
      extracts.flatMap((item) => item.faq),
      (item) => `${item.question}|${item.answer}`,
      10
    ),
    analogies: uniqueStrings(extracts.flatMap((item) => item.analogies), 8),
    quotes: uniqueStrings(extracts.flatMap((item) => item.quotes), 12)
  };
}

export class DisabledStructuredSummaryGenerator implements StructuredSummaryGenerator {
  readonly isConfigured = false;

  getDisabledMessage(): string {
    return DISABLED_MESSAGE;
  }

  async summarize(_input: StructuredSummaryInput): Promise<StructuredSummaryRun> {
    throw new Error(DISABLED_MESSAGE);
  }
}

export class OpenRouterStructuredSummaryGenerator implements StructuredSummaryGenerator {
  readonly isConfigured = true;
  private readonly provider;
  private readonly personaDirective: string;
  private activeModel: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallbackModels: string[] = [],
    soul = ""
  ) {
    this.provider = createOpenAICompatible({
      name: "openrouter",
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      supportsStructuredOutputs: true
    });
    this.personaDirective = normalizeSoul(soul)
      ? `你必须遵循以下 persona 规则（优先级高于默认写作风格）：\n${normalizeSoul(soul)}\n`
      : "";
    this.activeModel = model;
  }

  getDisabledMessage(): string {
    return DISABLED_MESSAGE;
  }

  async summarize(input: StructuredSummaryInput): Promise<StructuredSummaryRun> {
    const text = compactText(input.text);
    if (!text) {
      throw new Error("总结任务缺少正文内容。");
    }
    const meta: StructuredSummaryRunMeta = {
      model: this.model,
      attemptedModels: [],
      schemaFallbackUsed: false
    };

    const chunks = splitIntoChunks(text);
    if (chunks.length === 1) {
      const summary = await this.runSummary(chunks[0], input, meta);
      return {
        summary: normalizeStructuredSummary(summary),
        meta
      };
    }

    const extracts: ChunkExtract[] = [];
    for (let index = 0; index < chunks.length; index++) {
      const extract = await this.runChunkExtract(chunks[index], input, index, chunks.length, meta);
      extracts.push(normalizeChunkExtract(extract));
    }

    const merged = mergeChunkExtracts(extracts);
    const finalSummary = await this.runMergedSummary(merged, input, meta);
    return {
      summary: normalizeStructuredSummary(finalSummary),
      meta
    };
  }

  private modelCandidates(): string[] {
    const all = [this.activeModel, this.model, ...this.fallbackModels];
    const unique: string[] = [];
    let sawNonFree = false;
    for (const value of all) {
      const normalized = String(value || "").trim();
      if (normalized && !unique.includes(normalized)) {
        unique.push(normalized);
        if (!normalized.endsWith(":free") && normalized !== "openrouter/free") {
          sawNonFree = true;
        }
      }
    }
    if (!sawNonFree && !unique.includes("openrouter/free")) {
      unique.push("openrouter/free");
    }
    return unique;
  }

  private isRetryableModelError(err: unknown): boolean {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    const isRegionBlocked =
      message.includes(" 403 ") &&
      (message.includes("region") ||
        message.includes("not allow in your region") ||
        message.includes("not available in your region") ||
        message.includes("is not allowed in your region"));
    const isRateLimited = message.includes(" 429 ");
    const isServerBusy =
      message.includes(" 5") &&
      (message.includes(" 500 ") ||
        message.includes(" 502 ") ||
        message.includes(" 503 ") ||
        message.includes(" 504 "));
    const isNoEndpoint = message.includes("no endpoints found");
    const isProviderReturnedError = message.includes("provider returned error");
    return (
      isRegionBlocked ||
      isRateLimited ||
      isServerBusy ||
      isNoEndpoint ||
      isProviderReturnedError
    );
  }

  private isStructuredOutputCompatibilityError(err: unknown): boolean {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      message.includes("provider returned error") ||
      message.includes("response_format") ||
      message.includes("json_schema") ||
      message.includes("structured output") ||
      message.includes("structured outputs") ||
      message.includes("does not support") ||
      message.includes("unsupported")
    );
  }

  private async withModelFallback<T>(
    runCandidate: (modelId: string) => Promise<T>,
    meta: StructuredSummaryRunMeta
  ): Promise<T> {
    const candidates = this.modelCandidates();
    const errors: string[] = [];

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (!meta.attemptedModels.includes(candidate)) {
        meta.attemptedModels.push(candidate);
      }
      try {
        const result = await runCandidate(candidate);
        if (this.activeModel !== candidate) {
          this.activeModel = candidate;
        }
        meta.model = candidate;
        return result;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`${candidate}: ${detail.replace(/\s+/g, " ").slice(0, 180)}`);
        const canTryNext = this.isRetryableModelError(err);
        if (!canTryNext || index === candidates.length - 1) {
          break;
        }
      }
    }

    throw new Error(
      [
        "OpenRouter 调用失败：主模型当前不可用或受限（可能是地区限制、限流、路由不可用）。",
        "请在 .env 调整 OPENROUTER_MODEL，并配置 OPENROUTER_FALLBACK_MODELS（逗号分隔）。",
        `尝试记录：${errors.join(" | ")}`
      ].join(" ")
    );
  }

  private baseInstruction(): string {
    return [
      this.personaDirective,
      "你是资深新闻分析助理。",
      "只允许基于输入内容输出，不要杜撰，不要引入输入之外的外部事实。",
      "输出语言以中文为主；概念字段必须保留中英文。",
      "如果原文没有足够信息，请明确写“未提及”或返回空数组。",
      "优先保留信息密度，而不是修辞。"
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async callChatCompletion(candidate: string, prompt: string): Promise<string> {
    const payload = {
      model: candidate,
      messages: [
        {
          role: "system",
          content: this.baseInstruction()
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1
    };

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
    return content;
  }

  private async generateObjectWithChatFallback<T>(
    candidate: string,
    schema: { parse: (value: unknown) => T },
    prompt: string,
    jsonTemplate: string,
    meta: StructuredSummaryRunMeta
  ): Promise<T> {
    meta.schemaFallbackUsed = true;
    const raw = await this.callChatCompletion(
      candidate,
      [
        prompt,
        "",
        "输出要求：",
        "- 只输出一个合法 JSON 对象。",
        "- 不要输出 Markdown，不要加 ```json 代码块，不要附加解释。",
        "- 所有字段都必须保留；无内容时使用空数组，或写“未提及”。",
        "",
        "JSON 字段模板：",
        jsonTemplate
      ].join("\n")
    );
    const parsed = JSON.parse(extractJsonObject(raw));
    return schema.parse(parsed);
  }

  private summaryJsonTemplate(): string {
    return JSON.stringify(
      {
        title: "",
        topicZh: "",
        topicEn: "",
        audience: "",
        oneSentenceSummary: "",
        coreConclusions: [],
        claims: [],
        evidence: [],
        risks: [],
        actions: [],
        concepts: [
          {
            zh: "",
            en: "",
            definitionZh: "",
            definitionEn: ""
          }
        ],
        formalRelations: [],
        relationships: [
          {
            kind: "concept",
            from: { zh: "", en: "" },
            to: { zh: "", en: "" },
            relation: ""
          }
        ],
        logicSteps: [],
        facts: [],
        opinions: [],
        faq: [{ question: "", answer: "" }],
        analogies: [],
        quotes: []
      },
      null,
      2
    );
  }

  private chunkJsonTemplate(): string {
    return JSON.stringify(
      {
        segmentSummary: "",
        audienceHints: [],
        claims: [],
        evidence: [],
        risks: [],
        actions: [],
        concepts: [
          {
            zh: "",
            en: "",
            definitionZh: "",
            definitionEn: ""
          }
        ],
        formalRelations: [],
        relationships: [
          {
            kind: "concept",
            from: { zh: "", en: "" },
            to: { zh: "", en: "" },
            relation: ""
          }
        ],
        logicSteps: [],
        facts: [],
        opinions: [],
        faq: [{ question: "", answer: "" }],
        analogies: [],
        quotes: []
      },
      null,
      2
    );
  }

  private async runSummary(
    text: string,
    input: StructuredSummaryInput,
    meta: StructuredSummaryRunMeta
  ): Promise<StructuredSummary> {
    return this.withModelFallback(async (candidate) => {
      const prompt = [
        `任务：请对以下${input.sourceType === "url" ? "网页正文" : "文本"}生成最终结构化总结对象。`,
        `来源标签：${input.sourceLabel}`,
        "要求：",
        "- title 为 20 字以内中文标题。",
        "- coreConclusions 优先给 3 条以内。",
        "- formalRelations 尽量给出 3 条可形式化表达；若原文不足，可少于 3 条。",
        "- logicSteps 使用 Step 1/2/3 形式。",
        "",
        "正文：",
        text
      ].join("\n");

      try {
        const { object } = await generateObject({
          model: this.provider(candidate),
          schema: structuredSummarySchema,
          temperature: 0.2,
          prompt: [this.baseInstruction(), prompt].join("\n")
        });
        return object;
      } catch (err) {
        if (!this.isStructuredOutputCompatibilityError(err)) {
          throw err;
        }
        return this.generateObjectWithChatFallback(
          candidate,
          structuredSummarySchema,
          [this.baseInstruction(), prompt].join("\n"),
          this.summaryJsonTemplate(),
          meta
        );
      }
    }, meta);
  }

  private async runChunkExtract(
    text: string,
    input: StructuredSummaryInput,
    index: number,
    total: number,
    meta: StructuredSummaryRunMeta
  ): Promise<ChunkExtract> {
    return this.withModelFallback(async (candidate) => {
      const prompt = [
        `任务：请抽取第 ${index + 1}/${total} 段的结构化信息，不要总结全文。`,
        `来源标签：${input.sourceLabel}`,
        "请重点抽取 claim / evidence / risk / concept / relationship / FAQ / quote。",
        "若本段没有某类信息，返回空数组。",
        "",
        "分段正文：",
        text
      ].join("\n");

      try {
        const { object } = await generateObject({
          model: this.provider(candidate),
          schema: chunkExtractSchema,
          temperature: 0.1,
          prompt: [this.baseInstruction(), prompt].join("\n")
        });
        return object;
      } catch (err) {
        if (!this.isStructuredOutputCompatibilityError(err)) {
          throw err;
        }
        return this.generateObjectWithChatFallback(
          candidate,
          chunkExtractSchema,
          [this.baseInstruction(), prompt].join("\n"),
          this.chunkJsonTemplate(),
          meta
        );
      }
    }, meta);
  }

  private async runMergedSummary(
    merged: MergedChunkExtracts,
    input: StructuredSummaryInput,
    meta: StructuredSummaryRunMeta
  ): Promise<StructuredSummary> {
    return this.withModelFallback(async (candidate) => {
      const prompt = [
        `任务：请基于以下分段抽取结果，生成一份最终结构化总结对象。`,
        `来源标签：${input.sourceLabel}`,
        "注意：",
        "- 只能基于下方 JSON 数据整合，不要新增 JSON 中不存在的事实。",
        "- 可以合并重复表述、统一口径、压缩冗余。",
        "- title 要简洁准确，logicSteps 仍然使用 Step 1/2/3 格式。",
        "",
        "分段抽取 JSON：",
        JSON.stringify(merged, null, 2)
      ].join("\n");

      try {
        const { object } = await generateObject({
          model: this.provider(candidate),
          schema: structuredSummarySchema,
          temperature: 0.2,
          prompt: [this.baseInstruction(), prompt].join("\n")
        });
        return object;
      } catch (err) {
        if (!this.isStructuredOutputCompatibilityError(err)) {
          throw err;
        }
        return this.generateObjectWithChatFallback(
          candidate,
          structuredSummarySchema,
          [this.baseInstruction(), prompt].join("\n"),
          this.summaryJsonTemplate(),
          meta
        );
      }
    }, meta);
  }
}
