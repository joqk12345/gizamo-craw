import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AppConfig {
  telegramBotToken: string;
  telegramAllowedUserIds: Set<string>;
  telegramAllowedChatIds: Set<string>;
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
  reportBasePath: string;
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

function must(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
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

export function loadConfig(): AppConfig {
  loadEnvFile();
  const allowedUserRaw =
    process.env.TELEGRAM_ALLOWED_USER_IDS || process.env.TELEGRAM_ALLOWED_USER_ID;
  const allowedUsers = (allowedUserRaw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const allowedChatRaw =
    process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_ALLOWED_CHAT_ID;
  const allowedChats = (allowedChatRaw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!allowedUsers.length && !allowedChats.length) {
    throw new Error(
      "Missing allowlist: set TELEGRAM_ALLOWED_USER_ID(S) or TELEGRAM_ALLOWED_CHAT_ID(S)"
    );
  }

  return {
    telegramBotToken: normalizeTelegramBotToken(must("TELEGRAM_BOT_TOKEN")),
    telegramAllowedUserIds: new Set(allowedUsers),
    telegramAllowedChatIds: new Set(allowedChats),
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
    reportBasePath:
      firstEnv("REPORT_BASE_PATH", "report_BASE_PATH", "report_base_path") ||
      "reports"
  };
}
