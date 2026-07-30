#!/usr/bin/env bash
# Build every app under apps/ and report pass/fail.
#
# Apps are deliberately self-contained and each pins its own dependency ranges
# (SCAFFOLD_GUIDE.md rules 1 and 4), so installing all ~75 separately would cost
# tens of GB and hours. Instead this keeps one shared toolchain per stack under
# .buildkit/ and, for each app, assembles a node_modules of symlinks into it --
# installing individually any package whose declared range the shared copy does
# not satisfy. See tools/link-deps.mjs. Nothing under apps/ is modified, so
# extracting a folder still works exactly as the root README describes.
#
# Usage:
#   tools/build-all.sh                 # everything
#   tools/build-all.sh 05 42-schema    # only units whose path matches a prefix
#   KEEP_MODULES=1 tools/build-all.sh  # leave node_modules in place afterwards
#
# Exit code is non-zero if any unit fails.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="$ROOT/apps"
KIT="$ROOT/.buildkit"
LOGS="${BUILD_LOG_DIR:-$KIT/logs}"
mkdir -p "$LOGS"

export NEXT_TELEMETRY_DISABLED=1
export CI=1
export PUPPETEER_SKIP_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

filters=("$@")
matches() {
  [ ${#filters[@]} -eq 0 ] && return 0
  for f in "${filters[@]}"; do [[ "$1" == *"$f"* ]] && return 0; done
  return 1
}

# Buildable units: each app, plus any nested project with its own manifest
# (three apps ship a companion web/server alongside the mobile client).
units() {
  find "$APPS" -mindepth 2 -maxdepth 3 \( -name package.json -o -name pyproject.toml \) \
    -not -path "*/node_modules/*" -not -path "*/.next/*" -print0 |
    xargs -0 -n1 dirname | sort -u
}

stack_of() {
  local dir=$1
  if [ -f "$dir/package.json" ]; then
    node -e '
      const j = require(process.argv[1] + "/package.json");
      const d = { ...j.dependencies, ...j.devDependencies };
      console.log(
        d.next ? "next" :
        d.expo ? "expo" :
        (d["@tauri-apps/cli"] || d["@tauri-apps/api"]) ? "tauri" :
        d.astro ? "astro" : "node"
      );
    ' "$dir" 2>/dev/null && return
  fi
  [ -f "$dir/pyproject.toml" ] && { echo python; return; }
  echo unknown
}

kit_for() {
  case "$1" in
    next) echo web ;;
    expo) echo expo ;;
    *) echo node ;;
  esac
}

pass=0; fail=0; skip=0
declare -a FAILED=()

printf '%-26s %-8s %-7s %s\n' UNIT STACK RESULT NOTE
printf '%s\n' "---------------------------------------------------------------------------"

while IFS= read -r dir; do
  unit="${dir#$APPS/}"
  matches "$unit" || continue
  stack=$(stack_of "$dir")
  kit=$(kit_for "$stack")
  log="$LOGS/${unit//\//__}.log"
  : >"$log"
  start=$SECONDS
  ok=1
  note=""

  if [ "$stack" = "python" ]; then
    pysrc=""
    for c in app src; do [ -d "$dir/$c" ] && pysrc="$pysrc $c"; done
    [ -f "$dir/worker.py" ] && pysrc="$pysrc worker.py"
    if [ -z "$pysrc" ]; then
      note="no python sources"; ok=2
    elif [ -x "$KIT/py/bin/python" ]; then
      ( cd "$dir" && "$KIT/py/bin/python" -m compileall -q $pysrc &&
        "$KIT/py/bin/python" -m mypy --ignore-missing-imports --no-error-summary $pysrc ) >>"$log" 2>&1 || ok=0
      note="compileall + mypy"
    else
      note="no .buildkit/py"; ok=2
    fi
  elif [ ! -d "$KIT/$kit/node_modules" ]; then
    note="no .buildkit/$kit"; ok=2
  else
    node "$ROOT/tools/link-deps.mjs" "$dir" --kit "$kit" >>"$log" 2>&1 || { note="dep resolution failed"; ok=0; }
    BIN="$dir/node_modules/.bin:$KIT/$kit/node_modules/.bin:$PATH"
    if [ $ok -eq 1 ]; then
      case "$stack" in
        next)
          ( cd "$dir" && PATH="$BIN" next build --no-lint ) >>"$log" 2>&1 || ok=0
          ;;
        astro)
          ( cd "$dir" && PATH="$BIN" tsc --noEmit && PATH="$BIN" astro build ) >>"$log" 2>&1 || ok=0
          note="tsc + astro build"
          ;;
        tauri)
          # Frontend only. The Rust shell needs a platform toolchain and, on
          # Linux, tesseract/leptonica headers -- see the note in the README.
          ( cd "$dir" && PATH="$BIN" tsc --noEmit && PATH="$BIN" vite build ) >>"$log" 2>&1 || ok=0
          note="tsc + vite build (Rust shell not built here)"
          ;;
        expo)
          # A real native build needs EAS/Xcode/Android SDK, so the gate is a
          # full typecheck of the router tree and lib code.
          ( cd "$dir" && PATH="$BIN" tsc --noEmit ) >>"$log" 2>&1 || ok=0
          note="tsc (native build needs EAS)"
          ;;
        *)
          ( cd "$dir" && PATH="$BIN" tsc --noEmit ) >>"$log" 2>&1 || ok=0
          note="tsc"
          ;;
      esac
    fi
    [ -n "${KEEP_MODULES:-}" ] || rm -rf "$dir/node_modules"
  fi

  took=$((SECONDS - start))
  case $ok in
    1) pass=$((pass+1)); printf '%-26s %-8s %-7s %s\n' "$unit" "$stack" "ok" "${took}s ${note}" ;;
    0) fail=$((fail+1)); FAILED+=("$unit"); printf '%-26s %-8s %-7s %s\n' "$unit" "$stack" "FAIL" "${took}s  ${log#$ROOT/}" ;;
    2) skip=$((skip+1)); printf '%-26s %-8s %-7s %s\n' "$unit" "$stack" "skip" "$note" ;;
  esac
done < <(units)

printf '%s\n' "---------------------------------------------------------------------------"
printf 'pass %d   fail %d   skip %d\n' "$pass" "$fail" "$skip"
if [ ${#FAILED[@]} -gt 0 ]; then
  printf 'failed: %s\n' "${FAILED[*]}"
  exit 1
fi
