#!/bin/sh
# Restart only this app's server on port 3049, killing nothing that is not ours.
# Other agents work in this checkout, so every PID is confirmed by its cwd before
# it is signalled — never by a process-name pattern.
cd "$(dirname "$0")" || exit 1
APP="$(pwd)"

for pid in $(pgrep -f "next" 2>/dev/null); do
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)"
  if [ "$cwd" = "$APP" ]; then
    kill "$pid" 2>/dev/null && echo "stopped $pid"
  fi
done

# Wait for the port to actually free before rebinding.
i=0
while [ $i -lt 20 ]; do
  if ! curl -s -o /dev/null --max-time 1 http://localhost:3049/ 2>/dev/null; then break; fi
  sleep 1
  i=$((i + 1))
done

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
PATH="node_modules/.bin:$PATH" nohup npx next start -p 3049 > /tmp/grantgrid-server.log 2>&1 &
echo $! > .server.pid

i=0
while [ $i -lt 30 ]; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3049/ 2>/dev/null)
  if [ "$code" = "200" ]; then echo "up on 3049 (pid $(cat .server.pid))"; exit 0; fi
  sleep 1
  i=$((i + 1))
done
echo "failed to start; log:"
tail -20 /tmp/grantgrid-server.log
exit 1
