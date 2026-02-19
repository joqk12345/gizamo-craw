# News Editer Agent (MVP)

面向“数字员工”场景的新闻采编 Agent。

当前版本目标：
- 私聊 Telegram 下发任务
- 支持链接总结、长文本总结、Hacker News 分析、OpenRouter 综合热度分析
- 任务执行完后，Telegram 返回短摘要 + GitHub 详细报告链接
  - 若未配置 GitHub，则仅返回 TG 短摘要

## 架构

```text
Telegram(private chat)
  -> Gateway (allowlist + queue + task parsing)
  -> TaskRunner
      -> Skills (summarize_text / summarize_link / hn_digest / openrouter_ranking)
  -> GitHubReporter (markdown report)
  -> Telegram short reply + report link
```

后续接入飞书时，只需要新增一个 `ChannelAdapter` 实现并接入 `Gateway`。

## 新增渠道（如飞书）

1. 在 `src/channels/` 新建 adapter，实现 `ChannelAdapter` 接口：
   - `start(onMessage)`：把平台消息转成 `IncomingMessage`
   - `sendMessage(chatId, text)`：统一发送能力
2. 在 `src/index.ts` 注入该 adapter 并交给 `Gateway`
3. 保持 `Skill` 与 `TaskRunner` 不变

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制配置

```bash
cp .env.example .env
```

3. 填写 `.env`

- `TELEGRAM_BOT_TOKEN`: Telegram Bot token
  - 支持填写纯 token 或 `bot<token>`，程序会自动清洗
- `TELEGRAM_ALLOWED_USER_ID`: 单个允许用户 ID
- `TELEGRAM_ALLOWED_USER_IDS`: 多个允许用户 ID（逗号分隔）
- `TELEGRAM_ALLOWED_CHAT_ID`: 单个允许 chat ID（可选）
- `TELEGRAM_ALLOWED_CHAT_IDS`: 多个允许 chat ID（逗号分隔，可选）
- `TELEGRAM_LONG_POLL_TIMEOUT_SEC`: TG long polling 超时秒数（默认 10）
- `TELEGRAM_FORCE_SHORT_POLL`: 是否强制短轮询（`1`/`0`，默认 `0`）
- `TELEGRAM_TRANSPORT`: `fetch` 或 `curl`（网络不稳定时建议 `curl`）
- `OPENROUTER_API_KEY`: OpenRouter API key（可选；缺失时会提示配置，无法生成模型总结）
  - 兼容别名：`openrouter_API_KEY` / `openrouter_api_key`
- `OPENROUTER_MODEL`: 用于总结的模型 ID
- `OPENROUTER_FALLBACK_MODELS`: 备用模型列表（逗号分隔）。当主模型返回地区限制（403）时会自动降级重试
- `GITHUB_TOKEN`: 具有 repo 写权限的 token（可选）
- `GITHUB_REPO`: `owner/repo`（可选）
  - 兼容别名：`GITHUB_REPOSITORY`
- `GITHUB_BRANCH`: 报告写入分支，默认 `main`（分支不存在时会自动回退到仓库默认分支重试）
- `REPORT_BASE_PATH`: 报告目录，默认 `reports`

4. 启动

```bash
npm run dev
```

## 指令示例

- 链接总结
  - `总结 https://example.com/article`
- 长文本总结
  - 直接发一段长文本给 Bot
- Hacker News
  - `抓取 hn top 10 并分析`
- OpenRouter
  - `抓取 openrouter top 10 做综合分析，热度优先`
- 多任务
  - `任务：总结 https://x.com/... + 抓取 hn top 10 + 抓取 openrouter top 10`

## OpenClaw 风格对齐点（MVP）

- 通道与执行逻辑解耦：`ChannelAdapter` 与 `TaskRunner` 分离
- 任务可扩展：每个能力是独立 `Skill`
- 安全入口：私聊 + allowlist
- 输出分层：即时短消息 + 外部详细报告链接

## 已知限制

- OpenRouter “热度”暂无官方分值接口，当前以 API 返回顺序作为热度近似参考
- 当前是单进程内队列；生产环境建议切到 Redis/BullMQ
- Telegram 使用 long polling；生产可迁移 webhook

## 网络排障（Telegram 连接报 ECONNRESET）

如果持续出现 `fetch failed / ECONNRESET`：

1. 降低 long poll 超时
   - `TELEGRAM_LONG_POLL_TIMEOUT_SEC=8`
2. 强制短轮询（禁用长连接）
   - `TELEGRAM_FORCE_SHORT_POLL=1`
3. 使用代理（如果你的网络环境需要）
   - `NODE_USE_ENV_PROXY=1`
   - `HTTPS_PROXY=http://127.0.0.1:7890`
4. 保留 `POLL_INTERVAL_MS=1500` 或更高，避免过高请求频率
5. 切换 Telegram 传输层（推荐）
   - `TELEGRAM_TRANSPORT=curl`

如果出现 `Unauthorized`：

1. 在 BotFather 重新生成 token 后，必须把 `.env` 里的 `TELEGRAM_BOT_TOKEN` 一并更新
2. 关闭并重启进程（确保读取最新 `.env`）
3. 用同一个 token 验证：
   - `curl "https://api.telegram.org/bot<token>/getMe"`
   - `curl "https://api.telegram.org/bot<token>/getUpdates?timeout=1"`

## 报告发布排障（GitHub）

如果 Telegram 返回“详细报告未发布”：

1. 检查 `.env` 是否设置：
   - `GITHUB_TOKEN=...`
   - `GITHUB_REPO=owner/repo`
   - `GITHUB_BRANCH=main`（可选）
2. 确认 token 有仓库内容写权限（`repo` 或 Fine-grained token 的 `Contents: Read and write`）
3. 若分支名写错，程序会自动回退默认分支重试；仍失败时会在 Telegram 显示具体错误摘要

## 模型地区限制排障（OpenRouter 403）

如果出现 `this model is not allow(ed) in your region`：

1. 修改 `.env`：
   - `OPENROUTER_MODEL=<你账号可用模型>`
   - `OPENROUTER_FALLBACK_MODELS=<模型1>,<模型2>`
2. 程序会在主模型不可用时自动切换到备用模型
3. 重启进程后重试任务
