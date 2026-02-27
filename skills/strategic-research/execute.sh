#!/usr/bin/env bash
set -euo pipefail

TEXT=""
CADENCE="weekly"
PHASE="phase4"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)
      TEXT="$2"
      shift 2
      ;;
    --cadence)
      CADENCE="$2"
      shift 2
      ;;
    --phase)
      PHASE="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TEXT" ]]; then
  echo "--text is required" >&2
  exit 1
fi

TEXT="$TEXT" CADENCE="$CADENCE" PHASE="$PHASE" node --input-type=module <<'NODE'
import { StrategicResearchOrchestrator } from './dist/strategic/orchestrator.js';

const text = process.env.TEXT;
const cadence = process.env.CADENCE;
const phase = process.env.PHASE;

const orchestrator = new StrategicResearchOrchestrator({
  cadence,
  phase,
  insufficientSignalThreshold: 0.4
});

const result = await orchestrator.run({
  text,
  sourceType: 'cli'
});

console.log(JSON.stringify(result, null, 2));
NODE
