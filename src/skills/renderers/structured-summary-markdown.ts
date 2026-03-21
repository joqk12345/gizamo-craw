import {
  MISSING_EN,
  MISSING_ZH,
  StructuredConcept,
  StructuredRelationship,
  StructuredSummary
} from "../schemas/structured-summary.js";

function renderList(items: string[], fallback: string): string[] {
  if (!items.length) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
}

function escapeMermaidLabel(input: string): string {
  return input.replace(/"/g, "'").replace(/\|/g, "/").trim();
}

function conceptKey(value: string): string {
  return value.trim().toLowerCase();
}

function conceptLabel(concept: Pick<StructuredConcept, "zh" | "en">): string {
  return `${concept.zh} / ${concept.en}`;
}

function buildConceptGraph(summary: StructuredSummary): string {
  const concepts = summary.concepts.slice(0, 6);
  if (!concepts.length) {
    return [
      "```mermaid",
      "graph TD",
      '  subgraph "Concept Map"',
      `    T["${escapeMermaidLabel(summary.topicZh)} / ${escapeMermaidLabel(summary.topicEn)}"] --> C["${escapeMermaidLabel(summary.coreConclusions[0] || summary.oneSentenceSummary)}"]`,
      "  end",
      "```"
    ].join("\n");
  }

  const nodeLines: string[] = [];
  const keyToNode = new Map<string, string>();
  concepts.forEach((concept, index) => {
    const id = `C${index + 1}`;
    nodeLines.push(`    ${id}["${escapeMermaidLabel(conceptLabel(concept))}"]`);
    keyToNode.set(conceptKey(concept.zh), id);
    keyToNode.set(conceptKey(concept.en), id);
  });

  const edges = summary.relationships
    .slice(0, 8)
    .map((relation) => {
      const from = keyToNode.get(conceptKey(relation.from.zh)) || keyToNode.get(conceptKey(relation.from.en));
      const to = keyToNode.get(conceptKey(relation.to.zh)) || keyToNode.get(conceptKey(relation.to.en));
      if (!from || !to || from === to) {
        return "";
      }
      return `    ${from} --> ${to}`;
    })
    .filter(Boolean);

  if (!edges.length && concepts.length >= 2) {
    for (let index = 0; index < concepts.length - 1; index++) {
      edges.push(`    C${index + 1} --> C${index + 2}`);
    }
  }

  return [
    "```mermaid",
    "graph TD",
    '  subgraph "Concept Map"',
    ...nodeLines,
    ...edges,
    "  end",
    "```"
  ].join("\n");
}

function fallbackFlowNodes(summary: StructuredSummary): Array<{ label: string; id: string }> {
  const nodes = [
    { id: "T", label: `${summary.topicZh} / ${summary.topicEn}` },
    { id: "R", label: summary.risks[0] || summary.oneSentenceSummary || MISSING_ZH },
    { id: "A", label: summary.actions[0] || summary.coreConclusions[0] || MISSING_ZH }
  ];
  return nodes.map((item) => ({ ...item, label: escapeMermaidLabel(item.label) }));
}

function buildCausalGraph(summary: StructuredSummary): string {
  const relations = summary.relationships
    .filter((item) => item.kind === "causal" || item.kind === "support")
    .slice(0, 6);

  if (!relations.length) {
    const nodes = fallbackFlowNodes(summary);
    return [
      "```mermaid",
      "flowchart LR",
      '  subgraph "Causal Chain"',
      ...nodes.map((node) => `    ${node.id}["${node.label}"]`),
      "    T --> R",
      "    R --> A",
      "  end",
      "```"
    ].join("\n");
  }

  const nodeMap = new Map<string, string>();
  const nodeLines: string[] = [];
  const edges: string[] = [];
  let nodeIndex = 1;

  const ensureNode = (label: string): string => {
    const key = conceptKey(label);
    const existing = nodeMap.get(key);
    if (existing) {
      return existing;
    }
    const id = `N${nodeIndex++}`;
    nodeMap.set(key, id);
    nodeLines.push(`    ${id}["${escapeMermaidLabel(label)}"]`);
    return id;
  };

  relations.forEach((relation) => {
    const from = ensureNode(conceptLabel(relation.from));
    const to = ensureNode(conceptLabel(relation.to));
    if (from !== to) {
      edges.push(`    ${from} --> ${to}`);
    }
  });

  return [
    "```mermaid",
    "flowchart LR",
    '  subgraph "Causal Chain"',
    ...nodeLines,
    ...edges,
    "  end",
    "```"
  ].join("\n");
}

function renderConceptDefinitions(concepts: StructuredConcept[]): string[] {
  if (!concepts.length) {
    return ["- 未发现明确概念定义"];
  }

  const lines: string[] = [];
  for (const concept of concepts) {
    lines.push(`### ${concept.zh} / ${concept.en}`);
    lines.push(`- 中文定义：${concept.definitionZh || MISSING_ZH}`);
    lines.push(`- English Definition: ${concept.definitionEn || MISSING_EN}`);
    lines.push("");
  }
  return lines;
}

function renderRelationships(relationships: StructuredRelationship[]): string[] {
  if (!relationships.length) {
    return ["- 未发现明确概念关系"];
  }
  return relationships.map(
    (item) =>
      `- ${item.from.zh}/${item.from.en} -> ${item.to.zh}/${item.to.en} | ${item.kind} | ${item.relation}`
  );
}

export function renderStructuredSummaryShortText(summary: StructuredSummary): string {
  const parts = [summary.title, summary.oneSentenceSummary, ...summary.coreConclusions.slice(0, 2)];
  return parts
    .filter(Boolean)
    .join(" | ")
    .slice(0, 320);
}

export function renderStructuredSummaryMarkdown(summary: StructuredSummary): string {
  const metadata = {
    title: summary.title,
    topic_zh: summary.topicZh,
    topic_en: summary.topicEn,
    audience: summary.audience,
    claims: summary.claims,
    evidence: summary.evidence,
    risks: summary.risks,
    actions: summary.actions
  };

  return [
    `# ${summary.title}`,
    "",
    "## 整体结构化文档表达",
    "### 文档卡片",
    `- 主题（中文/English）：${summary.topicZh} / ${summary.topicEn}`,
    `- 一句话摘要：${summary.oneSentenceSummary}`,
    `- 目标读者：${summary.audience}`,
    "- 核心结论（3条）：",
    ...renderList(summary.coreConclusions, "未发现明确核心结论"),
    "",
    "### 内容结构树",
    "1. 背景与问题定义",
    "2. 核心观点与关键证据",
    "3. 方法/机制/路径",
    "4. 风险与边界条件",
    "5. 结论与行动建议",
    "",
    "### 结构化元数据（JSON）",
    "```json",
    JSON.stringify(metadata, null, 2),
    "```",
    "",
    "## 处理流程",
    "1. 输入识别",
    "2. 信息抽取（实体、概念、问题、事实、观点）",
    "3. 结构化归纳（定义/分类/比较/因果/方法论）",
    "4. 关系建模（概念关系、等式/方程/逻辑链）",
    "5. 可视化表达（Mermaid）",
    "",
    "## 概念清单（中英文）",
    ...renderList(summary.concepts.map((item) => `${item.zh} / ${item.en}`), "未发现明确概念"),
    "",
    "## 概念定义（中英文）",
    ...renderConceptDefinitions(summary.concepts),
    "",
    "## 概念关联与逻辑关系（中英文）",
    ...renderRelationships(summary.relationships),
    "",
    "### 可形式化关系",
    ...renderList(summary.formalRelations, "未发现明确形式化关系"),
    "",
    "## COT逻辑梳理（定义/分类/比较/因果/科学方法论）",
    ...renderList(summary.logicSteps, "未发现明确逻辑步骤"),
    "",
    "## 事实与看法（区分）",
    "### 事实",
    ...renderList(summary.facts, "未发现明确客观事实"),
    "",
    "### 看法",
    ...renderList(summary.opinions, "未发现明确主观看法"),
    "",
    "## FAQ（原文问题整理）",
    ...(summary.faq.length
      ? summary.faq.flatMap((item) => [`### ${item.question}`, `- ${item.answer}`, ""])
      : ["- 未发现明确 FAQ", ""]),
    "## Visualization",
    "### Mermaid 图 1（概念结构图）",
    buildConceptGraph(summary),
    "",
    "### Mermaid 图 2（逻辑/因果图）",
    buildCausalGraph(summary),
    "",
    "## 文章中的类比",
    ...renderList(summary.analogies, "未发现明确类比"),
    "",
    "## 10个金句",
    ...renderList(summary.quotes, "原文未提供"),
    ""
  ].join("\n");
}
