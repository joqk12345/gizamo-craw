import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AppConfig {
  tenants: TenantConfig[];
  telegramLongPollTimeoutSec: number;
  telegramForceShortPoll: boolean;
  telegramTransport: "fetch" | "curl";
  openRouterApiKey?: string;
  openRouterModel: string;
  openRouterFallbackModels: string[];
  githubToken?: string;
  githubRepo?: string;
  githubBranch: string;
  pollIntervalMs: number;
  heartbeatEnabled: boolean;
  heartbeatIntervalMs: number;
}

export type AgentRole = "news" | "strategic";

export interface TenantConfig {
  id: string;
  agentRole: AgentRole;
  telegramBotToken: string;
  telegramAllowedUserIds: Set<string>;
  telegramAllowedChatIds: Set<string>;
  reportBasePath: string;
  strategicInsufficientSignalThreshold?: number;
  personaWorkspaceDir?: string;
  soulFile?: string;
  identityFile?: string;
  userFile?: string;
}

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // In local dev we prefer .env values to avoid stale exported shell vars.
    process.env[key] = value;
  }
}

function toBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function toTelegramTransport(raw: string | undefined): "fetch" | "curl" {
  if (!raw) {
    return "fetch";
  }
  return raw.trim().toLowerCase() === "curl" ? "curl" : "fetch";
}

function normalizeTelegramBotToken(raw: string): string {
  const trimmed = raw.trim();
  const extracted = trimmed.match(/(?:^|[^a-zA-Z0-9_])(bot)?(\d+:[A-Za-z0-9_-]{20,})(?:$|[^A-Za-z0-9_-])/);
  if (extracted?.[2]) {
    return extracted[2];
  }
  return trimmed.replace(/^bot/i, "").split(/\s+#/)[0].trim();
}

function splitCsv(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseAgentRole(raw: string | undefined): AgentRole {
  const normalized = (raw || "news").trim().toLowerCase();
  return normalized === "strategic" ? "strategic" : "news";
}

function parseThreshold(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value)) return undefined;
  return clamp(value, 0.1, 0.9);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeTenantId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function parseTenantIds(): string[] {
  const raw = firstEnv("AGENT_TENANTS", "TENANTS");
  if (raw) {
    const fromList = splitCsv(raw)
      .map((id) => normalizeTenantId(id))
      .filter(Boolean);
    if (fromList.length) {
      return Array.from(new Set(fromList));
    }
  }
  const fallbackRole = parseAgentRole(process.env.AGENT_ROLE);
  return [fallbackRole];
}

function loadTenantConfig(tenantId: string, defaultReportRoot: string): TenantConfig {
  const prefix = tenantId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const role = parseAgentRole(firstEnv(`${prefix}_AGENT_ROLE`));

  const token = firstEnv(
    `${prefix}_TELEGRAM_BOT_TOKEN`,
    role === "strategic" ? "STRATEGIC_TELEGRAM_BOT_TOKEN" : "NEWS_TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN"
  );
  if (!token) {
    throw new Error(
      `Missing bot token for tenant "${tenantId}": set ${prefix}_TELEGRAM_BOT_TOKEN`
    );
  }

  const allowedUsers = splitCsv(
    firstEnv(
      `${prefix}_TELEGRAM_ALLOWED_USER_IDS`,
      `${prefix}_TELEGRAM_ALLOWED_USER_ID`,
      role === "strategic"
        ? "STRATEGIC_TELEGRAM_ALLOWED_USER_IDS"
        : "NEWS_TELEGRAM_ALLOWED_USER_IDS",
      role === "strategic"
        ? "STRATEGIC_TELEGRAM_ALLOWED_USER_ID"
        : "NEWS_TELEGRAM_ALLOWED_USER_ID",
      "TELEGRAM_ALLOWED_USER_IDS",
      "TELEGRAM_ALLOWED_USER_ID"
    )
  );
  const allowedChats = splitCsv(
    firstEnv(
      `${prefix}_TELEGRAM_ALLOWED_CHAT_IDS`,
      `${prefix}_TELEGRAM_ALLOWED_CHAT_ID`,
      role === "strategic"
        ? "STRATEGIC_TELEGRAM_ALLOWED_CHAT_IDS"
        : "NEWS_TELEGRAM_ALLOWED_CHAT_IDS",
      role === "strategic"
        ? "STRATEGIC_TELEGRAM_ALLOWED_CHAT_ID"
        : "NEWS_TELEGRAM_ALLOWED_CHAT_ID",
      "TELEGRAM_ALLOWED_CHAT_IDS",
      "TELEGRAM_ALLOWED_CHAT_ID"
    )
  );
  if (!allowedUsers.length && !allowedChats.length) {
    throw new Error(
      `Missing allowlist for tenant "${tenantId}": set ${prefix}_TELEGRAM_ALLOWED_USER_IDS or ${prefix}_TELEGRAM_ALLOWED_CHAT_IDS`
    );
  }

  const explicitReportPath = firstEnv(`${prefix}_REPORT_BASE_PATH`);
  const reportBasePath = explicitReportPath || `${defaultReportRoot}/${tenantId}`;
  const strategicInsufficientSignalThreshold =
    role === "strategic"
      ? parseThreshold(
          firstEnv(
            `${prefix}_STRATEGIC_INSUFFICIENT_SIGNAL_THRESHOLD`,
            "STRATEGIC_INSUFFICIENT_SIGNAL_THRESHOLD"
          )
        )
      : undefined;
  const personaWorkspaceDir = firstEnv(
    `${prefix}_PERSONA_WORKSPACE`,
    "OPENCLAW_WORKSPACE"
  );
  const soulFile = firstEnv(`${prefix}_SOUL_FILE`);
  const identityFile = firstEnv(`${prefix}_IDENTITY_FILE`);
  const userFile = firstEnv(`${prefix}_USER_FILE`);

  return {
    id: tenantId,
    agentRole: role,
    telegramBotToken: normalizeTelegramBotToken(token),
    telegramAllowedUserIds: new Set(allowedUsers),
    telegramAllowedChatIds: new Set(allowedChats),
    reportBasePath,
    strategicInsufficientSignalThreshold,
    personaWorkspaceDir,
    soulFile,
    identityFile,
    userFile
  };
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  const tenantIds = parseTenantIds();
  const defaultReportRoot =
    firstEnv("REPORT_BASE_PATH", "report_BASE_PATH", "report_base_path") ||
    "reports";
  const tenants = tenantIds.map((tenantId) =>
    loadTenantConfig(tenantId, defaultReportRoot)
  );

  return {
    tenants,
    telegramLongPollTimeoutSec: Number(
      process.env.TELEGRAM_LONG_POLL_TIMEOUT_SEC || "10"
    ),
    telegramForceShortPoll: toBool(process.env.TELEGRAM_FORCE_SHORT_POLL, false),
    telegramTransport: toTelegramTransport(process.env.TELEGRAM_TRANSPORT),
    openRouterApiKey: firstEnv(
      "OPENROUTER_API_KEY",
      "openrouter_API_KEY",
      "openrouter_api_key"
    ),
    openRouterModel:
      firstEnv("OPENROUTER_MODEL", "openrouter_MODEL", "openrouter_model") ||
      "openai/gpt-4o-mini",
    openRouterFallbackModels: (
      firstEnv(
        "OPENROUTER_FALLBACK_MODELS",
        "openrouter_FALLBACK_MODELS",
        "openrouter_fallback_models"
      ) || ""
    )
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    githubToken: firstEnv("GITHUB_TOKEN", "github_TOKEN", "github_token"),
    githubRepo: firstEnv(
      "GITHUB_REPO",
      "github_REPO",
      "github_repo",
      "GITHUB_REPOSITORY"
    ),
    githubBranch:
      firstEnv("GITHUB_BRANCH", "github_BRANCH", "github_branch") || "main",
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || "1500"),
    heartbeatEnabled: toBool(process.env.HEARTBEAT_ENABLED, true),
    heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS || "1800000")
  };
}
