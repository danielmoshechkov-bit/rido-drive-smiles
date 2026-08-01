#!/bin/bash
# Mostek fiskalny GetRido jako usługa systemowa (Linux / systemd --user).
#
# Usługa użytkownika, nie systemowa: mostek nasłuchuje tylko na 127.0.0.1 i nie potrzebuje
# uprawnień roota. Włączony `linger` sprawia, że wstaje także bez zalogowanego użytkownika.
#
# Uruchom:  bash scripts/elzab/service/install-linux.sh
# Usuń:     bash scripts/elzab/service/install-linux.sh --uninstall
set -euo pipefail

NAME="getrido-fiscal-bridge"
UNIT="$HOME/.config/systemd/user/$NAME.service"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NODE_BIN="$(command -v node)"

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now "$NAME" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl --user daemon-reload
  echo "Usunięto usługę $NAME."
  exit 0
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Nie znaleziono Node.js w PATH. Zainstaluj Node 20+ i uruchom ponownie." >&2
  exit 1
fi

mkdir -p "$(dirname "$UNIT")"

cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=GetRido — mostek drukarki fiskalnej
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO
Environment=FISCAL_BRIDGE_PORT=${FISCAL_BRIDGE_PORT:-9110}
Environment=FISCAL_BRIDGE_TOKEN=${FISCAL_BRIDGE_TOKEN:-}
ExecStart=$NODE_BIN --no-warnings=ExperimentalWarning $REPO/scripts/elzab/bridge.ts
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT_EOF

systemctl --user daemon-reload
systemctl --user enable --now "$NAME"
loginctl enable-linger "$USER" 2>/dev/null || true

echo "Zainstalowano usługę $NAME."
echo "  status:   systemctl --user status $NAME"
echo "  log:      journalctl --user -u $NAME -f"
echo "  sprawdź:  curl http://127.0.0.1:${FISCAL_BRIDGE_PORT:-9110}/health"
