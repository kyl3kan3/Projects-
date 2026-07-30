#!/usr/bin/env bash
# One-time setup for the shared build toolchains that tools/build-all.sh uses.
#
# Installs one toolchain per stack into .buildkit/ from the manifests committed
# under tools/buildkit/. Safe to re-run; npm and pip both no-op when everything
# is already present. See BUILDING.md for why the toolchain is shared.
#
# Usage:
#   tools/setup-buildkit.sh            # all stacks
#   tools/setup-buildkit.sh web expo   # only these

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIT="$ROOT/.buildkit"
SRC="$ROOT/tools/buildkit"

want=("$@")
wanted() {
  [ ${#want[@]} -eq 0 ] && return 0
  for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done
  return 1
}

# Neither is needed to typecheck, and both fetch a browser at install time.
export PUPPETEER_SKIP_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

for stack in web expo node; do
  wanted "$stack" || continue
  echo "==> $stack toolchain"
  mkdir -p "$KIT/$stack"
  cp "$SRC/$stack/package.json" "$KIT/$stack/package.json"
  # --legacy-peer-deps: these manifests deliberately union dependencies across
  # many apps, so peer ranges collide in ways no single app would hit.
  ( cd "$KIT/$stack" && npm install --no-audit --no-fund --legacy-peer-deps )
done

if wanted py; then
  echo "==> python toolchain"
  [ -x "$KIT/py/bin/python" ] || python3 -m venv "$KIT/py"
  "$KIT/py/bin/pip" install --quiet --upgrade pip
  "$KIT/py/bin/pip" install --quiet -r "$SRC/py-requirements.txt"
fi

echo
echo "Done. Now run: tools/build-all.sh"
