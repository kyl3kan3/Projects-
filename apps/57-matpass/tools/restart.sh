#!/bin/bash
# Scratch helper: restart only this app's server, never anyone else's.
set -u
APP=/home/user/Projects-/apps/57-matpass
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  cwd=$(readlink /proc/$p/cwd 2>/dev/null) || continue
  [ "$cwd" = "$APP" ] || continue
  grep -qa next-server /proc/$p/cmdline 2>/dev/null || continue
  echo "killing our server $p"
  kill "$p" 2>/dev/null
done
for i in $(seq 1 30); do
  ss -ltn 2>/dev/null | grep -q ':3057 ' || break
  sleep 1
done
if ss -ltn 2>/dev/null | grep -q ':3057 '; then echo "port 3057 still busy"; exit 1; fi
cd "$APP"
PATH="node_modules/.bin:$PATH" NEXT_TELEMETRY_DISABLED=1 setsid next start -p 3057 > /tmp/matpass-server.log 2>&1 &
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3057/ 2>/dev/null || true)
  [ "$code" = "200" ] && break
  sleep 1
done
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  cwd=$(readlink /proc/$p/cwd 2>/dev/null) || continue
  [ "$cwd" = "$APP" ] || continue
  grep -qa next-server /proc/$p/cmdline 2>/dev/null || continue
  echo "$p" > "$APP/.server.pid"
done
echo "server up, pid $(cat "$APP/.server.pid" 2>/dev/null)"
