function splitByTopLevelPlus(input: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let bracketDepth = 0;
  let inDoubleQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      buf += ch;
      continue;
    }
    if (!inDoubleQuote) {
      if (ch === "[") bracketDepth += 1;
      if (ch === "]" && bracketDepth > 0) bracketDepth -= 1;
    }
    if (ch === "+" && !inDoubleQuote && bracketDepth === 0) {
      const token = buf.trim();
      if (token) parts.push(token);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function sanitizeMermaidBlock(block: string): string {
  const lines = block.split("\n");
  const fixed: string[] = [];

  for (const line of lines) {
    if (!line.includes("-->")) {
      fixed.push(line);
      continue;
    }

    const arrowIdx = line.indexOf("-->");
    const lhs = line.slice(0, arrowIdx).trim();
    const rhs = line.slice(arrowIdx + 3).trim();
    const indent = line.match(/^\s*/)?.[0] || "";

    if (!lhs || !rhs || !lhs.includes("+")) {
      fixed.push(line);
      continue;
    }

    const lhsParts = splitByTopLevelPlus(lhs);
    if (lhsParts.length <= 1) {
      fixed.push(line);
      continue;
    }

    for (const part of lhsParts) {
      fixed.push(`${indent}${part} --> ${rhs}`);
    }
  }

  return fixed.join("\n");
}

function sanitizeMermaidBlocks(markdown: string): string {
  return markdown.replace(/```mermaid([\s\S]*?)```/g, (_m, inner: string) => {
    const fixed = sanitizeMermaidBlock(inner);
    return `\`\`\`mermaid${fixed}\`\`\``;
  });
}

function normalizeTitle(markdown: string): string {
  const lines = markdown.split("\n");
  if (!lines.length) return markdown;

  // Case: "标题：xxx" / "标题 xxx"
  const first = lines[0].trim();
  const inlineTitle = first.match(/^标题[:：]?\s*(.+)$/);
  if (inlineTitle?.[1]) {
    lines[0] = `# ${inlineTitle[1].trim()}`;
    return lines.join("\n");
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw !== "# 标题" && raw !== "标题") {
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length) break;
    const candidate = lines[j].trim();
    if (
      candidate &&
      !candidate.startsWith("#") &&
      !candidate.startsWith("-") &&
      !candidate.startsWith("*")
    ) {
      lines[i] = `# ${candidate.replace(/^标题[:：]?\s*/, "").trim()}`;
      lines.splice(j, 1);
    }
    break;
  }

  return lines.join("\n");
}

export function sanitizeSummaryOutput(markdown: string): string {
  const titleFixed = normalizeTitle(markdown);
  return sanitizeMermaidBlocks(titleFixed);
}

