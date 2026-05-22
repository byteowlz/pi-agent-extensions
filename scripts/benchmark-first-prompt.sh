#!/usr/bin/env bash
set -euo pipefail

# Benchmark per-extension startup/first-prompt latency for pi.
# Uses a real model (default: zgx/qwen3.6-35b) and compares each extension
# against a no-extension baseline.

MODEL="${MODEL:-zgx/qwen3.6-35b}"
PROMPT="${PROMPT:-Say exactly: ok}"
RUNS="${RUNS:-3}"
TIMEOUT_SECS="${TIMEOUT_SECS:-45}"
OUT_DIR="${OUT_DIR:-benchmarks/pi-first-prompt}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_CSV="$OUT_DIR/results-$TS.csv"

mkdir -p "$OUT_DIR"

echo "model=$MODEL runs=$RUNS timeout=${TIMEOUT_SECS}s" >&2
echo "extension,run,seconds" > "$OUT_CSV"

measure_once() {
  local ext_args=("$@")
  python - "$TIMEOUT_SECS" "$MODEL" "$PROMPT" "${ext_args[@]}" <<'PY'
import subprocess, sys, time

timeout = int(sys.argv[1])
model = sys.argv[2]
prompt = sys.argv[3]
ext_args = sys.argv[4:]

cmd = [
    "pi",
    "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes",
    "--no-builtin-tools", "--mode", "text", "-p", "--model", model,
    *ext_args,
    prompt,
]

start = time.monotonic()
try:
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
    dt = time.monotonic() - start
    print(f"{dt:.3f}")
except Exception:
    print("NaN")
PY
}

run_series() {
  local label="$1"; shift
  for i in $(seq 1 "$RUNS"); do
    s=$(measure_once "$@")
    echo "$label,$i,$s" >> "$OUT_CSV"
    echo "$label run $i: $s s" >&2
  done
}

# Baseline
run_series "__baseline__" --no-extensions

# Per extension directory (pi-*)
for d in pi-*; do
  [[ -d "$d" ]] || continue
  [[ -f "$d/index.ts" ]] || continue
  run_series "$d" --no-extensions -e "$(pwd)/$d"
done

# Summary (median per extension + delta vs baseline)
python - "$OUT_CSV" <<'PY'
import csv, math, statistics, sys
from collections import defaultdict

path = sys.argv[1]
vals = defaultdict(list)
with open(path, newline='') as f:
    r = csv.DictReader(f)
    for row in r:
        try:
            v = float(row['seconds'])
            if math.isfinite(v):
                vals[row['extension']].append(v)
        except Exception:
            pass

def med(xs):
    return statistics.median(xs) if xs else float('nan')

base = med(vals.get('__baseline__', []))
rows = []
for k,v in vals.items():
    if k == '__baseline__':
        continue
    m = med(v)
    rows.append((k, len(v), m, m-base))
rows.sort(key=lambda x: x[3], reverse=True)

print('\n=== Summary (median seconds; sorted by slowdown vs baseline) ===')
print(f'baseline_median={base:.3f}s n={len(vals.get("__baseline__",[]))}')
for k,n,m,d in rows:
    print(f'{k:28} n={n:<2} median={m:7.3f}s  delta={d:+7.3f}s')
PY

echo "\nWrote: $OUT_CSV" >&2
