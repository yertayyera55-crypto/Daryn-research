#!/bin/zsh

set -euo pipefail

launcher_root="$(cd "$(dirname "$0")" && pwd)"
app_dir="$launcher_root/web"

if [ ! -f "$app_dir/.env.local" ]; then
  echo "Missing web/.env.local. Follow the setup instructions first."
  read -r "?Press Enter to close..."
  exit 1
fi

if lsof -n -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:3000"
  echo "IELTS Mentor is already running."
  exit 0
fi

cd "$app_dir"
npm run dev &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..30}; do
  if curl -fsS "http://localhost:3000" >/dev/null 2>&1; then
    open "http://localhost:3000"
    echo "IELTS Mentor is running. Keep this Terminal window open while you use it."
    wait "$server_pid"
    exit 0
  fi
  sleep 1
done

echo "The app did not start within 30 seconds."
wait "$server_pid"
