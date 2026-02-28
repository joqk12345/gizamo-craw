import { LLMClient } from "./llm.js";

function normalizeSoul(soul: string): string {
  return soul.replace(/\s+/g, " ").trim();
}

export class PersonaAwareLLM implements LLMClient {
  private readonly soulDirective: string;

  constructor(
    private readonly base: LLMClient,
    soul: string
  ) {
    const normalized = normalizeSoul(soul);
    this.soulDirective = normalized
      ? `你必须遵循以下 persona 规则（优先级高于默认写作风格）：\n${normalized}\n`
      : "";
  }

  async complete(prompt: string): Promise<string> {
    if (!this.soulDirective) {
      return this.base.complete(prompt);
    }
    return this.base.complete(`${this.soulDirective}\n任务：\n${prompt}`);
  }

  async summarizeLongText(text: string, instruction: string): Promise<string> {
    if (!this.soulDirective) {
      return this.base.summarizeLongText(text, instruction);
    }
    return this.base.summarizeLongText(text, `${this.soulDirective}\n${instruction}`);
  }
}
