import { IncomingMessage } from "../core/types.js";
import { ChannelAdapter } from "./channel-adapter.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    from?: { id: number };
    chat: { id: number; type: string };
  };
}

interface GetUpdatesResponse {
  ok: boolean;
  description?: string;
  result: TelegramUpdate[];
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private offset = 0;
  private running = false;
  private consecutiveErrors = 0;

  constructor(
    private readonly botToken: string,
    private readonly pollIntervalMs: number,
    private readonly longPollTimeoutSec: number,
    private readonly forceShortPoll: boolean,
    private readonly transport: "fetch" | "curl"
  ) {}

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }

  async start(
    onMessage: (message: IncomingMessage) => Promise<void>
  ): Promise<void> {
    this.running = true;
    try {
      await this.validateToken();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        throw err;
      }
      // Network glitches during startup should not crash the whole process.
      // Polling loop below already has retry/backoff and will recover.
      console.warn(
        `[telegram] startup token check skipped due to transient error: ${redactToken(formatError(err))}`
      );
    }
    while (this.running) {
      try {
        const timeoutSec = this.forceShortPoll ? 0 : this.longPollTimeoutSec;
        const data = await this.callApi<GetUpdatesResponse>(
          "getUpdates",
          {
            timeout: timeoutSec,
            offset: this.offset,
            allowed_updates: JSON.stringify(["message"])
          },
          (timeoutSec + 10) * 1000
        );
        if (!data.ok) {
          throw new Error(`Telegram API getUpdates error: ${data.description || "unknown"}`);
        }
        this.consecutiveErrors = 0;
        for (const update of data.result || []) {
          this.offset = update.update_id + 1;
          const message = update.message;
          if (!message) {
            continue;
          }
          const text = message.text || message.caption || "";
          if (!text.trim()) {
            continue;
          }
          await onMessage({
            channel: this.name,
            actorId: String(message.from?.id || ""),
            chatId: String(message.chat.id),
            chatType: message.chat.type,
            text,
            messageId: String(message.message_id),
            createdAt: new Date(message.date * 1000).toISOString()
          });
        }
      } catch (err) {
        if (isUnauthorizedError(err)) {
          throw new Error(
            "Telegram token unauthorized. Please re-check TELEGRAM_BOT_TOKEN in .env and ensure it is the newest token from BotFather."
          );
        }
        this.consecutiveErrors += 1;
        const waitMs = getBackoffMs(this.consecutiveErrors, this.pollIntervalMs);
        console.error(
          `[telegram] poll error (#${this.consecutiveErrors}, retry in ${waitMs}ms):`,
          redactToken(formatError(err))
        );
        await sleep(waitMs);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const chunks = splitMessage(text, 3500);
    for (const chunk of chunks) {
      const apiData = await this.callApi<TelegramApiResponse>(
        "sendMessage",
        {
          chat_id: Number(chatId),
          text: chunk,
          disable_web_page_preview: true
        },
        20_000
      );
      if (!apiData.ok) {
        throw new Error(`Telegram sendMessage API error: ${apiData.description || "unknown"}`);
      }
    }
  }

  private async callApi<T>(
    method: string,
    params: Record<string, string | number | boolean>,
    timeoutMs: number
  ): Promise<T> {
    if (this.transport === "curl") {
      return this.callApiByCurl<T>(method, params, timeoutMs);
    }
    try {
      return await this.callApiByFetch<T>(method, params, timeoutMs);
    } catch (err) {
      if (!isTransientNetworkError(err)) {
        throw err;
      }
      console.warn(
        `[telegram] fetch failed, fallback to curl: ${redactToken(formatError(err))}`
      );
      return this.callApiByCurl<T>(method, params, timeoutMs);
    }
  }

  private async callApiByFetch<T>(
    method: string,
    params: Record<string, string | number | boolean>,
    timeoutMs: number
  ): Promise<T> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      query.set(k, String(v));
    }
    const url = `${this.apiUrl(method)}?${query.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { connection: "close" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Telegram ${method} failed: ${res.status} ${txt}`);
    }
    return (await res.json()) as T;
  }

  private async callApiByCurl<T>(
    method: string,
    params: Record<string, string | number | boolean>,
    timeoutMs: number
  ): Promise<T> {
    const url = this.apiUrl(method);
    const args = [
      "-sS",
      "--max-time",
      String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      "-G",
      url
    ];
    for (const [k, v] of Object.entries(params)) {
      args.push("--data-urlencode", `${k}=${String(v)}`);
    }
    let stdout = "";
    let stderr = "";
    try {
      const result = await execFileAsync("curl", args, {
        maxBuffer: 1024 * 1024
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err) {
      const msg = err instanceof Error ? redactToken(err.message) : String(err);
      throw new Error(`curl request failed: ${msg}`);
    }
    if (stderr && stderr.trim()) {
      throw new Error(`curl stderr: ${stderr.trim()}`);
    }
    try {
      return JSON.parse(stdout) as T;
    } catch {
      throw new Error(`Invalid Telegram JSON response: ${stdout.slice(0, 200)}`);
    }
  }

  private async validateToken(): Promise<void> {
    const data = await this.callApi<TelegramApiResponse>("getMe", {}, 10_000);
    if (!data.ok) {
      throw new Error(
        `Telegram getMe unauthorized. Please update TELEGRAM_BOT_TOKEN in .env with the latest BotFather token.`
      );
    }
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks: string[] = [];
  let remain = text;
  while (remain.length > maxLength) {
    const slice = remain.slice(0, maxLength);
    const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const cut = lastBreak > 100 ? lastBreak : maxLength;
    chunks.push(remain.slice(0, cut));
    remain = remain.slice(cut).trimStart();
  }
  if (remain.length) {
    chunks.push(remain);
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffMs(errorCount: number, baseMs: number): number {
  const capped = Math.min(errorCount, 6);
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(baseMs * 2 ** capped + jitter, 15000);
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const code = cause?.code ? ` code=${cause.code}` : "";
    const detail = cause?.message ? ` cause=${cause.message}` : "";
    return `${err.message}${code}${detail}`;
  }
  return String(err);
}

function isUnauthorizedError(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return msg.includes("unauthorized");
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("ehostunreach") ||
    msg.includes("enotfound") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("network")
  );
}

function redactToken(input: string): string {
  return input.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<redacted>");
}
