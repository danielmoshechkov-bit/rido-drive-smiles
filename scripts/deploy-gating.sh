#!/usr/bin/env bash
# KROK 6 + 7 wdrożenia gatingu: deploy funkcji brzegowych i kontrola SHA-256.
#
# Uruchamiać PO scaleniu do main i PO wykonaniu czterech migracji.
# Bramka G5 woła funkcję SQL `moze_pracowac`; wdrożona przed migracjami
# odmówi wszystkim, bo brak funkcji w bazie liczy się jak brak zgody.
set -uo pipefail

REF=wclrrytmrscqvsyxyvnn
REPO="$(cd "$(dirname "$0")/.." && pwd)"

BRAMKA=(workshop-send-sms workshop-notify-employee workshop-parts-api
        workshop-tire-reminders workshop-invite-employee
        workshop-accept-employee-invitation workshop-approve-findings
        workshop-employee-submit-findings)
BILLING=(billing-portal billing-price-guarantee billing-stripe-webhook)
POZOSTALE=(register-marketplace-user activate-workshop-trial
           send-invoice-email seed-services-demo)
WSZYSTKIE=("${BRAMKA[@]}" "${BILLING[@]}" "${POZOSTALE[@]}")

echo "═══ KROK 6: deploy ${#WSZYSTKIE[@]} funkcji ═══"
BLEDY=()
for f in "${WSZYSTKIE[@]}"; do
  printf '%-40s' "$f"
  if supabase functions deploy "$f" --project-ref "$REF" >/dev/null 2>&1; then
    echo "wdrożona"
  else
    echo "🔴 BŁĄD"; BLEDY+=("$f")
  fi
done
[ ${#BLEDY[@]} -gt 0 ] && { echo "Nieudane: ${BLEDY[*]}"; exit 1; }

echo
echo "═══ KROK 7: kontrola SHA-256 (produkcja vs repo) ═══"
echo "Numer wersji nie wystarcza — Lovable potrafi nadpisać kod, zostawiając wyższy numer."
TMP=$(mktemp -d); cd "$TMP"
ROZJAZD=()
for f in "${WSZYSTKIE[@]}"; do
  printf '%-40s' "$f"
  supabase functions download "$f" --project-ref "$REF" >/dev/null 2>&1
  # Ścieżka DOKŁADNA, nie wzorzec. `*send-sms/index.ts` pasuje także do
  # `workshop-send-sms/index.ts` — przy takiej parze nazw skrypt porównywał
  # nie ten plik i zgłaszał rozjazd tam, gdzie go nie było.
  POBRANE="./supabase/functions/$f/index.ts"
  LOKALNE="$REPO/supabase/functions/$f/index.ts"
  if [ ! -f "$POBRANE" ]; then echo "🔴 brak pobrania"; ROZJAZD+=("$f"); continue; fi
  A=$(shasum -a 256 "$POBRANE" | cut -d' ' -f1)
  B=$(shasum -a 256 "$LOKALNE"  | cut -d' ' -f1)
  if [ "$A" = "$B" ]; then echo "zgodne"; else echo "🔴 ROZJAZD"; ROZJAZD+=("$f"); fi
done
cd - >/dev/null; rm -rf "$TMP"

echo
if [ ${#ROZJAZD[@]} -eq 0 ]; then
  echo "✅ Wszystkie ${#WSZYSTKIE[@]} zgodne z repozytorium."
else
  echo "🔴 Rozjazd w: ${ROZJAZD[*]}"
  echo "   Powtórz deploy tych funkcji i sprawdź, czy Lovable nie wgrał czegoś w międzyczasie."
  exit 1
fi
