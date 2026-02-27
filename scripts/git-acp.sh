#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: current directory is not a git repository." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/git-acp.sh \"commit message\"" >&2
  exit 1
fi

message="$*"
branch="$(git branch --show-current)"

if [[ -z "${branch}" ]]; then
  echo "Error: unable to detect current branch." >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

git commit -m "${message}"
git push origin "${branch}"

echo "Done: pushed ${branch} with commit message: ${message}"
