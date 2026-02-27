import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface PersonaProfile {
  workspaceDir: string;
  soul: string;
  identity: string;
  user: string;
  assistantName: string;
  assistantSymbol: string;
  userAlias: string;
}

function readIfExists(filePath: string): string {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8").trim();
}

function pickByLabel(content: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${label}\\s*[:：]\\s*(.+)`, "i");
    const m = content.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function firstMeaningfulLine(content: string): string {
  const line = content
    .split("\n")
    .map((v) => v.trim())
    .find((v) => v && !v.startsWith("#"));
  return line || "";
}

export function loadPersonaProfile(): PersonaProfile {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE || path.resolve(process.cwd(), "workspace");

  const soul = readIfExists(path.join(workspaceDir, "SOUL.md"));
  const identity = readIfExists(path.join(workspaceDir, "IDENTITY.md"));
  const user = readIfExists(path.join(workspaceDir, "USER.md"));

  const assistantName =
    pickByLabel(identity, ["name", "名称", "assistant", "角色"]) || firstMeaningfulLine(identity) || "Strategic Research Crew";
  const assistantSymbol = pickByLabel(identity, ["symbol", "标识", "icon", "徽标"]) || "◉";
  const userAlias =
    pickByLabel(user, ["称呼", "name", "你可以叫我", "call me", "昵称"]) || firstMeaningfulLine(user) || "你";

  return {
    workspaceDir,
    soul,
    identity,
    user,
    assistantName,
    assistantSymbol,
    userAlias
  };
}

export function hasRule(soul: string, keyword: string): boolean {
  return soul.toLowerCase().includes(keyword.toLowerCase());
}
