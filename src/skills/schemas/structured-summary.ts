import { z } from "zod";

export const MISSING_ZH = "未提及";
export const MISSING_EN = "Not Mentioned";

export const bilingualTermSchema = z
  .object({
    zh: z.string().describe("中文概念名。若原文没有，请写“未提及”。"),
    en: z.string().describe("English concept name. If the source does not provide it, write “Not Mentioned”.")
  })
  .describe("中英双语概念名。");

export const conceptSchema = z
  .object({
    zh: z.string().describe("中文概念名。"),
    en: z.string().describe("English concept name."),
    definitionZh: z.string().describe("中文定义。若原文未明确说明，请写“未提及”。"),
    definitionEn: z.string().describe("English definition. If missing, write “Not Mentioned”.")
  })
  .describe("带中英定义的核心概念。");

export const relationshipKindSchema = z
  .enum(["concept", "causal", "support", "comparison"])
  .describe("关系类型：概念关联、因果、支撑、比较。");

export const relationshipSchema = z
  .object({
    kind: relationshipKindSchema,
    from: bilingualTermSchema,
    to: bilingualTermSchema,
    relation: z.string().describe("说明二者关系的中文短语，例如“推动”“制约”“对比”。")
  })
  .describe("概念之间的结构化关系。");

export const faqItemSchema = z
  .object({
    question: z.string().describe("原文中出现的问题，或从原文显式抽出的关键问题。"),
    answer: z.string().describe("仅基于原文给出的简洁回答。若原文没有明确回答，请写“未提及”。")
  })
  .describe("FAQ 条目。");

export const chunkExtractSchema = z
  .object({
    segmentSummary: z.string().describe("该分段的 1 句中文摘要。"),
    audienceHints: z.array(z.string()).describe("该分段面向的潜在读者或使用场景。没有则返回空数组。"),
    claims: z.array(z.string()).describe("该分段中的核心观点或主张。"),
    evidence: z.array(z.string()).describe("该分段中的关键证据、事实、数据或例子。"),
    risks: z.array(z.string()).describe("该分段中的风险、限制、边界条件或不确定性。"),
    actions: z.array(z.string()).describe("该分段中的结论性建议、行动项或启发。"),
    concepts: z.array(conceptSchema).describe("该分段出现的关键概念及其中英定义。"),
    formalRelations: z
      .array(z.string())
      .describe("该分段中可形式化表达的关系，例如等式、逻辑式、函数式、因果表达。"),
    relationships: z.array(relationshipSchema).describe("该分段内概念关系。"),
    logicSteps: z.array(z.string()).describe("该分段的逻辑推演步骤，使用 Step 1/2/3 风格的中文短句。"),
    facts: z.array(z.string()).describe("可核验的客观事实。"),
    opinions: z.array(z.string()).describe("观点、判断、推测、立场。"),
    faq: z.array(faqItemSchema).describe("该分段中的问题与回答。"),
    analogies: z.array(z.string()).describe("原文中的类比、比喻、映射。"),
    quotes: z.array(z.string()).describe("代表性表述或金句。优先保留原意，必要时可做轻度压缩。")
  })
  .describe("长文本分段抽取结果。");

export const structuredSummarySchema = z
  .object({
    title: z.string().describe("20字以内的中文标题，准确概括主旨。"),
    topicZh: z.string().describe("主题中文名。"),
    topicEn: z.string().describe("主题英文名。若原文没有，请写“Not Mentioned”。"),
    audience: z.string().describe("目标读者。若原文没有，请写“未提及”。"),
    oneSentenceSummary: z.string().describe("一句话中文摘要。"),
    coreConclusions: z.array(z.string()).describe("3条以内的核心结论。"),
    claims: z.array(z.string()).describe("主要观点或主张。"),
    evidence: z.array(z.string()).describe("关键证据、事实、例子或数据。"),
    risks: z.array(z.string()).describe("风险、限制、边界条件和不确定性。"),
    actions: z.array(z.string()).describe("行动建议、编辑建议或应用建议。"),
    concepts: z.array(conceptSchema).describe("关键概念及定义。"),
    formalRelations: z.array(z.string()).describe("至少 3 条可形式化表达的关系；若不足可返回更少。"),
    relationships: z.array(relationshipSchema).describe("概念之间的结构化关系。"),
    logicSteps: z.array(z.string()).describe("逻辑梳理步骤，使用 Step 1/2/3 风格。"),
    facts: z.array(z.string()).describe("客观事实。"),
    opinions: z.array(z.string()).describe("观点或推断。"),
    faq: z.array(faqItemSchema).describe("问题与简答。"),
    analogies: z.array(z.string()).describe("类比。"),
    quotes: z.array(z.string()).describe("代表性金句。原文不足时可少于 10 条。")
  })
  .describe("最终结构化总结对象。");

export type BilingualTerm = z.infer<typeof bilingualTermSchema>;
export type StructuredConcept = z.infer<typeof conceptSchema>;
export type StructuredRelationship = z.infer<typeof relationshipSchema>;
export type StructuredFaqItem = z.infer<typeof faqItemSchema>;
export type ChunkExtract = z.infer<typeof chunkExtractSchema>;
export type StructuredSummary = z.infer<typeof structuredSummarySchema>;

function cleanString(value: string | null | undefined, fallback = ""): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function uniqueStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const normalized = cleanString(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(normalized);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string, limit: number): T[] {
  const seen = new Set<string>();
  const results: T[] = [];
  for (const value of values) {
    const key = cleanString(keyFn(value)).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(value);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function normalizeBilingualTerm(term: Partial<BilingualTerm> | undefined): BilingualTerm {
  return {
    zh: cleanString(term?.zh, MISSING_ZH),
    en: cleanString(term?.en, MISSING_EN)
  };
}

function normalizeConcept(concept: Partial<StructuredConcept> | undefined): StructuredConcept {
  return {
    zh: cleanString(concept?.zh, MISSING_ZH),
    en: cleanString(concept?.en, MISSING_EN),
    definitionZh: cleanString(concept?.definitionZh, MISSING_ZH),
    definitionEn: cleanString(concept?.definitionEn, MISSING_EN)
  };
}

function normalizeRelationship(
  relationship: Partial<StructuredRelationship> | undefined
): StructuredRelationship {
  const kind = relationship?.kind;
  return {
    kind:
      kind === "concept" || kind === "causal" || kind === "support" || kind === "comparison"
        ? kind
        : "concept",
    from: normalizeBilingualTerm(relationship?.from),
    to: normalizeBilingualTerm(relationship?.to),
    relation: cleanString(relationship?.relation, "相关")
  };
}

function normalizeFaqItem(item: Partial<StructuredFaqItem> | undefined): StructuredFaqItem {
  return {
    question: cleanString(item?.question, MISSING_ZH),
    answer: cleanString(item?.answer, MISSING_ZH)
  };
}

function buildFormalRelations(
  relationships: StructuredRelationship[],
  existing: string[]
): string[] {
  const direct = uniqueStrings(existing, 6);
  if (direct.length > 0) {
    return direct;
  }
  return relationships
    .slice(0, 6)
    .map((item) => `${item.from.zh}/${item.from.en} -> ${item.to.zh}/${item.to.en}: ${item.relation}`);
}

export function normalizeChunkExtract(raw: ChunkExtract): ChunkExtract {
  return {
    segmentSummary: cleanString(raw.segmentSummary, MISSING_ZH),
    audienceHints: uniqueStrings(raw.audienceHints || [], 4),
    claims: uniqueStrings(raw.claims || [], 8),
    evidence: uniqueStrings(raw.evidence || [], 8),
    risks: uniqueStrings(raw.risks || [], 6),
    actions: uniqueStrings(raw.actions || [], 6),
    concepts: uniqueBy((raw.concepts || []).map(normalizeConcept), (item) => `${item.zh}|${item.en}`, 12),
    formalRelations: uniqueStrings(raw.formalRelations || [], 6),
    relationships: uniqueBy(
      (raw.relationships || []).map(normalizeRelationship),
      (item) => `${item.kind}|${item.from.zh}|${item.from.en}|${item.to.zh}|${item.to.en}|${item.relation}`,
      12
    ),
    logicSteps: uniqueStrings(raw.logicSteps || [], 8),
    facts: uniqueStrings(raw.facts || [], 10),
    opinions: uniqueStrings(raw.opinions || [], 10),
    faq: uniqueBy((raw.faq || []).map(normalizeFaqItem), (item) => `${item.question}|${item.answer}`, 8),
    analogies: uniqueStrings(raw.analogies || [], 6),
    quotes: uniqueStrings(raw.quotes || [], 10)
  };
}

export function normalizeStructuredSummary(raw: StructuredSummary): StructuredSummary {
  const concepts = uniqueBy((raw.concepts || []).map(normalizeConcept), (item) => `${item.zh}|${item.en}`, 12);
  const relationships = uniqueBy(
    (raw.relationships || []).map(normalizeRelationship),
    (item) => `${item.kind}|${item.from.zh}|${item.from.en}|${item.to.zh}|${item.to.en}|${item.relation}`,
    12
  );
  const claims = uniqueStrings(raw.claims || [], 8);
  const evidence = uniqueStrings(raw.evidence || [], 8);
  const risks = uniqueStrings(raw.risks || [], 6);
  const actions = uniqueStrings(raw.actions || [], 6);
  const coreConclusions = uniqueStrings(
    raw.coreConclusions?.length ? raw.coreConclusions : claims.slice(0, 3),
    5
  );

  const topicZh = cleanString(raw.topicZh, concepts[0]?.zh || MISSING_ZH);
  const topicEn = cleanString(raw.topicEn, concepts[0]?.en || MISSING_EN);
  const title = cleanString(raw.title, topicZh === MISSING_ZH ? "内容结构化总结" : topicZh);

  return {
    title,
    topicZh,
    topicEn,
    audience: cleanString(raw.audience, MISSING_ZH),
    oneSentenceSummary: cleanString(raw.oneSentenceSummary, coreConclusions[0] || MISSING_ZH),
    coreConclusions,
    claims,
    evidence,
    risks,
    actions,
    concepts,
    formalRelations: buildFormalRelations(relationships, raw.formalRelations || []),
    relationships,
    logicSteps: uniqueStrings(raw.logicSteps || [], 8),
    facts: uniqueStrings(raw.facts || [], 10),
    opinions: uniqueStrings(raw.opinions || [], 10),
    faq: uniqueBy((raw.faq || []).map(normalizeFaqItem), (item) => `${item.question}|${item.answer}`, 8),
    analogies: uniqueStrings(raw.analogies || [], 6),
    quotes: uniqueStrings(raw.quotes || [], 10)
  };
}
