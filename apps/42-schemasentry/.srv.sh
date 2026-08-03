#!/bin/sh
# Start/stop ONLY this app's next-server, matched on cwd + an exact
# `next-server` cmdline prefix. Matching "next" loosely killed this session's own
# shell, whose cwd is the app dir and whose command line mentions next.
APP=/home/user/Projects-/apps/42-schemasentry
SP=/tmp/claude-0/-home-user-Projects-/1ca38fdf-0b29-57e3-b349-c2f61fec860e/scratchpad/ss42
stop() {
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    cwd=$(readlink /proc/$p/cwd 2>/dev/null) || continue
    [ "$cwd" = "$APP" ] || continue
    cmd=$(tr '\0' '\n' < /proc/$p/cmdline 2>/dev/null | head -1)
    case "$cmd" in
      next-server*) echo "stopping $p ($cmd)"; kill "$p" 2>/dev/null;;
    esac
  done
  sleep 2
}
case "$1" in
  stop) stop;;
  start)
    cd "$APP" || exit 1
    PATH="node_modules/.bin:$PATH" nohup npx next start -p 3042 > "$SP/server.log" 2>&1 &
    for i in $(seq 1 25); do
      sleep 1
      code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3042/login 2>/dev/null)
      [ "$code" = "200" ] && { echo "up after ${i}s"; exit 0; }
    done
    echo "did not come up"; tail -20 "$SP/server.log"; exit 1;;
esac
