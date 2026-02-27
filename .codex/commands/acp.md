---
description: Stage all changes, commit, and push current branch
---

# ACP

Run add/commit/push in one step using `scripts/git-acp.sh`.

## Usage

- `/acp fix: handle 429 fallback`

## Behavior

1. Use the slash command arguments as the commit message.
2. Run: `scripts/git-acp.sh "<message>"`
3. If no changes exist, report and stop.
