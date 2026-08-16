#!/bin/bash
# PRAWDZIWA kontrola typów.
#
# `npx tsc --noEmit` (bez -p) NIC NIE SPRAWDZAŁO: główny tsconfig.json ma
# "files": [] i tylko wskazuje na tsconfig.app.json przez "references".
# Bez `-b`/`-p` TypeScript dostaje pustą listę plików i kończy z kodem 0.
#
# Kosztowało to realny błąd: komponent używał `useTrybProbny` bez importu,
# „kontrola typów" przeszła, budowanie przeszło (Vite nie sprawdza typów),
# a ekran wywalił się dopiero u użytkownika: „useTrybProbny is not defined".
#
# WYJĄTKI: pliki, których świadomie nie ruszamy (równoległa praca nad bramką
# płatności). Ich błędy są znane i nie mają nic wspólnego z warsztatem —
# gdyby nie ta lista, kontrola świeciłaby na czerwono niezależnie od nas,
# czyli byłaby ignorowana.
WYJATKI='src/hooks/useSubscriptionAccess.ts'

BLEDY=$(npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" | grep -v -F "$WYJATKI")

if [ -n "$BLEDY" ]; then
  echo "$BLEDY"
  echo ""
  echo "Znaleziono $(echo "$BLEDY" | wc -l | tr -d ' ') bledow typow poza lista wyjatkow."
  exit 1
fi
echo "OK: kontrola typow czysta (poza znanymi wyjatkami: $WYJATKI)."
