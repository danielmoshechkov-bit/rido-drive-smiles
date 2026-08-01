#!/bin/bash
# Mostek fiskalny GetRido jako usługa systemowa (macOS / launchd).
#
# PO CO: mostek uruchamiany ręcznie znika po restarcie komputera, a wtedy warsztat
# rano nie wydrukuje paragonu i nie wie dlaczego. Usługa wstaje razem z systemem
# i sama się podnosi po awarii.
#
# Uruchom:  bash scripts/elzab/service/install-macos.sh
# Usuń:     bash scripts/elzab/service/install-macos.sh --uninstall
set -euo pipefail

LABEL="com.getrido.fiscal-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NODE_BIN="$(command -v node)"
LOG_DIR="$HOME/Library/Logs/GetRido"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Usunięto usługę $LABEL."
  exit 0
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Nie znaleziono Node.js w PATH. Zainstaluj Node 20+ i uruchom ponownie." >&2
  exit 1
fi

mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--no-warnings=ExperimentalWarning</string>
    <string>$REPO/scripts/elzab/bridge.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>FISCAL_BRIDGE_PORT</key><string>${FISCAL_BRIDGE_PORT:-9110}</string>
    <key>FISCAL_BRIDGE_TOKEN</key><string>${FISCAL_BRIDGE_TOKEN:-}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/fiscal-bridge.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/fiscal-bridge.err.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Zainstalowano usługę $LABEL."
echo "  log:      $LOG_DIR/fiscal-bridge.log"
echo "  sprawdź:  curl http://127.0.0.1:${FISCAL_BRIDGE_PORT:-9110}/health"
