#!/usr/bin/env bash
set -euo pipefail

PROVIDER="${1:-}"
WORKDIR="${2:-$HOME/.pi/delegations/_usage-probe-workspace}"
SESSION="usage_probe_${PROVIDER:-all}_$$"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-8}"

cleanup() {
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: scripts/acpx-usage-probe.sh <claude|codex> [workdir]

Outputs a JSON object with status and parsed usage when available.
Detects:
- cli_missing
- trust_prompt_required
- not_logged_in
- ok
- parse_failed
EOF
}

json_escape() {
  python - <<'PY' "$1"
import json,sys
print(json.dumps(sys.argv[1]))
PY
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '{"provider":"%s","status":"cli_missing","error":"%s not found on PATH"}\n' "$PROVIDER" "$1"
    exit 0
  }
}

require_tmux() {
  command -v tmux >/dev/null 2>&1 || {
    printf '{"provider":"%s","status":"tmux_missing","error":"tmux not found on PATH"}\n' "$PROVIDER"
    exit 0
  }
}

capture_tail() {
  tmux capture-pane -t "$SESSION" -p | tail -n 260
}

print_result() {
  local provider="$1" status="$2" message="$3" all_left="$4" model_left="$5" reset="$6"
  printf '{"provider":%s,"status":%s,"message":%s,"usage":{"all_models_left":%s,"model_left":%s,"reset":%s}}\n' \
    "$(json_escape "$provider")" \
    "$(json_escape "$status")" \
    "$(json_escape "$message")" \
    "$(json_escape "$all_left")" \
    "$(json_escape "$model_left")" \
    "$(json_escape "$reset")"
}

[[ -n "$PROVIDER" ]] || { usage; exit 1; }
[[ "$PROVIDER" == "claude" || "$PROVIDER" == "codex" ]] || { usage; exit 1; }

mkdir -p "$WORKDIR"
require_tmux

if [[ "$PROVIDER" == "claude" ]]; then
  require_bin claude
  tmux new-session -d -s "$SESSION" "cd '$WORKDIR' && claude"
  sleep 3
  out="$(capture_tail)"

  if grep -qiE "Quick safety check|Accessing workspace|Yes, I trust this folder" <<<"$out"; then
    print_result "$PROVIDER" "trust_prompt_required" "Workspace trust prompt shown" "" "" ""
    tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
    exit 0
  fi

  if grep -qiE "Not logged in|Run /login" <<<"$out"; then
    print_result "$PROVIDER" "not_logged_in" "Claude not logged in" "" "" ""
    tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
    exit 0
  fi

  tmux send-keys -t "$SESSION" /status Enter
  sleep 2
  tmux send-keys -t "$SESSION" Right Right
  sleep 2
  out="$(capture_tail)"

  # Fallback navigation: some builds land in Settings search pane first
  if ! grep -q "Current week (all models)" <<<"$out"; then
    tmux send-keys -t "$SESSION" Right Right
    sleep 2
    out="$(capture_tail)"
  fi

  all_left="$(grep -Eo 'Current week \(all models\).*' <<<"$out" | head -n1 | sed 's/"/\\"/g' || true)"
  all_pct="$(grep -Eo '[0-9]+% used' <<<"$out" | head -n1 || true)"
  sonnet_pct="$(grep -Eo 'Current week \(Sonnet only\)[[:space:]]+[0-9]+% used' <<<"$out" | sed -E 's/.* ([0-9]+% used)/\1/' | head -n1 || true)"
  reset="$(grep -Eo 'Resets [^[:cntrl:]]+' <<<"$out" | head -n1 || true)"

  if [[ -n "$all_pct" || -n "$sonnet_pct" ]]; then
    print_result "$PROVIDER" "ok" "Parsed Claude usage" "$all_pct" "$sonnet_pct" "$reset"
  else
    print_result "$PROVIDER" "parse_failed" "Could not parse Claude usage view" "" "" ""
  fi

elif [[ "$PROVIDER" == "codex" ]]; then
  require_bin codex
  tmux new-session -d -s "$SESSION" "cd '$WORKDIR' && codex"
  sleep 3
  out="$(capture_tail)"

  if grep -qiE "Sign in with ChatGPT|Sign in with Device Code|Provide your own API key|Finish signing in via your browser|auth.openai.com/oauth" <<<"$out"; then
    print_result "$PROVIDER" "not_logged_in" "Codex login required" "" "" ""
    tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
    exit 0
  fi

  if grep -qiE "Do you trust the contents of this directory|Yes, continue|Press enter to continue" <<<"$out"; then
    print_result "$PROVIDER" "trust_prompt_required" "Workspace trust prompt shown" "" "" ""
    tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
    exit 0
  fi

  tmux send-keys -t "$SESSION" /status Enter
  sleep 2
  tmux send-keys -t "$SESSION" Enter
  sleep 2
  out="$(capture_tail)"

  five_h_left="$(grep -Eo '5h limit:[^\n]*[0-9]+% left' <<<"$out" | sed -E 's/.* ([0-9]+% left)/\1/' | head -n1 || true)"
  weekly_left="$(grep -Eo 'Weekly limit:[^\n]*[0-9]+% left' <<<"$out" | sed -E 's/.* ([0-9]+% left)/\1/' | head -n1 || true)"
  reset="$(grep -Eo 'resets [^)]+' <<<"$out" | paste -sd ';' - || true)"

  if [[ -n "$five_h_left" || -n "$weekly_left" ]]; then
    print_result "$PROVIDER" "ok" "Parsed Codex status" "$weekly_left" "$five_h_left" "$reset"
  else
    print_result "$PROVIDER" "parse_failed" "Could not parse Codex /status" "" "" ""
  fi
fi

tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
